// Second Witness UI. Motif: the gold plate. The prompt is a chapter heading engraved on a plate, answers
// are numbered like verses ("3:1", "3:2"), a word someone matched goes verdigris with a check, and a
// temple silhouette sits quietly behind the prompt.
//
// Two pages: write (type your words) and match (your own words only; tap the ones someone matched, then Done).
import { useState } from 'preact/hooks';
import { Check } from 'lucide-preact';
import { Avatar, PointsNote, PromptCard, RulesSheet, Timer, playerOf, useDraft, useSfxCount } from '../../client/kit';
import type { ClientGameModule, PlayerProps, ScreenProps } from '../../client/gameModule';
import type { Lobby } from '../../shared/types';
// Type-only imports from logic.ts: a value import would pull zod and the game logic into this chunk.
import type { SWAction, SWView } from './logic';
import { normalize } from './match';
import { MAX_ANSWER_LEN, POINTS, WRITE_MS } from './rules';
import { play } from './sfx';
import './ui.css';

function Temple({ class: cls }: { class?: string }) {
  return (
    <svg class={`sw-temple${cls ? ` ${cls}` : ''}`} viewBox="0 0 48 54" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M24 1l3.2 11v18H20.8V12zM8 17l3 9v14H5V26zM40 17l3 9v14h-6V26zM4 36h40v12H4zM1 48h46v5H1z" />
    </svg>
  );
}

function Header({ view }: { view: SWView }) {
  const writing = view.phase === 'write';
  return (
    <div class="g-spread sw-head">
      <span class="sw-head-id">
        <Temple />
        <span class="eyebrow">{writing ? 'Writing' : 'Matching'}</span>
      </span>
      <Timer deadline={view.deadline} total={writing ? view.writeMs : view.matchMs} urgentAt={writing ? 10 : 15} quiet={!writing} />
    </div>
  );
}

/** The prompt, engraved like a chapter heading. */
function Chapter({ view, size, compact }: { view: SWView; size?: 'l'; compact?: boolean }) {
  return (
    <PromptCard eyebrow={`Chapter ${view.chapter}`} size={size ?? 'm'} tone="accent" quiet={compact} class={`sw-plate sw-chapter${compact ? ' is-compact' : ''}`}>
      {view.prompt.text}
      <Temple class="sw-watermark" />
    </PromptCard>
  );
}

/** One avatar per player who is here; the ones in `inIds` (locked in, or done) are lit. */
function Pills({ view, lobby, inIds, size, label }: { view: SWView; lobby: Lobby; inIds: string[]; size: string; label: string }) {
  return (
    <div class="sw-pills" aria-label={label}>
      {view.players
        .filter((id) => !view.gone.includes(id))
        .map((id) => {
          const p = playerOf(lobby, id);
          return (
            <span key={id} class={`sw-pill${inIds.includes(id) ? ' is-in' : ''}`}>
              <Avatar name={p?.name ?? '?'} color={p?.color ?? '#9aa5b1'} size={size} />
            </span>
          );
        })}
    </div>
  );
}

const hereCount = (view: SWView): number => view.players.length - view.gone.length;
/** How many present players have not yet locked in (write) or checked off Done (match). */
const waitingFor = (view: SWView, inIds: string[]): number => view.players.filter((p) => !view.gone.includes(p) && !inIds.includes(p)).length;

// ---------- write ----------

function Verses({ view, answers }: { view: SWView; answers: string[] }) {
  return (
    <ol class="sw-verses">
      {answers.map((t, i) => (
        <li key={i} class="sw-plate sw-ans">
          <span class="sw-vn">
            {view.chapter}:{i + 1}
          </span>
          <span class="sw-ans-text">{t}</span>
        </li>
      ))}
    </ol>
  );
}

function WriteForm({ view, send }: { view: SWView; send(a: SWAction): void }) {
  const [a, setA] = useState(view.you?.draft?.[0] ?? '');
  const [b, setB] = useState(view.you?.draft?.[1] ?? '');
  const ta = a.trim();
  const tb = b.trim();
  const list = [ta, tb].filter(Boolean);
  const same = list.length === 2 && normalize(list[0]) === normalize(list[1]);
  const n = same ? 1 : list.length;
  // Half-typed words are sent when the page hides and just before time is up, and submitted for you then.
  useDraft([ta, tb], (answers) => send({ type: 'draft', answers }), { deadline: view.deadline, isEmpty: (v) => !v.some(Boolean) });
  const hint =
    n === 0
      ? `One answer is the safe play: ${POINTS.single} points if someone else writes it too. Two is a gamble: ${POINTS.second} if both match, ${POINTS.half} if only one does.`
      : n === 1
        ? `One answer: ${POINTS.single} points if someone else wrote it too.`
        : `Two answers: ${POINTS.second} points if both match, ${POINTS.half} if only one does, 0 if neither.`;
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
              {view.chapter}:{i + 1}
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
          <p class="sw-hint">Answer locked in. Waiting for {waitingFor(view, view.locked)} more.</p>
          {!lobby.screenConnected && <Pills view={view} lobby={lobby} inIds={view.locked} size="26px" label="Who has submitted" />}
        </>
      ) : (
        <WriteForm view={view} send={send} />
      )}
    </section>
  );
}

