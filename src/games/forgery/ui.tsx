// Forgery UI. Phone: your secret card, the shared canvas, your one stroke, the vote.
// Screen: the canvas in its gilt frame, the turn order, the vote and the reveal.
// With no screen the phone shows all of that itself. Everything comes from the kit.
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { Avatar, DrawingCanvas, PlayerChip, PromptCard, RevealStage, StrokeView, Timer, Vote, playerOf, useAssets, useEphemeral } from '../../client/kit';
import type { Drawing, Stroke } from '../../client/kit';
import type { ClientGameModule, PlayerProps, ScreenProps } from '../../client/gameModule';
import type { Lobby } from '../../shared/types';
// Type-only import from logic.ts: a value import would pull zod and the game logic into this chunk.
import type { ForgeryAction, ForgeryView } from './logic';
import { ASPECT, GUESS_MS, LAPS, POINTS, REVEAL_MS, REVEAL_STEP_MS, STROKE_W, TURN_MS, VOTE_MS } from './rules';
import './ui.css';

type V = ForgeryView;
const GREY = '#9aa5b1';

const nameOf = (lobby: Lobby, id: string | null | undefined): string => playerOf(lobby, id)?.name ?? 'Someone';
const colorOf = (lobby: Lobby, id: string): string => playerOf(lobby, id)?.color ?? GREY;

// ---------- canvas ----------

/** Finished strokes of this round, in turn order (each turn is its own asset). */
function useRoundStrokes(view: V): Stroke[] {
  const ids = view.strokes.map((t) => t.id).filter((id): id is string => !!id);
  const assets = useAssets(ids);
  return ids.flatMap((id) => (assets[id] as Drawing | undefined)?.strokes ?? []);
}

interface LiveInk {
  round: number;
  turn: number;
  by: string;
  pts: number[];
}

/** The stroke being drawn right now by someone else, from the ephemeral ink stream. */
function useLiveStroke(view: V, lobby: Lobby): Stroke | null {
  const [live, setLive] = useState<LiveInk | null>(null);
  useEphemeral((raw) => {
    const m = raw as Partial<LiveInk> & { k?: string };
    if (m?.k !== 'ink' || !Array.isArray(m.pts) || typeof m.round !== 'number' || typeof m.turn !== 'number' || typeof m.by !== 'string') return;
    const { round, turn, by, pts } = m as LiveInk;
    setLive((cur) => (cur && cur.round === round && cur.turn === turn && cur.by === by ? { ...cur, pts: cur.pts.concat(pts) } : { round, turn, by, pts: pts.slice() }));
  });
  if (!live || view.phase !== 'draw' || live.round !== view.round || live.turn !== view.turn || live.pts.length < 2) return null;
  return { c: colorOf(lobby, live.by), w: STROKE_W, p: live.pts };
}

/** The shared canvas in its gilt frame with the category on a brass plate. */
function Gallery({ view, lobby }: { view: V; lobby: Lobby }) {
  const done = useRoundStrokes(view);
  const live = useLiveStroke(view, lobby);
  return (
    <figure class="fg-frame">
      <StrokeView strokes={live ? [...done, live] : done} aspect={ASPECT} paper="var(--stage)" label="Shared canvas" />
      <figcaption class="fg-plate">{view.category}</figcaption>
    </figure>
  );
}

/** Your turn: one continuous stroke in your seat color, streamed live to everyone. */
function MyStroke({ view, lobby, me, send }: { view: V; lobby: Lobby; me: string; send(a: ForgeryAction): void }) {
  const done = useRoundStrokes(view);
  return (
    <figure class="fg-frame is-mine">
      <DrawingCanvas
        key={`${view.round}-${view.turn}`}
        singleStroke
        tools={false}
        aspect={ASPECT}
        colors={[colorOf(lobby, me)]}
        widths={[STROKE_W]}
        underlay={done}
        paper="var(--stage)"
        label="Draw one stroke"
        onStrokeProgress={(pts) => {
          for (let i = 0; i < pts.length; i += 200) send({ type: 'ink', pts: pts.slice(i, i + 200) });
        }}
        onStroke={(stroke) => send({ type: 'stroke', stroke })}
      />
      <figcaption class="fg-plate">{view.category}</figcaption>
    </figure>
  );
}

