// The one menu on every device: a gear that opens a panel with, top to bottom,
//   1. Game settings  (the host, between games, when the selected game has any),
//   2. Sound          (only the device that plays the room's audio: Music and Sound effects),
//   3. the caller's own room actions (`children`: share, skip, end the game, leave).
// Phones mount it in the header, the TV in the lobby corner and in the in-game footer rail.
import type { ComponentChildren } from 'preact';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { Settings } from 'lucide-preact';
import { clampSetting } from '../../shared/settings';
import type { Lobby, SettingField } from '../../shared/types';
import { music, useMusicState } from '../audio/music';
import { sfx, useSfxState } from '../audio/sfx';
import type { RoomClient } from '../net/room';

export type MenuPlacement = 'phone' | 'tv-corner' | 'tv-rail';

export function RoomMenu({
  client,
  lobby,
  placement,
  head,
  children,
}: {
  client: RoomClient;
  lobby: Lobby;
  placement: MenuPlacement;
  /** Shown first in the panel (the phone puts "who am I" here). */
  head?: ComponentChildren;
  /** Room actions, last in the panel. A function gets `close`, to shut the menu after an action. */
  children?: ComponentChildren | ((close: () => void) => ComponentChildren);
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLElement>(null);
  const panelId = useId();
  const fx = useSfxState();
  const m = useMusicState();
  const actions = typeof children === 'function' ? children(() => setOpen(false)) : children;
  const settings = client.isHost && lobby.phase !== 'playing' ? lobby.settings : null;

  // Close on a tap outside or Escape.
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => root.current && !root.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  // Nothing to put in the panel (a TV that is not the host and plays no sound): no gear.
  if (!settings && !fx.device && !head && !children) return null;

  return (
    <section ref={root} class={`menu menu-${placement}`} aria-label="Menu">
      <button
        type="button"
        class="menu-gear"
        aria-label="Menu"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        <Settings aria-hidden="true" strokeWidth={2.25} />
      </button>
      {open && (
        <div class="menu-panel" id={panelId}>
          {head}
          {settings && (
            <div class="menu-section">
              <h2 class="eyebrow">Game settings</h2>
              <GameSettings settings={settings} onSet={(key, value) => client.host({ type: 'setSetting', key, value })} />
            </div>
          )}
          {fx.device && (
            <div class="menu-section">
              <h2 class="eyebrow">Sound</h2>
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
          {actions && <div class="menu-section menu-actions">{actions}</div>}
        </div>
      )}
    </section>
  );
}

function GameSettings({ settings, onSet }: { settings: NonNullable<Lobby['settings']>; onSet(key: string, value: number): void }) {
  // Show a tap at once and let the server's value replace it: quick repeat taps keep adding up.
  const [local, setLocal] = useState<Record<string, number>>({});
  const served = JSON.stringify(settings.values);
  useEffect(() => setLocal({}), [served, settings.gameId]);
  return (
    <>
      {settings.fields.map((f) => (
        <Stepper
          key={f.key}
          field={f}
          value={local[f.key] ?? settings.values[f.key]}
          onChange={(v) => {
            setLocal((l) => ({ ...l, [f.key]: v }));
            onSet(f.key, v);
          }}
        />
      ))}
    </>
  );
}

function Stepper({ field, value, onChange }: { field: SettingField; value: number; onChange(value: number): void }) {
  const step = (dir: 1 | -1) => onChange(clampSetting(field, value + dir * field.step));
  return (
    <div class="menu-row">
      <span class="switch-label">
        {field.label}
        {field.hint && <span class="switch-hint">{field.hint}</span>}
      </span>
      <span class="stepper" role="group" aria-label={field.label}>
        <button type="button" class="stepper-btn" aria-label={`Less ${field.label}`} disabled={value <= field.min} onClick={() => step(-1)}>
          −
        </button>
        <output class="stepper-value">
          {value}
          {field.unit && <span class="stepper-unit">{field.unit}</span>}
        </output>
        <button type="button" class="stepper-btn" aria-label={`More ${field.label}`} disabled={value >= field.max} onClick={() => step(1)}>
          +
        </button>
      </span>
    </div>
  );
}

function Switch({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange(on: boolean): void }) {
  return (
    <button type="button" role="switch" aria-checked={on} class="menu-row switch-row" onClick={() => onChange(!on)}>
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
