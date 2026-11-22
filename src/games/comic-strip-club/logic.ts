// Comic Strip Club. Pure TypeScript: no DOM, no Cloudflare, no Math.random / Date.now.
//
// Flow: prompt round -> 3 drawing rounds (panel 1, 2, 3) -> reveal (strip by strip, server
// clock driven) -> vote -> tally -> remix (bonus reveal, no vote) -> done.
//
// Chains. Player i (seat order) starts chain i by writing its prompt. In round r (0 = prompt,
// 1..3 = panel r) player p works on chain (p - r) mod n. Each round is a shift of one seat, so:
//  - no player works on the same chain in two consecutive rounds (any n >= 2);
//  - for n >= 4 the offsets 0,1,2,3 are distinct mod n: every chain has four different
//    contributors, i.e. no player touches a strip twice (a Latin square);
//  - for n = 3 offset 3 wraps to 0: a strip's author draws its panel 3 (so they touch their own
//    strip twice, but never back to back).
//
// Voting rule: you cannot vote for the strip whose prompt you wrote (that always leaves n-1 >= 2
// options). You may vote for a strip you only drew a panel on: with 4 players you contributed to
// every strip, so banning all of them would leave nothing to vote for.
import { z } from 'zod';
import { defineGame, type GameCtx } from '../../core/game';
import { makeDrawing } from '../../shared/strokes';
import { StrokesSchema } from '../../shared/strokeSchema';
import type { Rng } from '../../core/rng';
import type { SettingField } from '../../shared/types';
import { PREMISES } from './content';

import { MAX_PROMPT_CHARS, PANEL_ASPECT, PANELS } from './constants';
export { MAX_PROMPT_CHARS, PANEL_ASPECT, PANELS };

/** Default lengths of the premise and panel rounds (the host can change them). */
export const PROMPT_MS = 60_000;
export const DRAW_MS = 75_000;
/** The server waits this long past the shown deadline so phones can auto-submit what they drew. */
export const GRACE_MS = 3_000;
const LEAD_MS = 2_500;
/** Reveal: the prompt shows first, then a panel every STEP_MS, then a short hold. */
export const STEP_MS = 2_400;
export const STRIP_MS = 10_000;
export const REMIX_STRIP_MS = 9_200;
const VOTE_MS = 40_000;
const TALLY_MS = 8_000;
const POINTS_PER_VOTE = 100;

const MAX_VOTE_ACTION_ID = 64;

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('prompt'), text: z.string().trim().min(1).max(MAX_PROMPT_CHARS) }).strict(),
  z.object({ type: z.literal('panel'), panel: z.number().int().min(1).max(PANELS), strokes: StrokesSchema }).strict(),
  z.object({ type: z.literal('vote'), strip: z.string().min(1).max(MAX_VOTE_ACTION_ID) }).strict(),
]);
export type CscAction = z.infer<typeof actionSchema>;

export type Phase = 'prompt' | 'draw' | 'reveal' | 'vote' | 'tally' | 'remix' | 'done';

export interface Panel {
  /** Player who drew it. */
  by: string;
  /** Drawing asset id, or null for a blank panel. */
  asset: string | null;
}

export interface Chain {
  /** Author of the prompt; also the strip's id. */
  author: string;
  prompt: string;
  /** The prompt was auto-filled from the content pack (author sent nothing). */
  auto: boolean;
  panels: Panel[];
}

export interface Remix {
  title: string;
  panels: Panel[];
}

export interface CscSettings {
  /** Seconds to write a premise. */
  promptSeconds: number;
  /** Seconds to draw a panel. */
  drawSeconds: number;
}

const settingsFields: SettingField[] = [
  { key: 'promptSeconds', label: 'Premise time', hint: 'To write the comic idea', min: 20, max: 120, step: 10, unit: 's' },
  { key: 'drawSeconds', label: 'Drawing time', hint: 'Per panel', min: 30, max: 150, step: 15, unit: 's' },
];

export interface CscState {
  /** Length of the premise round and of each panel round, in ms. */
  promptMs: number;
  drawMs: number;
  playerIds: string[];
  names: Record<string, string>;
  gone: string[];
  phase: Phase;
  /** 0 = prompt round, 1..3 = panel round. */
  round: number;
  /** Shown deadline of the current prompt/draw/vote phase (server ms). */
  deadline: number | null;
  /** This round's submissions: prompt text (prompt round) or drawing asset / null for blank. */
  inbox: Record<string, string | null>;
  /** One chain per player, in seat order. */
  chains: Chain[];
  /** Strip ids (authors) in reveal order. */
  order: string[];
  revealAt: number | null;
  votes: Record<string, string>;
  counts: Record<string, number>;
  remix: Remix[];
  remixAt: number | null;
  scores: Record<string, number>;
  summary: string;
}

