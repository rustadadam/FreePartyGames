// Cave Rave constants and view types shared by logic.ts and the UI. zod-free, so the UI chunk
// can import values from here without pulling in the game logic.

export const EFFECTS = ['fog', 'mirror', 'wobble'] as const;
export type Effect = (typeof EFFECTS)[number];

/** How long each sabotage lasts once it lands (ms). */
export const EFFECT_MS: Record<Effect, number> = { fog: 2000, mirror: 3000, wobble: 3000 };
/** Per-saboteur cooldown (ms). */
export const SAB_COOLDOWN_MS = 8000;
/** At most this many effects on one target at once. */
export const MAX_ACTIVE_EFFECTS = 2;

/** Pre-round "get ready" phase: longer the first time, for sound and calibration. */
export const READY_FIRST_MS = 25_000;
export const READY_MS = 12_000;
/** Countdown between "everyone's ready" and the first beat. */
export const COUNTDOWN_MS = 4000;
/** After the song ends, scores may still arrive for this long. */
export const GRACE_MS = 5000;
/** A score arriving more than this before the song's end is refused (it can't be finished yet). */
export const EARLY_SUBMIT_MS = 2500;
export const REVEAL_MS = 7000;

/** Placement points: per bracket round cleared (a win or a bye), plus a champion bonus. */
export const POINTS_PER_ROUND = 2;
export const CHAMPION_BONUS = 3;

export type CRPhase = 'ready' | 'play' | 'reveal' | 'done';

export interface Submission {
  score: number;
  hits: number;
  misses: number;
}

export interface DuelView {
  id: string;
  a: string;
  /** null = `a` has a bye this round. */
  b: string | null;
  /** Players in this duel whose score is in. */
  done: string[];
  winner: string | null;
  /** Scores, revealed once the round is resolved. */
  scores: Record<string, Submission> | null;
}

export interface PastDuel {
  a: string;
  b: string | null;
  winner: string;
  sa: number;
  sb: number;
}

export interface SabEvent {
  by: string;
  target: string;
  effect: Effect;
  /** Server ms the effect starts and ends. */
  at: number;
  until: number;
}

export interface YouView {
  role: 'duel' | 'bye' | 'out' | 'champion';
  duel: string | null;
  opponent: string | null;
  submitted: boolean;
  ready: boolean;
  /** Sabotage on you this round (server timestamps; the UI applies the ones running now). */
  effects: SabEvent[];
  /** Eliminated players: server ms your next sabotage is allowed. */
  sabReadyAt: number;
  /** Eliminated players: who you can sabotage right now. */
  targets: string[];
}

export interface CRView {
  phase: CRPhase;
  /** 1-based bracket round, and the expected total. */
  round: number;
  rounds: number;
  /** Everything a phone needs to rebuild the song with makeChart(seed, level). */
  chart: { seed: number; level: number; notes: number; max: number; lengthMs: number };
  /** Server ms the song's first beat plays (null before the countdown starts). */
  startAt: number | null;
  endAt: number | null;
  /** Server ms the current phase ends at the latest. */
  deadline: number | null;
  /** True once the song is underway (after startAt). */
  running: boolean;
  /** True once the song has ended on the server clock. */
  chartOver: boolean;
  duels: DuelView[];
  history: { round: number; duels: PastDuel[] }[];
  /** Eliminated, in order of elimination. */
  out: string[];
  ready: string[];
  champion: string | null;
  /** Latest sabotage this round, newest last. */
  feed: SabEvent[];
  you: YouView | null;
}

/** Live score ticker, sent over the ephemeral channel (never stored). */
export interface LivePayload {
  cr: 'live';
  duel: string;
  id: string;
  score: number;
}
