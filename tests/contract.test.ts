// LOAD-BEARING: this file is the game contract. Never weaken or skip it to get green.
// Every game in the server registry must pass every check here.
import { describe, expect, it } from 'vitest';
import { serverGames } from '../src/games/registry.server';
import { clientGames } from '../src/games/registry.client';
import { ManifestSchema } from '../src/shared/protocol';
import { MAX_VIEW_BYTES } from '../src/shared/protocol';
import { simulateGame } from '../src/core/testkit';
import { clampSetting } from '../src/shared/settings';

const SEEDS = [1, 2, 3];
const MAX_STEPS = 50_000;

function playerCounts(min: number, max: number): number[] {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return [...new Set([min, 8, 20].map(clamp))].sort((a, b) => a - b);
}

describe('registries', () => {
  it('server and client registries have identical id sets', () => {
    expect(Object.keys(serverGames).sort()).toEqual(Object.keys(clientGames).sort());
  });

  it('registry keys match manifest ids', () => {
    for (const [id, def] of Object.entries(serverGames)) expect(def.manifest.id).toBe(id);
  });
});

for (const [id, def] of Object.entries(serverGames)) {
  describe(`game contract: ${id}`, () => {
    it('has a valid manifest and default settings', () => {
      const parsed = ManifestSchema.safeParse(def.manifest);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
      expect(def.manifest.minPlayers).toBeLessThanOrEqual(def.manifest.maxPlayers);
      expect(() => JSON.stringify(def.defaultSettings)).not.toThrow();
    });

    it('settings fields describe real settings, and every default fits its field', () => {
      const defaults = def.defaultSettings as Record<string, unknown>;
      for (const f of def.settingsFields ?? []) {
        expect(f.key in defaults, `${f.key} is not in defaultSettings`).toBe(true);
        expect(clampSetting(f, defaults[f.key] as number), `${f.key} default is outside its field`).toBe(defaults[f.key]);
      }
    });

    for (const players of playerCounts(def.manifest.minPlayers, def.manifest.maxPlayers)) {
      for (const seed of SEEDS) {
        for (const screen of [true, false]) {
          if (def.manifest.screen === 'required' && !screen) continue;
          if (def.manifest.screen === 'none' && screen) continue;
          it(`bots finish: ${players} players, seed ${seed}, ${screen ? 'with' : 'no'} screen`, () => {
            // simulateGame (strict) throws if: any game hook throws, a view is not
            // JSON-serializable or exceeds MAX_VIEW_BYTES, an action reaches onAction
            // without passing actionSchema, or no result within the step cap.
            const report = simulateGame(def, { players, seed, screen, maxSteps: MAX_STEPS });
            expect(report.result).not.toBeNull();
            expect(report.actions).toBeGreaterThan(0);
            // A game that ends on timers alone, or lets one player carry it, is not being played.
            expect(report.actors).toBeGreaterThanOrEqual(Math.min(2, players));
            expect(report.maxViewBytes).toBeLessThanOrEqual(MAX_VIEW_BYTES);
            for (const pid of Object.keys(report.result.scores)) {
              expect(report.playerIds).toContain(pid);
            }
          });
        }
      }
    }

    it('finishes with every setting at its smallest and at its largest', () => {
      for (const settings of ['min', 'max'] as const) {
        for (const players of [def.manifest.minPlayers, Math.min(def.manifest.maxPlayers, 8)]) {
          const report = simulateGame(def, { players, seed: 5, screen: def.manifest.screen !== 'none', maxSteps: MAX_STEPS, settings });
          expect(report.result).not.toBeNull();
        }
      }
    });

    it('survives snapshot/restore (hibernation) every few steps', () => {
      const players = def.manifest.minPlayers;
      const report = simulateGame(def, {
        players,
        seed: 7,
        screen: def.manifest.screen !== 'none',
        maxSteps: MAX_STEPS,
        restoreEvery: 5,
      });
      expect(report.result).not.toBeNull();
    });

    it('finishes on its own timers when every player is idle (no phase waits forever)', () => {
      const report = simulateGame(def, {
        players: def.manifest.minPlayers,
        seed: 13,
        screen: def.manifest.screen !== 'none',
        maxSteps: MAX_STEPS,
        idleBots: true,
      });
      expect(report.result).not.toBeNull();
      expect(report.actions).toBe(0);
    });

    it('ignores stale and out-of-turn actions without throwing', () => {
      for (const seed of SEEDS) {
        const report = simulateGame(def, {
          players: Math.min(def.manifest.maxPlayers, Math.max(def.manifest.minPlayers, 4)),
          seed,
          screen: def.manifest.screen !== 'none',
          maxSteps: MAX_STEPS,
          staleActions: true,
        });
        expect(report.result).not.toBeNull();
      }
    });

    it('does not stall when a player leaves mid-game', () => {
      const players = Math.max(def.manifest.minPlayers, 3);
      if (players > def.manifest.maxPlayers) return;
      const report = simulateGame(def, {
        players,
        seed: 11,
        screen: def.manifest.screen !== 'none',
        maxSteps: MAX_STEPS,
        dropPlayerAtStep: 3,
      });
      expect(report.result).not.toBeNull();
    });
  });
}
