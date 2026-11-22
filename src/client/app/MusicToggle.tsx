// Music on/off for the device that plays the room's music. Renders nothing elsewhere.
import { music, useMusicState } from './music';

export function MusicToggle({ class: cls = '' }: { class?: string }) {
  const m = useMusicState();
  if (!m.wanted) return null;
  const waiting = m.enabled && m.blocked;
  const label = !m.enabled ? 'Music off' : waiting ? 'Tap to start music' : 'Music on';
  return (
    <button
      type="button"
      class={`btn btn-s music-toggle ${cls}`}
      aria-pressed={m.enabled && !waiting}
      onClick={() => (waiting ? music.unlock() : music.setEnabled(!m.enabled))}
    >
      <span aria-hidden="true">{m.enabled ? '♪' : '×'}</span> {label}
    </button>
  );
}
