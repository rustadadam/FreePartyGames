// Cave Rave UI. Phones run the song and judge locally (highway.tsx); the server only sees one
// score per duel. The screen shows the bracket, a live score race and the sabotage feed.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Avatar, PlayerChip, RulesSheet, Timer, playerOf, useEphemeral, useServerNow } from '../../client/kit';
import type { ClientGameModule, PlayerProps, ScreenProps } from '../../client/gameModule';
import type { Lobby } from '../../shared/types';
import { audioState, click, ctxToPerf, loadOffset, medianOffset, perfToCtx, saveOffset, unlockAudio } from './audio';
import { makeChart } from './chart';
import { Highway, runFor } from './highway';
import { EFFECTS, EFFECT_MS, READY_FIRST_MS, READY_MS, SAB_COOLDOWN_MS, type CRView, type DuelView, type Effect, type LivePayload, type SabEvent } from './rules';
// Type-only import from logic.ts keeps zod out of this chunk.
import type { CRAction } from './logic';
import './ui.css';

const fmt = (n: number) => n.toLocaleString('en-US');
const nameOf = (lobby: Lobby, id: string | null | undefined) => playerOf(lobby, id)?.name ?? 'Someone';

const EFFECT_INFO: Record<Effect, { name: string; hint: string; verb: string }> = {
  fog: { name: 'Fog', hint: `Hides the notes for ${EFFECT_MS.fog / 1000} s`, verb: 'fogged' },
  mirror: { name: 'Mirror', hint: `Flips left and right for ${EFFECT_MS.mirror / 1000} s`, verb: 'mirrored' },
  wobble: { name: 'Wobble', hint: `Shakes their screen for ${EFFECT_MS.wobble / 1000} s`, verb: 'wobbled' },
};

function useChart(view: CRView) {
  return useMemo(() => makeChart(view.chart.seed, view.chart.level), [view.chart.seed, view.chart.level]);
}

/** Live scores from the ephemeral ticker, reset each round. */
function useLiveScores(round: number): Record<string, number> {
  const [live, setLive] = useState<Record<string, number>>({});
  useEffect(() => setLive({}), [round]);
  useEphemeral((p) => {
    const m = p as Partial<LivePayload> | null;
    if (m && m.cr === 'live' && typeof m.id === 'string' && typeof m.score === 'number') {
      const { id, score } = m;
      setLive((cur) => (cur[id] === score ? cur : { ...cur, [id]: score }));
    }
  });
  return live;
}

// ---------- shared pieces ----------

/** The cave's ceiling: an irregular stalactite edge with an ultraviolet glow. */
function Stalactites() {
  const teeth = [3, 7, 4, 9, 5, 2, 8, 4, 6, 3, 10, 5, 3, 7, 2, 6, 9, 4, 5, 3];
  const w = 100 / teeth.length;
  const d = teeth.map((h, i) => `L${(i * w + w / 2).toFixed(2)} ${h} L${((i + 1) * w).toFixed(2)} 0`).join(' ');
  return (
    <svg class="cr-stalactites" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
      <path d={`M0 0 ${d} Z`} />
    </svg>
  );
}

function RoundLabel({ view }: { view: CRView }) {
  const final = view.round === view.rounds;
  return (
    <span class="eyebrow">
      {final ? 'Final' : `Round ${view.round} of ${view.rounds}`} · {view.chart.notes} notes
    </span>
  );
}

function DuelCard({ duel, lobby, me, live, view, big }: { duel: DuelView; lobby: Lobby; me?: string; live?: Record<string, number>; view: CRView; big?: boolean }) {
  const size = big ? '5vh' : '32px';
  const side = (id: string) => {
    const done = duel.done.includes(id);
    const sc = duel.scores?.[id]?.score ?? live?.[id];
    const won = duel.winner === id;
    const lost = !!duel.winner && !won;
    const pct = view.chart.max ? Math.min(100, ((sc ?? 0) / view.chart.max) * 100) : 0;
    return (
      <div class={`cr-side${won ? ' is-won' : ''}${lost ? ' is-lost' : ''}`}>
        <PlayerChip lobby={lobby} id={id} you={id === me} size={size} trailing={sc != null ? fmt(sc) : done ? 'in' : view.phase === 'ready' && view.ready.includes(id) ? 'ready' : null} />
        {view.phase === 'play' && <span class="cr-bar" style={{ width: `${pct}%` }} />}
      </div>
    );
  };
  if (!duel.b)
    return (
      <div class="cr-duel is-bye">
        {side(duel.a)}
        <span class="cr-bye">bye: moves on</span>
      </div>
    );
  return (
    <div class="cr-duel">
      {side(duel.a)}
      <span class="cr-vs" aria-hidden="true">
        vs
      </span>
      {side(duel.b)}
    </div>
  );
}

