// Invariant: every file in /songs is played by something. The client picks songs by file name
// (`lobby.mp3`, `lobby2.mp3`, ... or `<game id>.mp3`), so a misnamed file would silently never play.
// The lobby rule is copied from LOBBY_SONG in src/client/audio/music.ts (which needs Vite to import).
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { serverGames } from '../src/games/registry.server';

describe('songs', () => {
  it('are named lobby.mp3, lobby<n>.mp3 or after a registered game id', () => {
    const known = new Set(Object.keys(serverGames));
    const played = (name: string) => /^lobby\d*$/.test(name) || known.has(name);
    const files = readdirSync(join(__dirname, '..', 'songs'));
    const unplayed = files.filter((f) => !f.startsWith('.') && !(f.endsWith('.mp3') && played(f.slice(0, -4))));
    expect(unplayed).toEqual([]);
  });
});
