// Second Witness UI. Motif: the gold plate. The prompt is a chapter heading engraved on a plate,
// answers are numbered like verses ("3:1", "3:2"), witness counts are small marks on the plate,
// and a temple silhouette sits quietly behind the prompt.
import { useState } from 'preact/hooks';
import { Avatar, PromptCard, RevealStage, RulesSheet, Timer, playerOf, useServerNow, useSfxCount } from '../../client/kit';
import type { ClientGameModule, PlayerProps, ScreenProps } from '../../client/gameModule';
import type { Lobby } from '../../shared/types';
// Type-only imports from logic.ts: a value import would pull zod and the game logic into this chunk.
import type { SWAction, SWView } from './logic';
import { normalize } from './match';
import {
  FINAL_MS,
  MAX_ANSWER_LEN,
  MAX_OPEN_PROPOSALS,
  MERGE_MS,
  MULTIPLIERS,
  POINTS,
  UNIQUE_BONUS,
  UNIQUE_MIN_ROUNDS,
  WRITE_MS,
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

const pairKey = (a: number, b: number): string => (a < b ? `${a}-${b}` : `${b}-${a}`);

function Temple({ class: cls }: { class?: string }) {
  return (
    <svg class={`sw-temple${cls ? ` ${cls}` : ''}`} viewBox="0 0 48 54" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M24 1l3.2 11v18H20.8V12zM8 17l3 9v14H5V26zM40 17l3 9v14h-6V26zM4 36h40v12H4zM1 48h46v5H1z" />
    </svg>
  );
}

function Header({ view }: { view: SWView }) {
  const over = view.phase === 'final' || view.phase === 'done';
  const total = view.phase === 'write' ? WRITE_MS : view.phase === 'merge' ? MERGE_MS : view.phase === 'final' ? FINAL_MS : undefined;
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
      {(view.phase === 'write' || view.phase === 'merge') && <Timer deadline={view.deadline} total={total} urgentAt={10} />}
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

function Marks({ n }: { n: number }) {
  return (
    <span class="sw-marks" role="img" aria-label={`${n} wrote this`}>
      {Array.from({ length: n }, (_, i) => (
        <i key={i} class={`sw-mark${n === 1 ? ' is-solo' : ''}`} />
      ))}
    </span>
  );
}

function Pills({ view, lobby, size }: { view: SWView; lobby: Lobby; size: string }) {
  const here = view.players.filter((p) => !view.gone.includes(p));
  return (
    <div class="sw-pills" aria-label={view.phase === 'merge' ? 'Who is done' : 'Who has submitted'}>
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
            Answer submitted. Waiting for {Math.max(0, hereCount(view) - view.locked.length)} more. Answers stay hidden until everyone has submitted or time runs out.
          </p>
          <Pills view={view} lobby={lobby} size="30px" />
        </>
      ) : (
        <WriteForm key={view.round} view={view} send={send} />
      )}
    </section>
  );
}

// ---------- merge ----------

function PlateButton({ labels, selected, yours, onTap, disabled }: { labels: string[]; selected: boolean; yours: boolean; onTap?: () => void; disabled?: boolean }) {
  return (
    <button type="button" class={`sw-plate sw-pick${selected ? ' is-selected' : ''}`} aria-pressed={selected} onClick={onTap} disabled={disabled}>
      <span class="sw-pick-text">{labels[0]}</span>
      {labels.length > 1 && <span class="sw-also">also: {labels.slice(1).join(' · ')}</span>}
      {yours && <span class="sw-yours">Yours</span>}
    </button>
  );
}

function ProposalRow({
  p,
  groups,
  need,
  onVote,
  big,
}: {
  p: NonNullable<SWView['merge']>['proposals'][number];
  groups: NonNullable<SWView['merge']>['groups'];
  need: number;
  onVote?: (yes: boolean) => void;
  big?: boolean;
}) {
  const la = groups.find((g) => g.id === p.a)?.labels[0] ?? '?';
  const lb = groups.find((g) => g.id === p.b)?.labels[0] ?? '?';
  return (
    <li class={`sw-prop${big ? ' is-big' : ''}`}>
      <p class="sw-prop-q">
        <b>{la}</b> <span class="sw-eq">=</span> <b>{lb}</b>?
      </p>
      <p class="sw-prop-tally">
        <span class="sw-yes">{p.yes} same</span> <span class="sw-no">{p.no} different</span> <span class="g-muted">· needs {need}</span>
      </p>
      {onVote &&
        (p.mine === null ? (
          <div class="sw-vote-row">
            <button type="button" class="btn btn-primary" onClick={() => onVote(true)}>
              Same
            </button>
            <button type="button" class="btn" onClick={() => onVote(false)}>
              Different
            </button>
          </div>
        ) : (
          <p class="sw-voted">{p.own ? 'You proposed this.' : `You voted ${p.mine === 'yes' ? 'same' : 'different'}.`}</p>
        ))}
    </li>
  );
}

