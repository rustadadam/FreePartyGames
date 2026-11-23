// Forgery UI. Phone: the role card, your secret card, your one stroke, the vote, the reveal.
// Screen: "check your phone", then the canvas in its gilt frame, the turn order, the vote and the
// reveal. With no screen the phone also shows the shared parts itself. Everything comes from the kit.
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { Avatar, DrawingCanvas, PlayerChip, PointsNote, PromptCard, RevealStage, RoleCard, RulesSheet, StrokeView, Timer, Vote, playerOf, sfx, useAssets, useDraft, useEphemeral, useSfxCount, useSfxCue } from '../../client/kit';
import type { Drawing, Stroke } from '../../client/kit';
import type { ClientGameModule, PlayerProps, ScreenProps } from '../../client/gameModule';
import type { Lobby } from '../../shared/types';
// Type-only import from logic.ts: a value import would pull zod and the game logic into this chunk.
import type { ForgeryAction, ForgeryView } from './logic';
import { GUESS_WORDS, normalizeGuess, suggestWords } from './words';
import { ASPECT, GUESS_MS, LAPS, POINTS, REVEAL_MS, REVEAL_STEP_MS, ROLE_MS, STROKE_W, VOTE_MS } from './rules';
import { play } from './sfx';
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
        label="Draw one line"
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

/** Sound (room audio device only): a tick per line drawn and per vote, the alarm when caught. */
function useForgeryCues(view: V) {
  useSfxCount(view.turn);
  useSfxCount(view.voted.length);
  useSfxCue(view.phase, (p) => p === 'guess' && play('busted'));
}

function phaseTiming(view: V): number {
  const by = { role: ROLE_MS, draw: view.turnMs, vote: VOTE_MS, guess: GUESS_MS, reveal: REVEAL_MS, done: REVEAL_MS };
  return by[view.phase];
}

