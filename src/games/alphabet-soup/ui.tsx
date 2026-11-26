// Alphabet Soup UI. Motif: the bowl. Letters float like soup noodles, in the group's color, above
// a bowl's rim; on the TV each group is a bowl that fills when it solves.
//
// The phone is deliberately plain: your color, your letters, and a box to type the word.
import { useState } from 'preact/hooks';
import { PlayerChip, RevealStage, RulesSheet, Timer, playerOf, useSfxCue } from '../../client/kit';
import type { ClientGameModule, PlayerProps, ScreenProps } from '../../client/gameModule';
import type { Lobby } from '../../shared/types';
// Type-only imports from logic.ts: a value import would pull zod and the game logic into this chunk.
import type { ASAction, ASView, GroupView } from './logic';
import { FIRST_BONUS, GROUP_COLORS, MAX_GUESS_LEN, MAX_WORD, REVEAL_MS, ROUND_MS } from './rules';
import { play } from './sfx';
import './ui.css';

const colorOf = (i: number) => GROUP_COLORS[i] ?? GROUP_COLORS[0];
const grp = (i: number) => ({ '--grp': colorOf(i).hex });
const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
const secs = (ms: number) => `${Math.max(1, Math.round(ms / 1000))}s`;

/** Solved groups by place, then the ones that ran out of time. */
const byPlace = (groups: GroupView[]) =>
  groups.map((g, i) => ({ g, i })).sort((a, b) => (a.g.place ?? 99) - (b.g.place ?? 99));

function Header({ view }: { view: ASView }) {
  return (
    <div class="g-spread as-head">
      <span class="eyebrow">
        Round {view.round} of {view.rounds}
      </span>
      {view.phase === 'play' ? <Timer deadline={view.deadline} total={view.roundMs} urgentAt={10} /> : null}
    </div>
  );
}

/** Letters floating in the soup: one tile each, bobbing out of step. */
function Noodles({ letters, size }: { letters: string[]; size?: 's' | 'l' }) {
  return (
    <div class={`as-noodles${size ? ` is-${size}` : ''}`} aria-label={letters.join(' ').toUpperCase()}>
      {letters.map((c, i) => (
        <span key={`${i}${c}`} class="as-noodle" style={{ '--i': i }} aria-hidden="true">
          {c.toUpperCase()}
        </span>
      ))}
    </div>
  );
}

// ---------- phone ----------

function GuessForm({ view, send }: { view: ASView; send(a: ASAction): void }) {
  const [text, setText] = useState('');
  const fb = view.you?.feedback ?? null;
  useSfxCue(fb?.n ?? null, () => play('miss'));
  const submit = (e: Event) => {
    e.preventDefault();
    const word = text.trim();
    if (!word) return;
    send({ type: 'guess', word: word.slice(0, MAX_GUESS_LEN) });
    setText('');
  };
  return (
    <form class="as-dock" onSubmit={submit}>
      {fb && (
        <p key={fb.n} class="as-feedback" role="status">
          {fb.verdict === 'wrong'
            ? `“${fb.guess.toUpperCase()}” uses your group's letters, but it isn't the word.`
            : `“${fb.guess.toUpperCase()}” doesn't use your group's letters.`}
        </p>
      )}
      <div class="as-entry">
        <input
          class="input as-input"
          type="text"
          value={text}
          maxLength={MAX_GUESS_LEN}
          placeholder={`Your group's ${view.wordLen}-letter word`}
          autocomplete="off"
          autocapitalize="characters"
          autocorrect="off"
          spellcheck={false}
          enterkeyhint="send"
          aria-label="Your group's word"
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
        />
        <button type="submit" class="btn btn-primary as-go" disabled={!text.trim()}>
          Guess
        </button>
      </div>
    </form>
  );
}

