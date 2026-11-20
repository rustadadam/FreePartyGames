// Tap Duel UI: the reference for game-builders. Everything comes from the kit
// (src/client/kit, documented in docs/DESIGN.md) and the g-* layout helpers.
// Pattern to copy:
//   - Player: one primary action, big and thumb-reachable; status from the view only.
//   - Screen: the same state, couch-sized (the shell already sets vh-based type tokens).
//   - Names and colors come from `lobby` via PlayerChip / playerOf; views carry ids.
//   - Theming is automatic: the shell wraps you in data-game="<id>" (tokens.css).
import { PlayerChip, RevealStage, Timer, playerOf } from '../../client/kit';
import type { ClientGameModule, PlayerProps, ScreenProps } from '../../client/gameModule';
import type { Lobby } from '../../shared/types';
// Type-only import from logic.ts: a value import would pull zod and the game logic into this chunk.
import type { TapAction, TapView } from './logic';
import './ui.css';

function headline(view: TapView, lobby: Lobby): string {
  if (view.phase === 'wait') return 'Wait for it…';
  if (view.phase === 'go') return 'TAP!';
  if (view.phase === 'reveal') return view.winner ? `${playerOf(lobby, view.winner)?.name ?? 'Someone'} got it` : 'Too slow, everyone';
  return 'Game over';
}

function RoundBar({ view }: { view: TapView }) {
  return (
    <div class="g-spread">
      <span class="eyebrow">
        Round {view.round} of {view.rounds}
      </span>
      <Timer deadline={view.goDeadline} total={5000} urgentAt={2} />
    </div>
  );
}

function Scoreboard({ view, lobby, me, size }: { view: TapView; lobby: Lobby; me?: string; size?: string }) {
  const ids = Object.keys(view.scores).sort((a, b) => view.scores[b] - view.scores[a]);
  return (
    <RevealStage
      items={ids.map((id) => (
        <PlayerChip key={id} lobby={lobby} id={id} you={id === me} trailing={view.scores[id]} size={size} />
      ))}
      interval={120}
    />
  );
}

function Player({ view, send, lobby, me }: PlayerProps<TapView, TapAction>) {
  const locked = !!view.you?.lockedOut;
  const live = view.phase === 'wait' || view.phase === 'go';
  const label = locked
    ? 'Too early!'
    : view.phase === 'go'
      ? 'TAP!'
      : view.phase === 'wait'
        ? 'Wait…'
        : view.winner === me
          ? 'You got it!'
          : headline(view, lobby);
  return (
    <section class="g-stack">
      <RoundBar view={view} />
      <button
        type="button"
        class={`g-hit tap-hit tap-${locked ? 'locked' : view.phase}`}
        disabled={locked || !live}
        onPointerDown={(e) => {
          // pointerdown, not click: every millisecond counts in a reaction game
          e.preventDefault();
          send({ type: 'tap' });
        }}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && send({ type: 'tap' })}
      >
        {label}
      </button>
      {view.phase === 'wait' && !locked && <p class="g-muted">Tap when it turns pink. Not before.</p>}
      {view.phase === 'done' && <Scoreboard view={view} lobby={lobby} me={me} />}
    </section>
  );
}

function Screen({ view, lobby }: ScreenProps<TapView>) {
  return (
    <section class="g-stack tap-screen">
      <RoundBar view={view} />
      <div class="g-center tap-call">
        <p key={view.phase} class={`g-call tap-call-${view.phase}`}>
          {headline(view, lobby)}
        </p>
        {view.phase === 'wait' && <p class="g-muted">Tap too early and you sit this round out.</p>}
      </div>
      <Scoreboard view={view} lobby={lobby} size="5vh" />
    </section>
  );
}

function Rules() {
  return <p>When the screen says TAP, tap first to win the round. Tap too early and you sit the round out.</p>;
}

export default { Player, Screen, Rules } satisfies ClientGameModule;