function Duels({ view, lobby, me, live, big }: { view: CRView; lobby: Lobby; me?: string; live?: Record<string, number>; big?: boolean }) {
  return (
    <div class="cr-duels">
      {view.duels.map((d) => (
        <DuelCard key={d.id} duel={d} lobby={lobby} me={me} live={live} view={view} big={big} />
      ))}
    </div>
  );
}

function Feed({ feed, lobby, now }: { feed: SabEvent[]; lobby: Lobby; now: number }) {
  if (!feed.length) return null;
  return (
    <ul class="g-list cr-feed" aria-label="Sabotage">
      {feed
        .slice()
        .reverse()
        .map((e) => (
          <li key={`${e.by}${e.at}`} class={now < e.until ? 'is-on' : ''}>
            <strong>{nameOf(lobby, e.by)}</strong> {EFFECT_INFO[e.effect].verb} <strong>{nameOf(lobby, e.target)}</strong>
          </li>
        ))}
    </ul>
  );
}

// ---------- phone ----------

function Calibrate({ onDone, onCancel }: { onDone(ms: number): void; onCancel(): void }) {
  const CLICKS = 8;
  const GAP = 0.6;
  const [stage, setStage] = useState<'idle' | 'run' | 'fail'>('idle');
  const [taps, setTaps] = useState(0);
  const clicks = useRef<number[]>([]);
  const tapTimes = useRef<number[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  const start = () => {
    unlockAudio();
    tapTimes.current = [];
    setTaps(0);
    const t0 = perfToCtx(performance.now()) + 1.2;
    clicks.current = [];
    for (let i = 0; i < CLICKS; i++) {
      click(t0 + i * GAP);
      clicks.current.push(ctxToPerf(t0 + i * GAP));
    }
    setStage('run');
    timer.current = setTimeout(
      () => {
        const off = medianOffset(clicks.current, tapTimes.current);
        if (off === null) setStage('fail');
        else onDone(off);
      },
      1200 + CLICKS * GAP * 1000 + 400,
    );
  };

  return (
    <section class="g-stack cr-cal">
      <span class="eyebrow">Tune your timing</span>
      <h2 class="g-title">Tap along to {CLICKS} clicks</h2>
      <p class="g-muted">Turn your volume up. Tap the pad each time you hear a click. This measures your phone's sound delay, so your taps count at the right time.</p>
      {stage === 'run' ? (
        <button
          type="button"
          class="g-hit cr-cal-pad"
          onPointerDown={(e) => {
            e.preventDefault();
            const now = performance.now();
            tapTimes.current.push(e.timeStamp > 0 && Math.abs(now - e.timeStamp) < 1000 ? e.timeStamp : now);
            setTaps((n) => n + 1);
          }}
        >
          <span class="cr-cal-dots" aria-label={`${taps} taps`}>
            {Array.from({ length: CLICKS }, (_, i) => (
              <i key={i} class={i < taps ? 'is-on' : ''} />
            ))}
          </span>
          Tap
        </button>
      ) : (
        <>
          {stage === 'fail' && <p class="cr-warn">Not enough taps. Turn the sound on and try again.</p>}
          <button type="button" class="btn btn-primary btn-block" onClick={start}>
            {stage === 'fail' ? 'Try again' : 'Start'}
          </button>
          <button type="button" class="btn btn-ghost btn-block" onClick={onCancel}>
            Skip for now
          </button>
        </>
      )}
    </section>
  );
}

function SoundAndTiming({ offset, onCalibrate }: { offset: number | null; onCalibrate(): void }) {
  const [sound, setSound] = useState(audioState());
  return (
    <div class="g-panel cr-setup">
      <div class="g-spread">
        <span>{sound === 'running' ? 'Sound is on' : 'Sound is off'}</span>
        {sound !== 'running' && (
          <button
            type="button"
            class="btn btn-s"
            onClick={() => {
              unlockAudio();
              setTimeout(() => setSound(audioState()), 100);
            }}
          >
            Turn on sound
          </button>
        )}
      </div>
      <div class="g-spread">
        <span>{offset === null ? 'Timing not tuned yet' : `Timing tuned: ${offset >= 0 ? '+' : ''}${Math.round(offset)} ms`}</span>
        <button type="button" class={`btn btn-s${offset === null ? ' btn-primary' : ' btn-ghost'}`} onClick={onCalibrate}>
          {offset === null ? 'Tune (10 s)' : 'Retune'}
        </button>
      </div>
    </div>
  );
}

function Meddle({ view, send, lobby }: { view: CRView; send(a: CRAction): void; lobby: Lobby }) {
  const now = useServerNow(200);
  const [effect, setEffect] = useState<Effect>('fog');
  const you = view.you!;
  const running = view.startAt !== null && view.endAt !== null && now >= view.startAt && now < view.endAt;
  const wait = Math.max(0, you.sabReadyAt - now);
  const ready = running && wait === 0;
  return (
    <section class="g-stack cr-meddle">
      <div>
        <span class="eyebrow">You're out. Sabotage the players still in.</span>
        <p class="cr-meddle-state" role="status">
          {!running ? (view.startAt && now < view.startAt ? 'The song starts soon.' : 'Song over. Wait for the next round.') : wait > 0 ? `Next sabotage in ${Math.ceil(wait / 1000)} s` : 'Pick a trick, then tap a player.'}
        </p>
        <span class="cr-charge" style={{ width: `${running ? 100 - (wait / SAB_COOLDOWN_MS) * 100 : 0}%` }} />
      </div>
      <div class="cr-tricks" role="radiogroup" aria-label="Trick">
        {EFFECTS.map((e) => (
          <button key={e} type="button" role="radio" aria-checked={effect === e} class={`cr-trick${effect === e ? ' is-on' : ''}`} onClick={() => setEffect(e)}>
            <strong>{EFFECT_INFO[e].name}</strong>
            <small>{EFFECT_INFO[e].hint}</small>
          </button>
        ))}
      </div>
      <div class="cr-targets">
        {you.targets.length === 0 && <p class="g-muted">No players left to sabotage this round.</p>}
        {you.targets.map((id) => {
          const p = playerOf(lobby, id);
          return (
            <button key={id} type="button" class="cr-target" disabled={!ready} onClick={() => send({ type: 'sabotage', target: id, effect })}>
              <Avatar name={p?.name ?? '?'} color={p?.color ?? '#9aa5b1'} size="40px" />
              <span>{p?.name ?? 'Someone'}</span>
            </button>
          );
        })}
      </div>
      <Feed feed={view.feed} lobby={lobby} now={now} />
    </section>
  );
}

function PlayRun({ view, send, lobby, offset }: { view: CRView; send(a: CRAction): void; lobby: Lobby; offset: number }) {
  const you = view.you!;
  const chart = useChart(view);
  const practice = you.role !== 'duel';
  const run = runFor(`${you.duel ?? 'x'}:${view.chart.seed}`, chart);
  const submit = () => {
    if (practice || !you.duel) return;
    run.sent = true;
    send({ type: 'score', duel: you.duel, score: run.score, hits: run.hits, misses: Math.max(0, chart.notes.length - run.hits) });
  };
  // If the phone slept through the end (no frames), the server's "song over" sends it.
  useEffect(() => {
    if (view.chartOver && !you.submitted && !practice) submit();
  }, [view.chartOver, you.submitted]);
  return (
    <section class="cr-play">
      <div class="cr-play-head">
        {practice ? (
          <span class="eyebrow">Bye round: practice only. This run doesn't count.</span>
        ) : (
          <span class="cr-opp">
            <span class="eyebrow">vs</span>
            <PlayerChip lobby={lobby} id={you.opponent} />
          </span>
        )}
        <RoundLabel view={view} />
      </div>
      <Highway
        chart={chart}
        run={run}
        startAt={view.startAt!}
        offsetMs={offset}
        effects={you.effects}
        onFinish={() => submit()}
        onLive={practice || !you.duel ? undefined : (score) => send({ type: 'live', duel: you.duel!, score })}
      />
    </section>
  );
}

function Player({ view, send, lobby, me }: PlayerProps<CRView, CRAction>) {
  const [offset, setOffset] = useState<number | null>(() => loadOffset());
  const [calibrating, setCalibrating] = useState(false);
  // The song starting cancels a calibration in progress.
  useEffect(() => {
    if (view.phase === 'play') setCalibrating(false);
  }, [view.phase]);
  const you = view.you;
  if (!you) return <p class="g-muted">You joined after this game started. Watch the screen.</p>;

  if (calibrating && view.phase !== 'play')
    return (
      <Calibrate
        onDone={(ms) => {
          saveOffset(ms);
          setOffset(ms);
          setCalibrating(false);
        }}
        onCancel={() => setCalibrating(false)}
      />
    );

  const myDuel = view.duels.find((d) => d.id === you.duel);

  if (view.phase === 'play') {
    if ((you.role === 'duel' && !you.submitted) || you.role === 'bye') return <PlayRun view={view} send={send} lobby={lobby} offset={offset ?? 0} />;
    if (you.role === 'out') return <Meddle view={view} send={send} lobby={lobby} />;
    return (
      <section class="g-stack">
        <RoundLabel view={view} />
        <p class="g-title">Score sent. Waiting for the other players.</p>
        <Timer deadline={view.deadline} />
        <Duels view={view} lobby={lobby} me={me} />
      </section>
    );
  }

  if (view.phase === 'ready') {
    const isDuel = you.role === 'duel';
    return (
      <section class="g-stack cr-ready">
        <div class="g-spread">
          <RoundLabel view={view} />
          <Timer deadline={view.deadline} total={view.round === 1 ? READY_FIRST_MS : READY_MS} />
        </div>
        {isDuel ? (
          <div class="cr-face">
            <PlayerChip lobby={lobby} id={me} you size="44px" />
            <span class="cr-vs">vs</span>
            <PlayerChip lobby={lobby} id={you.opponent} size="44px" />
          </div>
        ) : (
          <p class="g-title">{you.role === 'bye' ? 'Bye round. You move on to the next round.' : "You're out. You can still sabotage."}</p>
        )}
        {you.role === 'out' && <p class="g-muted">When the song starts, use fog, mirror or wobble on the players still in.</p>}
        {you.role === 'bye' && <p class="g-muted">Play along for practice. Your score doesn't count.</p>}
        <SoundAndTiming offset={offset} onCalibrate={() => setCalibrating(true)} />
        {!lobby.screenConnected && <Duels view={view} lobby={lobby} me={me} />}
        {isDuel && (
          <div class="dock cr-dock">
            <button
              type="button"
              class="btn btn-primary btn-block"
              disabled={you.ready}
              onClick={() => {
                unlockAudio(); // the tap that readies you also unlocks the sound
                send({ type: 'ready' });
              }}
            >
              {you.ready ? 'Ready. Waiting for the other players.' : "I'm ready"}
            </button>
          </div>
        )}
      </section>
    );
  }

  if (view.phase === 'reveal') {
    const mine = myDuel?.scores;
    const won = myDuel?.winner === me;
    return (
      <section class="g-stack cr-reveal">
        <RoundLabel view={view} />
        {myDuel?.b ? (
          <>
            <p class={`g-call cr-call ${won ? 'is-won' : 'is-lost'}`}>{won ? 'You win!' : "You're out"}</p>
            {mine && (
              <p class="cr-versus">
                {fmt(mine[me]?.score ?? 0)} <span class="g-muted">vs</span> {fmt(mine[you.opponent ?? '']?.score ?? 0)}
              </p>
            )}
            {!won && <p class="g-muted">From now on, you can sabotage the other players.</p>}
          </>
        ) : myDuel ? (
          <p class="g-title">Bye. You're through.</p>
        ) : (
          <p class="g-title">Round {view.round} results</p>
        )}
        <Timer deadline={view.deadline} />
        <Duels view={view} lobby={lobby} me={me} />
      </section>
    );
  }

  // done
  const champ = view.champion;
  return (
    <section class="g-stack cr-reveal">
      <span class="eyebrow">Cave champion</span>
      <div class="cr-champ">
        <Avatar name={nameOf(lobby, champ)} color={playerOf(lobby, champ)?.color ?? '#9aa5b1'} size="96px" />
        <p class="g-call">{champ === me ? 'You!' : nameOf(lobby, champ)}</p>
      </div>
      <History view={view} lobby={lobby} me={me} />
    </section>
  );
}

// ---------- screen ----------

function History({ view, lobby, me, big }: { view: CRView; lobby: Lobby; me?: string; big?: boolean }) {
  return (
    <div class="cr-history">
      {view.history.map((r) => (
        <div key={r.round} class="cr-col">
          <span class="eyebrow">Round {r.round}</span>
          {r.duels.map((d, i) => (
            <div key={i} class="cr-past">
              <PlayerChip lobby={lobby} id={d.winner} you={d.winner === me} size={big ? '3.6vh' : '24px'} trailing={d.b ? fmt(d.winner === d.a ? d.sa : d.sb) : 'bye'} />
              {d.b && (
                <span class="cr-past-loser">
                  beat {nameOf(lobby, d.winner === d.a ? d.b : d.a)} ({fmt(d.winner === d.a ? d.sb : d.sa)})
                </span>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function SongProgress({ view, now }: { view: CRView; now: number }) {
  if (view.phase !== 'play' || view.startAt === null || view.endAt === null) return <div class="cr-progress is-idle" aria-hidden="true" />;
  const pct = Math.max(0, Math.min(100, ((now - view.startAt) / (view.endAt - view.startAt)) * 100));
  return (
    <div class="cr-progress" aria-hidden="true">
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

function Screen({ view, lobby }: ScreenProps<CRView>) {
  const now = useServerNow(100);
  const live = useLiveScores(view.round);
  const chart = useChart(view);
  let call: string;
  if (view.phase === 'ready') call = view.round === view.rounds ? 'The final' : 'Get ready';
  else if (view.phase === 'play') call = view.startAt && now < view.startAt ? String(Math.ceil((view.startAt - now) / 1000)) : view.chartOver ? 'Scores coming in' : 'Go!';
  else if (view.phase === 'reveal') call = 'Results';
  else call = `${nameOf(lobby, view.champion)} rules the cave`;

  return (
    <section class={`cr-screen phase-${view.phase}`}>
      <Stalactites />
      <header class="cr-screen-head">
        <div class="g-stack cr-screen-title">
          <RoundLabel view={view} />
          <span class="eyebrow">{chart.bpm} BPM</span>
        </div>
        <p key={call} class="g-call cr-screen-call">
          {call}
        </p>
        <Timer deadline={view.deadline} size="l" />
      </header>
      <SongProgress view={view} now={now} />
      <div class="cr-screen-body">
        <div class="cr-screen-main">
          {view.phase === 'done' ? (
            <div class="cr-champ is-big">
              <Avatar name={nameOf(lobby, view.champion)} color={playerOf(lobby, view.champion)?.color ?? '#9aa5b1'} size="22vh" />
            </div>
          ) : (
            <Duels view={view} lobby={lobby} live={live} big />
          )}
          <History view={view} lobby={lobby} big />
        </div>
        <aside class="cr-meddlers">
          <span class="eyebrow">Saboteurs</span>
          {view.out.length === 0 ? (
            <p class="g-muted">Knocked-out players can sabotage the duels from their phones.</p>
          ) : (
            <div class="cr-out">
              {view.out.map((id) => (
                <Avatar key={id} name={nameOf(lobby, id)} color={playerOf(lobby, id)?.color ?? '#9aa5b1'} size="5vh" />
              ))}
            </div>
          )}
          <Feed feed={view.feed} lobby={lobby} now={now} />
        </aside>
      </div>
    </section>
  );
}

function Rules() {
  return (
    <RulesSheet
      story="Deep under the hills, the cave is shaking with music, and only one dancer gets to leave as its champion. Duels are won note by note. Anyone who gets knocked out stays behind to make life hard for the dancers still standing."
      how={[
        "Before your first duel, tune your timing. Tap along to 8 clicks, so your phone's sound delay doesn't cost you points.",
        "Each round is a set of duels. Every duel plays the same song at the same time, on everyone's phone.",
        'Notes fall down three lanes. Tap the left, middle or right of your screen as each note reaches the line. Perfect is 100 points. Good is 50.',
        'The higher score wins the duel. On a tie, the better accuracy wins. If the numbers are odd, one player gets a bye and goes straight through.',
        <>Knocked out? You are not done. Once every {SAB_COOLDOWN_MS / 1000} seconds, hit someone still dancing with fog, mirror or wobble.</>,
      ]}
      scoring={['Every round you get through (a win or a bye): +2', 'The champion: +3 more']}
    />
  );
}

export default { Player, Screen, Rules } satisfies ClientGameModule;