// ---------- rotation (exported for tests and docs) ----------

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Index of the chain seat `p` works on in `round` (0 = prompt round, 1..3 = panels). */
export function chainFor(n: number, round: number, p: number): number {
  return mod(p - round, n);
}

/** Seat that works on chain `c` in `round`. Inverse of chainFor. */
export function workerOn(n: number, round: number, c: number): number {
  return mod(c + round, n);
}

// ---------- views ----------

export type Source = { kind: 'prompt'; text: string } | { kind: 'panel'; asset: string | null };

export interface StripView {
  id: string;
  prompt: string;
  auto: boolean;
  panels: Panel[];
}

export interface CscView {
  phase: Phase;
  round: number;
  deadline: number | null;
  /** Length of the premise round and of each panel round, for the timer ring. */
  promptMs: number;
  drawMs: number;
  players: string[];
  /** Players who have submitted this round. */
  done: string[];
  gone: string[];
  /** Player only: what this player must do right now. */
  you: { submitted: boolean; panel: number; source: Source | null; vote: string | null } | null;
  /** From the reveal on: every strip, in reveal order. */
  strips: StripView[] | null;
  reveal: { startAt: number; stepMs: number; stripMs: number } | null;
  /** Who has voted (never for whom, until the tally). */
  voted: string[];
  counts: Record<string, number> | null;
  remix: Remix[] | null;
  remixAt: number | null;
  remixStripMs: number;
  stepMs: number;
  scores: Record<string, number> | null;
}

// ---------- helpers ----------

const present = (s: CscState) => s.playerIds.filter((p) => !s.gone.includes(p));
const submittedAll = (s: CscState) => present(s).every((p) => p in s.inbox);

function startRound(s: CscState, ctx: GameCtx): void {
  s.phase = s.round === 0 ? 'prompt' : 'draw';
  s.inbox = {};
  const ms = s.round === 0 ? s.promptMs : s.drawMs;
  s.deadline = ctx.now() + ms;
  // Everyone gone: don't sit out the clock.
  ctx.setTimer('round', present(s).length === 0 ? 500 : ms + GRACE_MS);
}

function endRound(s: CscState, ctx: GameCtx): void {
  const n = s.playerIds.length;
  if (s.round === 0) {
    s.chains = s.playerIds.map((id) => {
      const text = s.inbox[id];
      const auto = !text;
      return { author: id, prompt: text ?? ctx.rng.pick(PREMISES), auto, panels: [] };
    });
  } else {
    s.chains.forEach((chain, c) => {
      const by = s.playerIds[workerOn(n, s.round, c)];
      chain.panels.push({ by, asset: s.inbox[by] ?? null });
    });
  }
  s.inbox = {};
  s.round++;
  if (s.round <= PANELS) startRound(s, ctx);
  else startReveal(s, ctx);
}

function startReveal(s: CscState, ctx: GameCtx): void {
  s.phase = 'reveal';
  s.deadline = null;
  s.order = ctx.rng.shuffle(s.playerIds);
  s.revealAt = ctx.now() + LEAD_MS;
  ctx.setTimer('reveal', LEAD_MS + s.order.length * STRIP_MS);
}

function startVote(s: CscState, ctx: GameCtx): void {
  s.phase = 'vote';
  s.votes = {};
  s.deadline = ctx.now() + VOTE_MS;
  ctx.setTimer('vote', present(s).length === 0 ? 500 : VOTE_MS);
}

const votersLeft = (s: CscState) => present(s).filter((p) => !(p in s.votes));

/** Distinct players who earn credit for a strip: the prompt's author and every non-blank panel. */
export function contributors(chain: Chain): string[] {
  const out = new Set<string>();
  if (!chain.auto) out.add(chain.author);
  for (const p of chain.panels) if (p.asset) out.add(p.by);
  return [...out];
}

