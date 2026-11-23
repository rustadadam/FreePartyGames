// Second Witness UI. Motif: the gold plate. The prompt is a chapter heading engraved on a plate,
// answers are numbered like verses ("3:1", "3:2"), witness counts are small marks on the plate,
// and a temple silhouette sits quietly behind the prompt.
import { useEffect, useRef, useState } from 'preact/hooks';
import { Avatar, PromptCard, RevealStage, RulesSheet, Timer, playerOf, useSfxCount } from '../../client/kit';
import type { ClientGameModule, PlayerProps, ScreenProps } from '../../client/gameModule';
import type { Lobby } from '../../shared/types';
// Type-only imports from logic.ts: a value import would pull zod and the game logic into this chunk.
import type { SWAction, SWView } from './logic';
import { normalize } from './match';
import {
  FINAL_MS,
  MAX_ANSWER_LEN,
  MULTIPLIERS,
  POINTS,
  UNIQUE_BONUS,
  UNIQUE_MIN_ROUNDS,
  type Outcome,
} from './rules';
import { play } from './sfx';
import './ui.css';

const OUTCOME_LABEL: Record<Outcome, string> = {
  single: 'Matched',
  second: 'Both matched',
  half: 'One of two matched',
  none: 'No match',
  blank: 'No answer',
};

function Temple({ class: cls }: { class?: string }) {
  return (
    <svg class={`sw-temple${cls ? ` ${cls}` : ''}`} viewBox="0 0 48 54" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M24 1l3.2 11v18H20.8V12zM8 17l3 9v14H5V26zM40 17l3 9v14h-6V26zM4 36h40v12H4zM1 48h46v5H1z" />
    </svg>
  );
}

function Header({ view }: { view: SWView }) {
  const over = view.phase === 'final' || view.phase === 'done';
  const total = view.phase === 'write' ? view.writeMs : view.phase === 'call' ? view.callMs : view.phase === 'final' ? FINAL_MS : undefined;
  return (
    <div class="g-spread sw-head">
      <span class="sw-head-id">
        <Temple />
        <span class="eyebrow">{over ? 'Final scores' : `Round ${view.round} of ${view.rounds}`}</span>
      </span>
      {!over && (
        <span class="sw-mult" aria-label={`Score multiplier ${view.mult}`}>
          &times;{view.mult}
        </span>
      )}
      {(view.phase === 'write' || view.phase === 'call') && <Timer deadline={view.deadline} total={total} urgentAt={view.phase === 'call' ? 0 : 10} quiet={view.phase === 'call'} />}
    </div>
  );
}

/** The prompt, engraved like a chapter heading. */
function Chapter({ view, size, compact }: { view: SWView; size?: 'l'; compact?: boolean }) {
  return (
    <PromptCard eyebrow={`Round ${view.round}`} size={size ?? 'm'} tone="accent" class={`sw-plate sw-chapter${compact ? ' is-compact' : ''}`}>
      {view.prompt.text}
      <Temple class="sw-watermark" />
    </PromptCard>
  );
}

function Pills({ view, lobby, size }: { view: SWView; lobby: Lobby; size: string }) {
  const here = view.players.filter((p) => !view.gone.includes(p));
  return (
    <div class="sw-pills" aria-label="Who has submitted">
      {here.map((id) => {
        const p = playerOf(lobby, id);
        return (
          <span key={id} class={`sw-pill${view.locked.includes(id) ? ' is-in' : ''}`}>
            <Avatar name={p?.name ?? '?'} color={p?.color ?? '#9aa5b1'} size={size} />
          </span>
        );
      })}
    </div>
  );
}

const hereCount = (view: SWView): number => view.players.length - view.gone.length;

// ---------- write ----------

function Verses({ view, answers }: { view: SWView; answers: string[] }) {
  return (
    <ol class="sw-verses">
      {answers.map((t, i) => (
        <li key={i} class="sw-plate sw-ans">
          <span class="sw-vn">
            {view.round}:{i + 1}
          </span>
          <span class="sw-ans-text">{t}</span>
        </li>
      ))}
    </ol>
  );
}

