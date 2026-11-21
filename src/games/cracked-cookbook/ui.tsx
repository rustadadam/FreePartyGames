// Cracked Cookbook UI. Motif: recipe index cards with a torn strip of tape, and props that
// become die-cut stickers (white outline, soft shadow) on a plate. Everything comes from the kit
// (src/client/kit) and the sub-palette; names and colors come from `lobby`, views carry ids.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  DEFAULT_COLORS,
  DrawingCanvas,
  PlayerChip,
  PromptCard,
  RevealStage,
  StrokeView,
  Timer,
  Vote,
  playerOf,
  useAssets,
  useServerNow,
  type Drawing,
  type Stroke,
} from '../../client/kit';
import type { AssetMap, ClientGameModule, PlayerProps, ScreenProps } from '../../client/gameModule';
import type { Lobby } from '../../shared/types';
// Type-only imports from logic.ts: a value import would pull zod and the game logic into this chunk.
import type { CookAction, CookView, DishView, Sticker } from './logic';
import { COOK_MS, DRAW_MS, MAX_STICKERS, NAME_MAX, PROP_PTS, STICKER_BASE_PCT, VOTE_MS, VOTE_PTS } from './rules';
import './ui.css';

type Pantry = CookView['pantry'];
/** Ink without white: white would vanish into the sticker outline. */
const INK = DEFAULT_COLORS.filter((c) => c.toLowerCase() !== '#ffffff');
/** The phone sends its draft this long before the deadline, so "time's up" still counts. */
const LAST_CALL_MS = 2500;
const PLATE_PAPER = 'var(--cc-plate)';

// ------------------------------------------------------------------ shared bits

const outlined = new WeakMap<Drawing, Drawing>();
/** A copy of the drawing with a fat white underlay: the die-cut sticker edge. */
function withOutline(d: Drawing): Drawing {
  let o = outlined.get(d);
  if (!o) {
    o = { ...d, strokes: [...d.strokes.map((s) => ({ ...s, c: '#ffffff', w: s.w + 26 })), ...d.strokes] };
    outlined.set(d, o);
  }
  return o;
}

function Art({ asset, assets, outline, label }: { asset: string | null | undefined; assets: AssetMap; outline?: boolean; label: string }) {
  const d = asset ? (assets[asset] as Drawing | undefined) : undefined;
  return <StrokeView drawing={d && outline ? withOutline(d) : d} paper="transparent" label={label} class="cc-art" />;
}

function stickerStyle(st: Sticker) {
  return {
    left: `${st.x / 10}%`,
    top: `${st.y / 10}%`,
    width: `${STICKER_BASE_PCT * st.s}%`,
    transform: `translate(-50%, -50%) rotate(${st.r}deg)`,
  };
}

/** A finished dish: the cook's own strokes, then the stickers on top. */
function DishPlate({ dish, pantry, assets }: { dish: DishView; pantry: Pantry; assets: AssetMap }) {
  return (
    <div class="cc-plate" role="img" aria-label={`${dish.meal} with ${dish.stickers.length} props`}>
      <StrokeView drawing={dish.asset ? (assets[dish.asset] as Drawing | undefined) : undefined} paper="transparent" class="cc-plate-ink" />
      {dish.stickers.map((st, i) => (
        <span key={i} class="cc-sticker" style={stickerStyle(st)}>
          <Art asset={pantry[st.p]?.asset} assets={assets} outline label={pantry[st.p]?.name ?? 'Prop'} />
        </span>
      ))}
    </div>
  );
}

/** The pantry: every prop so far as a taped index card. */
function PantryWall({ pantry, assets, lobby, class: cls }: { pantry: Pantry; assets: AssetMap; lobby: Lobby; class?: string }) {
  if (!pantry.length) return <p class="g-muted cc-empty">The shelves are bare. Props will land here.</p>;
  return (
    <ul class={`cc-wall${cls ? ` ${cls}` : ''}`} aria-label="Pantry">
      {[...pantry].reverse().map((p) => (
        <li key={p.id} class="cc-card" style={{ '--tilt': `${((p.id * 37) % 7) - 3}deg` }}>
          <Art asset={p.asset} assets={assets} label={p.name} />
          <span class="cc-card-name">{p.name}</span>
          {p.by && <span class="cc-card-by">{playerOf(lobby, p.by)?.name ?? 'Someone'}</span>}
        </li>
      ))}
    </ul>
  );
}

