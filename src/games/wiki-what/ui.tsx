// Wiki-what UI. Motif: the footnote. Choices carry superscript markers, sources are cited in mono
// under a hairline, and the Mole is marked with a "citation needed" bracket.
import { Avatar, PointsNote, RevealStage, RoleCard, RulesSheet, Timer, Vote, playerOf, sfx, useSfxCount, useSfxCue } from '../../client/kit';
import type { ClientGameModule, PlayerProps, ScreenProps } from '../../client/gameModule';
import type { Lobby } from '../../shared/types';
// Type-only imports from logic.ts: a value import would pull zod and the game logic into this chunk.
import type { WikiAction, WikiView } from './logic';
import { play } from './sfx';
import './ui.css';

const MARKS = ['[1]', '[2]', '[3]', '[4]'];
const TOTAL_MS = { role: 5_000, accuse: 25_000, reveal: 8_000, moleReveal: 10_000 } as const;

/** Sound (room audio device only): a tick per answer or accusation; the Mole sting, then points. */
function useWikiCues(view: WikiView) {
  useSfxCount(view.voted.length);
  useSfxCue(view.phase, (p) => {
    if (p !== 'moleReveal') return;
    play('mole');
    sfx.play('score', { delay: 1700 });
  });
}

function Header({ view, big }: { view: WikiView; big?: boolean }) {
  const live = view.phase !== 'done';
  return (
    <div class="g-spread ww-head">
      <span class="eyebrow">
        Round {Math.min(view.round, view.rounds)} of {view.rounds}
        {view.phase === 'ask' || view.phase === 'reveal' ? ` · Question ${view.qi + 1} of ${view.perRound}` : ''}
      </span>
      <span class="ww-team">
        Team <b>{view.team}</b>
      </span>
      {live && view.phase !== 'moleReveal' && (
        <Timer
          deadline={view.deadline}
          total={view.phase === 'ask' ? view.askMs : TOTAL_MS[view.phase as keyof typeof TOTAL_MS]}
          size={big ? 'l' : 'm'}
          urgentAt={5}
          quiet={view.phase === 'reveal'}
        />
      )}
    </div>
  );
}

function Choice({
  i,
  text,
  state,
  onPick,
  count,
  tip,
}: {
  i: number;
  text: string;
  state: 'open' | 'mine' | 'locked' | 'right' | 'wrong' | 'team';
  onPick?: () => void;
  count?: number;
  /** A small sticker on the card's corner. */
  tip?: string;
}) {
  const tag = [tip, state === 'mine' ? 'Your pick' : null].filter(Boolean).join(' · ');
  return (
    <button type="button" class={`ww-choice is-${state}`} disabled={state !== 'open'} onClick={onPick} aria-pressed={state === 'mine'}>
      <sup class="ww-mark">{MARKS[i]}</sup>
      <span class="ww-choice-text">{text}</span>
      {count !== undefined && <span class="ww-count">{count}</span>}
      {tag && <span class={`ww-tag${tip ? ' is-tip' : ''}`}>{tag}</span>}
    </button>
  );
}

function Pills({ ids, lobby, voted, size }: { ids: string[]; lobby: Lobby; voted: string[]; size: string }) {
  return (
    <div class="ww-pills" aria-label="Who has locked in">
      {ids.map((id) => {
        const p = playerOf(lobby, id);
        return (
          <span key={id} class={`ww-pill${voted.includes(id) ? ' is-in' : ''}`}>
            <Avatar name={p?.name ?? '?'} color={p?.color ?? '#9aa5b1'} size={size} />
          </span>
        );
      })}
    </div>
  );
}

function ResolvedChoices({ view, me, onlyMine }: { view: WikiView; me?: string; onlyMine?: boolean }) {
  const r = view.reveal!;
  const mine = me ? r.picks[me] : undefined;
  return (
    <div class="ww-choices">
      {view.q!.choices.map((c, i) => {
        const state = i === r.answerIndex ? 'right' : i === r.teamPick ? 'wrong' : 'locked';
        return <Choice key={i} i={i} text={c} state={onlyMine && mine === i && state === 'locked' ? 'mine' : state} count={r.counts[i]} />;
      })}
    </div>
  );
}