function WriteForm({ view, send }: { view: SWView; send(a: SWAction): void }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const ta = a.trim();
  const tb = b.trim();
  const list = [ta, tb].filter(Boolean);
  const same = list.length === 2 && normalize(list[0]) === normalize(list[1]);
  const n = same ? 1 : list.length;
  const m = view.mult;
  const hint =
    n === 0
      ? `Write one answer to play it safe: ${POINTS.single * m} points if someone else writes it too. Write two to gamble: ${POINTS.second * m} points if both match, ${POINTS.half * m} if only one does.`
      : n === 1
        ? `One answer: ${POINTS.single * m} points if someone else wrote it too.`
        : `Two answers: ${POINTS.second * m} points if both match, ${POINTS.half * m} if only one does, 0 if neither.`;
  const lock = (e: Event) => {
    e.preventDefault();
    if (list.length) send({ type: 'submit', answers: list });
  };
  return (
    <>
      <form id="sw-form" class="sw-form" onSubmit={lock}>
        {[
          [a, setA, 'Your answer'],
          [b, setB, 'A second answer (optional)'],
        ].map(([val, set, ph], i) => (
          <label key={i} class="sw-line">
            <span class="sw-vn">
              {view.round}:{i + 1}
            </span>
            <input
              class="input sw-input"
              type="text"
              value={val as string}
              maxLength={MAX_ANSWER_LEN}
              placeholder={ph as string}
              autocomplete="off"
              autocapitalize="sentences"
              enterkeyhint={i === 0 ? 'next' : 'done'}
              aria-label={`Answer ${i + 1}`}
              onInput={(e) => (set as (v: string) => void)((e.target as HTMLInputElement).value)}
            />
          </label>
        ))}
      </form>
      <p class={`sw-hint${same ? ' is-warn' : ''}`}>{same ? 'Those two answers are the same, so they count as one.' : hint}</p>
      <div class="sw-dock">
        <button type="submit" form="sw-form" class="btn btn-primary btn-block" disabled={!list.length}>
          {n === 2 ? 'Submit both answers' : 'Submit answer'}
        </button>
      </div>
    </>
  );
}

function WritePlayer({ view, send, lobby }: { view: SWView; send(a: SWAction): void; lobby: Lobby }) {
  const mine = view.you?.answers;
  return (
    <section class="sw-phone">
      <Header view={view} />
      <Chapter view={view} />
      {mine ? (
        <>
          <Verses view={view} answers={mine} />
          <p class="sw-hint">
            Answer submitted. Waiting for {Math.max(0, hereCount(view) - view.locked.length)} more. Each player's answers are shown on their turn.
          </p>
          <Pills view={view} lobby={lobby} size="30px" />
        </>
      ) : (
        <WriteForm key={view.round} view={view} send={send} />
      )}
    </section>
  );
}

// ---------- call: one player's words at a time ----------

type Call = NonNullable<SWView['call']>;
type Side = 'mine' | 'theirs';
interface Pick {
  side: Side;
  i: number;
}

/**
 * Drag one word onto the other (the one that matches), or tap one and then the other. Pointer events,
 * not HTML drag and drop: that does not work on touch screens. Disabled plates get no props at all,
 * so they are neither draggable nor a drop target.
 */
function useMatchPick(onMatch: (mine: number, theirs: number) => void) {
  const [sel, setSel] = useState<Pick | null>(null);
  const [drag, setDrag] = useState<{ from: Pick; over: Pick | null; x: number; y: number; text: string } | null>(null);
  const start = useRef<{ from: Pick; x: number; y: number; text: string; moved: boolean } | null>(null);

  const finish = (a: Pick, b: Pick) => {
    if (a.side !== b.side) onMatch(a.side === 'mine' ? a.i : b.i, a.side === 'theirs' ? a.i : b.i);
  };
  const pickAt = (x: number, y: number): Pick | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-side]');
    return el ? { side: el.dataset.side as Side, i: Number(el.dataset.i) } : null;
  };
  const tap = (side: Side, i: number) => {
    if (sel && sel.side !== side) {
      finish(sel, { side, i });
      setSel(null);
    } else setSel(sel && sel.side === side && sel.i === i ? null : { side, i });
  };

  const bind = (side: Side, i: number, text: string, enabled: boolean) =>
    enabled
      ? {
          'data-side': side,
          'data-i': i,
          role: 'button' as const,
          tabIndex: 0,
          onKeyDown(e: KeyboardEvent) {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              tap(side, i);
            }
          },
          onPointerDown(e: PointerEvent) {
            start.current = { from: { side, i }, x: e.clientX, y: e.clientY, text, moved: false };
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          },
          onPointerMove(e: PointerEvent) {
            const s = start.current;
            if (!s || (!s.moved && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 8)) return;
            s.moved = true;
            const over = pickAt(e.clientX, e.clientY);
            setDrag({ from: s.from, over: over && over.side !== s.from.side ? over : null, x: e.clientX, y: e.clientY, text: s.text });
          },
          onPointerUp(e: PointerEvent) {
            const s = start.current;
            start.current = null;
            setDrag(null);
            if (!s) return;
            if (!s.moved) tap(side, i);
            else {
              const to = pickAt(e.clientX, e.clientY);
              if (to) finish(s.from, to);
              setSel(null);
            }
          },
          onPointerCancel() {
            start.current = null;
            setDrag(null);
          },
        }
      : {};

  const is = (p: Pick | null, side: Side, i: number) => !!p && p.side === side && p.i === i;
  return { bind, drag, selected: (side: Side, i: number) => is(sel, side, i) || is(drag?.from ?? null, side, i), over: (side: Side, i: number) => is(drag?.over ?? null, side, i), sel };
}

