// Path router: "/" is home, "/ABCD" is a room. A saved seat for that code rejoins
// straight away; otherwise the join ticket opens with the code filled in.
import { useEffect, useState } from 'preact/hooks';
import { isValidCode, normalizeCode } from '../../shared/roomCode';
import type { Role } from '../../shared/types';
import { RoomClient } from '../net/room';
import { clearSession, loadSession } from '../net/session';
import { Home } from './Home';
import { Room } from './Room';

type Route = { kind: 'home'; code: string } | { kind: 'room'; client: RoomClient };

function codeFromPath(): string | null {
  const seg = location.pathname.split('/').filter(Boolean)[0] ?? '';
  const code = normalizeCode(decodeURIComponent(seg));
  return isValidCode(code) ? code : null;
}

function routeFromLocation(): Route {
  const code = codeFromPath();
  if (!code) return { kind: 'home', code: '' };
  const saved = loadSession(code);
  if (saved) return { kind: 'room', client: new RoomClient(code, saved.name, saved.role, saved.token) };
  return { kind: 'home', code };
}

export function App() {
  const [route, setRoute] = useState<Route>(routeFromLocation);

  useEffect(() => {
    const onPop = () =>
      setRoute((prev) => {
        if (prev.kind === 'room') prev.client.dispose();
        return routeFromLocation();
      });
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (route.kind !== 'room') return;
    const c = route.client;
    document.title = `${c.code} · Free Party Games`;
    return () => {
      document.title = 'Free Party Games';
    };
  }, [route]);

  const enter = (code: string, name: string, role: Role) => {
    if (location.pathname !== `/${code}`) history.pushState(null, '', `/${code}`);
    setRoute({ kind: 'room', client: new RoomClient(code, name, role, loadSession(code)?.token) });
  };

  if (route.kind === 'home') return <Home initialCode={route.code} onEnter={enter} />;

  const { client } = route;
  return (
    <Room
      client={client}
      onExit={() => {
        client.dispose();
        if (client.state.ended !== 'replaced') clearSession(client.code);
        history.pushState(null, '', '/');
        setRoute({ kind: 'home', code: '' });
      }}
      onRejoin={() => {
        client.dispose();
        const saved = loadSession(client.code);
        setRoute({ kind: 'room', client: new RoomClient(client.code, client.name, client.role, saved?.token) });
      }}
    />
  );
}
