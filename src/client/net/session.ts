// Per-room identity in localStorage: the seat token the server hands out in `welcome`.
// Every access is wrapped: private windows and blocked storage just mean no rejoin.
import type { Role } from '../../shared/types';

export interface SavedSession {
  token?: string;
  name: string;
  role: Role;
}

const key = (code: string) => `fpg:room:${code}`;
const NAME_KEY = 'fpg:name';

export function loadSession(code: string): SavedSession | null {
  try {
    const raw = localStorage.getItem(key(code));
    if (!raw) return null;
    const s = JSON.parse(raw) as SavedSession;
    return s && typeof s.name === 'string' && (s.role === 'player' || s.role === 'screen') ? s : null;
  } catch {
    return null;
  }
}

export function saveSession(code: string, s: SavedSession): void {
  try {
    localStorage.setItem(key(code), JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

export function clearSession(code: string): void {
  try {
    localStorage.removeItem(key(code));
  } catch {
    /* storage unavailable */
  }
}

export function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* storage unavailable */
  }
}
