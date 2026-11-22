// Tap Duel: the reference game. Copy this folder to start a new game.
// Pure TypeScript: no DOM, no Cloudflare, no Math.random / Date.now (use ctx.rng / ctx.now).
import { z } from 'zod';
import { defineGame, type GameCtx } from '../../core/game';
import type { SettingField } from '../../shared/types';

export const actionSchema = z.object({ type: z.literal('tap') }).strict();
export type TapAction = z.infer<typeof actionSchema>;

export interface TapSettings {
  rounds: number;
}

/** What the host can change in the lobby. The shell renders these; the game ships no settings UI. */
const settingsFields: SettingField[] = [{ key: 'rounds', label: 'Rounds', hint: 'Taps are worth a point each', min: 1, max: 10, step: 1 }];

type Phase = 'wait' | 'go' | 'reveal' | 'done';

export interface TapState {
  playerIds: string[];
  names: Record<string, string>;
  round: number;
  rounds: number;
  phase: Phase;
  goAt: number | null;
  winner: string | null;
  /** Tapped before "go" this round. */
  lockedOut: string[];
  /** Left the game (onPlayerLeave). The game never waits on them. */
  gone: string[];
  scores: Record<string, number>;
}

/** What every viewer receives. Nothing here is secret, but the projection still shapes per viewer. */
export interface TapView {
  phase: Phase;
  round: number;
  rounds: number;
  goAt: number | null;
  /** Server ms when an unanswered "go" times out: put deadlines in views for the kit Timer. */
  goDeadline: number | null;
  winner: string | null;
  scores: Record<string, number>;
  /** Only for players: their own status. */
  you: { lockedOut: boolean } | null;
}

const WAIT_MIN_MS = 1000;
const WAIT_MAX_MS = 3000;
const GO_TIMEOUT_MS = 5000;
const REVEAL_MS = 2000;

function startRound(s: TapState, ctx: GameCtx): void {
  s.round++;
  s.phase = 'wait';
  s.goAt = null;
  s.winner = null;
  s.lockedOut = [];
  ctx.setTimer('go', ctx.rng.int(WAIT_MIN_MS, WAIT_MAX_MS));
}

function endRound(s: TapState, ctx: GameCtx, winner: string | null): void {
  s.phase = 'reveal';
  s.winner = winner;
  if (winner) s.scores[winner] = (s.scores[winner] ?? 0) + 1;
  ctx.clearTimer('go');
  ctx.clearTimer('timeout');
  ctx.setTimer('next', REVEAL_MS);
}

/** True when nobody present can still win this round. */
function nobodyLeft(s: TapState): boolean {
  return s.playerIds.every((id) => s.gone.includes(id) || s.lockedOut.includes(id));
}

export default defineGame<TapState, TapAction, TapSettings>({
  manifest: {
    id: 'tap-duel',
    title: 'Tap Duel',
    tagline: 'Wait for it... tap first.',
    minPlayers: 2,
    maxPlayers: 20,
    screen: 'optional',
    estMinutes: 1,
    hidden: true,
  },
  defaultSettings: { rounds: 3 },
  settingsFields,
  actionSchema,

  setup(ctx, players, settings) {
    const s: TapState = {
      playerIds: players.map((p) => p.id),
      names: Object.fromEntries(players.map((p) => [p.id, p.name])),
      round: 0,
      rounds: settings.rounds,
      phase: 'wait',
      goAt: null,
      winner: null,
      lockedOut: [],
      gone: [],
      scores: Object.fromEntries(players.map((p) => [p.id, 0])),
    };
    startRound(s, ctx);
    return s;
  },

  onAction(s, ctx, playerId) {
    if (s.gone.includes(playerId) || s.lockedOut.includes(playerId)) return;
    if (s.phase === 'wait') {
      s.lockedOut.push(playerId); // false start
      if (nobodyLeft(s)) endRound(s, ctx, null);
    } else if (s.phase === 'go') {
      endRound(s, ctx, playerId);
    }
  },

  onTimer(s, ctx, key) {
    if (key === 'go' && s.phase === 'wait') {
      s.phase = 'go';
      s.goAt = ctx.now();
      ctx.setTimer('timeout', GO_TIMEOUT_MS);
    } else if (key === 'timeout' && s.phase === 'go') {
      endRound(s, ctx, null);
    } else if (key === 'next' && s.phase === 'reveal') {
      if (s.round >= s.rounds) s.phase = 'done';
      else startRound(s, ctx);
    }
  },

  onPlayerLeave(s, ctx, playerId) {
    if (!s.gone.includes(playerId)) s.gone.push(playerId);
    if ((s.phase === 'wait' || s.phase === 'go') && nobodyLeft(s)) endRound(s, ctx, null);
  },

  onPlayerReturn(s, _ctx, playerId) {
    s.gone = s.gone.filter((id) => id !== playerId);
  },

  view(s, viewer): TapView {
    return {
      phase: s.phase,
      round: s.round,
      rounds: s.rounds,
      goAt: s.goAt,
      goDeadline: s.phase === 'go' && s.goAt !== null ? s.goAt + GO_TIMEOUT_MS : null,
      winner: s.winner,
      scores: s.scores,
      you: viewer.kind === 'player' ? { lockedOut: s.lockedOut.includes(viewer.id) } : null,
    };
  },

  result(s) {
    if (s.phase !== 'done') return null;
    const best = Math.max(...Object.values(s.scores));
    const champs = s.playerIds.filter((id) => s.scores[id] === best && best > 0).map((id) => s.names[id]);
    return { scores: { ...s.scores }, summary: champs.length ? `Fastest: ${champs.join(', ')}` : 'Nobody tapped in time' };
  },

  bot: {
    act(view, rng) {
      const v = view as TapView;
      if (v.you?.lockedOut) return null;
      if (v.phase === 'go' && rng.chance(0.6)) return { type: 'tap' };
      if (v.phase === 'wait' && rng.chance(0.03)) return { type: 'tap' }; // the occasional false start
      return null;
    },
  },
});
