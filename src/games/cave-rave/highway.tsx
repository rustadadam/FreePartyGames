// The 3-lane highway: plays the song against the server clock, judges taps locally, draws on
// a canvas. The whole thing is the tap surface: each third of the width is one lane.
import { useEffect, useRef, useState } from 'preact/hooks';
import { useServerClock } from '../../client/kit';
import { audioState, playSong, unlockAudio } from './audio';
import { LANES, MISS_MS, judge, pointsFor, type Chart, type Judgement } from './chart';
import type { Effect, SabEvent } from './rules';

const LIVE_EVERY_MS = 1500;

/** One player's judging for one song. Lives at module level so a remount (reconnect) keeps it. */
export class Run {
  /** 0 = pending, 1 = perfect, 2 = good, 3 = miss. */
  readonly marks: number[];
  score = 0;
  hits = 0;
  misses = 0;
  combo = 0;
  best = 0;
  last: { j: Judgement; at: number; lane: number } | null = null;
  laneFlash = [-1e9, -1e9, -1e9];
  finished = false;
  sent = false;
  lastLive = 0;

  constructor(readonly chart: Chart) {
    this.marks = chart.notes.map(() => 0);
  }

  private mark(i: number, j: Judgement, at: number): void {
    this.marks[i] = j === 'perfect' ? 1 : j === 'good' ? 2 : 3;
    this.score += pointsFor(j);
    if (j === 'miss') {
      this.misses++;
      this.combo = 0;
    } else {
      this.hits++;
      this.combo++;
      this.best = Math.max(this.best, this.combo);
    }
    this.last = { j, at, lane: this.chart.notes[i].lane };
  }

  /** A tap in `lane` at song time `songMs`; `at` is perf ms for the flash. */
  tap(lane: number, songMs: number, at: number): void {
    this.laneFlash[lane] = at;
    let best = -1;
    let bestD = Infinity;
    const notes = this.chart.notes;
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      if (n.t > songMs + MISS_MS) break;
      if (this.marks[i] || n.lane !== lane) continue;
      const d = Math.abs(n.t - songMs);
      if (d <= MISS_MS && d < bestD) {
        best = i;
        bestD = d;
      }
    }
    if (best < 0) return; // a tap on nothing costs nothing
    const j = judge(notes[best].t - songMs);
    if (j) this.mark(best, j, at);
  }

  /** Notes that went by untouched are misses. */
  sweep(songMs: number, at: number): void {
    const notes = this.chart.notes;
    for (let i = 0; i < notes.length; i++) {
      if (notes[i].t >= songMs - MISS_MS) break;
      if (!this.marks[i]) this.mark(i, 'miss', at);
    }
  }
}

const runs = new Map<string, Run>();
export function runFor(key: string, chart: Chart): Run {
  let r = runs.get(key);
  if (!r) {
    r = new Run(chart);
    runs.set(key, r);
    if (runs.size > 12) runs.delete(runs.keys().next().value as string);
  }
  return r;
}

/** Active effects at server time `now`. */
export function activeEffects(effects: readonly SabEvent[], now: number): Set<Effect> {
  const out = new Set<Effect>();
  for (const e of effects) if (e.at <= now && now < e.until) out.add(e.effect);
  return out;
}

function tapTime(e: { timeStamp: number }): number {
  const now = performance.now();
  const t = e.timeStamp;
  return t > 0 && Math.abs(now - t) < 1000 ? t : now;
}

export interface HighwayProps {
  chart: Chart;
  run: Run;
  /** Server ms of the first step. */
  startAt: number;
  /** Calibration offset, ms (positive: this device is heard/tapped late). */
  offsetMs: number;
  effects: readonly SabEvent[];
  /** Called once when the song is over locally. */
  onFinish?(run: Run): void;
  /** Called every ~1.5 s while playing with the running score. */
  onLive?(score: number): void;
  label?: string;
}

const KEYS: Record<string, number> = { a: 0, s: 1, d: 2, j: 0, k: 1, l: 2, ArrowLeft: 0, ArrowDown: 1, ArrowRight: 2, '1': 0, '2': 1, '3': 2 };

