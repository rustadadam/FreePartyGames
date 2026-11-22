// Game settings helpers shared by the room engine (validation) and the settings panel (stepper).
import type { SettingField } from './types';

/** Snaps `value` onto the field's grid (min + n * step) and keeps it in range. */
export function clampSetting(field: SettingField, value: number): number {
  const steps = Math.round((Math.min(field.max, Math.max(field.min, value)) - field.min) / field.step);
  const snapped = field.min + steps * field.step;
  // Round away float noise from fractional steps.
  return Math.min(field.max, Math.round(snapped * 1000) / 1000);
}
