// Everything inside a room: picks the screen or phone view, and owns the
// connection chrome (reconnect banner, error toast, wake lock, end states).
import { useEffect, useState } from 'preact/hooks';
import { RoomContext, useRoomState } from '../net/context';
import type { EndReason, RoomClient, RoomState } from '../net/room';
import { PlayerView } from './PlayerView';
import { ScreenView } from './ScreenView';
import { useWakeLock } from './wakeLock';

const ENDED: Record<EndReason, { title: string; body: string }> = {
  kicked: {
    title: 'You were removed',
    body: 'The host removed you from this room. You can join again with the code if they let you back in.',
  },
  replaced: {
    title: 'Opened somewhere else',
    body: 'This seat is now open in another tab or device. Close this one, or rejoin here to take it back.',
  },
  left: { title: 'You left the room', body: 'Your seat is free. Join again any time with the code.' },
  gone: {
    title: 'This room has closed',
    body: 'Rooms close after a couple of hours with nobody in them. Start a new one from the home page.',
  },
  full: { title: 'This room is full', body: 'A room holds 20 players. Ask the host to make space, or start your own room.' },
  screen_taken: { title: 'This room already has a TV', body: 'Another device is the big screen for this room. Join as a player instead.' },
};

export function Room({ client, onExit, onRejoin }: { client: RoomClient; onExit(): void; onRejoin(): void }) {
  const state = useRoomState(client);
  // Phones and the TV both stay awake: a laptop screen dimming mid-game is as bad as a phone locking.
  useWakeLock(state.status !== 'ended');

  if (state.ended) {
    const e = ENDED[state.ended];
    return (
      <main class="ended">
        <span class="ticket-mini">{client.code}</span>
        <h1 class="ended-title">{e.title}</h1>
        <p>{e.body}</p>
        <div class="ended-actions">
          {state.ended === 'replaced' && (
            <button type="button" class="btn btn-primary btn-block" onClick={onRejoin}>
              Use this device
            </button>
          )}
          <button type="button" class="btn btn-block" onClick={onExit}>
            Go to home page
          </button>
        </div>
      </main>
    );
  }

  const reconnecting = state.status === 'reconnecting' && !!state.lobby;
  return (
    <RoomContext.Provider value={client}>
      <ReconnectBanner state={state} />
      <Toast state={state} />
      <div class={reconnecting ? 'is-reconnecting' : undefined}>
        {!state.lobby || !state.you ? (
          <main class="arriving" aria-busy="true">
            <span class="ticket-mini">{client.code}</span>
            <p>{state.status === 'reconnecting' ? 'Trying to reach the room…' : 'Getting your ticket…'}</p>
          </main>
        ) : state.you.kind === 'screen' ? (
          <ScreenView client={client} lobby={state.lobby} view={state.view} />
        ) : (
          <PlayerView client={client} lobby={state.lobby} view={state.view} meId={state.you.id} />
        )}
      </div>
    </RoomContext.Provider>
  );
}

function ReconnectBanner({ state }: { state: RoomState }) {
  // Only after a first successful join: the "arriving" screen covers the first connect.
  if (state.status !== 'reconnecting' || !state.lobby) return null;
  return (
    <div class="banner" role="status">
      <span class="banner-dot" aria-hidden="true" />
      <span>Reconnecting{state.attempt > 2 ? ` (try ${state.attempt})` : ''}… your seat is saved.</span>
    </div>
  );
}

function Toast({ state }: { state: RoomState }) {
  const [shown, setShown] = useState<RoomState['notice']>(null);
  useEffect(() => {
    if (!state.notice) return;
    setShown(state.notice);
    const t = setTimeout(() => setShown(null), 3500);
    return () => clearTimeout(t);
  }, [state.notice?.at]);
  if (!shown) return null;
  return (
    <div class="toast" role="alert">
      {shown.message}
    </div>
  );
}