function Solved({ view, lobby, me }: { view: ASView; lobby: Lobby; me: string }) {
  const you = view.you!;
  const g = view.groups[you.group!];
  const waiting = view.groups.filter((x) => !x.solved);
  const by = you.solvedBy === me ? 'You typed it.' : `${playerOf(lobby, you.solvedBy)?.name ?? 'A teammate'} typed it.`;
  return (
    <>
      <div class="as-solved" style={grp(g.color)}>
        <p class="eyebrow">Solved · {ordinal(g.place ?? 1)} place</p>
        <Noodles letters={(you.word ?? '').split('')} size="s" />
        <p class="as-solved-pts">+{g.points}</p>
        <p class="as-solved-by">{by}</p>
      </div>
      {waiting.length > 0 && (
        <div class="as-waiting">
          <p class="g-muted">Still stirring:</p>
          <div class="as-dots">
            {waiting.map((x) => (
              <span key={x.color} class="as-dot" style={grp(x.color)}>
                {colorOf(x.color).name}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function PlayPhone({ view, send, lobby, me }: PlayerProps<ASView, ASAction>) {
  const you = view.you;
  useSfxCue(you?.word ?? null, () => play('solved'));
  if (!you || you.group === null) {
    return (
      <section class="as-phone">
        <Header view={view} />
        <p class="g-call as-sitout">You'll be dealt in next round.</p>
      </section>
    );
  }
  const g = view.groups[you.group];
  const color = colorOf(g.color);
  if (g.solved) {
    return (
      <section class="as-phone">
        <Header view={view} />
        <Solved view={view} lobby={lobby} me={me} />
      </section>
    );
  }
  return (
    <section class="as-phone" style={grp(g.color)}>
      <Header view={view} />
      <div class="as-bowl">
        <p class="as-you">
          You're <strong>{color.name}</strong>
        </p>
        {you.letters.length ? (
          <Noodles letters={you.letters} />
        ) : (
          <p class="as-handed">Your letters went to a teammate. Help your group find the word.</p>
        )}
        <span class="as-rim" aria-hidden="true" />
      </div>
      <p class="as-hint">
        Find everyone else who is {color.name.toLowerCase()}. Together your letters spell a {view.wordLen}-letter word.
      </p>
      <GuessForm view={view} send={send} />
    </section>
  );
}

function RevealPhone({ view, me }: { view: ASView; me: string }) {
  const mine = view.you?.group ?? null;
  return (
    <section class="as-phone">
      <Header view={view} />
      <p class="eyebrow">The words were</p>
      <ol class="as-results">
        {byPlace(view.groups).map(({ g, i }) => (
          <li key={i} class={`as-result${i === mine ? ' is-you' : ''}`} style={grp(g.color)}>
            <span class="as-result-word">{(g.word ?? '').toUpperCase()}</span>
            <span class="as-result-meta">
              {colorOf(g.color).name}
              {i === mine ? ' (you)' : ''} · {g.solved ? `${ordinal(g.place!)} · +${g.points}` : 'out of time'}
            </span>
          </li>
        ))}
      </ol>
      <p class="as-total">
        Your total: <strong>{view.scores[me] ?? 0}</strong>
      </p>
    </section>
  );
}

function Player(props: PlayerProps<ASView, ASAction>) {
  if (props.view.phase === 'play') return <PlayPhone {...props} />;
  if (props.view.phase === 'reveal') return <RevealPhone view={props.view} me={props.me} />;
  return null; // 'done': the shell's podium takes over
}

// ---------- screen ----------

function Bowls({ view }: { view: ASView }) {
  return (
    <div class="as-bowls">
      {view.groups.map((g, i) => (
        <div key={i} class={`as-tvbowl${g.solved ? ' is-solved' : ''}`} style={grp(g.color)}>
          <span class="as-tvbowl-name">{colorOf(g.color).name}</span>
          <span class="as-tvbowl-mark">{g.solved ? ordinal(g.place!) : '?'}</span>
          <span class="as-tvbowl-meta">{g.solved ? `${secs(g.solvedIn ?? 0)} · +${g.points}` : `${g.size} people`}</span>
        </div>
      ))}
    </div>
  );
}

function Leaders({ view, lobby }: { view: ASView; lobby: Lobby }) {
  const ids = Object.keys(view.scores)
    .sort((a, b) => view.scores[b] - view.scores[a])
    .slice(0, 5);
  return (
    <aside class="as-leaders">
      <p class="eyebrow">Leaders</p>
      {ids.map((id) => (
        <PlayerChip key={id} lobby={lobby} id={id} trailing={view.scores[id]} size="5vh" />
      ))}
    </aside>
  );
}

function Screen({ view, lobby }: ScreenProps<ASView>) {
  const solvedCount = view.groups.filter((g) => g.solved).length;
  useSfxCue(view.phase === 'play' && solvedCount ? solvedCount : null, () => play('solved'));
  if (view.phase === 'done') return null;
  if (view.phase === 'reveal') {
    return (
      <section class="as-screen">
        <Header view={view} />
        <div class="as-reveal">
          <RevealStage
            class="as-reveal-list"
            interval={700}
            startAt={(view.deadline ?? 0) - REVEAL_MS + 400}
            items={byPlace(view.groups).map(({ g, i }) => (
              <div key={i} class="as-tvrow" style={grp(g.color)}>
                <Noodles letters={(g.word ?? '').split('')} size="s" />
                <div class="as-tvrow-who">
                  {(g.members ?? []).map((id) => (
                    <span key={id} class="as-name">
                      {playerOf(lobby, id)?.name ?? '?'}
                    </span>
                  ))}
                </div>
                <span class="as-tvrow-pts">{g.solved ? `${ordinal(g.place!)} · +${g.points}` : 'Out of time'}</span>
              </div>
            ))}
          />
          <Leaders view={view} lobby={lobby} />
        </div>
      </section>
    );
  }
  return (
    <section class="as-screen">
      <Header view={view} />
      <div class="as-stage">
        <p class="as-call">Find your color. Unscramble your word.</p>
        <Bowls view={view} />
        <p class="as-stage-hint">
          Every group's word has {view.wordLen} letters. Any member can type it in.
        </p>
      </div>
    </section>
  );
}

function Rules() {
  return (
    <RulesSheet
      story="Someone knocked the soup pot over, and the noodle letters landed on everyone's phones. Each color is one word that got spilled, and the people who share your color hold the rest of yours. Find them before the soup gets cold."
      how={[
        `Your phone shows your color and one or two letters. Without saying your color, try to find the other people who share your color to form your group. Groups have 3 to 6 people, and the groups change every round.`,
        `Together your letters spell one word of up to ${MAX_WORD} letters. Every group's word has the same length this round.`,
        `Anyone in the group can type the word at the bottom of their phone. You can guess as often as you like. If a guess is wrong, your phone tells you whether it at least used your group's letters.`,
        `The round ends when every group has its word, or when time runs out (${ROUND_MS / 1000} seconds, unless the host changed it). Then all the words are shown, and new colors and letters are dealt.`,
      ]}
      scoring={[
        'Everyone in a group that solves its word gets 1 point for each second left on the clock.',
        `The first group to solve also gets ${FIRST_BONUS} bonus points each.`,
        'A group that runs out of time gets 0 points.',
      ]}
      note="If someone leaves, their letters go to a teammate so the group can still finish. Someone who comes back mid-round is dealt in next round."
    />
  );
}

export default { Player, Screen, Rules } satisfies ClientGameModule;
