// Tap Duel UI. Plain markup: the design system arrives in U3.
import type { ClientGameModule, PlayerProps, ScreenProps } from '../../client/gameModule';
import type { Lobby } from '../../shared/types';
import type { TapAction, TapView } from './logic';

function nameOf(lobby: Lobby, id: string | null): string {
  return lobby.players.find((p) => p.id === id)?.name ?? '?';
}

function Status({ view, lobby }: { view: TapView; lobby: Lobby }) {
  if (view.phase === 'wait') return <p>Wait for it...</p>;
  if (view.phase === 'go') return <p>TAP!</p>;
  if (view.phase === 'reveal') return <p>{view.winner ? `${nameOf(lobby, view.winner)} wins the round` : 'Nobody this round'}</p>;
  return <p>Game over</p>;
}

function Player({ view, send, lobby }: PlayerProps<TapView, TapAction>) {
  const locked = view.you?.lockedOut;
  return (
    <section>
      <h2>
        Round {view.round}/{view.rounds}
      </h2>
      <Status view={view} lobby={lobby} />
      <button disabled={locked || view.phase === 'reveal' || view.phase === 'done'} onClick={() => send({ type: 'tap' })}>
        {locked ? 'Too early!' : 'Tap'}
      </button>
    </section>
  );
}

function Screen({ view, lobby }: ScreenProps<TapView>) {
  return (
    <section>
      <h1>
        Tap Duel: round {view.round}/{view.rounds}
      </h1>
      <Status view={view} lobby={lobby} />
      <ol>
        {lobby.players
          .filter((p) => p.id in view.scores)
          .sort((a, b) => view.scores[b.id] - view.scores[a.id])
          .map((p) => (
            <li key={p.id}>
              {p.name}: {view.scores[p.id]}
            </li>
          ))}
      </ol>
    </section>
  );
}

function Rules() {
  return <p>When the screen says TAP, tap first to win the round. Tap too early and you sit the round out.</p>;
}

export default { Player, Screen, Rules } satisfies ClientGameModule;