function Bar({ view, size }: { view: V; size?: 'm' | 'l' }) {
  const lap = view.turns.length ? Math.min(LAPS, Math.floor(view.turn / (view.turns.length / LAPS)) + 1) : 1;
  return (
    <div class="g-spread fg-bar">
      <span class="eyebrow">
        Round {view.round} of {view.rounds}
        {view.phase === 'role' && ' · roles'}
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
  if (view.drawer === me) return 'Your turn. Draw one line.';
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

/** This round's points, top few only (the shell's podium shows the full ranking at the end). */
function Scoreboard({ view, lobby, me, size, max = 6 }: { view: V; lobby: Lobby; me?: string; size?: string; max?: number }) {
  const gain = view.reveal?.gain ?? {};
  const ids = view.players.filter((id) => gain[id]).sort((a, b) => gain[b] - gain[a]);
  if (!ids.length) return <p class="g-muted">Nobody scored this round.</p>;
  return (
    <ul class="g-list fg-scores">
      {ids.slice(0, max).map((id) => (
        <li key={id}>
          <PlayerChip lobby={lobby} id={id} you={id === me} size={size} trailing={<b class="fg-gain">+{gain[id]}</b>} />
        </li>
      ))}
      {ids.length > max && <li class="g-muted">+{ids.length - max} more</li>}
    </ul>
  );
}

/** "[Name] was the forger and escaped": the headline of the reveal ("You were ..." on the forger's own phone). */
function headline(view: V, lobby: Lobby, me?: string): string {
  const r = view.reveal;
  if (!r) return '';
  const you = r.forger === me;
  const who = you ? 'You were' : `${nameOf(lobby, r.forger)} was`;
  if (r.outcome === 'void') return `${who} the forger and left`;
  if (r.outcome === 'escaped') return `${who} the forger and escaped`;
  return `${who} the forger and ${you ? 'were' : 'was'} caught`;
}

/** The smaller second line: how the guess went, or who took the blame. */
function detail(view: V, lobby: Lobby, me?: string): string {
  const r = view.reveal;
  if (!r) return '';
  const they = r.forger === me ? 'You' : 'They';
  if (r.outcome === 'void') return 'The round was skipped.';
  if (r.outcome === 'stolen') return `${they} guessed the word and stole the win.`;
  if (r.outcome === 'caught') return r.guess ? `${they} guessed “${r.guess}”, which was wrong.` : `${they} ran out of time to guess.`;
  const accused = view.result?.accused;
  if (!accused) return 'The vote tied, so nobody was accused.';
  return accused === me ? 'You took the blame.' : `${nameOf(lobby, accused)} took the blame.`;
}

/**
 * The motion: votes land, the wax seal stamps the forger, the word, then points. `full` adds the
 * shared parts (vote tally, round points): the TV always shows them, a phone only with no TV.
 */
function RevealPanel({ view, lobby, me, full, big }: { view: V; lobby: Lobby; me?: string; full?: boolean; big?: boolean }) {
  const r = view.reveal;
  if (!r) return null;
  const startAt = (view.deadline ?? 0) - REVEAL_MS;
  const items: ComponentChildren[] = [];
  if (full && r.outcome !== 'void') {
    items.push(
      <div class="fg-rv" key="votes">
        <p class="eyebrow">The room voted</p>
        <VoteTally view={view} lobby={lobby} size={big ? '4vh' : '28px'} />
      </div>,
    );
  }
  const forgerAt = items.length;
  items.push(
    <div class="fg-rv" key="forger">
      <div class="fg-seal-wrap">
        <Avatar name={nameOf(lobby, r.forger)} color={colorOf(lobby, r.forger)} size={big ? '7vh' : '44px'} />
        <span class="fg-seal" aria-label="Forged">
          FORGED
        </span>
      </div>
      <p class="fg-verdict">{headline(view, lobby, me)}</p>
      <p class="g-muted fg-detail">{detail(view, lobby, me)}</p>
    </div>,
    <div class="fg-rv" key="word">
      <p class="eyebrow">The word was</p>
      <p class="fg-word">{r.word}</p>
    </div>,
  );
  if (full) {
    items.push(
      <div class="fg-rv" key="score">
        <Scoreboard view={view} lobby={lobby} me={me} size={big ? '4.4vh' : undefined} max={big ? 3 : 6} />
      </div>,
    );
  }
  if (view.mine.length) {
    const total = view.mine.reduce((n, l) => n + l.pts, 0);
    items.push(
      <div class="fg-rv" key="mine">
        <PointsNote lines={view.mine} total={view.mine.length > 1 ? total : undefined} />
      </div>,
    );
  }
  // The seal stamps on the forger; the last step stings with how the round went.
  const sound = (i: number) => {
    if (i === forgerAt) play('stamp');
    else if (i === items.length - 1 && r.outcome !== 'void') play(r.outcome === 'caught' ? 'caught' : 'escaped');
    else sfx.play('reveal');
  };
  return <RevealStage class="fg-reveal" items={items} startAt={startAt} interval={REVEAL_STEP_MS} layout="stack" sound={sound} />;
}

// ---------- phone ----------

/** The role card that opens every round. Both roles share one layout and similar line lengths. */
function RolePage({ view }: { view: V }) {
  const you = view.you;
  if (!you) return <p class="fg-status">The round is about to start.</p>;
  return (
    <RoleCard
      key={view.round}
      eyebrow={`Round ${view.round} of ${view.rounds} · your role`}
      role={you.role === 'forger' ? 'You are the Forger' : 'You are an artist'}
      detail={`Category: ${view.category} · Word: ${you.word ?? 'none'}`}
      deadline={view.deadline}
      total={ROLE_MS}
    />
  );
}

/** A small reminder of your secret during draw and vote (both roles share one look). */
function SecretCard({ view }: { view: V }) {
  const you = view.you;
  if (!you) return null;
  return (
    <PromptCard secret eyebrow="Your secret" quiet>
      {you.role === 'forger' ? 'You are the forger' : you.word}
    </PromptCard>
  );
}

/** The forger's last chance: type the word, pick it from the matches, and lock it in. One guess. */
function GuessBox({ view, onGuess, onDraft }: { view: V; onGuess(word: string): void; onDraft(word: string): void }) {
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const typed = normalizeGuess(text);
  const matches = suggestWords(text);
  const valid = GUESS_WORDS.includes(typed);
  // A word typed but not yet sent is submitted when time runs out.
  useDraft(valid ? typed : '', onDraft, { deadline: view.deadline, enabled: !sent });
  const submit = () => {
    if (!valid || sent) return;
    setSent(true);
    onGuess(typed);
  };
  return (
    <form
      class="fg-guess"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input
        class="input"
        aria-label="The secret word"
        value={text}
        disabled={sent}
        onInput={(e) => setText(e.currentTarget.value)}
        maxLength={40}
        placeholder="Type the word…"
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellcheck={false}
        enterKeyHint="go"
      />
      {!sent && matches.length > 0 && !(matches.length === 1 && matches[0] === typed) && (
        <ul class="fg-matches" aria-label="Matching words">
          {matches.map((w) => (
            <li key={w}>
              <button type="button" class="btn btn-s" onClick={() => setText(w)}>
                {w}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button class="btn btn-primary btn-block" disabled={!valid || sent}>
        {sent ? 'Guess sent' : valid ? `Guess “${typed}”` : 'Pick a word from the matches'}
      </button>
    </form>
  );
}

function Player({ view, send, me, lobby }: PlayerProps<V, ForgeryAction>) {
  useForgeryCues(view);
  const seated = view.players.includes(me);
  const others = view.players.filter((id) => id !== me && !view.gone.includes(id));
  const isForger = view.you?.role === 'forger';
  // With a TV connected the phone shows only what is yours: the canvas, tally and order live there.
  const shared = !lobby.screenConnected;

  // The role card is the whole page: nothing else competes with it, and nobody draws yet.
  if (view.phase === 'role') {
    return (
      <section class="g-stack fg-player">
        <RolePage view={view} />
      </section>
    );
  }

  let body: ComponentChildren = null;
  if (view.phase === 'draw') {
    body = (
      <>
        <p class={`fg-status${view.drawer === me ? ' is-me' : ''}`}>{drawerLine(view, lobby, me)}</p>
        {view.drawer === me ? <MyStroke view={view} lobby={lobby} me={me} send={send} /> : shared && <Gallery view={view} lobby={lobby} />}
        {shared && <TurnOrder view={view} lobby={lobby} />}
      </>
    );
  } else if (view.phase === 'vote') {
    body = (
      <>
        <p class="fg-status">Who is the forger?</p>
        {shared && <Gallery view={view} lobby={lobby} />}
        {seated ? (
          <Vote
            label="Who is the forger?"
            changeable
            value={view.myVote}
            onVote={(id) => send({ type: 'vote', target: id })}
            options={others.map((id) => ({ id, label: nameOf(lobby, id), color: colorOf(lobby, id) }))}
          />
        ) : null}
        {shared && (
          <p class="g-muted fg-status">
            {view.voted.length} of {view.players.length - view.gone.length} voted
          </p>
        )}
      </>
    );
  } else if (view.phase === 'guess') {
    body = isForger ? (
      <>
        <p class="fg-status is-me">They found you. Type the word to steal the win.</p>
        <GuessBox view={view} onGuess={(word) => send({ type: 'guess', word })} onDraft={(word) => send({ type: 'draft', word })} />
        {shared && <Gallery view={view} lobby={lobby} />}
      </>
    ) : (
      <>
        <p class="fg-status">{nameOf(lobby, view.result?.accused)} is the forger. If they guess the word, they steal the win.</p>
        {shared && <VoteTally view={view} lobby={lobby} />}
        {shared && <Gallery view={view} lobby={lobby} />}
      </>
    );
  } else {
    body = (
      <>
        {shared && <Gallery view={view} lobby={lobby} />}
        <RevealPanel view={view} lobby={lobby} me={me} full={shared} />
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
  useForgeryCues(view);
  if (view.phase === 'role') {
    return (
      <section class="fg-hush">
        <Bar view={view} size="l" />
        <div class="fg-hush-main">
          <p class="fg-call">Everyone, check your phone</p>
          <PromptCard size="l" eyebrow="Category" quiet>
            {view.category}
          </PromptCard>
        </div>
      </section>
    );
  }
  let rail: ComponentChildren;
  if (view.phase === 'draw') {
    rail = (
      <>
        <p class="fg-call">{view.drawer ? nameOf(lobby, view.drawer) : ''}</p>
        <p class="g-muted">is drawing one line</p>
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
    rail = <RevealPanel view={view} lobby={lobby} full big />;
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
    <RulesSheet
      story="You and a few distinguished guests have been invited to the world's greatest art challenge. Together, you will paint the next masterpiece, one that will stun the world and make every one of you rich. But one artist was never invited. They slipped in to take your fortune. Find them, or lose it all."
      how={[
        'Each round opens with a role card on your phone for five seconds. Everyone gets a category, like Kitchen tools. Everyone except the forger also gets a secret word from that category. The forger sees only the category.',
        'Take turns drawing one line on the shared canvas, to show you know the word. Go around the table twice.',
        'Vote on who you think the forger is. The player with the most votes is accused. If votes are tied, nobody is.',
        'If the forger is accused, they get one last chance: type the word. A right guess steals the win.',
      ]}
      scoring={[
        <>The forger gets away (or the vote is tied): forger +{POINTS.escaped}</>,
        <>The forger is caught but guesses the word: forger +{POINTS.stolen}</>,
        <>The forger is caught and guesses wrong: every artist +{POINTS.caught}</>,
        <>Each artist who voted for the forger: +{POINTS.sharpEye}</>,
      ]}
      note="Every round has a new forger. If the forger leaves, the round is skipped. If a drawer leaves, their turn is skipped."
    />
  );
}

export default { Player, Screen, Rules } satisfies ClientGameModule;