function Waiting({ ids, lobby, size }: { ids: string[]; lobby: Lobby; size?: string }) {
  if (!ids.length) return null;
  const shown = ids.slice(0, 10);
  return (
    <div class="cc-waiting" aria-live="polite">
      <span class="eyebrow">Still cooking</span>
      {shown.map((id) => (
        <PlayerChip key={id} lobby={lobby} id={id} size={size} />
      ))}
      {ids.length > shown.length && <span class="g-muted">+{ids.length - shown.length} more</span>}
    </div>
  );
}

function phaseTotal(phase: CookView['phase']): number {
  return phase === 'draw' ? DRAW_MS : phase === 'cook' ? COOK_MS : VOTE_MS;
}

function phaseLabel(v: CookView): string {
  if (v.phase === 'draw') return `Pantry ${v.round} of ${v.rounds}`;
  if (v.phase === 'cook') return 'Cook the dish';
  if (v.phase === 'vote') return 'Taste test';
  return 'Dinner is served';
}

function Bar({ view, size }: { view: CookView; size?: 'm' | 'l' }) {
  return (
    <div class="g-spread cc-bar">
      <span class="cc-tape eyebrow">{phaseLabel(view)}</span>
      <Timer deadline={view.deadline} total={phaseTotal(view.phase)} size={size} />
    </div>
  );
}

/** Sends the draft shortly before the deadline so the server timer never beats the player. */
function useLastCall(deadline: number | null, armed: boolean, fire: () => void) {
  const now = useServerNow(500);
  const latest = useRef(fire);
  latest.current = fire;
  const fired = useRef<number | null>(null);
  useEffect(() => {
    if (armed && deadline && deadline - now <= LAST_CALL_MS && fired.current !== deadline) {
      fired.current = deadline;
      latest.current();
    }
  }, [now, deadline, armed]);
}

function assetIds(v: CookView): string[] {
  return [...v.pantry.map((p) => p.asset), ...v.dishes.map((d) => d.asset).filter((a): a is string => !!a)];
}

// ------------------------------------------------------------------ phone: drawing a prop