// ---------- shared pieces ----------

function phaseTiming(view: V): number {
  return view.phase === 'draw' ? TURN_MS : view.phase === 'vote' ? VOTE_MS : view.phase === 'guess' ? GUESS_MS : REVEAL_MS;
}

function Bar({ view, size }: { view: V; size?: 'm' | 'l' }) {
  const lap = view.turns.length ? Math.min(LAPS, Math.floor(view.turn / (view.turns.length / LAPS)) + 1) : 1;
  return (
    <div class="g-spread fg-bar">
      <span class="eyebrow">
        Round {view.round} of {view.rounds}
        {view.phase === 'draw' && ` · lap ${lap} of ${LAPS}`}
        {view.phase === 'vote' && ' · vote'}
        {view.phase === 'guess' && ' · last chance'}
      </span>
      {view.phase !== 'reveal' && view.phase !== 'done' && <Timer deadline={view.deadline} total={phaseTiming(view)} size={size} />}
    </div>
  );
}

/** Turn order, one lap, in seat colors: done, now, to come. */
function TurnOrder({ view, lobby, size = '36px', named }: { view: V; lobby: Lobby; size?: string; named?: boolean }) {
  const lapLen = view.turns.length / LAPS;
  const lap = Math.floor(view.turn / lapLen);
  const order = view.turns.slice(0, lapLen);
  return (
    <ol class={`fg-order${named ? ' is-named' : ''}`} aria-label="Turn order">
      {order.map((id, i) => {
        const at = lap * lapLen + i;
        const state = view.phase !== 'draw' || at < view.turn ? 'done' : at === view.turn ? 'now' : 'next';
        const skipped = view.strokes[at] && view.strokes[at].id === null;
        const p = playerOf(lobby, id);
        return (
          <li key={id} class={`fg-turn is-${state}${skipped ? ' is-skipped' : ''}`} aria-current={state === 'now' ? 'step' : undefined}>
            <Avatar name={p?.name ?? '?'} color={colorOf(lobby, id)} size={size} away={view.gone.includes(id)} />
            {named && <span class="fg-turn-name">{p?.name ?? 'Someone'}</span>}
          </li>
        );
      })}
    </ol>
  );
}

function drawerLine(view: V, lobby: Lobby, me?: string): string {
  if (!view.drawer) return '';
  if (view.drawer === me) return 'Your turn. One stroke.';
  const next = view.turns[view.turn + 1];
  return `${nameOf(lobby, view.drawer)} is drawing${next && next === me ? '. You are up next.' : ''}`;
}

