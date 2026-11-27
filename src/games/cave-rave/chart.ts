// Cave Rave charts: one seed + a level -> the whole song (drums, bass) and its 3-lane chart.
// Pure and deterministic: logic.ts imports it to know the max score, the UI imports it to play
// the same song on every phone. No DOM, no Cloudflare, no Math.random.
import { Rng } from '../../core/rng';

export const LANES = 3;
/** 16th-note grid. */
export const STEPS_PER_BAR = 16;
/** Judgement windows (ms either side of the note). */
export const PERFECT_MS = 55;
export const GOOD_MS = 115;
/** A note this late with no tap is a miss. */
export const MISS_MS = 160;
export const PERFECT_PTS = 100;
export const GOOD_PTS = 50;
/** Bracket rounds past this play at the top level. */
export const MAX_LEVEL = 4;

export interface Note {
  /** ms from song start (startAt). */
  t: number;
  lane: number;
}

export interface BassNote {
  step: number;
  /** Length in steps. */
  len: number;
  /** MIDI note number. */
  midi: number;
}

export interface Chart {
  seed: number;
  level: number;
  bpm: number;
  /** ms per 16th step. */
  stepMs: number;
  /** Count-in bars before the first note (hats only). */
  leadInBars: number;
  /** Charted bars after the count-in. */
  bars: number;
  /** Song length in ms (all notes are before this). */
  lengthMs: number;
  notes: Note[];
  /** Music, as absolute step indexes from song start. */
  kick: number[];
  snare: number[];
  hat: number[];
  /** Accented open hats. */
  openHat: number[];
  bass: BassNote[];
}

interface Groove {
  kick: boolean[];
  snare: boolean[];
  hat: boolean[];
  open: boolean[];
  /** Scale degree index per step, or -1. */
  bass: number[];
}

const MINOR_PENTA = [0, 3, 5, 7, 10, 12];
const TARGET_SONG_MS = 26_000;

function blank<T>(v: T): T[] {
  return Array.from({ length: STEPS_PER_BAR }, () => v);
}

/** One bar of groove. Busier with level; `fill` adds a snare run at the end of a phrase. */
function makeGroove(rng: Rng, level: number, fill: boolean): Groove {
  const g: Groove = { kick: blank(false), snare: blank(false), hat: blank(false), open: blank(false), bass: blank(-1) };
  // Choose a drum pocket so each generated song has a different rhythmic starting point.
  const pocket = rng.int(3);
  if (pocket === 0) {
    g.kick[0] = g.kick[8] = true;
    g.snare[4] = g.snare[12] = true;
  } else if (pocket === 1) {
    g.kick[0] = g.kick[6] = g.kick[8] = g.kick[14] = true;
    g.snare[4] = g.snare[12] = true;
  } else {
    g.kick[0] = g.kick[7] = g.kick[10] = true;
    g.snare[3] = g.snare[11] = true;
  }
  const extraKicks = [3, 6, 10, 11, 14];
  const nKick = Math.min(extraKicks.length, 1 + level + rng.int(2));
  for (const s of rng.shuffle(extraKicks).slice(0, nKick)) g.kick[s] = true;
  if (level >= 2) for (const s of [7, 15, 9]) if (rng.chance(0.25 + level * 0.08)) g.snare[s] = true;
  for (let s = 0; s < STEPS_PER_BAR; s += 2) g.hat[s] = true;
  if (level >= 1) for (let s = 1; s < STEPS_PER_BAR; s += 2) if (rng.chance(0.15 + level * 0.12)) g.hat[s] = true;
  g.open[rng.pick([2, 6, 10, 14])] = true;
  if (fill) {
    const from = level >= 3 ? 10 : 12;
    for (let s = from; s < STEPS_PER_BAR; s += level >= 2 ? 1 : 2) {
      g.snare[s] = true;
      g.kick[s] = false;
    }
  }
  // Bass follows the kick, with the odd offbeat push.
  let degree = 0;
  for (let s = 0; s < STEPS_PER_BAR; s++) {
    if (g.kick[s] || (s % 4 === 2 && rng.chance(0.2 + level * 0.1))) {
      g.bass[s] = degree;
      degree = rng.chance(0.5) ? 0 : rng.int(MINOR_PENTA.length);
    }
  }
  return g;
}

function bpmFor(level: number, rng: Rng): number {
  return 96 + level * 13 + rng.int(0, 6);
}

