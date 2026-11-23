// Results preview: the shell's podium + ranking with fake players. Dev only, not in the production build.
// Open /dev/results.html under `npm run dev`. Params: n (players, default 8), view (phone|screen),
// ties (0|1|2: a tie for first / for second), scored (0 = nobody scored), game (a manifest id).
import { render } from 'preact';
import '../src/client/fonts';
import '../src/client/styles/tokens.css';
import '../src/client/styles/base.css';
import '../src/client/kit/kit.css';
import '../src/client/styles/shell.css';
import { Results } from '../src/client/app/Results';
import { sfx } from '../src/client/audio/sfx';
import type { Lobby } from '../src/shared/types';

const q = new URLSearchParams(location.search);
const n = Number(q.get('n') ?? 8);
const view = q.get('view') === 'screen' ? 'screen' : 'phone';
const ties = Number(q.get('ties') ?? 0);
const scored = q.get('scored') !== '0';
const game = q.get('game') ?? 'forgery';
sfx.setDevice(q.get('sound') === '1');

const NAMES = ['Maya', 'Theo', 'Jun', 'Priya', 'Bartholomew', 'Sol', 'Ines', 'Kofi', 'Lena', 'Omar', 'Zed', 'Ada', 'Noor', 'Gus', 'Wren', 'Tobias'];
const COLORS = ['#ff5d5d', '#ffb13b', '#2ec4b6', '#7a6bff', '#6fe3a1', '#ffffff', '#ffe14d', '#9aa5b1', '#ff8fd1', '#4da3ff'];
const players = Array.from({ length: n }, (_, i) => ({
  id: `p${i}`,
  name: i < NAMES.length ? NAMES[i] : `${NAMES[i % NAMES.length]} ${Math.floor(i / NAMES.length) + 1}`,
  color: COLORS[i % COLORS.length],
  isBot: false,
  isHost: i === 0,
  connected: true,
  score: 0,
}));
// Strictly descending scores, with optional ties at the top.
const scores: Record<string, number> = {};
players.forEach((p, i) => {
  let s = scored ? Math.max(1, (n - i) * 2) : 0;
  if (scored && ties >= 1 && i === 1) s = (n - 0) * 2;
  if (scored && ties >= 2 && i === 3) s = (n - 2) * 2;
  scores[p.id] = s;
  p.score = s * 3 + 5;
});
const ranking = [...players].sort((a, b) => scores[b.id] - scores[a.id]).map((p) => p.id);
const lobby = {
  code: 'ABCD',
  players,
  games: [{ id: game, title: game === 'forgery' ? 'Forgery' : game }],
  lastResult: { gameId: game, scores, ranking, summary: 'The forger fooled four of six artists.' },
} as unknown as Lobby;
const me = players[Math.min(n - 1, 5)].id;

function Phone() {
  return (
    <div class="view-phone phase-results">
      <header class="phone-head">
        <span class="phone-head-title">Forgery</span>
      </header>
      <main class="phone-body">
        <Results lobby={lobby} meId={me} kind="phone" />
      </main>
      <div class="dock">
        <div class="dock-row">
          <button type="button" class="btn">Lobby</button>
          <button type="button" class="btn btn-primary">Play again</button>
        </div>
      </div>
    </div>
  );
}

function Screen() {
  return (
    <main class="view-screen screen-play">
      <div class="screen-stage">
        <div class="screen-results">
          <Results lobby={lobby} kind="screen" />
        </div>
      </div>
      <footer class="rail">
        <span class="ticket-mini">ABCD</span>
        <span class="rail-join">Join at <strong>example.workers.dev/ABCD</strong></span>
      </footer>
    </main>
  );
}

render(view === 'screen' ? <Screen /> : <Phone />, document.getElementById('app')!);