function Verdict({ view, lobby, size, votes = true }: { view: WikiView; lobby: Lobby; size?: 'l'; votes?: boolean }) {
  const r = view.reveal!;
  const items = [
    <p class="ww-verdict" key="pick">
      {r.teamPick === null ? 'The team did not answer.' : `The team chose ${MARKS[r.teamPick]} ${view.q!.choices[r.teamPick]}.`}
    </p>,
    <p key="ans" class={`ww-verdict ${r.right ? 'is-right' : 'is-wrong'}`}>
      {r.right ? 'Correct. ' : 'The answer was '}
      {MARKS[r.answerIndex]} {view.q!.choices[r.answerIndex]}
    </p>,
  ];
  const voters = (i: number) => view.players.filter((p) => r.picks[p] === i);
  return (
    <div class={`ww-reveal${size ? ' is-l' : ''}`}>
      <RevealStage
        key={`${view.round}-${view.qi}`}
        items={items}
        interval={1300}
        sound={(i) => (i === 1 ? play(r.right ? 'right' : 'wrong') : sfx.play('reveal'))}
      />
      {votes && (
        <ul class="ww-votes">
          {view.q!.choices.map((c, i) =>
            voters(i).length ? (
              <li key={i}>
                <sup class="ww-mark">{MARKS[i]}</sup>
                {voters(i).map((p) => (
                  <span key={p} class="ww-vp">
                    {playerOf(lobby, p)?.name ?? '?'}
                  </span>
                ))}
              </li>
            ) : null,
          )}
        </ul>
      )}
      <p class="ww-cite">
        Source: Wikipedia, "{r.article}"{r.fact ? <span class="ww-fact"> {r.fact}</span> : null}
      </p>
    </div>
  );
}

function MoleReveal({ view, lobby, me, big }: { view: WikiView; lobby: Lobby; me?: string; big?: boolean }) {
  const e = view.roundEnd!;
  const mole = playerOf(lobby, e.mole);
  return (
    <div class="g-stack ww-mole">
      <p class="eyebrow">End of round {view.round}</p>
      <div class="ww-bracket">
        <Avatar name={mole?.name ?? '?'} color={mole?.color ?? '#9aa5b1'} size={big ? '12vh' : '72px'} />
        <div>
          <p class="g-title">{e.mole === me ? 'You were the Mole' : `${mole?.name ?? 'Someone'} was the Mole`}</p>
          <p class="ww-cn">[citation needed]</p>
        </div>
      </div>
      <p class={`ww-verdict ${e.caught ? 'is-right' : 'is-wrong'}`}>
        {e.caught ? 'Mole caught. The team earns 3 points.' : 'Mole not caught. The Mole earns 3 points.'}
      </p>
    </div>
  );
}

/** The role card: same words, same length, same layout for everyone (the Mole's differ only in content). */
function Role({ view }: { view: WikiView }) {
  const mole = !!view.you?.mole;
  return (
    <RoleCard
      eyebrow={`Round ${view.round} of ${view.rounds} · your role`}
      role={mole ? 'You are the Mole' : 'You are on the team'}
      detail={mole ? "You'll see each right answer. Steer the team away from it." : 'Pick the right answers. One of you is secretly the Mole.'}
      deadline={view.deadline}
      total={TOTAL_MS.role}
    />
  );
}