/** Vote pips: who voted for whom, popping in. */
function VoteTally({ view, lobby, size = '28px' }: { view: V; lobby: Lobby; size?: string }) {
  if (!view.result) return null;
  const { votes, tally } = view.result;
  const targets = Object.keys(tally).sort((a, b) => tally[b] - tally[a]);
  if (!targets.length) return <p class="g-muted">Nobody voted.</p>;
  return (
    <ul class="g-list fg-tally">
      {targets.map((t) => (
        <li key={t} class="g-spread">
          <PlayerChip lobby={lobby} id={t} />
          <span class="fg-pips">
            {Object.keys(votes)
              .filter((v) => votes[v] === t)
              .map((v, i) => (
                <span key={v} class="fg-pip" style={{ animationDelay: `${i * 120}ms` }}>
                  <Avatar name={nameOf(lobby, v)} color={colorOf(lobby, v)} size={size} />
                </span>
              ))}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Scoreboard({ view, lobby, me, size }: { view: V; lobby: Lobby; me?: string; size?: string }) {
  const ids = [...view.players].sort((a, b) => (view.scores[b] ?? 0) - (view.scores[a] ?? 0));
  const gain = view.reveal?.gain ?? {};
  return (
    <ul class="g-list fg-scores">
      {ids.map((id) => (
        <li key={id}>
          <PlayerChip
            lobby={lobby}
            id={id}
            you={id === me}
            size={size}
            trailing={
              <>
                {view.scores[id] ?? 0}
                {gain[id] ? <b class="fg-gain"> +{gain[id]}</b> : null}
              </>
            }
          />
        </li>
      ))}
    </ul>
  );
}

function verdict(view: V, lobby: Lobby): string {
  const r = view.reveal;
  if (!r) return '';
  const accused = view.result?.accused;
  if (r.outcome === 'void') return 'The forger left. Round skipped.';
  if (r.outcome === 'stolen') return 'Caught, but they guessed the word!';
  if (r.outcome === 'caught') return r.guess ? 'Caught, and the guess was wrong.' : 'Caught, and out of time to guess.';
  return accused ? `${nameOf(lobby, accused)} took the blame. The forger walks free!` : 'The vote tied. The forger walks free!';
}

/** The motion: votes land, the wax seal stamps the forger, the word, then points. */
function RevealPanel({ view, lobby, me, big }: { view: V; lobby: Lobby; me?: string; big?: boolean }) {
  const r = view.reveal;
  if (!r) return null;
  const startAt = (view.deadline ?? 0) - REVEAL_MS;
  const items: ComponentChildren[] = [];
  if (r.outcome !== 'void') {
    items.push(
      <div class="fg-rv" key="votes">
        <p class="eyebrow">The room voted</p>
        <VoteTally view={view} lobby={lobby} size={big ? '4vh' : '28px'} />
      </div>,
    );
  }
  items.push(
    <div class="fg-rv" key="forger">
      <p class="eyebrow">The forger was</p>
      <div class="fg-seal-wrap">
        <PlayerChip lobby={lobby} id={r.forger} size={big ? '7vh' : '44px'} you={r.forger === me} />
        <span class="fg-seal" aria-label="Forged">
          FORGED
        </span>
      </div>
    </div>,
    <div class="fg-rv" key="word">
      <p class="eyebrow">The word was</p>
      <p class="fg-word">{r.word}</p>
      {r.guess && <p class="g-muted">The forger guessed “{r.guess}”.</p>}
    </div>,
    <div class="fg-rv" key="score">
      <p class="fg-verdict">{verdict(view, lobby)}</p>
      <Scoreboard view={view} lobby={lobby} me={me} size={big ? '4.4vh' : undefined} />
    </div>,
  );
  return <RevealStage class="fg-reveal" items={items} startAt={startAt} interval={REVEAL_STEP_MS} layout="stack" />;
}

// ---------- phone ----------

function SecretCard({ view }: { view: V }) {
  const you = view.you;
  if (!you) return null;
  // Both cards share one look (tone, eyebrow, footer shape), so a glance at a phone, shown or
  // hidden, cannot tell the forger's card from an artist's.
  return (
    <PromptCard
      key={view.round}
      secret
      eyebrow="Your secret card"
      footer={`Category · ${view.category}`}
    >
      {you.role === 'forger' ? (
        <>
          You are the forger
          <span class="fg-card-note">Blend in. Nobody may find out you cannot see the word.</span>
        </>
      ) : (
        <>
          {you.word}
          <span class="fg-card-note">Hint at it. Do not give it away.</span>
        </>
      )}
    </PromptCard>
  );
}

function Player({ view, send, me, lobby }: PlayerProps<V, ForgeryAction>) {
  const seated = view.players.includes(me);
  const others = view.players.filter((id) => id !== me && !view.gone.includes(id));
  const isForger = view.you?.role === 'forger';

  let body: ComponentChildren = null;
  if (view.phase === 'draw') {
    body = (
      <>
        <p class={`fg-status${view.drawer === me ? ' is-me' : ''}`}>{drawerLine(view, lobby, me)}</p>
        {view.drawer === me ? <MyStroke view={view} lobby={lobby} me={me} send={send} /> : <Gallery view={view} lobby={lobby} />}
        <TurnOrder view={view} lobby={lobby} />
      </>
    );
  } else if (view.phase === 'vote') {
    body = (
      <>
        <Gallery view={view} lobby={lobby} />
        {seated ? (
          <Vote
            label="Who is the forger?"
            changeable
            value={view.myVote}
            onVote={(id) => send({ type: 'vote', target: id })}
            options={others.map((id) => ({ id, label: nameOf(lobby, id), color: colorOf(lobby, id) }))}
          />
        ) : null}
        <p class="g-muted fg-status">
          {view.voted.length} of {view.players.length - view.gone.length} voted
        </p>
      </>
    );
  } else if (view.phase === 'guess') {
    body = (
      <>
        {isForger ? (
          <>
            <p class="fg-status is-me">You were caught. Name the word to steal the win.</p>
            <Vote
              label="Guess the word"
              value={null}
              onVote={(word) => send({ type: 'guess', word })}
              options={(view.options ?? []).map((w) => ({ id: w, label: w }))}
            />
          </>
        ) : (
          <>
            <p class="fg-status">{nameOf(lobby, view.result?.accused)} was the forger, and gets one guess at the word.</p>
            <VoteTally view={view} lobby={lobby} />
          </>
        )}
        <Gallery view={view} lobby={lobby} />
      </>
    );
  } else {
    body = (
      <>
        <RevealPanel view={view} lobby={lobby} me={me} />
        <Gallery view={view} lobby={lobby} />
      </>
    );
  }

  return (
    <section class="g-stack fg-player">
      <Bar view={view} />
      {(view.phase === 'draw' || view.phase === 'vote') && <SecretCard view={view} />}
      {body}
    </section>
  );
}

// ---------- screen ----------

function Screen({ view, lobby }: ScreenProps<V>) {
  let rail: ComponentChildren;
  if (view.phase === 'draw') {
    rail = (
      <>
        <p class="fg-call">{view.drawer ? nameOf(lobby, view.drawer) : ''}</p>
        <p class="g-muted">is drawing one stroke</p>
        <TurnOrder view={view} lobby={lobby} size="5vh" named />
      </>
    );
  } else if (view.phase === 'vote') {
    rail = (
      <>
        <p class="fg-call">Who is the forger?</p>
        <p class="g-muted">Vote on your phone</p>
        <ul class="g-list fg-voters">
          {view.players
            .filter((id) => !view.gone.includes(id))
            .map((id) => (
              <li key={id} class={view.voted.includes(id) ? 'is-done' : ''}>
                <PlayerChip lobby={lobby} id={id} size="4.4vh" trailing={view.voted.includes(id) ? 'voted' : '…'} />
              </li>
            ))}
        </ul>
      </>
    );
  } else if (view.phase === 'guess') {
    rail = (
      <>
        <p class="fg-call">Caught!</p>
        <p class="g-muted">{nameOf(lobby, view.result?.accused)} gets one guess at the word</p>
        <VoteTally view={view} lobby={lobby} size="4vh" />
      </>
    );
  } else {
    rail = <RevealPanel view={view} lobby={lobby} big />;
  }
  return (
    <section class="fg-screen">
      <div class="fg-screen-main">
        <Bar view={view} />
        <Gallery view={view} lobby={lobby} />
      </div>
      <aside class="fg-rail g-panel">{rail}</aside>
    </section>
  );
}

function Rules() {
  return (
    <div class="g-stack">
      <p>
        Everyone but one player gets a category and a secret word. The forger sees only the category, and has to bluff. Take turns adding one single
        stroke to the shared canvas, twice around. Then vote on who the forger is.
      </p>
      <ul class="g-list">
        <li>Forger gets away (or the vote ties): forger +{POINTS.escaped}</li>
        <li>Forger caught, but guesses the word: forger +{POINTS.stolen}</li>
        <li>Forger caught and guesses wrong: every artist +{POINTS.caught}</li>
        <li>Each artist who voted for the forger: +{POINTS.sharpEye}</li>
      </ul>
      <p class="g-muted">The forger rotates each round. A round ends if the forger leaves, and a drawer who leaves is skipped.</p>
    </div>
  );
}

export default { Player, Screen, Rules } satisfies ClientGameModule;
