// Kit preview: every kit component with sample data. Dev only, not in the production build.
// Open with `npm run dev`, then /dev/kit.html (add ?game=forgery etc. to preview a sub-palette).
import { render } from 'preact';
import { useState } from 'preact/hooks';
import '../src/client/fonts';
import '../src/client/styles/tokens.css';
import '../src/client/styles/base.css';
import '../src/client/kit/kit.css';
import '../src/client/styles/shell.css';
import {
  Avatar,
  DrawingCanvas,
  makeDrawing,
  PlayerChip,
  PointsNote,
  PromptCard,
  QR,
  RevealStage,
  RoleCard,
  StrokeView,
  Timer,
  useDraft,
  useServerNow,
  Vote,
  type Stroke,
} from '../src/client/kit';
import type { Lobby } from '../src/shared/types';
import { KIT } from '../src/client/audio/recipes';
import { sfx, type SfxName } from '../src/client/audio/sfx';
import { play as caveRave } from '../src/games/cave-rave/sfx';
import { play as comicStripClub } from '../src/games/comic-strip-club/sfx';
import { play as crackedCookbook } from '../src/games/cracked-cookbook/sfx';
import { play as forgery } from '../src/games/forgery/sfx';
import { play as secondWitness } from '../src/games/second-witness/sfx';
import { play as wikiWhat } from '../src/games/wiki-what/sfx';

// The sound board plays here as if this page were the room's audio device.
sfx.setDevice(true);
const SFX_NAMES = Object.keys(KIT) as SfxName[];
const GAME_SFX = { forgery, comicStripClub, crackedCookbook, wikiWhat, secondWitness, caveRave };

const players = [
  { id: 'a', name: 'Maya', color: '#ff5d5d' },
  { id: 'b', name: 'Theo', color: '#ffb13b' },
  { id: 'c', name: 'Jun', color: '#2ec4b6' },
  { id: 'd', name: 'Priya', color: '#7a6bff' },
].map((p) => ({ ...p, isBot: false, isHost: p.id === 'a', connected: p.id !== 'd', score: 0 }));
const lobby = { players } as unknown as Lobby;
const game = new URLSearchParams(location.search).get('game') ?? undefined;

function Preview() {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [single, setSingle] = useState<Stroke[]>([]);
  const [live, setLive] = useState(0);
  const [vote, setVote] = useState<string | null>(null);
  const now = useServerNow(0);
  const [deadline] = useState(() => now + 30_000);
  const [roleDeadline] = useState(() => now + 5_000);
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState<string[]>([]);
  useDraft(draft, (t) => setSaved((s) => [...s, t]), { deadline: roleDeadline + 25_000 });
  return (
    <main class="view-phone" data-game={game} style={{ padding: '16px', gap: '28px', display: 'grid' }}>
      <section class="g-stack">
        <span class="eyebrow">Avatar · PlayerChip</span>
        <div class="g-row">
          {players.map((p) => (
            <Avatar key={p.id} name={p.name} color={p.color} host={p.isHost} away={!p.connected} label />
          ))}
        </div>
        <PlayerChip lobby={lobby} id="b" trailing={12} you />
      </section>
      <section class="g-stack">
        <span class="eyebrow">Timer · PromptCard</span>
        <div class="g-row">
          <Timer deadline={deadline} total={30_000} />
          <Timer deadline={now + 3_000} total={10_000} />
        </div>
        <PromptCard eyebrow="Category">Things in a kitchen</PromptCard>
        <PromptCard eyebrow="Your secret word" secret tone="accent">
          Colander
        </PromptCard>
        <PromptCard eyebrow="Question" footer="Source: Great Molasses Flood">
          How fast did the wave travel?
        </PromptCard>
      </section>
      <section class="g-stack">
        <span class="eyebrow">RoleCard (5 s, same layout for every role)</span>
        <RoleCard eyebrow="Round 2 · your role" role="You are an artist" detail="Draw a pancake. Blend in." deadline={roleDeadline} total={5_000} />
        <span class="eyebrow">PointsNote</span>
        <PointsNote lines={[{ pts: 3, why: 'pizza matched' }, { pts: 1, why: 'spotted the forger' }]} total={4} />
        <PointsNote lines={[{ pts: -2, why: 'fooled by the forger' }]} />
        <span class="eyebrow">useDraft (type, then hide the tab: {saved.length} saved{saved.length ? `, last "${saved[saved.length - 1]}"` : ''})</span>
        <input class="input" value={draft} onInput={(e) => setDraft((e.target as HTMLInputElement).value)} placeholder="Half-typed answer" />
      </section>
      <section class="g-stack">
        <span class="eyebrow">
          DrawingCanvas ({strokes.length} strokes, {live} live pts)
        </span>
        <DrawingCanvas strokes={strokes} onChange={setStrokes} onStrokeProgress={(p) => setLive((n) => n + p.length / 2)} aspect={4 / 3} />
        <span class="eyebrow">singleStroke, seat color, dark paper</span>
        <DrawingCanvas
          strokes={single}
          onChange={setSingle}
          singleStroke
          colors={['#ffe14d']}
          widths={[10]}
          paper="var(--stage)"
          underlay={strokes}
          aspect={4 / 3}
        />
        <span class="eyebrow">StrokeView (animated)</span>
        <div style={{ width: '50%' }}>
          <StrokeView key={strokes.length} drawing={makeDrawing(strokes, 4 / 3)} animate />
        </div>
      </section>
      <section class="g-stack">
        <span class="eyebrow">Vote</span>
        <Vote
          label="Who is the forger?"
          options={players.map((p) => ({ id: p.id, label: p.name, color: p.color, hint: p.id === 'a' ? 'Drew the handle' : undefined }))}
          value={vote}
          onVote={setVote}
        />
      </section>
      <section class="g-stack">
        <span class="eyebrow">Sounds (tap any; shared, then each game's)</span>
        <div class="g-row">
          {SFX_NAMES.map((n) => (
            <button key={n} type="button" class="btn btn-s" onClick={() => setTimeout(() => sfx.play(n, { n: 4 }), 30)}>
              {n}
            </button>
          ))}
        </div>
        {Object.entries(GAME_SFX).map(([game, play]) => (
          <div key={game} class="g-row">
            <span class="eyebrow">{game}</span>
            {play.names.map((n) => (
              <button key={n} type="button" class="btn btn-s" onClick={() => setTimeout(() => (play as (n: string, o?: object) => void)(n, { n: 4, through: true }), 30)}>
                {n}
              </button>
            ))}
          </div>
        ))}
      </section>
      <section class="g-stack">
        <span class="eyebrow">RevealStage (interval 700 ms) · QR</span>
        <RevealStage
          layout="row"
          interval={700}
          items={['Panel one', 'Panel two', 'Panel three'].map((t) => (
            <div class="g-panel">{t}</div>
          ))}
        />
        <div style={{ width: '140px' }}>
          <QR value="https://example.workers.dev/ABCD" />
        </div>
      </section>
    </main>
  );
}

render(<Preview />, document.getElementById('app')!);
