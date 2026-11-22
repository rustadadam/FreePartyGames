// Background music: the lobby song and one song per game, played by one device per room
// (the TV, or the host's phone when there is no TV).
//
// Songs are files in /songs named `lobby.mp3` or `<game id>.mp3`. A game without a file plays
// in silence (Cave Rave: phones make their own beat). Adding a song needs no code change.
//
// Each song is downloaded once and played from a blob URL: Cloudflare's static assets ignore
// HTTP Range requests, which Safari needs to play a plain <audio src>. Two players crossfade
// between songs and across each song's loop point, through Web Audio gain nodes because iOS
// ignores HTMLAudioElement.volume. The decks feed the shared engine's music bus, which sound
// effects duck under big stingers (engine.ts).
import { useEffect, useState } from 'preact/hooks';
import type { Lobby } from '../../shared/types';
import { audioCtx, bindUnlock, musicOut } from './engine';

const FILES = import.meta.glob('../../../songs/*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<
  string,
  string
>;
const SONGS: Record<string, string> = Object.fromEntries(
  Object.entries(FILES).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -'.mp3'.length), url]),
);

/** The song URL for `lobby` or a game id, or null when there is none. */
export function songFor(key: string): string | null {
  return SONGS[key] ?? null;
}

const VOLUME = 0.5;
const FADE_S = 1.5;
const STORE_KEY = 'fpg:music';

interface Deck {
  el: HTMLAudioElement;
  gain: GainNode | null;
  /** Bumped whenever the deck is reassigned, so a stale fade-out never pauses it. */
  gen: number;
}

export interface MusicState {
  /** This device has a song it should be playing (ignoring mute). */
  wanted: boolean;
  enabled: boolean;
  /** The browser is holding audio back until someone taps the page. */
  blocked: boolean;
}

class Music {
  private decks: Deck[] = [];
  private live = 0;
  private url: string | null = null;
  private crossing = false;
  private blobs = new Map<string, Promise<string>>();
  private listeners = new Set<() => void>();
  state: MusicState = { wanted: false, enabled: readEnabled(), blocked: false };

  /** Play this song (looping), crossfading from whatever is on; null fades to silence. */
  play(url: string | null): void {
    if (url === this.url) return;
    this.url = url;
    this.set({ wanted: url !== null });
    this.apply();
  }

  setEnabled(on: boolean): void {
    try {
      localStorage.setItem(STORE_KEY, on ? '1' : '0');
    } catch {
      /* private mode: the choice lasts for this page only */
    }
    this.set({ enabled: on });
    this.apply();
  }

  /** Called from a tap (engine.bindUnlock): browsers only start audio inside a user gesture. */
  unlock(): void {
    if (this.state.blocked && this.url && this.state.enabled) {
      const deck = this.decks[this.live];
      if (deck?.el.src) void this.start(deck);
      else this.apply();
    }
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<MusicState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  private apply(): void {
    if (!this.url || !this.state.enabled) {
      for (const d of this.decks) this.fadeOut(d);
      return;
    }
    bindUnlock(() => this.unlock());
    void this.switchTo(this.url);
  }

  /** Start `url` from the top on the idle deck and crossfade to it. */
  private async switchTo(url: string): Promise<void> {
    let src: string;
    try {
      src = await this.blob(url);
    } catch {
      return; // offline or missing file: stay silent rather than break the room
    }
    if (url !== this.url || !this.state.enabled) return; // changed while downloading
    const prev = this.decks[this.live];
    this.live = this.decks.length < 2 ? this.decks.length : 1 - this.live;
    const next = this.deck(this.live);
    next.gen++;
    next.el.src = src;
    next.el.currentTime = 0;
    if (prev && prev !== next) this.fadeOut(prev);
    await this.start(next);
  }

  private async start(deck: Deck): Promise<void> {
    try {
      await deck.el.play();
      const ctx = audioCtx();
      if (ctx && ctx.state !== 'running') await ctx.resume().catch(() => {});
      const running = !ctx || ctx.state === 'running';
      this.set({ blocked: !running });
      this.fadeIn(deck);
    } catch {
      this.set({ blocked: true }); // NotAllowedError: wait for a tap (see bindUnlock)
    }
  }

  /** Near the end of the song, start it again on the other deck so the loop never gaps. */
  private nearEnd(i: number): void {
    const deck = this.decks[i];
    if (i !== this.live || this.crossing || !this.url || !deck) return;
    const left = deck.el.duration - deck.el.currentTime;
    if (!Number.isFinite(left) || left > FADE_S) return;
    this.crossing = true;
    void this.switchTo(this.url).finally(() => (this.crossing = false));
  }

  private fadeIn(deck: Deck): void {
    const ctx = audioCtx();
    if (!deck.gain || !ctx) {
      deck.el.volume = VOLUME;
      return;
    }
    const g = deck.gain.gain;
    const now = ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(VOLUME, now + FADE_S);
  }

  private fadeOut(deck: Deck): void {
    const gen = deck.gen;
    const ctx = audioCtx();
    if (deck.gain && ctx) {
      const g = deck.gain.gain;
      const now = ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + FADE_S);
    }
    setTimeout(() => {
      if (deck.gen === gen && (this.decks[this.live] !== deck || !this.url || !this.state.enabled)) deck.el.pause();
    }, FADE_S * 1000);
  }

  private deck(i: number): Deck {
    let d = this.decks[i];
    if (d) return d;
    const el = new Audio();
    el.preload = 'auto';
    el.addEventListener('timeupdate', () => this.nearEnd(i));
    let gain: GainNode | null = null;
    const ctx = audioCtx();
    const out = musicOut();
    if (ctx && out) {
      gain = ctx.createGain();
      gain.gain.value = 0;
      ctx.createMediaElementSource(el).connect(gain).connect(out);
    } else {
      el.volume = 0;
    }
    d = { el, gain, gen: 0 };
    this.decks[i] = d;
    return d;
  }

  private blob(url: string): Promise<string> {
    let p = this.blobs.get(url);
    if (!p) {
      p = fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`song ${r.status}`);
          return r.blob();
        })
        .then((b) => URL.createObjectURL(b));
      p.catch(() => this.blobs.delete(url)); // let a later switch retry
      this.blobs.set(url, p);
    }
    return p;
  }
}

function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORE_KEY) !== '0';
  } catch {
    return true;
  }
}

export const music = new Music();

/**
 * Plays the right song for this room on this device. The TV plays when there is one;
 * otherwise the host's phone does. Lobby and results use the lobby song.
 */
export function useRoomMusic(lobby: Lobby | null, plays: boolean): void {
  const key = lobby?.phase === 'playing' && lobby.currentGameId ? lobby.currentGameId : 'lobby';
  const url = plays && lobby ? songFor(key) : null;
  useEffect(() => music.play(url), [url]);
  useEffect(() => () => music.play(null), []);
}

export function useMusicState(): MusicState {
  const [state, setState] = useState(music.state);
  useEffect(() => {
    setState(music.state); // it may have changed between this render and the subscription
    return music.subscribe(() => setState(music.state));
  }, []);
  return state;
}