/** The song and chart for bracket round `level` (0-based; clamped to MAX_LEVEL). */
export function makeChart(seed: number, levelIn: number): Chart {
  const level = Math.max(0, Math.min(MAX_LEVEL, Math.floor(levelIn)));
  const rng = new Rng((seed ^ Math.imul(level + 1, 0x9e3779b1)) >>> 0);
  const bpm = bpmFor(level, rng);
  const stepMs = 60_000 / bpm / 4;
  const barMs = stepMs * STEPS_PER_BAR;
  const leadInBars = 1;
  const bars = Math.max(8, Math.min(20, Math.round(TARGET_SONG_MS / barMs / 4) * 4));
  const root = 36 + rng.int(0, 7);

  // Two grooves (A, B) and their fill variants. Pick a four-bar arrangement for the song.
  const A = makeGroove(rng, level, false);
  const B = makeGroove(rng, level, false);
  const Af = makeGroove(rng, level, true);
  const Bf = makeGroove(rng, level, true);
  const arrangements = [
    [0, 0, 1, 2], // A A B A-fill
    [0, 1, 0, 3], // A B A B-fill
    [1, 0, 1, 3], // B A B B-fill
    [0, 1, 1, 2], // A B B A-fill
  ] as const;
  const arrangement = rng.pick(arrangements);
  const inverted = rng.chance(0.5);
  const grooves = [A, B, Af, Bf];
  const order = (bar: number): Groove => {
    let slot = arrangement[bar % 4];
    if (inverted) slot = slot === 0 ? 1 : slot === 1 ? 0 : slot === 2 ? 3 : 2;
    return grooves[slot];
  };

  const kick: number[] = [];
  const snare: number[] = [];
  const hat: number[] = [];
  const openHat: number[] = [];
  const bass: BassNote[] = [];
  const notes: Note[] = [];

  // Count-in: quarter hats only.
  for (let s = 0; s < leadInBars * STEPS_PER_BAR; s += 4) hat.push(s);

  // Chart density: how close two notes may sit (in steps), and how often off-grid notes are kept.
  const minGap = level >= 4 ? 1 : 2;
  const keepOff = 0.35 + level * 0.15;
  let lastStep = -100;
  let lastLane = -1;

  for (let bar = 0; bar < bars; bar++) {
    const g = order(bar);
    const base = (leadInBars + bar) * STEPS_PER_BAR;
    for (let s = 0; s < STEPS_PER_BAR; s++) {
      const at = base + s;
      if (g.kick[s]) kick.push(at);
      if (g.snare[s]) snare.push(at);
      if (g.hat[s] && !g.open[s]) hat.push(at);
      if (g.open[s]) openHat.push(at);
      if (g.bass[s] >= 0) {
        let len = 1;
        while (s + len < STEPS_PER_BAR && len < 4 && g.bass[s + len] < 0) len++;
        bass.push({ step: at, len, midi: root + MINOR_PENTA[g.bass[s]] });
      }

      // Which lane (if any) this step charts: snare > kick > bass.
      let lane = -1;
      if (g.snare[s]) lane = 1;
      else if (g.kick[s]) lane = 0;
      else if (g.bass[s] >= 0) lane = 2;
      if (lane < 0) continue;
      const onBeat = s % 4 === 0;
      if (!onBeat && !rng.chance(keepOff)) continue;
      const gap = at - lastStep;
      if (gap < minGap || (gap < 2 && lane === lastLane)) continue;
      // The bass rides the kick: half the kicks off the downbeat chart as bass, so all three lanes work.
      if (lane === 0 && s !== 0 && rng.chance(0.5)) lane = 2;
      notes.push({ t: Math.round(at * stepMs), lane });
      lastStep = at;
      lastLane = lane;
    }
  }
  // Final hit: kick + crash-ish open hat on the downbeat after the last bar.
  const end = (leadInBars + bars) * STEPS_PER_BAR;
  while (notes.length && end - lastStep < Math.max(2, minGap)) {
    notes.pop();
    lastStep = notes.length ? Math.round(notes[notes.length - 1].t / stepMs) : -100;
  }
  kick.push(end);
  openHat.push(end);
  bass.push({ step: end, len: 4, midi: root });
  notes.push({ t: Math.round(end * stepMs), lane: 1 });

  return {
    seed,
    level,
    bpm,
    stepMs,
    leadInBars,
    bars,
    lengthMs: Math.round((end + 8) * stepMs),
    notes,
    kick,
    snare,
    hat,
    openHat,
    bass,
  };
}

/** Best possible score: every note perfect. */
export function maxScore(chart: Pick<Chart, 'notes'>): number {
  return chart.notes.length * PERFECT_PTS;
}

export type Judgement = 'perfect' | 'good' | 'miss';

/** Judges a tap `deltaMs` off its note (negative = early). Null = too far to count as this note. */
export function judge(deltaMs: number): Judgement | null {
  const d = Math.abs(deltaMs);
  if (d <= PERFECT_MS) return 'perfect';
  if (d <= GOOD_MS) return 'good';
  if (d <= MISS_MS) return 'miss';
  return null;
}

export function pointsFor(j: Judgement): number {
  return j === 'perfect' ? PERFECT_PTS : j === 'good' ? GOOD_PTS : 0;
}
