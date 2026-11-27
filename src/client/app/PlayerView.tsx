// A phone in the room: portrait, one-handed. Header stub, content, docked action.
import { useEffect } from 'preact/hooks';
import type { Lobby } from '../../shared/types';
import { Avatar } from '../kit/Avatar';
import type { RoomClient } from '../net/room';
import { ConfirmButton } from './ConfirmButton';
import { GameStage } from './GameStage';
import { AddBots, GamePicker, hostName, PlayerWall, SelectedGame, StartButton, wallSize } from './Lobby';
import { Results } from './Results';
import { RoomMenu } from './RoomMenu';
import { ShareButton, Ticket, TicketStub } from './Ticket';

// These one-column, text-and-card phone games are designed around a portrait layout.
const PORTRAIT_GAME_IDS = new Set(['alphabet-soup', 'wiki-what', 'second-witness']);

export function PlayerView({ client, lobby, view, meId }: { client: RoomClient; lobby: Lobby; view: unknown; meId: string }) {
  const isHost = client.isHost;
  const me = lobby.players.find((p) => p.id === meId);
  const game = lobby.games.find((g) => g.id === lobby.currentGameId);
  const playing = lobby.phase === 'playing';
  const seated = lobby.inGame.includes(meId);
  const portraitGame = playing && PORTRAIT_GAME_IDS.has(game?.id ?? '');

  useEffect(() => {
    if (!portraitGame || typeof window === 'undefined') return;
    const orientation = window.screen.orientation as (ScreenOrientation & {
      lock?: (orientation: string) => Promise<void>;
      unlock?: () => void;
    }) | undefined;
    if (!orientation?.lock) return;

    let active = true;
    let attempts = 0;
    let inFlight = false;
    let userActivated = false;
    let locked = false;
    const requestLock = () => {
      if (!active || locked || inFlight || attempts >= 2) return;
      attempts++;
      inFlight = true;
      try {
        void orientation
          .lock('portrait')
          .then(() => {
            if (!active) {
              orientation.unlock?.();
              return;
            }
            locked = true;
          })
          .catch(() => {
            // Browsers that only allow locking in fullscreen/PWA mode fall back to the rotate hint.
          })
          .finally(() => {
            inFlight = false;
            if (userActivated && !locked && attempts < 2) requestLock();
          });
      } catch {
        // Older browsers may expose the API but reject the request synchronously.
        inFlight = false;
      }
    };
    const requestAfterGesture = () => {
      userActivated = true;
      requestLock();
      window.removeEventListener('pointerdown', requestAfterGesture);
      window.removeEventListener('keydown', requestAfterGesture);
    };
    requestLock();
    window.addEventListener('pointerdown', requestAfterGesture);
    window.addEventListener('keydown', requestAfterGesture);
    return () => {
      active = false;
      window.removeEventListener('pointerdown', requestAfterGesture);
      window.removeEventListener('keydown', requestAfterGesture);
      try {
        orientation.unlock?.();
      } catch {
        // Ignore unsupported unlock calls during navigation.
      }
    };
  }, [portraitGame]);

  return (
    <div class={`view-phone phase-${lobby.phase}${portraitGame ? ' is-portrait-game' : ''}`}>
      {portraitGame && <div class="portrait-overlay" role="status">Rotate your phone upright to play {game?.title ?? 'this game'}.</div>}
      <header class="phone-head">
        <TicketStub code={lobby.code} />
        <span class="phone-head-title">{playing || lobby.phase === 'results' ? (game?.title ?? '') : 'Lobby'}</span>
        <RoomMenu
          client={client}
          lobby={lobby}
          placement="phone"
          head={
            <p class="menu-who">
              {me && <Avatar name={me.name} color={me.color} size="36px" host={me.isHost} />}
              <span>
                {me?.name ?? 'You'} in room <strong>{lobby.code}</strong>
                {isHost && <span class="badge">Host</span>}
              </span>
            </p>
          }
        >
          {(close) => (
            <>
              {isHost && playing && (
                <>
                  <button type="button" class="btn btn-block" onClick={() => (client.host({ type: 'skip' }), close())}>
                    Skip ahead
                  </button>
                  <ConfirmButton
                    class="btn-block"
                    label="End game for everyone"
                    confirm="Tap again to end the game"
                    onConfirm={() => (client.host({ type: 'returnToLobby' }), close())}
                  />
                </>
              )}
              <ShareButton code={lobby.code} class="btn-block" />
              <ConfirmButton class="btn-block btn-ghost" label="Leave room" confirm="Tap again to leave" onConfirm={() => client.leave()} />
            </>
          )}
        </RoomMenu>
      </header>

      <main class="phone-body">
        {lobby.phase === 'lobby' && (
          <>
            <section class="phone-welcome">
              <span class="eyebrow">You're in</span>
              <h1 class="phone-hello">{me ? `Hi, ${me.name}` : 'Hi'}</h1>
            </section>
            {!lobby.screenConnected && (
              <section class="phone-share">
                <Ticket code={lobby.code} layout="horizontal" maxPlayers={lobby.maxPlayers} class="phone-ticket" />
                <ShareButton code={lobby.code} class="btn-block" />
              </section>
            )}
            <section aria-labelledby="phone-who">
              <h2 id="phone-who" class="section-h">
                Players <span class="count">{lobby.players.length}</span>
              </h2>
              <PlayerWall
                lobby={lobby}
                meId={meId}
                canKick={isHost}
                onKick={(id) => client.host({ type: 'kick', playerId: id })}
                size={wallSize(lobby.players.length, 'phone')}
              />
              {isHost && <p class="hint">Tap a player to remove them.</p>}
            </section>
            {isHost ? (
              <section aria-labelledby="phone-pick">
                <h2 id="phone-pick" class="section-h">
                  Pick a game
                </h2>
                <GamePicker lobby={lobby} client={client} showRules />
                {lobby.dev && <AddBots client={client} />}
              </section>
            ) : lobby.selectedGameId ? (
              <SelectedGame lobby={lobby} seating />
            ) : (
              <p class="waiting">Waiting for {hostName(lobby)} to pick a game.</p>
            )}
          </>
        )}

        {playing &&
          (seated ? (
            <GameStage lobby={lobby} view={view} client={client} kind="player" />
          ) : (
            <section class="phone-spectate">
              <span class="eyebrow">Game in progress</span>
              <h1 class="phone-hello">{game?.title ?? 'A game'} is on</h1>
              <p>You're in for the next one. {lobby.screenConnected ? 'Watch the big screen.' : 'Hang tight.'}</p>
            </section>
          ))}

        {lobby.phase === 'results' && <Results lobby={lobby} meId={meId} kind="phone" />}
      </main>

      {lobby.phase !== 'playing' && (
        <div class="dock">
          {isHost ? (
            lobby.phase === 'lobby' ? (
              <StartButton lobby={lobby} client={client} />
            ) : (
              <div class="dock-row">
                <button type="button" class="btn" onClick={() => client.host({ type: 'returnToLobby' })}>
                  Lobby
                </button>
                <button type="button" class="btn btn-primary" onClick={() => client.host({ type: 'start' })}>
                  Play again
                </button>
              </div>
            )
          ) : (
            <p class="dock-wait">
              {lobby.phase === 'lobby' ? `Waiting for ${hostName(lobby)} to start` : `Waiting for ${hostName(lobby)} to pick what's next`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
