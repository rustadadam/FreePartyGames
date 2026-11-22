// Sound effects: short, cartoony cues that mark moments (a join, a reveal, time up), never a bed
// of noise. Like the music, they play only on the room's audio device (the TV, or the host's
// phone when there is no TV); `play` anywhere else does nothing.
//
// Use from games and kit components through the kit, never Web Audio directly:
//   sfx.play('reveal')                      a shared effect by name (SfxName below)
//   const play = defineSfx({ caught: {...} }) a game's own recipes, typed by name (in its folder,
//   play('caught')                            so the synth code ships in the game's chunk)
//   useSfxCount(view.voted.length)          "someone answered" tick when a count goes up
//   useSfxCue(view.phase, (p) => ...)       run a cue when a value changes (not on mount)
//   useSfxHold(active)                      silence effects while active (Cave Rave songs)
//
// The synth and the shared recipes (recipes.ts) are a lazy chunk, fetched only by the device that
// becomes the room's audio device; every other phone skips it.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { audioCtx, bindUnlock, duck, sfxOut } from './engine';
import type { KIT } from './recipes';
import { pentatonic, semis } from './scale';
import type { Recipe } from './synth';

export type { Recipe, Voice } from './synth';
export { pentatonic } from './scale';

export interface PlayOpts {
  /** Semitones up (or down, negative). */
  pitch?: number;
  /** Start this many ms from now (staggers). */
  delay?: number;
  /** Loudness multiplier, 0..1. */
  vol?: number;
  /** Recipe-specific amount (Voice.n): a count, a step. */
  n?: number;
  /** Play even while a game holds effects (useSfxHold). For cues designed not to clash. */
  through?: boolean;
}

/** The shared effects, by name (recipes.ts; the table in docs/DESIGN.md, Sound). */
export type SfxName = keyof typeof KIT;

type Lib = typeof import('./recipes');
let lib: Lib | null = null;
let loading = false;

function loadLib(): void {
  if (lib || loading) return;
  loading = true;
  import('./recipes').then(
    (m) => (lib = m),
    () => (loading = false), // offline: try again next time this device becomes the audio device
  );
}

// ---------- engine ----------

const STORE_KEY = 'fpg:sfx';

export interface SfxState {
  /** This device plays the room's audio. */
  device: boolean;
  /** The Sound effects setting (saved per device). */
  enabled: boolean;
}

class Sfx {
  state: SfxState = { device: false, enabled: readEnabled() };
  private holds = 0;
  private last = new Map<Recipe, number>();
  private listeners = new Set<() => void>();

  /** Play a shared effect by name. A no-op on devices that don't play the room's audio. */
  play(name: SfxName, o?: PlayOpts): void {
    if (lib) this.run(lib.KIT[name], o);
  }

  run(recipe: Recipe, o: PlayOpts = {}): void {
    if (!lib || !this.state.device || !this.state.enabled || (this.holds > 0 && !o.through)) return;
    const ctx = audioCtx();
    const out = sfxOut();
    if (!ctx || !out || ctx.state !== 'running') return; // still waiting for a tap: drop, never queue
    const t = ctx.currentTime + 0.01 + Math.max(0, o.delay ?? 0) / 1000;
    const prev = this.last.get(recipe);
    if (prev !== undefined && Math.abs(t - prev) * 1000 < (recipe.gap ?? 60)) return;
    this.last.set(recipe, t);
    const vary = recipe.vary ?? 0.4;
    const p = semis((o.pitch ?? 0) + (Math.random() * 2 - 1) * vary);
    let bus: AudioNode = out;
    if (o.vol !== undefined && o.vol !== 1) {
      const g = ctx.createGain();
      g.gain.value = Math.max(0, Math.min(1, o.vol));
      g.connect(out);
      bus = g;
      setTimeout(() => g.disconnect(), (t - ctx.currentTime + 4) * 1000);
    }
    try {
      recipe.play(lib.makeVoice(ctx, bus, t, p, o.n ?? 1));
    } catch {
      return; // an odd browser rejecting a parameter must never break the room
    }
    if (recipe.duck) duck(recipe.duck, 0.3, t - ctx.currentTime);
  }

  setDevice(on: boolean): void {
    if (on === this.state.device) return;
    if (on) {
      bindUnlock();
      loadLib();
    }
    this.set({ device: on });
  }

  setEnabled(on: boolean): void {
    try {
      localStorage.setItem(STORE_KEY, on ? '1' : '0');
    } catch {
      /* private mode: the choice lasts for this page only */
    }
    this.set({ enabled: on });
  }

  hold(): () => void {
    this.holds++;
    return () => {
      this.holds--;
    };
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<SfxState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }
}

function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORE_KEY) !== '0';
  } catch {
    return true;
  }
}

export const sfx = new Sfx();

/**
 * A game's own effects. Keep the call in the game's folder so its synth code ships in the
 * game's lazy chunk; the returned function only accepts the names defined here (`.names` lists
 * them, for the dev sound board).
 */
export function defineSfx<K extends string>(recipes: Record<K, Recipe>): ((name: K, o?: PlayOpts) => void) & { names: K[] } {
  return Object.assign((name: K, o?: PlayOpts) => sfx.run(recipes[name], o), { names: Object.keys(recipes) as K[] });
}

/** A shared effect name, or a callback (given a count or step) that plays a game's own effect. */
export type Sound = SfxName | ((n: number) => void);

export function playSound(sound: Sound, n: number, o?: PlayOpts): void {
  if (typeof sound === 'function') sound(n);
  else sfx.play(sound, o);
}

// ---------- hooks ----------

/** Runs `cue(key)` when `key` changes to a non-null value after mount. */
export function useSfxCue<T>(key: T, cue: ((key: T) => void) | null | undefined): void {
  const prev = useRef(key);
  const ref = useRef(cue);
  ref.current = cue;
  useEffect(() => {
    if (prev.current === key) return;
    prev.current = key;
    if (key !== null && key !== undefined) ref.current?.(key);
  }, [key]);
}

/** Plays `sound` (default the lockIn tick, climbing the scale) each time `n` goes up. */
export function useSfxCount(n: number, sound: Sound = 'lockIn'): void {
  const prev = useRef(n);
  useEffect(() => {
    const was = prev.current;
    prev.current = n;
    if (n > was) playSound(sound, n, { pitch: pentatonic(n - 1) });
  }, [n]);
}

/** While `on`, effects are silenced on this device (except plays marked `through`). */
export function useSfxHold(on: boolean): void {
  useLayoutEffect(() => (on ? sfx.hold() : undefined), [on]);
}

export function useSfxState(): SfxState {
  const [state, setState] = useState(sfx.state);
  useEffect(() => {
    setState(sfx.state); // it may have changed between this render and the subscription
    return sfx.subscribe(() => setState(sfx.state));
  }, []);
  return state;
}