function startTally(s: CscState, ctx: GameCtx): void {
  s.phase = 'tally';
  s.deadline = null;
  s.counts = Object.fromEntries(s.playerIds.map((id) => [id, 0]));
  for (const strip of Object.values(s.votes)) s.counts[strip]++;
  for (const chain of s.chains) {
    const votes = s.counts[chain.author];
    for (const p of contributors(chain)) s.scores[p] += votes * POINTS_PER_VOTE;
  }
  const best = Math.max(...Object.values(s.counts));
  const top = s.chains.filter((c) => best > 0 && s.counts[c.author] === best);
  s.summary = top.length ? `Favourite strip: "${top[0].prompt}"${top.length > 1 ? ` (and ${top.length - 1} more)` : ''}` : 'No votes were cast';
  ctx.setTimer('tally', TALLY_MS);
}

/** Bonus strips: each slot's panel comes from a different chain where possible. Blank panels are never used. */
export function buildRemixes(chains: readonly Chain[], rng: Rng, count: number): Remix[] {
  const out: Remix[] = [];
  for (let k = 0; k < count; k++) {
    const used = new Set<number>();
    const panels: Panel[] = [];
    for (let slot = 0; slot < PANELS; slot++) {
      const cands = chains.map((_, c) => c).filter((c) => chains[c].panels[slot]?.asset);
      if (!cands.length) return out;
      const fresh = cands.filter((c) => !used.has(c));
      const pick = rng.pick(fresh.length ? fresh : cands);
      used.add(pick);
      panels.push(chains[pick].panels[slot]);
    }
    out.push({ title: `Remix ${k + 1}`, panels });
  }
  return out;
}

function startRemix(s: CscState, ctx: GameCtx): void {
  const count = Math.min(4, Math.max(2, Math.ceil(s.playerIds.length / 3)));
  s.remix = buildRemixes(s.chains, ctx.rng, count);
  if (!s.remix.length) {
    s.phase = 'done';
    return;
  }
  s.phase = 'remix';
  s.remixAt = ctx.now() + LEAD_MS;
  ctx.setTimer('remix', LEAD_MS + s.remix.length * REMIX_STRIP_MS);
}

function sourceFor(s: CscState, player: string): Source | null {
  if (s.phase !== 'draw') return null;
  const n = s.playerIds.length;
  const chain = s.chains[chainFor(n, s.round, s.playerIds.indexOf(player))];
  // Only the previous item of the chain: the prompt for panel 1, panel k-1 for panel k.
  if (s.round === 1) return { kind: 'prompt', text: chain.prompt };
  return { kind: 'panel', asset: chain.panels[s.round - 2].asset };
}

// ---------- the game ----------

