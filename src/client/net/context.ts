// The room connection as Preact context, plus the store hook the shell uses.
import { createContext } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import type { RoomClient, RoomState } from './room';

export const RoomContext = createContext<RoomClient | null>(null);

/** The current room connection, or null outside a room (e.g. a Rules preview). */
export function useRoomClient(): RoomClient | null {
  return useContext(RoomContext);
}

/** Re-renders on every room state change. */
export function useRoomState(client: RoomClient): RoomState {
  const [state, setState] = useState(client.state);
  useEffect(() => {
    setState(client.state);
    return client.subscribe(() => setState(client.state));
  }, [client]);
  return state;
}