function DrawProp({ view, send }: { view: CookView; send(a: CookAction): void }) {
  const prompt = view.you?.prompt ?? 'Mystery item';
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [name, setName] = useState(prompt);
  const submit = () => strokes.length && send({ type: 'prop', strokes, name: name.trim() || prompt });
  useLastCall(view.deadline, strokes.length > 0, submit);
  return (
    <section class="cc-phone">
      <Bar view={view} />
      <PromptCard eyebrow={view.round === 1 ? 'Draw this ingredient' : 'Draw this for the scene'} tone="accent">
        {prompt}
      </PromptCard>
      <DrawingCanvas strokes={strokes} onChange={setStrokes} colors={INK} aspect={1} label={`Drawing of ${prompt}`} />
      <label class="field">
        <span class="eyebrow">Name it</span>
        <input class="input" value={name} maxLength={NAME_MAX} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
      </label>
      <div class="cc-dock">
        <button type="button" class="btn btn-primary btn-block" disabled={!strokes.length} onClick={submit}>
          Add to the pantry
        </button>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ phone: composing a dish

interface Placed extends Sticker {
  uid: number;
}
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function DragSticker(props: {
  st: Placed;
  pantry: Pantry;
  assets: AssetMap;
  live: boolean;
  selected: boolean;
  onSelect(): void;
  onMove(x: number, y: number): void;
}) {
  const { st, pantry, assets, live, selected } = props;
  const down = (e: PointerEvent) => {
    if (!live) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    const box = (el.parentElement as HTMLElement).getBoundingClientRect();
    const k = 1000 / box.width;
    const from = { px: e.clientX, py: e.clientY, x: st.x, y: st.y };
    el.setPointerCapture(e.pointerId);
    props.onSelect();
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      props.onMove(clamp(from.x + (ev.clientX - from.px) * k, 0, 1000), clamp(from.y + (ev.clientY - from.py) * k, 0, 1000));
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  return (
    <span
      class={`cc-sticker${live ? ' is-live' : ''}${selected && live ? ' is-selected' : ''}`}
      style={stickerStyle(st)}
      onPointerDown={down}
    >
      <Art asset={pantry[st.p]?.asset} assets={assets} outline label={pantry[st.p]?.name ?? 'Prop'} />
    </span>
  );
}

function Compose({ view, send, assets }: { view: CookView; send(a: CookAction): void; assets: AssetMap }) {
  const you = view.you!;
  const hand = you.hand;
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [mode, setMode] = useState<'place' | 'draw'>(hand.length ? 'place' : 'draw');
  const next = useRef(1);
  const picked = placed.find((p) => p.uid === sel) ?? null;

  const submit = () =>
    send({
      type: 'dish',
      strokes,
      stickers: placed.map(({ p, x, y, s, r }) => ({ p, x: Math.round(x), y: Math.round(y), s: Math.round(s * 100) / 100, r: Math.round(r) })),
    });
  useLastCall(view.deadline, true, submit);

  const patch = (uid: number, change: Partial<Placed>) => setPlaced((ps) => ps.map((p) => (p.uid === uid ? { ...p, ...change } : p)));
  const add = (p: number) => {
    if (placed.length >= MAX_STICKERS) return;
    const uid = next.current++;
    setPlaced([...placed, { uid, p, x: 500 + ((uid * 97) % 240) - 120, y: 500 + ((uid * 61) % 240) - 120, s: 1, r: 0 }]);
    setSel(uid);
    setMode('place');
  };
  const remove = () => {
    setPlaced(placed.filter((p) => p.uid !== sel));
    setSel(null);
  };
  const front = () => {
    if (picked) setPlaced([...placed.filter((p) => p.uid !== sel), picked]);
  };

  return (
    <section class="cc-phone">
      <Bar view={view} />
      <PromptCard eyebrow="Your order" tone="accent">
        {you.meal}
      </PromptCard>
      <DrawingCanvas
        strokes={strokes}
        onChange={setStrokes}
        colors={INK}
        aspect={1}
        paper={PLATE_PAPER}
        disabled={mode === 'place'}
        label={`Plate for ${you.meal}`}
      >
        {placed.map((st) => (
          <DragSticker
            key={st.uid}
            st={st}
            pantry={view.pantry}
            assets={assets}
            live={mode === 'place'}
            selected={st.uid === sel}
            onSelect={() => setSel(st.uid)}
            onMove={(x, y) => patch(st.uid, { x, y })}
          />
        ))}
      </DrawingCanvas>

      <div class="cc-seg" role="radiogroup" aria-label="What your finger does">
        <button type="button" role="radio" aria-checked={mode === 'place'} class={mode === 'place' ? 'is-on' : ''} onClick={() => setMode('place')}>
          Move stickers ({placed.length}/{MAX_STICKERS})
        </button>
        <button type="button" role="radio" aria-checked={mode === 'draw'} class={mode === 'draw' ? 'is-on' : ''} onClick={() => setMode('draw')}>
          Draw
        </button>
      </div>

      {mode === 'place' && picked && (
        <div class="cc-adjust">
          <label>
            <span class="eyebrow">Size</span>
            <input type="range" min={30} max={300} value={Math.round(picked.s * 100)} onInput={(e) => patch(picked.uid, { s: Number((e.target as HTMLInputElement).value) / 100 })} />
          </label>
          <label>
            <span class="eyebrow">Turn</span>
            <input type="range" min={-180} max={180} value={picked.r} onInput={(e) => patch(picked.uid, { r: Number((e.target as HTMLInputElement).value) })} />
          </label>
          <div class="g-row">
            <button type="button" class="btn btn-s" onClick={front}>
              Bring to front
            </button>
            <button type="button" class="btn btn-s btn-danger" onClick={remove}>
              Remove
            </button>
          </div>
        </div>
      )}
      {mode === 'place' && !picked && placed.length > 0 && <p class="g-muted">Tap a sticker to select it, drag to move it.</p>}

      <div>
        <span class="eyebrow">Your props, drawn by the others</span>
        {hand.length ? (
          <div class="cc-tray">
            {hand.map((i) => (
              <button key={i} type="button" class="cc-tray-item" disabled={placed.length >= MAX_STICKERS} onClick={() => add(i)} aria-label={`Add ${view.pantry[i]?.name}`}>
                <Art asset={view.pantry[i]?.asset} assets={assets} outline label="" />
                <span>{view.pantry[i]?.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <p class="g-muted">The pantry is empty. Draw your dish by hand.</p>
        )}
      </div>

      <div class="cc-dock">
        <button type="button" class="btn btn-primary btn-block" onClick={submit}>
          Serve it up
        </button>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ phone: waiting and voting

function PhoneWait({ view, lobby, assets, title, note }: { view: CookView; lobby: Lobby; assets: AssetMap; title: string; note: string }) {
  return (
    <section class="cc-phone">
      <Bar view={view} />
      <PromptCard eyebrow={note}>{title}</PromptCard>
      <Waiting ids={view.waiting} lobby={lobby} />
      {!lobby.screenConnected && (
        <>
          <span class="eyebrow">The pantry so far</span>
          <PantryWall pantry={view.pantry} assets={assets} lobby={lobby} class="cc-wall-phone" />
        </>
      )}
    </section>
  );
}

function PhoneVote({ view, send, assets }: { view: CookView; send(a: CookAction): void; assets: AssetMap }) {
  const you = view.you!;
  return (
    <section class="cc-phone">
      <Bar view={view} />
      <p class="g-muted">Pick the dish you would eat first. You cannot pick your own. You can change your mind until time is up.</p>
      <Vote
        label="Vote for the best dish"
        changeable
        value={you.vote === null ? null : String(you.vote)}
        onVote={(id) => send({ type: 'vote', dish: Number(id) })}
        options={view.dishes.map((d) => ({
          id: String(d.id),
          label: d.id === you.ownDish ? `Dish ${d.id + 1} (yours)` : `Dish ${d.id + 1}`,
          hint: d.meal,
          disabled: d.id === you.ownDish,
          media: <DishPlate dish={d} pantry={view.pantry} assets={assets} />,
        }))}
      />
    </section>
  );
}

// ------------------------------------------------------------------ reveal (phones without a screen, and the screen)

function DishReveal({ dish, res, lobby, pantry, assets }: { dish: DishView; res: { votes: number; pts: number; artists: string[] }; lobby: Lobby; pantry: Pantry; assets: AssetMap }) {
  return (
    <article class="cc-reveal">
      <DishPlate dish={dish} pantry={pantry} assets={assets} />
      <div class="cc-reveal-info">
        <p class="eyebrow">{dish.meal}</p>
        <h2 class="cc-reveal-name">{playerOf(lobby, dish.by)?.name ?? 'Someone'}</h2>
        <p class="cc-votes">
          <b>{res.votes}</b> {res.votes === 1 ? 'vote' : 'votes'}
          <span class="g-muted"> · +{res.pts} pts</span>
        </p>
        {res.votes > 0 && res.artists.length > 0 && (
          <div class="cc-credit">
            <span class="eyebrow">Prop artists, +{PROP_PTS} each</span>
            <div class="g-row">
              {res.artists.map((id) => (
                <PlayerChip key={id} lobby={lobby} id={id} />
              ))}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function Standings({ scores, lobby, me, size }: { scores: Record<string, number>; lobby: Lobby; me?: string; size: string }) {
  const ids = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);
  return (
    <div class="cc-board">
      <p class="eyebrow">Kitchen scores</p>
      <ol>
        {ids.map((id, i) => (
          <li key={id} class="cc-board-row" style={{ animationDelay: `${i * 60}ms` }}>
            <span class="cc-rank">{i + 1}</span>
            <PlayerChip lobby={lobby} id={id} you={id === me} size={size} trailing={scores[id]} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function RevealBoard({ view, assets, lobby, me, size }: { view: CookView; assets: AssetMap; lobby: Lobby; me?: string; size: string }) {
  const r = view.reveal!;
  const items = r.order.map((id) => <DishReveal key={id} dish={view.dishes[id]} res={r.detail[id]} lobby={lobby} pantry={view.pantry} assets={assets} />);
  items.push(<Standings key="board" scores={view.scores ?? {}} lobby={lobby} me={me} size={size} />);
  return <RevealStage items={items} startAt={r.startAt} interval={r.interval} layout="single" class="cc-stage" />;
}

// ------------------------------------------------------------------ top-level components

function Player({ view, send, lobby, me, assets: _shared }: PlayerProps<CookView, CookAction>) {
  const assets = useAssets(assetIds(view));
  const you = view.you;
  if (!you) return <p class="g-muted">Watching this one.</p>;

  if (view.phase === 'draw') {
    return you.submitted ? (
      <PhoneWait view={view} lobby={lobby} assets={assets} title="In the pantry. Nice." note={`Pantry ${view.round} of ${view.rounds}`} />
    ) : (
      <DrawProp key={view.round} view={view} send={send} />
    );
  }
  if (view.phase === 'cook') {
    return you.submitted ? (
      <PhoneWait view={view} lobby={lobby} assets={assets} title="Served. Wait for the other cooks." note="Order up" />
    ) : (
      <Compose view={view} send={send} assets={assets} />
    );
  }
  if (view.phase === 'vote') return <PhoneVote view={view} send={send} assets={assets} />;

  // reveal / done
  return (
    <section class="cc-phone">
      <Bar view={view} />
      {lobby.screenConnected ? (
        <PromptCard eyebrow="Dinner is served">Eyes on the screen. Your score: {view.scores?.[me] ?? 0}</PromptCard>
      ) : (
        <RevealBoard view={view} assets={assets} lobby={lobby} me={me} size="32px" />
      )}
    </section>
  );
}

function Screen({ view, lobby, assets: _shared }: ScreenProps<CookView>) {
  const assets = useAssets(assetIds(view));

  if (view.phase === 'draw') {
    return (
      <section class="cc-screen">
        <header class="cc-head">
          <div>
            <p class="cc-tape eyebrow">{phaseLabel(view)}</p>
            <h1 class="g-title">{view.round === 1 ? 'Draw an ingredient. Name it.' : 'Now the scenery. Draw it.'}</h1>
          </div>
          <Timer deadline={view.deadline} total={DRAW_MS} size="l" />
        </header>
        <PantryWall pantry={view.pantry} assets={assets} lobby={lobby} class="cc-wall-screen" />
        <Waiting ids={view.waiting} lobby={lobby} size="4vh" />
      </section>
    );
  }

  if (view.phase === 'cook') {
    // Cooks and orders stay unpaired: each dish shows its meal in the vote.
    const cooks = lobby.inGame;
    return (
      <section class="cc-screen cc-screen-cook">
        <header class="cc-head">
          <div>
            <p class="cc-tape eyebrow">{phaseLabel(view)}</p>
            <h1 class="g-title">Plate it with everyone else&rsquo;s drawings.</h1>
          </div>
          <Timer deadline={view.deadline} total={COOK_MS} size="l" />
        </header>
        <div class="cc-orders">
          {(view.orders ?? []).map((meal, i) => (
            <div key={i} class="cc-order">
              <span class="cc-order-meal">{meal}</span>
            </div>
          ))}
        </div>
        <div class="cc-cooks" aria-label="Cooks">
          {cooks.map((id) => {
            const done = !view.waiting.includes(id);
            return (
              <span key={id} class={`cc-cook${done ? ' is-done' : ''}`}>
                <PlayerChip lobby={lobby} id={id} size="4vh" trailing={done ? 'Served' : null} />
              </span>
            );
          })}
        </div>
        <PantryWall pantry={view.pantry} assets={assets} lobby={lobby} class="cc-wall-strip" />
      </section>
    );
  }

  if (view.phase === 'vote') {
    const n = view.dishes.length;
    const cols = clamp(Math.ceil(Math.sqrt(n * 1.8)), 2, 7);
    return (
      <section class="cc-screen">
        <header class="cc-head">
          <div>
            <p class="cc-tape eyebrow">{phaseLabel(view)}</p>
            <h1 class="g-title">Vote on your phone for the best dish.</h1>
          </div>
          <Timer deadline={view.deadline} total={VOTE_MS} size="l" />
        </header>
        <div class="cc-vgrid" style={{ '--cols': cols }}>
          {view.dishes.map((d) => (
            <figure key={d.id} class="cc-dish">
              <DishPlate dish={d} pantry={view.pantry} assets={assets} />
              <figcaption>
                <b class="cc-num">{d.id + 1}</b> {d.meal}
              </figcaption>
            </figure>
          ))}
        </div>
        <Waiting ids={view.waiting} lobby={lobby} size="4vh" />
      </section>
    );
  }

  return (
    <section class="cc-screen cc-screen-reveal">
      <header class="cc-head">
        <div>
          <p class="cc-tape eyebrow">{phaseLabel(view)}</p>
          <h1 class="g-title">The votes are in</h1>
        </div>
      </header>
      <RevealBoard view={view} assets={assets} lobby={lobby} size="5vh" />
    </section>
  );
}

function Rules() {
  return (
    <div class="g-stack">
      <p>
        <b>Two pantry rounds.</b> You get an ingredient, then a scene element. Draw it and name it. Everything goes in the shared pantry.
      </p>
      <p>
        <b>Cook.</b> You get a meal order (Breakfast, Lunch or Dessert, with a twist) and a hand of props other players drew. Drag them onto your plate, resize and turn them, and add your own strokes. Up to {MAX_STICKERS} stickers.
      </p>
      <p>
        <b>Vote.</b> Pick the best dish. Not your own.
      </p>
      <p>
        <b>Points.</b> The cook earns {VOTE_PTS} per vote. Every prop artist earns {PROP_PTS} per vote on any dish that used their prop (once per dish, and never on their own dish).
      </p>
    </div>
  );
}

export default { Player, Screen, Rules } satisfies ClientGameModule;
