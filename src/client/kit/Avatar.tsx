// A player "punch": a filled circle in the seat color with the player's initial.
import type { JSX } from 'preact';

export interface AvatarProps {
  name: string;
  /** Seat color (#rrggbb), from lobby.players[].color. */
  color: string;
  /** CSS length. Default 44px (phones); use vh on the screen view. */
  size?: string;
  /** Show the name under the punch. */
  label?: boolean;
  /** Marquee crown ring: this player holds host controls. */
  host?: boolean;
  /** Dimmed with a dashed ring: disconnected. */
  away?: boolean;
  /** Small "bot" tag. */
  bot?: boolean;
  /** Pop-in animation on mount (the shell uses it as people join). */
  pop?: boolean;
  class?: string;
}

/** Dark ink on light seat colors, chalk on dark ones. */
export function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.22 ? '#1a1033' : '#fbf6ff';
}

export function initialOf(name: string): string {
  return (Array.from(name.trim())[0] ?? '?').toUpperCase();
}

export function Avatar({ name, color, size = '44px', label, host, away, bot, pop, class: cls }: AvatarProps) {
  const style: JSX.CSSProperties = { '--av': color, '--av-ink': inkOn(color), '--av-size': size } as JSX.CSSProperties;
  return (
    <span
      class={`k-avatar${host ? ' is-host' : ''}${away ? ' is-away' : ''}${pop ? ' k-pop' : ''}${cls ? ` ${cls}` : ''}`}
      style={style}
      title={name}
    >
      <span class="k-avatar-dot" aria-hidden="true">
        {initialOf(name)}
        {bot && <span class="k-avatar-bot">bot</span>}
      </span>
      {label ? <span class="k-avatar-name">{name}</span> : <span class="sr-only">{name}</span>}
      {(host || away) && (
        <span class="sr-only">
          {host ? ' (host)' : ''}
          {away ? ' (reconnecting)' : ''}
        </span>
      )}
    </span>
  );
}