export function Highway({ chart, run, startAt, offsetMs, effects, onFinish, onLive, label }: HighwayProps) {
  const clock = useServerClock();
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scoreEl = useRef<HTMLSpanElement>(null);
  const comboEl = useRef<HTMLSpanElement>(null);
  const [sound, setSound] = useState(audioState());
  // Everything the frame loop reads, kept current without re-subscribing.
  const live = useRef({ effects, offsetMs, onFinish, onLive });
  live.current = { effects, offsetMs, onFinish, onLive };
  /** Song start in perf ms. Follows the clock estimate until the count-in, then stays put. */
  const songStart = useRef(clock.toLocal(startAt) - performance.timeOrigin);

  const songMsAt = (perf: number) => perf - songStart.current - live.current.offsetMs;
  const mirrored = () => activeEffects(live.current.effects, clock.now()).has('mirror');

  const hit = (visualLane: number, at: number) => {
    if (audioState() !== 'running') {
      unlockAudio();
      setSound(audioState());
    }
    if (run.finished) return;
    const lane = mirrored() ? LANES - 1 - visualLane : visualLane;
    run.tap(lane, songMsAt(at), at);
  };

  // Audio: (re)start whenever sound becomes available.
  useEffect(() => {
    if (sound !== 'running') return;
    return playSong(chart, songStart.current);
  }, [sound, chart]);

  // Keyboard, for laptops.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || !(e.key in KEYS)) return;
      e.preventDefault();
      hit(KEYS[e.key], tapTime(e));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run]);

  // The frame loop: draw, sweep misses, report live score, finish.
  useEffect(() => {
    const cv = canvas.current!;
    const box = wrap.current!;
    const g = cv.getContext('2d')!;
    const css = getComputedStyle(box);
    const col = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    const C = {
      stage: col('--stage', '#0b0716'),
      accent: col('--accent', '#b76cff'),
      accent2: col('--accent-2', '#3dffb5'),
      text: col('--text', '#fbf6ff'),
      muted: col('--muted', '#b3a6d9'),
      line: col('--line', '#463575'),
      highlight: col('--highlight', '#ffd447'),
      danger: col('--danger', '#ff7a59'),
    };
    const laneColor = [C.accent, C.text, C.accent2];
    const approach = 1500 - chart.level * 110;
    let raf = 0;
    let lastSound = audioState();

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const perf = performance.now();
      const until = clock.toLocal(startAt) - performance.timeOrigin;
      if (perf < until - 600) songStart.current = until;
      const songMs = songMsAt(perf);
      const fx = activeEffects(live.current.effects, clock.now());
      box.classList.toggle('cr-wobble', fx.has('wobble'));
      box.classList.toggle('cr-mirror', fx.has('mirror'));
      const s = audioState();
      if (s !== lastSound) {
        lastSound = s;
        setSound(s);
      }

      if (!run.finished) {
        run.sweep(songMs, perf);
        if (songMs > chart.lengthMs + 250) {
          run.finished = true;
          live.current.onFinish?.(run);
        } else if (songMs > 0 && perf - run.lastLive > LIVE_EVERY_MS) {
          run.lastLive = perf;
          live.current.onLive?.(run.score);
        }
      }

      // ---- draw ----
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.round(cv.clientWidth * dpr);
      const H = Math.round(cv.clientHeight * dpr);
      if (cv.width !== W || cv.height !== H) {
        cv.width = W;
        cv.height = H;
      }
      const lw = W / LANES;
      const hitY = H * 0.8;
      const mirror = fx.has('mirror');
      const vx = (lane: number) => (mirror ? LANES - 1 - lane : lane) * lw;
      g.clearRect(0, 0, W, H);
      g.fillStyle = C.stage;
      g.fillRect(0, 0, W, H);

      // Lanes: faint glow columns that flash on tap.
      for (let l = 0; l < LANES; l++) {
        const x = vx(l);
        const since = perf - run.laneFlash[l];
        const grad = g.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(1, laneColor[l]);
        g.globalAlpha = 0.08 + (since < 160 ? 0.3 * (1 - since / 160) : 0);
        g.fillStyle = grad;
        g.fillRect(x + 2 * dpr, 0, lw - 4 * dpr, H);
        g.globalAlpha = 1;
        g.strokeStyle = C.line;
        g.lineWidth = 1 * dpr;
        if (l > 0) {
          g.beginPath();
          g.moveTo(l * lw, 0);
          g.lineTo(l * lw, H);
          g.stroke();
        }
      }

      // Hit line and pads.
      g.save();
      g.shadowColor = C.accent;
      g.shadowBlur = 14 * dpr;
      g.fillStyle = C.accent;
      g.fillRect(0, hitY - 2 * dpr, W, 4 * dpr);
      g.restore();
      for (let l = 0; l < LANES; l++) {
        const x = vx(l);
        const since = perf - run.laneFlash[l];
        g.globalAlpha = since < 120 ? 0.55 : 0.18;
        g.fillStyle = laneColor[l];
        roundRect(g, x + 8 * dpr, hitY + 10 * dpr, lw - 16 * dpr, H - hitY - 18 * dpr, 16 * dpr);
        g.fill();
        g.globalAlpha = 1;
      }

      // Notes.
      const noteH = Math.max(14 * dpr, H * 0.028);
      const notes = chart.notes;
      g.save();
      g.shadowBlur = 16 * dpr;
      for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        const dt = n.t - songMs;
        if (dt > approach) break;
        if (dt < -400) continue;
        const m = run.marks[i];
        if (m === 1 || m === 2) continue;
        const y = hitY - (dt / approach) * hitY;
        g.globalAlpha = m === 3 ? 0.25 : 1;
        g.shadowColor = laneColor[n.lane];
        g.fillStyle = laneColor[n.lane];
        roundRect(g, vx(n.lane) + 12 * dpr, y - noteH / 2, lw - 24 * dpr, noteH, noteH / 2);
        g.fill();
      }
      g.restore();
      g.globalAlpha = 1;

      // Fog: a glowstick haze over the top of the highway, so notes appear only at the last moment.
      if (fx.has('fog')) {
        const fog = g.createLinearGradient(0, 0, 0, hitY);
        fog.addColorStop(0, C.accent2);
        fog.addColorStop(0.72, C.accent2);
        fog.addColorStop(1, 'transparent');
        g.globalAlpha = 0.92;
        g.fillStyle = fog;
        g.fillRect(0, 0, W, hitY);
        g.globalAlpha = 1;
      }

      // Judgement pop.
      const last = run.last;
      if (last && perf - last.at < 450) {
        const k = (perf - last.at) / 450;
        g.globalAlpha = 1 - k;
        g.fillStyle = last.j === 'perfect' ? C.accent2 : last.j === 'good' ? C.text : C.danger;
        g.font = `${Math.round(30 * dpr)}px 'Bagel Fat One', system-ui, sans-serif`;
        g.textAlign = 'center';
        g.fillText(last.j === 'perfect' ? 'PERFECT' : last.j === 'good' ? 'GOOD' : 'MISS', W / 2, hitY - H * 0.12 - k * 20 * dpr);
        g.globalAlpha = 1;
      }

      // Countdown before the first beat.
      const toGo = songStart.current - perf;
      if (toGo > 0) {
        g.fillStyle = C.highlight;
        g.font = `${Math.round(110 * dpr)}px 'Bagel Fat One', system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(Math.ceil(toGo / 1000)), W / 2, H * 0.4);
        g.textBaseline = 'alphabetic';
      }

      if (scoreEl.current) scoreEl.current.textContent = run.score.toLocaleString('en-US');
      if (comboEl.current) comboEl.current.textContent = run.combo >= 4 ? `${run.combo} combo` : '';
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [chart, run, startAt, clock]);

  return (
    <div
      ref={wrap}
      class="cr-highway"
      role="application"
      aria-label={label ?? 'Three-lane highway: tap the left, middle or right third as notes reach the line'}
      onPointerDown={(e) => {
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        hit(Math.max(0, Math.min(LANES - 1, Math.floor(((e.clientX - r.left) / r.width) * LANES))), tapTime(e));
      }}
    >
      <canvas ref={canvas} class="cr-canvas" aria-hidden="true" />
      <div class="cr-hud" aria-live="off">
        <span class="cr-score" ref={scoreEl}>
          0
        </span>
        <span class="cr-combo" ref={comboEl} />
      </div>
      {sound !== 'running' && <span class="cr-mute">Sound off: tap a lane to turn it on</span>}
      <EffectTags effects={effects} />
    </div>
  );
}

const EFFECT_LABEL: Record<Effect, string> = { fog: 'Fogged', mirror: 'Mirrored', wobble: 'Wobbling' };

function EffectTags({ effects }: { effects: readonly SabEvent[] }) {
  const clock = useServerClock();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 200);
    return () => clearInterval(t);
  }, []);
  const now = clock.now();
  const on = effects.filter((e) => e.at <= now && now < e.until);
  if (!on.length) return null;
  return (
    <div class="cr-fx-tags" role="status">
      {on.map((e) => (
        <span key={`${e.effect}${e.at}`} class="cr-fx-tag">
          {EFFECT_LABEL[e.effect]}
        </span>
      ))}
    </div>
  );
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}