function MergePlayer({ view, send }: { view: SWView; send(a: SWAction): void }) {
  const m = view.merge!;
  const you = view.you!;
  const [picked, setPicked] = useState<number[]>([]);
  const sel = picked.filter((id) => m.groups.some((g) => g.id === id));
  const toggle = (id: number) => setPicked(sel.includes(id) ? sel.filter((x) => x !== id) : sel.length >= 2 ? [sel[1], id] : [...sel, id]);
  const two = sel.length === 2;
  const key = two ? pairKey(sel[0], sel[1]) : '';
  const lo = Math.min(...sel);
  const hi = Math.max(...sel);
  const blocked = two && you.refused.includes(key);
  const dup = two && (m.closed.includes(key) || m.proposals.some((p) => p.a === lo && p.b === hi));
  const full = you.open >= MAX_OPEN_PROPOSALS;
  const done = you.done;
  const wait = Math.max(0, hereCount(view) - view.locked.length);
  const open = m.proposals;
  return (
    <section class="sw-phone">
      <Header view={view} />
      <Chapter view={view} compact />
      <h2 class="sw-h">Same answer?</h2>
      <p class="g-muted sw-lede">
        These are everyone's answers, with no names. Tap two plates that mean the same thing, then propose a match. A match needs {m.need} Same votes.
      </p>
      {open.length > 0 && (
        <ul class="sw-props">
          {open.map((p) => (
            <ProposalRow key={p.id} p={p} groups={m.groups} need={m.need} onVote={(yes) => send({ type: 'vote', proposal: p.id, yes })} />
          ))}
        </ul>
      )}
      <div class="sw-picks">
        {m.groups.map((g) => (
          <PlateButton key={g.id} labels={g.labels} selected={sel.includes(g.id)} yours={you.mine.includes(g.id)} onTap={() => toggle(g.id)} />
        ))}
      </div>
      {(blocked || dup || full) && two && (
        <p class="sw-hint is-warn">
          {blocked ? 'One player wrote both of these, so they can’t be merged.' : dup ? 'This pair is already being voted on, or was voted down.' : `You already have ${MAX_OPEN_PROPOSALS} proposals open. Wait for a vote to finish.`}
        </p>
      )}
      <div class="sw-dock">
        {two ? (
          <div class="sw-dock-row">
            <button type="button" class="btn btn-ghost" onClick={() => setPicked([])}>
              Clear
            </button>
            <button
              type="button"
              class="btn btn-primary"
              disabled={blocked || dup || full}
              onClick={() => {
                send({ type: 'propose', a: sel[0], b: sel[1] });
                setPicked([]);
              }}
            >
              Propose a match
            </button>
          </div>
        ) : (
          <button type="button" class="btn btn-primary btn-block" disabled={done} onClick={() => send({ type: 'done' })}>
            {done ? `Done. Waiting for ${wait} more.` : sel.length === 1 ? 'Pick a second plate, or tap Done' : 'Done'}
          </button>
        )}
      </div>
    </section>
  );
}

// ---------- reveal ----------

/** A plate's sound as it is revealed: a lone clink, or a chime with one note per witness. */
function plateSound(view: SWView) {
  return (i: number) => {
    const n = view.reveal?.groups[i]?.members.length ?? 1;
    if (n >= 2) play('witness', { n });
    else play('clink');
  };
}

function useRevealDone(view: SWView): boolean {
  const now = useServerNow(250);
  const r = view.reveal;
  return !r || r.groups.length === 0 || now >= r.startAt + r.groups.length * r.interval;
}

function RevealPlate({ g, lobby, big }: { g: NonNullable<SWView['reveal']>['groups'][number]; lobby: Lobby; big?: boolean }) {
  const n = g.members.length;
  return (
    <div class={`sw-plate sw-rplate${n >= 2 ? ' is-witnessed' : ' is-solo'}${big ? ' is-big' : ''}`}>
      <div class="sw-rhead">
        <span class="sw-rtext">{g.labels[0]}</span>
        <Marks n={n} />
      </div>
      {g.labels.length > 1 && <span class="sw-also">also: {g.labels.slice(1).join(' · ')}</span>}
      <ul class="sw-who">
        {g.members.map((m) => {
          const p = playerOf(lobby, m.p);
          return (
            <li key={m.p}>
              <Avatar name={p?.name ?? '?'} color={p?.color ?? '#9aa5b1'} size={big ? '5vh' : '26px'} />
              <span>{p?.name ?? 'Someone'}</span>
              {m.t.toLowerCase() !== g.labels[0].toLowerCase() && <span class="sw-also">wrote &ldquo;{m.t}&rdquo;</span>}
            </li>
          );
        })}
      </ul>
      <p class="sw-verdict">{n >= 2 ? `${n} players wrote this` : 'Only one player wrote this'}</p>
    </div>
  );
}

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
  const done = useRevealDone(view);
  const mine = r.outcome[me];
  return (
    <section class="sw-phone">
      <Header view={view} />
      <Chapter view={view} compact />
      {done ? (
        <>
          {mine && (
            <p class={`sw-yourpts${(r.pts[me] ?? 0) > 0 ? ' is-pay' : ''}`}>
              <b>+{r.pts[me] ?? 0}</b> {OUTCOME_LABEL[mine]}
              {(r.pts[me] ?? 0) > 0 && view.mult > 1 ? ` (×${view.mult})` : ''}
            </p>
          )}
          <RoundScores view={view} lobby={lobby} me={me} />
        </>
      ) : (
        <p class="sw-hint">{r.groups.length ? 'Showing who wrote what, smallest groups first.' : 'Nobody wrote anything this round.'}</p>
      )}
      {r.groups.length > 0 && (
        <RevealStage
          key={view.round}
          class="sw-stack"
          startAt={r.startAt}
          interval={r.interval}
          sound={plateSound(view)}
          items={r.groups.map((g) => (
            <RevealPlate key={g.id} g={g} lobby={lobby} />
          ))}
        />
      )}
    </section>
  );
}

