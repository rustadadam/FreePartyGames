// Home: the join ticket (code + name) is the hero; hosting sits below it.
import { useState } from 'preact/hooks';
import { MAX_NAME_LENGTH, sanitizeName } from '../../shared/limits';
import { CODE_LENGTH, isValidCode, normalizeCode } from '../../shared/roomCode';
import type { Role } from '../../shared/types';
import { loadName, saveName } from '../net/session';

export interface EnterRoom {
  (code: string, name: string, role: Role): void;
}

type Busy = null | 'join' | 'screen' | 'player';

async function createRoom(): Promise<string> {
  const res = await fetch('/api/rooms', { method: 'POST' });
  if (res.status === 201) return ((await res.json()) as { code: string }).code;
  throw new Error(res.status === 503 ? 'Every room code is busy right now. Try again in a minute.' : 'Could not open a room. Try again.');
}

export function Home({ initialCode = '', onEnter }: { initialCode?: string; onEnter: EnterRoom }) {
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState(loadName);
  const [busy, setBusy] = useState<Busy>(null);
  const [joinError, setJoinError] = useState('');
  const [hostError, setHostError] = useState('');
  const [hostPlayer, setHostPlayer] = useState(false);
  const cleanName = sanitizeName(name);

  const join = async (e: Event) => {
    e.preventDefault();
    const c = normalizeCode(code);
    if (!isValidCode(c)) return setJoinError(`Room codes are ${CODE_LENGTH} letters, like QWRT.`);
    if (!cleanName) return setJoinError('Add your name so people know who you are.');
    setBusy('join');
    setJoinError('');
    try {
      const res = await fetch(`/api/rooms/${c}`);
      if (res.status === 404) throw new Error(`There's no room ${c}. Check the code with your host.`);
      if (!res.ok) throw new Error('Could not reach the room. Check your connection and try again.');
      saveName(cleanName);
      onEnter(c, cleanName, 'player');
    } catch (err) {
      setJoinError((err as Error).message);
      setBusy(null);
    }
  };

  const host = async (role: Role) => {
    if (role === 'player' && !cleanName) return setHostError('Add your name first: you are playing too.');
    setBusy(role === 'screen' ? 'screen' : 'player');
    setHostError('');
    try {
      const c = await createRoom();
      if (role === 'player') saveName(cleanName);
      onEnter(c, role === 'player' ? cleanName : 'Screen', role);
    } catch (err) {
      setHostError((err as Error).message);
      setBusy(null);
    }
  };

  return (
    <main class="home">
      <header class="home-head">
        <h1 class="wordmark">
          Free Party
          <br />
          Games
        </h1>
        <p class="home-lede">Party games you play on your phones, with one big screen for everyone to watch. Free, and nothing to install.</p>
      </header>

      <form class="ticket ticket-vertical ticket-join" onSubmit={join} noValidate>
        <div class="ticket-main">
          <label class="ticket-eyebrow" for="join-code">
            Enter your room code here
          </label>
          <input
            id="join-code"
            class="ticket-code ticket-input"
            value={code}
            onInput={(e) => {
              setCode(normalizeCode(e.currentTarget.value).slice(0, CODE_LENGTH));
              setJoinError('');
            }}
            placeholder="ABCD"
            maxLength={CODE_LENGTH + 2}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellcheck={false}
            enterKeyHint="next"
            aria-describedby="join-error"
          />
        </div>
        <div class="ticket-stub ticket-stub-form">
          <label class="ticket-eyebrow" for="join-name">
            Your name
          </label>
          <input
            id="join-name"
            class="input ticket-name"
            value={name}
            onInput={(e) => setName(e.currentTarget.value)}
            maxLength={MAX_NAME_LENGTH}
            placeholder="What should we call you?"
            autoComplete="nickname"
            enterKeyHint="go"
          />
          <button class="btn btn-ink btn-block" disabled={busy !== null}>
            {busy === 'join' ? 'Joining…' : 'Join room'}
          </button>
          <p id="join-error" class="form-error" role="alert">
            {joinError}
          </p>
        </div>
      </form>

      <section class="host" aria-labelledby="host-title">
        <h2 id="host-title" class="eyebrow">
          Hosting tonight?
        </h2>
        <button type="button" class="host-option" onClick={() => host('screen')} disabled={busy !== null}>
          <span class="host-option-title">{busy === 'screen' ? 'Opening room…' : 'Use this screen as the TV'}</span>
          <span class="host-option-body">Open this on a laptop or TV. Everyone watches here and plays on their phones.</span>
        </button>
        <div class={`host-option${hostPlayer ? ' is-open' : ''}`}>
          <button type="button" class="host-option-toggle" aria-expanded={hostPlayer} onClick={() => setHostPlayer(!hostPlayer)}>
            <span class="host-option-title">Host from my phone</span>
            <span class="host-option-body">No big screen? Play and run the game from this phone.</span>
          </button>
          {hostPlayer && (
            <div class="host-option-form">
              <label class="field">
                <span class="eyebrow">Your name</span>
                <input
                  class="input"
                  value={name}
                  onInput={(e) => setName(e.currentTarget.value)}
                  maxLength={MAX_NAME_LENGTH}
                  placeholder="What should we call you?"
                  autoComplete="nickname"
                />
              </label>
              <button type="button" class="btn btn-primary btn-block" disabled={busy !== null} onClick={() => host('player')}>
                {busy === 'player' ? 'Opening room…' : 'Open a room'}
              </button>
            </div>
          )}
        </div>
        <p class="form-error" role="alert">
          {hostError}
        </p>
      </section>
    </main>
  );
}
