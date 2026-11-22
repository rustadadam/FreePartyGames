// Wiki-what UI. Motif: the footnote. Choices carry superscript markers, sources are cited in mono
// under a hairline, and the Mole is marked with a "citation needed" bracket.
import { Avatar, PlayerChip, PromptCard, RevealStage, RulesSheet, Timer, Vote, playerOf, sfx, useSfxCount, useSfxCue } from '../../client/kit';
import type { ClientGameModule, PlayerProps, ScreenProps } from '../../client/gameModule';
import type { Lobby } from '../../shared/types';
// Type-only imports from logic.ts: a value import would pull zod and the game logic into this chunk.
import type { WikiAction, WikiView } from './logic';
import { play } from './sfx';
import './ui.css';

const MARKS = ['[1]', '[2]', '[3]', '[4]'];
const TOTAL_MS = { accuse: 25_000, reveal: 8_000, moleReveal: 10_000 } as const;

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
}: {
  i: number;
  text: string;
  state: 'open' | 'mine' | 'locked' | 'right' | 'wrong' | 'team';
  onPick?: () => void;
  count?: number;
}) {
  return (
    <button type="button" class={`ww-choice is-${state}`} disabled={state !== 'open'} onClick={onPick} aria-pressed={state === 'mine'}>
      <sup class="ww-mark">{MARKS[i]}</sup>
      <span class="ww-choice-text">{text}</span>
      {count !== undefined && <span class="ww-count">{count}</span>}
      {state === 'mine' && <span class="ww-tag">Your pick</span>}
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

function Verdict({ view, lobby, size }: { view: WikiView; lobby: Lobby; size?: 'l' }) {
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
      <p class="ww-cite">
        Source: Wikipedia, "{r.article}"{r.fact ? <span class="ww-fact"> {r.fact}</span> : null}
      </p>
    </div>
  );
}

function Standings({ view, lobby, me, size }: { view: WikiView; lobby: Lobby; me?: string; size?: string }) {
  const sc = view.scores ?? {};
  const ids = Object.keys(sc).sort((a, b) => sc[b] - sc[a]);
  return (
    <RevealStage
      class="ww-standings"
      items={ids.map((id) => (
        <PlayerChip key={id} lobby={lobby} id={id} you={id === me} trailing={sc[id]} size={size} />
      ))}
      interval={120}
      sound={false}
    />
  );
}

function MoleReveal({ view, lobby, me, big }: { view: WikiView; lobby: Lobby; me?: string; big?: boolean }) {
  const e = view.roundEnd!;
  const mole = playerOf(lobby, e.mole);
  const accusers = Object.keys(e.accuse).filter((p) => e.accuse[p] === e.mole);
  return (
    <div class="g-stack ww-mole">
      <p class="eyebrow">{view.phase === 'done' ? 'Final round' : `End of round ${view.round}`}</p>
      <div class="ww-bracket">
        <Avatar name={mole?.name ?? '?'} color={mole?.color ?? '#9aa5b1'} size={big ? '12vh' : '72px'} />
        <div>
          <p class="g-title">{e.mole === me ? 'You were the Mole' : `${mole?.name ?? 'Someone'} was the Mole`}</p>
          <p class="ww-cn">[citation needed]</p>
        </div>
      </div>
      <p class={`ww-verdict ${e.caught ? 'is-right' : 'is-wrong'}`}>
        {e.caught
          ? `Mole caught. The team earns 3 points${accusers.length ? `, and the ${accusers.length} player${accusers.length > 1 ? 's' : ''} who accused them earn 1 each` : ''}.`
          : 'Mole not caught. The Mole earns 3 points.'}
      </p>
      <Standings view={view} lobby={lobby} me={me} size={big ? '5vh' : undefined} />
    </div>
  );
}

function Player({ view, send, lobby, me }: PlayerProps<WikiView, WikiAction>) {
  useWikiCues(view);
  const you = view.you;
  const mole = !!you?.mole;
  const room = lobby.screenConnected;
  const q = view.q;
  const others = view.players.filter((p) => p !== me);
  return (
    <section class="g-stack ww-player">
      <Header view={view} />

      {view.phase === 'ask' && q && (
        <>
          {/* Everyone gets the same compact hidden card, so a glance at a phone cannot spot the Mole's. */}
          {you && (
            <PromptCard key={`${view.round}-${view.qi}`} secret hidden eyebrow="Your role this round" class="ww-role">
              {mole && you.answerIndex !== undefined ? (
                <>
                  You are the Mole. The right answer is {MARKS[you.answerIndex]} {q.choices[you.answerIndex]}. Get the team to pick a different one, without getting caught.
                </>
              ) : (
                'You are on the team. Pick the right answer. One player is the Mole, and wants you to get it wrong.'
              )}
            </PromptCard>
          )}
          <div class="g-panel ww-q">
            <p class="ww-q-text">{q.text}</p>
            <p class="ww-cite">The source shows after everyone answers</p>
          </div>
          <div class="ww-choices">
            {q.choices.map((c, i) => (
              <Choice
                key={i}
                i={i}
                text={c}
                state={you?.pick === i ? 'mine' : you?.pick != null ? 'locked' : 'open'}
                onPick={() => send({ type: 'pick', choice: i })}
              />
            ))}
          </div>
          <p class="g-muted">
            {you?.pick != null
              ? `Answer locked in. Waiting for ${Math.max(0, view.players.length - view.gone.length - view.voted.length)} more.`
              : 'Pick an answer. The most popular pick becomes the team answer.'}
          </p>
          {!room && <Pills ids={view.players} lobby={lobby} voted={view.voted} size="28px" />}
        </>
      )}

      {view.phase === 'reveal' && q && view.reveal && (
        <>
          <div class="g-panel ww-q">
            <p class="ww-q-text">{q.text}</p>
          </div>
          <ResolvedChoices view={view} me={me} onlyMine />
          <Verdict view={view} lobby={lobby} />
        </>
      )}

      {view.phase === 'accuse' && (
        <>
          <h2 class="g-title">Who was the Mole?</h2>
          <p class="g-muted">One player was the Mole. Accuse who you think it was. The player with the most accusations is caught.</p>
          <Vote
            label="Who was the Mole?"
            value={you?.accused ?? null}
            onVote={(id) => send({ type: 'accuse', target: id })}
            options={others.map((id) => ({ id, label: playerOf(lobby, id)?.name ?? '?', color: playerOf(lobby, id)?.color }))}
          />
          <p class="g-muted">
            {view.voted.length} of {view.players.length - view.gone.length} accused
          </p>
        </>
      )}

      {(view.phase === 'moleReveal' || view.phase === 'done') && view.roundEnd && (
        <>
          {view.phase === 'done' && <h2 class="g-title">Game over</h2>}
          <MoleReveal view={view} lobby={lobby} me={me} />
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
          <h2 class="g-call">Who was the Mole?</h2>
          <p class="g-muted">Accuse a player on your phone. The player with the most accusations is caught.</p>
          <Pills ids={view.players} lobby={lobby} voted={view.voted} size="9vh" />
        </div>
      )}
      {(view.phase === 'moleReveal' || view.phase === 'done') && view.roundEnd && (
        <div class="g-center">
          {view.phase === 'done' && <h2 class="g-call">Game over</h2>}
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
        'Each round, the team answers strange-but-true questions from Wikipedia. Everyone picks an answer.',
        'The team answer is the most popular pick. If it is tied, the choice locked in first wins.',
        'One player each round is secretly the Mole. The Mole sees the right answer, and wants the team to get it wrong.',
        'At the end of the round, everyone accuses a player. The Mole accuses someone too, to blend in, but that accusation does not count. The player with the most accusations is caught. If it is tied, nobody is.',
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
