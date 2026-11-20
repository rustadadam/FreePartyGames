// Mounts the current game's Player or Screen component (lazy chunk) inside its
// data-game sub-palette, with loading and crash states.
import { Component, type ComponentChildren } from 'preact';
import { useCallback } from 'preact/hooks';
import type { Lobby } from '../../shared/types';
import { useAssets } from '../kit/hooks';
import type { RoomClient } from '../net/room';
import { useGameModule } from './useGameModule';

class Boundary extends Component<{ children: ComponentChildren; resetKey: unknown }, { failed: boolean }> {
  override state = { failed: false };
  override componentDidCatch(err: unknown) {
    console.error('game UI crashed', err);
    this.setState({ failed: true });
  }
  override componentDidUpdate(prev: { resetKey: unknown }) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }
  override render() {
    if (this.state.failed)
      return (
        <div class="stage-msg">
          <p>This screen hit a snag. It will try again on the next update.</p>
        </div>
      );
    return this.props.children;
  }
}

export function GameStage({ lobby, view, client, kind }: { lobby: Lobby; view: unknown; client: RoomClient; kind: 'player' | 'screen' }) {
  const id = lobby.currentGameId;
  const { mod, error, retry } = useGameModule(id);
  const assets = useAssets();
  const send = useCallback((a: unknown) => client.action(a), [client]);
  const me = client.state.you?.kind === 'player' ? client.state.you.id : '';

  let body: ComponentChildren;
  if (error)
    body = (
      <div class="stage-msg">
        <p>Couldn't load this game. Check your connection.</p>
        <button type="button" class="btn" onClick={retry}>
          Try again
        </button>
      </div>
    );
  else if (!mod || view == null)
    body = (
      <div class="stage-msg" aria-busy="true">
        <span class="loader" aria-hidden="true" />
        <span class="sr-only">Loading game</span>
      </div>
    );
  else
    body = (
      <Boundary resetKey={view}>
        {kind === 'screen' ? (
          <mod.Screen view={view} assets={assets} lobby={lobby} />
        ) : (
          <mod.Player view={view} send={send} me={me} assets={assets} lobby={lobby} />
        )}
      </Boundary>
    );
  return (
    <div class={`stage stage-${kind}`} data-game={id ?? undefined}>
      {body}
    </div>
  );
}