function RevealScreen({ view, lobby }: { view: SWView; lobby: Lobby }) {
  const r = view.reveal!;
  const done = useRevealDone(view);
  return (
    <section class="sw-screen">
      <Header view={view} />
      <div class="sw-stage">
        {done ? (
          <div class="sw-stage-scores">
            <Chapter view={view} size="l" compact />
            <RoundScores view={view} lobby={lobby} big />
          </div>
        ) : (
          <>
            <p class="sw-stage-title">{view.prompt.text}</p>
            <RevealStage
              key={view.round}
              class="sw-single"
              layout="single"
              startAt={r.startAt}
              interval={r.interval}
              sound={plateSound(view)}
              items={r.groups.map((g) => (
                <RevealPlate key={g.id} g={g} lobby={lobby} big />
              ))}
            />
          </>
        )}
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
  useSfxCount(view.locked.length); // a tick per answer in, per Done in the merge
  if (view.phase === 'write') return <WritePlayer view={view} send={send} lobby={lobby} />;
  if (view.phase === 'merge' && view.merge && view.you) return <MergePlayer view={view} send={send} />;
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
  if (view.phase === 'merge' && view.merge) {
    const m = view.merge;
    return (
      <section class="sw-screen">
        <Header view={view} />
        <div class="sw-merge-screen">
          <div class="sw-merge-left">
            <Chapter view={view} size="l" compact />
            <div class="sw-picks is-big">
              {m.groups.map((g) => (
                <PlateButton key={g.id} labels={g.labels} selected={false} yours={false} disabled />
              ))}
            </div>
          </div>
          <aside class="sw-merge-right">
            <h2 class="sw-h">Same answer?</h2>
            <p class="g-muted">On your phone, tap two plates that mean the same thing and propose a match. A match needs {m.need} Same votes.</p>
            {m.proposals.length > 0 ? (
              <ul class="sw-props">
                {m.proposals.map((p) => (
                  <ProposalRow key={p.id} p={p} groups={m.groups} need={m.need} big />
                ))}
              </ul>
            ) : (
              <p class="g-muted">No proposals yet.</p>
            )}
            <Pills view={view} lobby={lobby} size="6vh" />
            <p class="g-muted">
              {view.locked.length} of {hereCount(view)} done
            </p>
          </aside>
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
        'Each round shows a category. Everyone secretly writes one or two answers, up to 40 characters each. One answer is the safe play. Two answers is the gamble.',
        'Matching answers are grouped for you. Capitals, punctuation, accents and plurals do not matter, so "Temple" and "the temples" match.',
        'Next, the groups appear as plates with no names. If two plates mean the same thing, tap both and propose a match. Everyone votes Same or Different. If more than half of the players here vote Same, the plates merge. You cannot merge two plates if one player wrote both.',
        'Then every plate is revealed with the players who wrote it, and points are paid out. Later rounds are worth more.',
      ]}
      scoring={[
        `One answer that someone else also wrote: ${POINTS.single} points`,
        `Two answers, both matched: ${POINTS.second} points`,
        `Two answers, only one matched: ${POINTS.half} point`,
        'Nothing matched, or no answer: 0 points',
        `There are ${MULTIPLIERS.length} rounds. Points are multiplied by ×${MULTIPLIERS.join(', ×')} in order`,
        `Unique thinker: if you wrote two answers and scored nothing in ${UNIQUE_MIN_ROUNDS} or more rounds, you get +${UNIQUE_BONUS} at the end`,
      ]}
      note="Nobody sees anyone else's answers until the writing is over. If a player leaves, votes only count the players still here."
    />
  );
}

export default { Player, Screen, Rules } satisfies ClientGameModule;