export default defineGame<CscState, CscAction, CscSettings>({
  manifest: {
    id: 'comic-strip-club',
    title: 'Comic Strip Club',
    tagline: 'Write an idea, draw a panel, pass it on, and see what the strip becomes.',
    minPlayers: 3,
    maxPlayers: 20,
    screen: 'optional',
    estMinutes: 15,
  },
  defaultSettings: { promptSeconds: PROMPT_MS / 1000, drawSeconds: DRAW_MS / 1000 },
  settingsFields,
  actionSchema,

  setup(ctx, players, settings) {
    const s: CscState = {
      promptMs: settings.promptSeconds * 1000,
      drawMs: settings.drawSeconds * 1000,
      playerIds: players.map((p) => p.id),
      names: Object.fromEntries(players.map((p) => [p.id, p.name])),
      gone: [],
      phase: 'prompt',
      round: 0,
      deadline: null,
      inbox: {},
      chains: [],
      order: [],
      revealAt: null,
      votes: {},
      counts: {},
      remix: [],
      remixAt: null,
      scores: Object.fromEntries(players.map((p) => [p.id, 0])),
      summary: '',
    };
    startRound(s, ctx);
    return s;
  },

  onAction(s, ctx, playerId, a) {
    if (!s.playerIds.includes(playerId)) return;
    if (a.type === 'prompt') {
      if (s.phase !== 'prompt' || playerId in s.inbox) return;
      s.inbox[playerId] = a.text;
      if (submittedAll(s)) endRound(s, ctx);
    } else if (a.type === 'panel') {
      if (s.phase !== 'draw' || a.panel !== s.round || playerId in s.inbox) return;
      s.inbox[playerId] = a.strokes.length ? ctx.putAsset(makeDrawing(a.strokes, PANEL_ASPECT)) : null;
      if (submittedAll(s)) endRound(s, ctx);
    } else {
      if (s.phase !== 'vote' || playerId in s.votes) return;
      // Only real strips, never your own prompt's strip.
      if (!s.playerIds.includes(a.strip) || a.strip === playerId) return;
      s.votes[playerId] = a.strip;
      if (votersLeft(s).length === 0) startTally(s, ctx);
    }
  },

  onTimer(s, ctx, key) {
    if (key === 'round' && (s.phase === 'prompt' || s.phase === 'draw')) endRound(s, ctx);
    else if (key === 'reveal' && s.phase === 'reveal') startVote(s, ctx);
    else if (key === 'vote' && s.phase === 'vote') startTally(s, ctx);
    else if (key === 'tally' && s.phase === 'tally') startRemix(s, ctx);
    else if (key === 'remix' && s.phase === 'remix') s.phase = 'done';
  },

  onPlayerLeave(s, ctx, playerId) {
    if (!s.playerIds.includes(playerId) || s.gone.includes(playerId)) return;
    s.gone.push(playerId);
    // Their panels simply go in blank (and a missing prompt is auto-filled): never wait on them.
    if ((s.phase === 'prompt' || s.phase === 'draw') && submittedAll(s)) endRound(s, ctx);
    else if (s.phase === 'vote' && votersLeft(s).length === 0) startTally(s, ctx);
  },

  onPlayerReturn(s, _ctx, playerId) {
    s.gone = s.gone.filter((id) => id !== playerId);
  },

  view(s, viewer): CscView {
    const revealed = s.phase !== 'prompt' && s.phase !== 'draw';
    const strips: StripView[] | null = revealed
      ? s.order.map((id) => {
          const c = s.chains.find((x) => x.author === id)!;
          return { id, prompt: c.prompt, auto: c.auto, panels: c.panels };
        })
      : null;
    const showTally = s.phase === 'tally' || s.phase === 'remix' || s.phase === 'done';
    const me = viewer.kind === 'player' ? viewer.id : null;
    return {
      phase: s.phase,
      round: s.round,
      deadline: s.deadline,
      promptMs: s.promptMs,
      drawMs: s.drawMs,
      players: s.playerIds,
      done: s.phase === 'prompt' || s.phase === 'draw' ? Object.keys(s.inbox) : [],
      gone: s.gone,
      you:
        me && s.playerIds.includes(me)
          ? {
              submitted: me in s.inbox,
              panel: s.round,
              source: sourceFor(s, me),
              vote: s.votes[me] ?? null,
            }
          : null,
      strips,
      reveal: s.phase === 'reveal' && s.revealAt !== null ? { startAt: s.revealAt, stepMs: STEP_MS, stripMs: STRIP_MS } : null,
      voted: s.phase === 'vote' ? Object.keys(s.votes) : [],
      counts: showTally ? s.counts : null,
      remix: s.phase === 'remix' || s.phase === 'done' ? s.remix : null,
      remixAt: s.remixAt,
      remixStripMs: REMIX_STRIP_MS,
      stepMs: STEP_MS,
      scores: showTally ? s.scores : null,
    };
  },

  result(s) {
    if (s.phase !== 'done') return null;
    return { scores: { ...s.scores }, summary: s.summary };
  },

  bot: {
    act(raw, rng, me) {
      const v = raw as CscView;
      if (!v.you) return null;
      if (v.phase === 'prompt' && !v.you.submitted) return { type: 'prompt', text: rng.pick(PREMISES) };
      if (v.phase === 'draw' && !v.you.submitted) {
        if (rng.chance(0.08)) return { type: 'panel', panel: v.round, strokes: [] };
        const colors = ['#14101f', '#e5484d', '#36a5f4', '#3fbf6f', '#ff8a1f'];
        const strokes = Array.from({ length: rng.int(2, 5) }, () => {
          const p: number[] = [];
          let x = rng.int(100, 900);
          let y = rng.int(100, 650);
          for (let i = 0; i < rng.int(4, 14); i++) {
            p.push(x, y);
            x = Math.max(0, Math.min(1000, x + rng.int(-90, 90)));
            y = Math.max(0, Math.min(750, y + rng.int(-90, 90)));
          }
          return { c: rng.pick(colors), w: rng.pick([6, 14, 32]), p };
        });
        return { type: 'panel', panel: v.round, strokes };
      }
      if (v.phase === 'vote' && v.you.vote === null) {
        const options = v.players.filter((p) => p !== me);
        return options.length ? { type: 'vote', strip: rng.pick(options) } : null;
      }
      return null;
    },
  },
});
