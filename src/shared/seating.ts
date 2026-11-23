// Who gets a seat when the room holds more players than the selected game allows.
// The room holds up to 30; every game keeps its own maxPlayers cap, and the rest spectate.
// Shared by the engine (who is seated) and the lobby (the "20 play, 6 watch" line), so both
// always agree. Pure data in, data out: no zod, no engine imports.

export interface SeatCandidate {
  id: string;
  isBot: boolean;
  /** Holds host controls (host-player mode). */
  isHost: boolean;
  /** Has a live socket (bots count as connected). */
  connected: boolean;
  /** Left, or gone past the disconnect grace: cannot be seated. Treated as present when missing. */
  away?: boolean;
}

export interface SeatPlan<T> {
  /** Who plays, in seat order. */
  seated: T[];
  /** Present players without a seat, in seat order. They spectate this game and play the next. */
  watching: T[];
}

/**
 * Seats at most `maxPlayers` of the players who are not away. Priority: the host-player, then
 * connected humans, then bots, then humans still inside the disconnect grace; ties go to seat
 * order. The result keeps seat order, so a game sees players in the order they joined.
 */
export function planSeats<T extends SeatCandidate>(players: readonly T[], maxPlayers: number): SeatPlan<T> {
  const rank = (p: T): number => (p.isHost && !p.isBot ? 0 : p.isBot ? 2 : p.connected ? 1 : 3);
  const present = players.filter((p) => !p.away);
  const chosen = new Set(
    present
      .map((p, i) => ({ p, i }))
      .sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i)
      .slice(0, Math.max(0, maxPlayers))
      .map(({ p }) => p),
  );
  return { seated: present.filter((p) => chosen.has(p)), watching: present.filter((p) => !chosen.has(p)) };
}
