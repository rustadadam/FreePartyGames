// Lobby-only Settings: Music and Sound effects switches, saved on this device. Renders only on
// the device that plays the room's audio (the TV, or the host's phone when there is no TV), and
// only the lobby views mount it, so nothing extra sits on screen during a game.
import { useState } from 'preact/hooks';
import { music, useMusicState } from '../audio/music';
import { sfx, useSfxState } from '../audio/sfx';

export function SoundSettings({ class: cls = '' }: { class?: string }) {
  const fx = useSfxState();
  const m = useMusicState();
  const [open, setOpen] = useState(false);
  if (!fx.device) return null;
  return (
    <section class={`settings ${cls}`} aria-label="Settings">
      <button
        type="button"
        class="settings-gear"
        aria-label="Settings"
        aria-expanded={open}
        aria-controls="settings-panel"
        onClick={() => setOpen(!open)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            fill="currentColor"
            fill-rule="evenodd"
            d="M10.3 2h3.4l.5 2.6a8 8 0 0 1 1.9 1.1l2.5-.9 1.7 2.9-2 1.7a8 8 0 0 1 0 2.2l2 1.7-1.7 2.9-2.5-.9a8 8 0 0 1-1.9 1.1l-.5 2.6h-3.4l-.5-2.6a8 8 0 0 1-1.9-1.1l-2.5.9-1.7-2.9 2-1.7a8 8 0 0 1 0-2.2l-2-1.7 1.7-2.9 2.5.9a8 8 0 0 1 1.9-1.1zM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"
          />
        </svg>
      </button>
      {open && (
        <div class="settings-panel" id="settings-panel">
          <Switch label="Music" hint="A song for the lobby and each game" on={m.enabled} onChange={(on) => music.setEnabled(on)} />
          <Switch
            label="Sound effects"
            hint="Joins, timers, reveals and winners"
            on={fx.enabled}
            onChange={(on) => {
              sfx.setEnabled(on);
              if (on) sfx.play('pick'); // a sample, so you hear what you turned on
            }}
          />
        </div>
      )}
    </section>
  );
}

function Switch({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange(on: boolean): void }) {
  return (
    <button type="button" role="switch" aria-checked={on} class="switch-row" onClick={() => onChange(!on)}>
      <span class="switch-label">
        {label}
        <span class="switch-hint">{hint}</span>
      </span>
      <span class="switch" aria-hidden="true">
        <span class="switch-knob" />
      </span>
    </button>
  );
}