function Matchers({ ids, lobby, size }: { ids: string[]; lobby: Lobby; size: string }) {
  return (
    <span class="sw-matchers" role="img" aria-label={`${ids.length} matched`}>
      {ids.map((id) => {
        const p = playerOf(lobby, id);
        return <Avatar key={id} name={p?.name ?? '?'} color={p?.color ?? '#9aa5b1'} size={size} />;
      })}
    </span>
  );
}

/** One of the active player's words: a plate that shows who matched it, or the error stamp. */
function TheirWord({
  w,
  i,
  view,
  lobby,
  big,
  props,
  selected,
  over,
}: {
  w: Call['words'][number];
  i: number;
  view: SWView;
  lobby: Lobby;
  big?: boolean;
  props?: Record<string, unknown>;
  selected?: boolean;
  over?: boolean;
}) {
  const matched = w.matchers.length > 0;
  return (
    <div
      class={`sw-plate sw-word${matched ? ' is-matched' : ''}${w.error ? ' is-error' : ''}${selected ? ' is-selected' : ''}${over ? ' is-over' : ''}${props?.role ? ' is-live' : ''}${big ? ' is-big' : ''}`}
      {...props}
    >
      <span class="sw-vn">
        {view.round}:{i + 1}
      </span>
      <span class="sw-word-text">{w.text}</span>
      {matched && <Matchers ids={w.matchers} lobby={lobby} size={big ? '5vh' : '28px'} />}
      {w.error && <span class="sw-stamp">No match</span>}
    </div>
  );
}

function TurnId({ view, lobby, me, big }: { view: SWView; lobby: Lobby; me?: string; big?: boolean }) {
  const call = view.call!;
  const p = playerOf(lobby, call.active);
  return (
    <div class="sw-turn">
      <Avatar name={p?.name ?? '?'} color={p?.color ?? '#9aa5b1'} size={big ? '9vh' : '44px'} />
      <span class="sw-turn-body">
        <span class="eyebrow">
          Turn {call.turn} of {call.turns}
        </span>
        <b>{call.active === me ? 'Your words' : `${p?.name ?? 'Someone'}'s words`}</b>
      </span>
    </div>
  );
}

