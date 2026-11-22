// Inline "punch + name" for a player id that a view references. Views carry ids;
// names and colors come from the lobby the shell passes to every game component.
import type { ComponentChildren } from 'preact';
import type { Lobby, LobbyPlayer } from '../../shared/types';
import { Avatar } from './Avatar';

export function playerOf(lobby: Lobby, id: string | null | undefined): LobbyPlayer | undefined {
  return id ? lobby.players.find((p) => p.id === id) : undefined;
}

export interface PlayerChipProps {
  lobby: Lobby;
  id: string | null | undefined;
  /** Right-aligned extra, e.g. a score. */
  trailing?: ComponentChildren;
  /** Avatar size (CSS length). Default 32px. */
  size?: string;
  /** Highlight as "you". */
  you?: boolean;
}

export function PlayerChip({ lobby, id, trailing, size = '32px', you }: PlayerChipProps) {
  const p = playerOf(lobby, id);
  const name = p?.name ?? 'Someone';
  return (
    <span class={`k-chip${you ? ' is-you' : ''}`}>
      <Avatar name={name} color={p?.color ?? '#9aa5b1'} size={size} away={p ? !p.connected : false} />
      <span class="k-chip-name">
        {name}
        {you && <span class="k-chip-you"> (you)</span>}
      </span>
      {trailing != null && <span class="k-chip-trail">{trailing}</span>}
    </span>
  );
}