function Player({ view, send, lobby, me }: PlayerProps<WikiView, WikiAction>) {
  useWikiCues(view);
  const you = view.you;
  const room = lobby.screenConnected;
  const q = view.q;
  const others = view.players.filter((p) => p !== me);
  const waiting = Math.max(0, view.players.length - view.gone.length - view.voted.length);

  if (view.phase === 'role') return <section class="g-stack ww-player">{you ? <Role view={view} /> : <p class="g-muted">Waiting for the round to start.</p>}</section>;

  return (
    <section class="g-stack ww-player">
      <Header view={view} />

      {view.phase === 'ask' && q && (
        <>
          <p class="g-muted">{you?.pick != null ? `Locked in. Waiting for ${waiting} more.` : 'Pick an answer. The most popular pick becomes the team answer.'}</p>
          <div class="g-panel ww-q">
            <p class="ww-q-text">{q.text}</p>
          </div>
          <div class="ww-choices">
            {q.choices.map((c, i) => (
              <Choice
                key={i}
                i={i}
                text={c}
                state={you?.pick === i ? 'mine' : you?.pick != null ? 'locked' : 'open'}
                // Only the Mole's view carries this: the right answer, tagged on the card itself.
                tip={you?.answerIndex === i ? 'Right answer' : undefined}
                onPick={() => send({ type: 'pick', choice: i })}
              />
            ))}
          </div>
          {!room && <Pills ids={view.players} lobby={lobby} voted={view.voted} size="28px" />}
        </>
      )}

      {view.phase === 'reveal' && q && view.reveal && (
        <>
          {!room && (
            <div class="g-panel ww-q">
              <p class="ww-q-text">{q.text}</p>
            </div>
          )}
          <ResolvedChoices view={view} me={me} onlyMine />
          <Verdict view={view} lobby={lobby} votes={!room} />
          <PointsNote lines={you?.note ?? []} />
        </>
      )}

      {view.phase === 'accuse' && (
        <>
          <h2 class="g-title">Who is the Mole?</h2>
          <Vote
            label="Who is the Mole?"
            value={you?.accused ?? null}
            onVote={(id) => send({ type: 'accuse', target: id })}
            options={others.map((id) => ({ id, label: playerOf(lobby, id)?.name ?? '?', color: playerOf(lobby, id)?.color }))}
          />
          {you?.accused != null && <p class="g-muted">Locked in. Waiting for {waiting} more.</p>}
        </>
      )}

      {view.phase === 'moleReveal' && view.roundEnd && (
        <>
          <MoleReveal view={view} lobby={lobby} me={me} />
          <PointsNote lines={you?.note ?? []} />
        </>
      )}
    </section>
  );
}

function Screen({ view, lobby }: ScreenProps<WikiView>) {
  useWikiCues(view);
  const q = view.q;
  return (
    <section class="g-stack ww-screen">
      <Header view={view} big />
      {view.phase === 'role' && (
        <div class="g-center">
          <h2 class="g-call">Check your phone for your role</h2>
        </div>
      )}
      {view.phase === 'ask' && q && (
        <div class="ww-stage">
          <div class="ww-q ww-q-l">
            <p class="ww-q-text">{q.text}</p>
            <p class="ww-cite">The source shows after everyone answers</p>
          </div>
          <div class="ww-choices ww-choices-l">
            {q.choices.map((c, i) => (
              <Choice key={i} i={i} text={c} state="locked" />
            ))}
          </div>
          <Pills ids={view.players} lobby={lobby} voted={view.voted} size="6vh" />
        </div>
      )}
      {view.phase === 'reveal' && q && view.reveal && (
        <div class="ww-stage">
          <div class="ww-q ww-q-l">
            <p class="ww-q-text">{q.text}</p>
          </div>
          <ResolvedChoices view={view} />
          <Verdict view={view} lobby={lobby} size="l" />
        </div>
      )}
      {view.phase === 'accuse' && (
        <div class="g-center">
          <h2 class="g-call">Who is the Mole?</h2>
          <p class="g-muted">Accuse a player on your phone.</p>
          <Pills ids={view.players} lobby={lobby} voted={view.voted} size="9vh" />
        </div>
      )}
      {view.phase === 'moleReveal' && view.roundEnd && (
        <div class="g-center">
          <MoleReveal view={view} lobby={lobby} big />
        </div>
      )}
    </section>
  );
}

function Rules() {
  return (
    <RulesSheet
      story="In the strangest corners of Wikipedia, there is a quiz your team has to pass. You are all working together, except for one of you. The Mole already knows the answers, and wants you to get them wrong."
      how={[
        'Each round opens with a secret role card on your phone: you are on the team, or you are the Mole. Check it, then keep your face still.',
        'The team answers strange-but-true questions from Wikipedia. Everyone picks an answer.',
        'The team answer is the most popular pick. If it is tied, the choice locked in first wins.',
        'The Mole sees the right answer, marked on their own screen, and wants the team to get it wrong.',
        'At the end of the round, everyone accuses a player. The Mole accuses someone too, to blend in, but that accusation does not count. The player with the most accusations is caught. If it is tied, nobody is.',
        'After each answer and each Mole reveal, your phone lists where your points came from.',
      ]}
      scoring={[
        'The team answers right: 2 team points, plus 1 for each player who picked it',
        'The team answers wrong: the Mole gets 3',
        'The Mole is caught: 3 team points, plus 1 for each player who accused them',
        'The Mole stays hidden: the Mole gets 3',
      ]}
      note="Your final score is your own points plus the team total."
    />
  );
}

export default { Player, Screen, Rules } satisfies ClientGameModule;