function TurnScores({ view, lobby, me, big }: { view: SWView; lobby: Lobby; me?: string; big?: boolean }) {
  const pts = view.call!.pts;
  const ids = view.players.filter((p) => !view.gone.includes(p) || pts[p]);
  ids.sort((a, b) => (pts[b] ?? 0) - (pts[a] ?? 0) || (view.scores[b] ?? 0) - (view.scores[a] ?? 0));
  const size = big ? '5vh' : '34px';
  return (
    <div class="sw-scores">
      <p class="eyebrow">Points this turn</p>
      <div class="sw-score-list">
        {ids.map((id) => {
          const p = playerOf(lobby, id);
          return (
            <div key={id} class={`sw-score${id === me ? ' is-you' : ''}${(pts[id] ?? 0) > 0 ? ' is-pay' : ''}`}>
              <Avatar name={p?.name ?? '?'} color={p?.color ?? '#9aa5b1'} size={size} />
              <span class="sw-score-name">
                {p?.name ?? 'Someone'}
                {id === me && <span class="g-muted"> (you)</span>}
              </span>
              <span class="sw-score-pts">+{pts[id] ?? 0}</span>
              <span class="sw-score-total">{view.scores[id] ?? 0}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The transition cues, one after another: a chime for each matched word, the buzzer for each failed one. */
function useResultSounds(call: Call) {
  useEffect(() => {
    const cues = call.words.flatMap((w) => (w.error ? [() => play('error')] : w.matchers.length ? [() => play('witness', { n: w.matchers.length + 1 })] : []));
    const timers = cues.map((cue, k) => setTimeout(cue, 150 + k * 380));
    return () => timers.forEach(clearTimeout);
  }, []);
}

/** The count of matches on the active player's words: a tick climbs the scale as each one lands. */
const matchCount = (view: SWView): number => (view.phase === 'call' && view.call ? view.call.words.reduce((n, w) => n + w.matchers.length, 0) : 0);

function CallPlayer({ view, send, lobby, me }: { view: SWView; send(a: SWAction): void; lobby: Lobby; me: string }) {
  const call = view.call!;
  const you = view.you!;
  const mine = you.answers ?? [];
  const mineTurn = call.active === me;
  const live = !mineTurn && mine.length > 0;
  const pick = useMatchPick((m, th) => send({ type: 'match', mine: m, theirs: th }));
  return (
    <section class="sw-phone">
      <Header view={view} />
      <Chapter view={view} compact />
      <TurnId view={view} lobby={lobby} me={me} />
      <div class="sw-words" aria-label="Their words">
        {call.words.map((w, i) => (
          <TheirWord key={i} w={w} i={i} view={view} lobby={lobby} props={pick.bind('theirs', i, w.text, live)} selected={pick.selected('theirs', i)} over={pick.over('theirs', i)} />
        ))}
      </div>
      {mineTurn ? (
        <p class="sw-hint">Everyone is matching your words. Matches show up on the plates.</p>
      ) : live ? (
        <>
          <p class="sw-hint">Drag your word onto theirs when they match, or tap one then the other. Seven seconds.</p>
          <div class="sw-words sw-mine" aria-label="Your words">
            {mine.map((text, i) => {
              const dead = you.dead[i];
              const claimed = you.claims[i];
              return (
                <div
                  key={i}
                  class={`sw-plate sw-word${you.matched[i] ? ' is-matched' : ''}${dead ? ' is-dead' : ''}${pick.selected('mine', i) ? ' is-selected' : ''}${pick.over('mine', i) ? ' is-over' : ''}${dead ? '' : ' is-live'}`}
                  {...pick.bind('mine', i, text, !dead)}
                >
                  <span class="sw-vn">
                    {view.round}:{i + 1}
                  </span>
                  <span class="sw-word-text">{text}</span>
                  <span class="sw-yours">{dead ? 'No match' : claimed !== null ? 'Matched' : you.matched[i] ? 'Matched earlier' : 'Yours'}</span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p class="sw-hint">You did not write anything this round. Watch the plates.</p>
      )}
      {pick.drag && (
        <div class="sw-plate sw-ghost" style={{ left: `${pick.drag.x}px`, top: `${pick.drag.y}px` }} aria-hidden="true">
          {pick.drag.text}
        </div>
      )}
    </section>
  );
}

function ResultPlayer({ view, lobby, me }: { view: SWView; lobby: Lobby; me: string }) {
  const call = view.call!;
  useResultSounds(call);
  return (
    <section class="sw-phone">
      <Header view={view} />
      <Chapter view={view} compact />
      <TurnId view={view} lobby={lobby} me={me} />
      <div class="sw-words">
        {call.words.map((w, i) => (
          <TheirWord key={i} w={w} i={i} view={view} lobby={lobby} />
        ))}
      </div>
      <TurnScores view={view} lobby={lobby} me={me} />
    </section>
  );
}

function CallScreen({ view, lobby }: { view: SWView; lobby: Lobby }) {
  const call = view.call!;
  const result = view.phase === 'result';
  return (
    <section class="sw-screen">
      <Header view={view} />
      <div class="sw-stage sw-call-screen">
        <Chapter view={view} size="l" compact />
        <TurnId view={view} lobby={lobby} big />
        <div class="sw-words is-big">
          {call.words.map((w, i) => (
            <TheirWord key={i} w={w} i={i} view={view} lobby={lobby} big />
          ))}
        </div>
        {result ? <TurnScores view={view} lobby={lobby} big /> : <p class="sw-stage-hint">If you wrote the same thing, drag your word onto theirs on your phone. Quick!</p>}
      </div>
    </section>
  );
}

/** Keyed by turn so each result plays its cues once. */
function ResultScreen({ view, lobby }: { view: SWView; lobby: Lobby }) {
  useResultSounds(view.call!);
  return <CallScreen view={view} lobby={lobby} />;
}

// ---------- round standings ----------

function RoundScores({ view, lobby, me, big }: { view: SWView; lobby: Lobby; me?: string; big?: boolean }) {
  const r = view.reveal!;
  const ids = view.players.filter((p) => !view.gone.includes(p) || r.pts[p]);
  ids.sort((a, b) => (r.pts[b] ?? 0) - (r.pts[a] ?? 0) || (view.scores[b] ?? 0) - (view.scores[a] ?? 0));
  const size = big ? '5vh' : '34px';
  return (
    <div class="sw-scores">
      <p class="eyebrow">
        Round {view.round} &middot; &times;{view.mult}
      </p>
      <RevealStage
        class="sw-score-list"
        interval={90}
        items={ids.map((id) => {
          const p = playerOf(lobby, id);
          const o = r.outcome[id] ?? 'blank';
          return (
            <div key={id} class={`sw-score${id === me ? ' is-you' : ''}${(r.pts[id] ?? 0) > 0 ? ' is-pay' : ''}`}>
              <Avatar name={p?.name ?? '?'} color={p?.color ?? '#9aa5b1'} size={size} />
              <span class="sw-score-name">
                {p?.name ?? 'Someone'}
                {id === me && <span class="g-muted"> (you)</span>}
                <span class="sw-also">{OUTCOME_LABEL[o]}</span>
              </span>
              <span class="sw-score-pts">+{r.pts[id] ?? 0}</span>
              <span class="sw-score-total">{view.scores[id] ?? 0}</span>
            </div>
          );
        })}
      />
    </div>
  );
}

function RevealPlayer({ view, lobby, me }: { view: SWView; lobby: Lobby; me: string }) {
  const r = view.reveal!;
  const mine = r.outcome[me];
  return (
    <section class="sw-phone">
      <Header view={view} />
      <Chapter view={view} compact />
      {mine && (
        <p class={`sw-yourpts${(r.pts[me] ?? 0) > 0 ? ' is-pay' : ''}`}>
          <b>+{r.pts[me] ?? 0}</b> {OUTCOME_LABEL[mine]}
          {(r.pts[me] ?? 0) > 0 && view.mult > 1 ? ` (×${view.mult})` : ''}
        </p>
      )}
      <RoundScores view={view} lobby={lobby} me={me} />
    </section>
  );
}

function RevealScreen({ view, lobby }: { view: SWView; lobby: Lobby }) {
  return (
    <section class="sw-screen">
      <Header view={view} />
      <div class="sw-stage">
        <div class="sw-stage-scores">
          <Chapter view={view} size="l" compact />
          <RoundScores view={view} lobby={lobby} big />
        </div>
      </div>
    </section>
  );
}

// ---------- final ----------

function FinalBoard({ view, lobby, me, big }: { view: SWView; lobby: Lobby; me?: string; big?: boolean }) {
  const sc = view.scores;
  const ids = Object.keys(sc).sort((a, b) => sc[b] - sc[a]);
  const size = big ? '5vh' : '34px';
  return (
    <div class="sw-final">
      {view.bonus.length > 0 ? (
        <ul class="sw-bonus">
          {view.bonus.map((id) => {
            const p = playerOf(lobby, id);
            return (
              <li key={id} class="sw-plate sw-thinker">
                <Avatar name={p?.name ?? '?'} color={p?.color ?? '#9aa5b1'} size={big ? '8vh' : '48px'} />
                <span class="sw-thinker-body">
                  <span class="eyebrow">Unique thinker</span>
                  <b>{id === me ? 'You' : (p?.name ?? 'Someone')}</b>
                  <span class="sw-also">{view.twoZero[id]} rounds with two answers and no match</span>
                </span>
                <span class="sw-thinker-pts">+{UNIQUE_BONUS}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p class="g-muted">Nobody earned the Unique thinker bonus this time.</p>
      )}
      <RevealStage
        class="sw-score-list"
        interval={130}
        items={ids.map((id, i) => {
          const p = playerOf(lobby, id);
          return (
            <div key={id} class={`sw-score${id === me ? ' is-you' : ''}${i === 0 ? ' is-pay' : ''}`}>
              <span class="sw-rank">{i + 1}</span>
              <Avatar name={p?.name ?? '?'} color={p?.color ?? '#9aa5b1'} size={size} />
              <span class="sw-score-name">
                {p?.name ?? 'Someone'}
                {id === me && <span class="g-muted"> (you)</span>}
              </span>
              {view.bonus.includes(id) && <span class="sw-score-pts">+{UNIQUE_BONUS}</span>}
              <span class="sw-score-total">{sc[id]}</span>
            </div>
          );
        })}
      />
    </div>
  );
}

// ---------- shells ----------

function Player({ view, send, lobby, me }: PlayerProps<SWView, SWAction>) {
  useSfxCount(view.locked.length); // a tick per answer in
  useSfxCount(matchCount(view)); // a tick per match on the plates
  if (view.phase === 'write') return <WritePlayer view={view} send={send} lobby={lobby} />;
  if (view.phase === 'call' && view.call && view.you) return <CallPlayer view={view} send={send} lobby={lobby} me={me} />;
  if (view.phase === 'result' && view.call) return <ResultPlayer view={view} lobby={lobby} me={me} />;
  if (view.phase === 'reveal' && view.reveal) return <RevealPlayer view={view} lobby={lobby} me={me} />;
  return (
    <section class="sw-phone">
      <Header view={view} />
      <h2 class="g-title">Final totals</h2>
      <FinalBoard view={view} lobby={lobby} me={me} />
    </section>
  );
}

function Screen({ view, lobby }: ScreenProps<SWView>) {
  useSfxCount(view.locked.length);
  useSfxCount(matchCount(view));
  if (view.phase === 'call' && view.call) return <CallScreen view={view} lobby={lobby} />;
  if (view.phase === 'result' && view.call) return <ResultScreen view={view} lobby={lobby} />;
  if (view.phase === 'reveal' && view.reveal) return <RevealScreen view={view} lobby={lobby} />;
  if (view.phase === 'final' || view.phase === 'done') {
    return (
      <section class="sw-screen">
        <Header view={view} />
        <div class="sw-stage">
          <h2 class="g-title sw-final-title">Final totals</h2>
          <FinalBoard view={view} lobby={lobby} big />
        </div>
      </section>
    );
  }
  return (
    <section class="sw-screen">
      <Header view={view} />
      <div class="sw-stage sw-write-screen">
        <Chapter view={view} size="l" />
        <p class="sw-stage-hint">
          Write one or two answers on your phone. You score when someone else writes the same answer. {view.mult > 1 ? `This round scores ×${view.mult}.` : ''}
        </p>
        <Pills view={view} lobby={lobby} size="8vh" />
        <p class="g-muted">
          {view.locked.length} of {hereCount(view)} submitted
        </p>
      </div>
    </section>
  );
}

function Rules() {
  return (
    <RulesSheet
      story="It is an old rule that a matter is settled by the mouth of two witnesses. Here, an answer only counts if someone else wrote it too. Each round, you all get the same category, and everyone secretly writes what they think the others will write."
      how={[
        'Each round shows a category. You have 30 seconds to secretly write one or two answers, up to 40 characters each. One answer is the safe play. Two answers is the gamble.',
        'Then the players take turns, in a random order. On your turn your words appear on every screen. Everyone else gets seven seconds to say which of their own words match yours: drag your word onto theirs, or theirs onto yours. You decide what counts as a match, so be fair.',
        'When the seven seconds are up, any word that nobody matched fails with a buzz, and everyone sees the points they just earned. A failed word can no longer match. If every word is already matched, the round moves on.',
        'After the last turn you see the round standings. Later rounds are worth more.',
      ]}
      scoring={[
        `One answer that someone else also wrote: ${POINTS.single} points`,
        `Two answers, both matched: ${POINTS.second} points`,
        `Two answers, only one matched: ${POINTS.half} point`,
        'Nothing matched, or no answer: 0 points',
        `There are ${MULTIPLIERS.length} rounds. Points are multiplied by ×${MULTIPLIERS.join(', ×')} in order`,
        `Unique thinker: if you wrote two answers and scored nothing in ${UNIQUE_MIN_ROUNDS} or more rounds, you get +${UNIQUE_BONUS} at the end`,
      ]}
      note="Nobody sees anyone else's answers until it is their turn. If a player leaves, their turn is skipped."
    />
  );
}

export default { Player, Screen, Rules } satisfies ClientGameModule;