// ---------- match ----------

function MatchPlayer({ view, send, lobby }: { view: SWView; send(a: SWAction): void; lobby: Lobby }) {
  const you = view.you!;
  const mine = you.answers ?? [];
  const tapped = you.matched.some(Boolean);
  const waiting = waitingFor(view, view.done);
  const lede = !mine.length
    ? 'You did not write anything this time. Listen along while the others match.'
    : you.done
      ? `Waiting for ${waiting} more to check off Done.`
      : tapped
        ? 'Tap each word that someone else matched.'
        : 'Go around the room: everyone says what they wrote, and who matched.';
  return (
    <section class="sw-phone">
      <Header view={view} />
      <Chapter view={view} compact />
      <p class="sw-lede">{lede}</p>
      {mine.length > 0 && (
        <div class="sw-words" role="group" aria-label="Your words">
          {mine.map((text, i) => {
            const on = you.matched[i];
            return (
              <button
                key={i}
                type="button"
                class={`sw-plate sw-word${on ? ' is-matched' : ''}${you.done ? ' is-locked' : ''}`}
                aria-pressed={on}
                aria-disabled={you.done}
                onClick={() => {
                  if (you.done) return;
                  send({ type: 'match', word: i, on: !on });
                  if (!on) play('witness', { n: 2 });
                }}
              >
                <span class="sw-vn">
                  {view.chapter}:{i + 1}
                </span>
                <span class="sw-word-text">{text}</span>
                <span class="sw-mark">
                  {on ? <Check size={20} strokeWidth={3} aria-hidden="true" /> : null}
                  {on ? 'Matched' : 'Tap if matched'}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {!lobby.screenConnected && (
        <div class="sw-who">
          <Pills view={view} lobby={lobby} inIds={view.done} size="22px" label="Who is done" />
          <span class="sw-hint">
            {view.done.length} of {hereCount(view)} done
          </span>
        </div>
      )}
      <div class="sw-dock">
        <PointsNote lines={you.why} />
        {mine.length > 0 && (
          <button type="button" class={`btn btn-block ${you.done ? 'btn-ghost' : 'btn-primary'}`} onClick={() => send({ type: 'done', on: !you.done })}>
            {you.done ? 'Done. Tap to undo' : 'Done'}
          </button>
        )}
      </div>
    </section>
  );
}

// ---------- shells ----------

function Player({ view, send, lobby }: PlayerProps<SWView, SWAction>) {
  useSfxCount(view.phase === 'write' ? view.locked.length : view.done.length); // a tick per answer in, then per Done
  if (view.phase === 'write') return <WritePlayer view={view} send={send} lobby={lobby} />;
  if (view.phase === 'match' && view.you) return <MatchPlayer view={view} send={send} lobby={lobby} />;
  return null; // 'done': the shell's podium takes over
}

function Screen({ view, lobby }: ScreenProps<SWView>) {
  useSfxCount(view.phase === 'write' ? view.locked.length : view.done.length);
  const writing = view.phase === 'write';
  const inIds = writing ? view.locked : view.done;
  return (
    <section class="sw-screen">
      <Header view={view} />
      <div class="sw-stage">
        <Chapter view={view} size="l" />
        <p class="sw-stage-hint">
          {writing
            ? 'Write one or two answers on your phone. You score when someone else writes the same answer.'
            : 'Go around the room. Everyone says what they wrote, and who matched. Then tap your matches on your phone and check off Done.'}
        </p>
        <Pills view={view} lobby={lobby} inIds={inIds} size="8vh" label={writing ? 'Who has submitted' : 'Who is done'} />
        <p class="g-muted">
          {inIds.length} of {hereCount(view)} {writing ? 'submitted' : 'done'}
        </p>
      </div>
    </section>
  );
}

function Rules() {
  return (
    <RulesSheet
      story="It is an old rule that a matter is settled by the mouth of two witnesses. Here, an answer only counts if someone else wrote it too. You all get the same category, and each of you secretly writes what you think the others will write. Then you talk it over, and find out who stood with whom."
      how={[
        `A category appears and a timer starts (${WRITE_MS / 1000} seconds, unless the host changed it). Write one or two answers on your phone, up to ${MAX_ANSWER_LEN} characters each. One answer is the safe play. Two answers is the gamble.`,
        'Now go around the room. Everyone says out loud what they wrote, and who else wrote the same. Your phone shows only your own words.',
        'Tap each of your words that someone else matched. You decide what counts as a match, so be fair. The points you have earned show at the bottom as you tap.',
        'When you are finished, tap Done. You can undo it until everyone else is done too. Once everyone is done, the game ends.',
      ]}
      scoring={[
        `One answer that someone else also wrote: ${POINTS.single} points`,
        `Two answers, both matched: ${POINTS.second} points`,
        `Two answers, only one matched: ${POINTS.half} point`,
        'Nothing matched, or no answer: 0 points',
      ]}
      note={`Nobody's words are shown on the TV or on anyone else's phone. If a player leaves, the game does not wait for them. If someone forgets to tap Done, matching ends on its own after a couple of minutes.`}
    />
  );
}

export default { Player, Screen, Rules } satisfies ClientGameModule;
