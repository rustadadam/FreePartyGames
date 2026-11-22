// A room's audio on this device: the song for the current phase, whether this device is the
// room's audio device, and the shell's cues (joins, leaves, game picked, start, results, back).
// Cues are derived from lobby changes, so they need nothing from the server.
import { useEffect, useRef } from 'preact/hooks';
import type { Lobby } from '../../shared/types';
import { useRoomMusic } from './music';
import { pentatonic, sfx } from './sfx';

export function useRoomAudio(lobby: Lobby | null, plays: boolean): void {
  useRoomMusic(lobby, plays);
  useEffect(() => sfx.setDevice(plays), [plays]);
  useEffect(() => () => sfx.setDevice(false), []);
  useShellCues(lobby);
}

function useShellCues(lobby: Lobby | null): void {
  const prev = useRef<Lobby | null>(null);
  useEffect(() => {
    const was = prev.current;
    prev.current = lobby;
    if (!was || !lobby) return; // first arrival: the room already existed, nothing just happened

    const before = new Set(was.players.map((p) => p.id));
    let wave = 0;
    lobby.players.forEach((p, seat) => {
      if (!before.has(p.id)) sfx.play('join', { pitch: pentatonic(seat), delay: 90 * wave++ });
    });
    const now = new Set(lobby.players.map((p) => p.id));
    if (was.players.some((p) => !now.has(p.id))) sfx.play('leave');

    if (lobby.phase !== was.phase) {
      sfx.play(lobby.phase === 'playing' ? 'start' : lobby.phase === 'results' ? 'fanfare' : 'back');
    } else if (lobby.phase === 'lobby' && lobby.selectedGameId && lobby.selectedGameId !== was.selectedGameId) {
      sfx.play('pick');
    }
  }, [lobby]);
}
