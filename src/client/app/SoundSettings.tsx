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
  const summary =
    m.enabled && m.blocked
      ? 'Tap anywhere to start the sound'
      : `Music ${m.enabled ? 'on' : 'off'} · Sound effects ${fx.enabled ? 'on' : 'off'}`;
  return (
    <section class={`settings${open ? ' is-open' : ''} ${cls}`} aria-label="Settings">
      <button type="button" class="settings-head" aria-expanded={open} aria-controls="settings-panel" onClick={() => setOpen(!open)}>
        <svg class="settings-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4z" />
          <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />
        </svg>
        <span class="settings-text">
          <span class="settings-title">Settings</span>
          <span class="settings-sum">{summary}</span>
        </span>
        <span class="settings-caret" aria-hidden="true">
          {open ? '−' : '+'}
        </span>
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
