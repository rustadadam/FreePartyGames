// The shared TV / laptop display. Landscape, readable at 3 m (sizes in vh, see tokens.css).
import type { Lobby } from '../../shared/types';
import type { RoomClient } from '../net/room';
import { ConfirmButton } from './ConfirmButton';
import { GameStage } from './GameStage';
import { AddBots, DENSE_WALL, GamePicker, PlayerWall, SelectedGame, StartButton, wallSize } from './Lobby';
import { Results } from './Results';
import { RoomMenu } from './RoomMenu';
import { prettyUrl, Ticket } from './Ticket';

export function ScreenView({ client, lobby, view }: { client: RoomClient; lobby: Lobby; view: unknown }) {
  const isHost = client.isHost;
  const kick = (id: string) => client.host({ type: 'kick', playerId: id });

  if (lobby.phase === 'lobby') {
    return (
      <main class={`view-screen screen-lobby${lobby.players.length > DENSE_WALL ? ' is-crowded' : ''}`}>
        <div class="screen-lobby-ticket">
          <Ticket code={lobby.code} maxPlayers={lobby.maxPlayers} />
          <p class="screen-howto">
            Join on your phone: scan the code, or go to <strong>{location.host}</strong> and type <strong>{lobby.code}</strong>.
          </p>
        </div>
        <div class="screen-lobby-side">
          <section class="screen-who" aria-labelledby="who-title">
            <h2 id="who-title" class="screen-h">
              Who's here{' '}
              <span class="count">
                {lobby.players.length}/{lobby.maxPlayers}
              </span>
            </h2>
            <PlayerWall lobby={lobby} canKick={isHost} onKick={kick} size={wallSize(lobby.players.length, 'screen')} />
          </section>
          {isHost ? (
            <section class="screen-host" aria-label="Host controls">
              <h2 class="screen-h">Pick a game</h2>
              <GamePicker lobby={lobby} client={client} compact />
              <div class="screen-host-row">
                {lobby.dev && <AddBots client={client} />}
                <StartButton lobby={lobby} client={client} />
              </div>
            </section>
          ) : (
            <p class="screen-wait">The host picks the game from their phone.</p>
          )}
          <SelectedGame lobby={lobby} seating={!isHost} />
        </div>
        <RoomMenu client={client} lobby={lobby} placement="tv-corner" />
      </main>
    );
  }

  return (
    <main class="view-screen screen-play">
      <div class="screen-stage">
        {lobby.phase === 'results' ? (
          <div class="screen-results">
            <Results lobby={lobby} kind="screen" />
          </div>
        ) : (
          <GameStage lobby={lobby} view={view} client={client} kind="screen" />
        )}
      </div>
      <footer class="rail">
        <span class="ticket-mini">{lobby.code}</span>
        <span class="rail-join">
          Join at <strong>{prettyUrl(lobby.code)}</strong>
        </span>
        {isHost && (
          <span class="rail-host">
            {lobby.phase !== 'playing' && (
              <>
                <button type="button" class="btn btn-s" onClick={() => client.host({ type: 'returnToLobby' })}>
                  Back to lobby
                </button>
                <button type="button" class="btn btn-s btn-primary" onClick={() => client.host({ type: 'start' })}>
                  Play again
                </button>
              </>
            )}
          </span>
        )}
        <RoomMenu client={client} lobby={lobby} placement="tv-rail">
          {(close) =>
            isHost &&
            lobby.phase === 'playing' && (
              <>
                <button type="button" class="btn btn-s btn-block" onClick={() => (client.host({ type: 'skip' }), close())}>
                  Skip ahead
                </button>
                <ConfirmButton
                  class="btn-s btn-block btn-ghost"
                  label="End game"
                  confirm="Click again to end"
                  onConfirm={() => (client.host({ type: 'returnToLobby' }), close())}
                />
              </>
            )
          }
        </RoomMenu>
      </footer>
    </main>
  );
}
