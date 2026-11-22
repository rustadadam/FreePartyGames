// Lobby building blocks shared by the screen and phone views:
// the player wall, the game picker, the host bar, and the selected-game card.
import { useState } from 'preact/hooks';
import type { Lobby, LobbyPlayer, Manifest } from '../../shared/types';
import { Avatar } from '../kit/Avatar';
import type { RoomClient } from '../net/room';
import { useGameModule } from './useGameModule';

export function PlayerWall({
  lobby,
  meId,
  canKick,
  onKick,
  size,
}: {
  lobby: Lobby;
  meId?: string;
  canKick: boolean;
  onKick(id: string): void;
  size: string;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const pickedPlayer = lobby.players.find((p) => p.id === picked);
  if (!lobby.players.length) return <p class="empty">Nobody yet. Scan the code or open the link to join.</p>;
  return (
    <div class="wall">
      <ul class="wall-grid" aria-label="Players">
        {lobby.players.map((p) => (
          <li key={p.id}>
            {canKick && p.id !== meId ? (
              <button
                type="button"
                class={`wall-btn${picked === p.id ? ' is-picked' : ''}`}
                aria-pressed={picked === p.id}
                onClick={() => setPicked(picked === p.id ? null : p.id)}
              >
                <PlayerPunch p={p} size={size} me={p.id === meId} />
              </button>
            ) : (
              <PlayerPunch p={p} size={size} me={p.id === meId} />
            )}
          </li>
        ))}
      </ul>
      {canKick && pickedPlayer && (
        <div class="wall-action">
          <span>{pickedPlayer.name}</span>
          <button
            type="button"
            class="btn btn-danger btn-s"
            onClick={() => {
              onKick(pickedPlayer.id);
              setPicked(null);
            }}
          >
            Remove from room
          </button>
          <button type="button" class="btn btn-ghost btn-s" onClick={() => setPicked(null)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function PlayerPunch({ p, size, me }: { p: LobbyPlayer; size: string; me: boolean }) {
  return (
    <span class={`punch${me ? ' is-me' : ''}`}>
      <Avatar name={p.name} color={p.color} size={size} host={p.isHost} away={!p.connected} bot={p.isBot} pop />
      <span class="punch-name">{me ? `${p.name} (you)` : p.name}</span>
    </span>
  );
}

/** Why Start is disabled, or null when the game can start. */
export function startBlocker(lobby: Lobby): string | null {
  const g = lobby.games.find((m) => m.id === lobby.selectedGameId);
  if (!g) return 'Pick a game';
  const n = lobby.players.length;
  if (n < g.minPlayers) return `Needs ${g.minPlayers - n} more player${g.minPlayers - n === 1 ? '' : 's'}`;
  if (n > g.maxPlayers) return `Too many players (max ${g.maxPlayers})`;
  if (g.screen === 'required' && !lobby.screenConnected) return 'This game needs the TV screen';
  return null;
}

function playersLabel(m: Manifest): string {
  return m.minPlayers === m.maxPlayers ? `${m.minPlayers} players` : `${m.minPlayers}–${m.maxPlayers} players`;
}

export function GamePicker({ lobby, client, showRules }: { lobby: Lobby; client: RoomClient; showRules?: boolean }) {
  const sel = lobby.games.find((g) => g.id === lobby.selectedGameId);
  return (
    <>
      <div class="picker" role="radiogroup" aria-label="Choose a game">
        {lobby.games.map((g) => {
          const on = g.id === lobby.selectedGameId;
          return (
            <button
              key={g.id}
              type="button"
              role="radio"
              aria-checked={on}
              data-game={g.id}
              class={`picker-card${on ? ' is-on' : ''}`}
              onClick={() => client.host({ type: 'selectGame', gameId: g.id })}
            >
              <span class="picker-title">{g.title}</span>
              <span class="picker-tag">{g.tagline}</span>
              <span class="picker-meta">
                {playersLabel(g)} · {g.estMinutes} min{g.hidden ? ' · dev' : ''}
              </span>
            </button>
          );
        })}
      </div>
      {showRules && sel && <GameRules id={sel.id} />}
    </>
  );
}

function GameRules({ id }: { id: string }) {
  const { mod } = useGameModule(id);
  const Rules = mod?.Rules;
  return (
    <div class="picker-rules" data-game={id}>
      <span class="eyebrow">How to play</span>
      {Rules ? <Rules /> : null}
    </div>
  );
}

/** The selected game: title, tagline and its Rules component (lazy). */
export function SelectedGame({ lobby }: { lobby: Lobby }) {
  const g = lobby.games.find((m) => m.id === lobby.selectedGameId);
  const { mod } = useGameModule(g?.id ?? null);
  if (!g) return null;
  const Rules = mod?.Rules;
  return (
    <section class="selected" data-game={g.id} aria-label="Next game">
      <span class="eyebrow">Next up</span>
      <h2 class="selected-title">{g.title}</h2>
      <p class="selected-tag">{g.tagline}</p>
      <div class="selected-rules">{Rules ? <Rules /> : null}</div>
      <span class="selected-meta">
        {playersLabel(g)} · about {g.estMinutes} min
      </span>
    </section>
  );
}

export function AddBots({ client }: { client: RoomClient }) {
  return (
    <div class="bots">
      <span class="eyebrow">Dev</span>
      {[1, 3, 5].map((n) => (
        <button key={n} type="button" class="btn btn-s" onClick={() => client.host({ type: 'addBots', count: n })}>
          Add {n} bot{n > 1 ? 's' : ''}
        </button>
      ))}
    </div>
  );
}

export function StartButton({ lobby, client, label = 'Start game' }: { lobby: Lobby; client: RoomClient; label?: string }) {
  const blocker = startBlocker(lobby);
  return (
    <button type="button" class="btn btn-primary btn-block btn-start" disabled={!!blocker} onClick={() => client.host({ type: 'start' })}>
      {blocker ?? label}
    </button>
  );
}

/** Lobby phase name of who holds host controls, for "waiting for X". */
export function hostName(lobby: Lobby): string {
  const h = lobby.host;
  if (!h) return 'the host';
  if (h.kind === 'screen') return 'the TV';
  return lobby.players.find((p) => p.id === h.id)?.name ?? 'the host';
}
