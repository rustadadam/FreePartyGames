// Cracked Cookbook UI. Motif: recipe index cards with a torn strip of tape, and props that
// become die-cut stickers (white outline, soft shadow) on a plate. Everything comes from the kit
// (src/client/kit) and the sub-palette; names and colors come from `lobby`, views carry ids.
import type { ComponentChildren } from 'preact';
import { useRef, useState } from 'preact/hooks';
import {
  DEFAULT_COLORS,
  DrawingCanvas,
  PlayerChip,
  PointsNote,
  PromptCard,
  RevealStage,
  RulesSheet,
  StrokeView,
  Timer,
  playerOf,
  sfx,
  useAssets,
  useDraft,
  useServerNow,
  useSfxCount,
  type Drawing,
  type Stroke,
} from '../../client/kit';
import type { AssetMap, ClientGameModule, PlayerProps, ScreenProps } from '../../client/gameModule';
import type { Lobby } from '../../shared/types';
// Type-only imports from logic.ts: a value import would pull zod and the game logic into this chunk.
import type { CookAction, CookView, DishResult, DishView, PointsLine, Sticker } from './logic';
import { MAX_STICKERS, NAME_MAX, PROP_PTS, RANK_PTS, RANK_SLOTS, STICKER_BASE_PCT, TITLE_MAX, VOTE_MS } from './rules';
import { play } from './sfx';
import './ui.css';

type Pantry = CookView['pantry'];
/** Ink without white: white would vanish into the sticker outline. */
const INK = DEFAULT_COLORS.filter((c) => c.toLowerCase() !== '#ffffff');
const ORDINAL = ['1st', '2nd', '3rd'];

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

/** A dish: the plate with its stickers on top. */
function DishPlate({ dish, pantry, assets }: { dish: DishView; pantry: Pantry; assets: AssetMap }) {
  return (
    <div class="cc-plate" role="img" aria-label={`${dish.title} with ${dish.stickers.length} props`}>
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
  if (!pantry.length) return <p class="g-muted cc-empty">No drawings yet. Everyone's props will show up here.</p>;
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
      <span class="eyebrow">Waiting for</span>
      {shown.map((id) => (
        <PlayerChip key={id} lobby={lobby} id={id} size={size} />
      ))}
      {ids.length > shown.length && <span class="g-muted">+{ids.length - shown.length} more</span>}
    </div>
  );
}

function phaseTotal(view: CookView): number {
  return view.phase === 'draw' ? view.drawMs : view.phase === 'cook' ? view.cookMs : VOTE_MS;
}

function phaseLabel(v: CookView): string {
  if (v.phase === 'draw') return `Pantry ${v.round} of ${v.rounds}`;
  if (v.phase === 'cook') return 'Cook your dish';
  if (v.phase === 'vote') return 'Rank the dishes';
  return 'Results';
}

/** Sound (room audio device only): a tick per drawing and vote in; a service bell per dish in. */
function useCookCues(view: CookView, lobby: Lobby) {
  const open = view.phase === 'draw' || view.phase === 'cook' || view.phase === 'vote';
  const done = open ? Math.max(0, lobby.inGame.length - view.waiting.length) : 0;
  useSfxCount(done, view.phase === 'cook' ? () => play('serve', { vol: 0.6 }) : 'lockIn');
}

function Bar({ view, size }: { view: CookView; size?: 'm' | 'l' }) {
  return (
    <div class="g-spread cc-bar">
      <span class="cc-tape eyebrow">{phaseLabel(view)}</span>
      <Timer deadline={view.deadline} total={phaseTotal(view)} size={size} quiet={view.phase !== 'draw' && view.phase !== 'cook' && view.phase !== 'vote'} />
    </div>
  );
}

function assetIds(v: CookView): string[] {
  return v.pantry.map((p) => p.asset);
}

// ------------------------------------------------------------------ phone: drawing a prop

/** The one-line ask at the top of a working page: what to do, and the clock. */
function Ask({ eyebrow, text, deadline, total }: { eyebrow: string; text: string; deadline: number | null; total: number }) {
  return (
    <div class="cc-order-line">
      <p class="cc-order-text">
        <span class="eyebrow">{eyebrow}</span>
        <b>{text}</b>
      </p>
      <Timer deadline={deadline} total={total} />
    </div>
  );
}

function DrawProp({ view, send }: { view: CookView; send(a: CookAction): void }) {
  const prompt = view.you?.prompt ?? 'Mystery item';
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [name, setName] = useState(prompt);
  const submit = () => strokes.length && send({ type: 'prop', strokes, name: name.trim() || prompt, round: view.round });
  // Half a drawing is still a drawing: it is saved when the page hides and just before time is up.
  useDraft({ strokes, name }, (d) => send({ type: 'draft', strokes: d.strokes, name: d.name.trim() || prompt, round: view.round }), {
    deadline: view.deadline,
    isEmpty: (d) => d.strokes.length === 0,
  });
  return (
    <section class="cc-phone cc-draw">
      <Ask
        eyebrow={`${view.round === 1 ? 'Draw an ingredient' : 'Draw a scene element'} · ${view.round} of ${view.rounds}`}
        text={prompt}
        deadline={view.deadline}
        total={view.drawMs}
      />
      <DrawingCanvas strokes={strokes} onChange={setStrokes} colors={INK} aspect={1} label={`Drawing of ${prompt}`} />
      <label class="field cc-name">
        <span class="eyebrow">Name it</span>
        <input class="input" value={name} maxLength={NAME_MAX} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
      </label>
      <div class="cc-dock">
        <button type="button" class="btn btn-primary btn-block" disabled={!strokes.length} onClick={submit}>
          Submit drawing
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
const toStickers = (placed: Placed[]): Sticker[] =>
  placed.map(({ p, x, y, s, r }) => ({ p, x: Math.round(x), y: Math.round(y), s: Math.round(s * 100) / 100, r: Math.round(r) }));

function DragSticker(props: {
  st: Placed;
  pantry: Pantry;
  assets: AssetMap;
  selected: boolean;
  onSelect(): void;
  onMove(x: number, y: number): void;
}) {
  const { st, pantry, assets, selected } = props;
  const down = (e: PointerEvent) => {
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
    <span class={`cc-sticker is-live${selected ? ' is-selected' : ''}`} style={stickerStyle(st)} onPointerDown={down}>
      <Art asset={pantry[st.p]?.asset} assets={assets} outline label={pantry[st.p]?.name ?? 'Prop'} />
    </span>
  );
}

/** Props only: the cook places other players' drawings on the plate and names the dish. */
function Compose({ view, send, assets }: { view: CookView; send(a: CookAction): void; assets: AssetMap }) {
  const you = view.you!;
  const hand = you.hand;
  const meal = you.meal ?? 'Dish';
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [title, setTitle] = useState('');
  const [sel, setSel] = useState<number | null>(null);
  const next = useRef(1);
  const picked = placed.find((p) => p.uid === sel) ?? null;

  const submit = () => send({ type: 'dish', stickers: toStickers(placed), title: title.trim() || meal });
  // Half a dish is still a dish: it is saved when the page hides and just before time is up.
  useDraft(
    { stickers: toStickers(placed), title },
    (d) => send({ type: 'draft', stickers: d.stickers, title: d.title.trim() || meal }),
    { deadline: view.deadline, isEmpty: (d) => d.stickers.length === 0 },
  );

  const patch = (uid: number, change: Partial<Placed>) => setPlaced((ps) => ps.map((p) => (p.uid === uid ? { ...p, ...change } : p)));
  const add = (p: number) => {
    if (placed.length >= MAX_STICKERS) return;
    const uid = next.current++;
    setPlaced([...placed, { uid, p, x: 500 + ((uid * 97) % 240) - 120, y: 500 + ((uid * 61) % 240) - 120, s: 1, r: 0 }]);
    setSel(uid);
    play('sticker');
  };
  const remove = () => {
    setPlaced(placed.filter((p) => p.uid !== sel));
    setSel(null);
  };
  const front = () => {
    if (picked) setPlaced([...placed.filter((p) => p.uid !== sel), picked]);
  };

  // Phone layout: the order line and the plate stay pinned under the header while the controls
  // below scroll, so the plate never scrolls away while a sticker is being moved or resized.
  // Under the plate, top to bottom: the title, the selected prop's controls, the tray; the dock
  // holds "Serve it up". All of it fits a 390x844 phone without scrolling.
  return (
    <section class="cc-phone cc-compose">
      <div class="cc-pin">
        <Ask eyebrow="Your order" text={meal} deadline={view.deadline} total={view.cookMs} />
        <div class="cc-plate cc-canvas" role="group" aria-label={`Plate for ${meal}`} onPointerDown={() => setSel(null)}>
          {placed.map((st) => (
            <DragSticker
              key={st.uid}
              st={st}
              pantry={view.pantry}
              assets={assets}
              selected={st.uid === sel}
              onSelect={() => setSel(st.uid)}
              onMove={(x, y) => patch(st.uid, { x, y })}
            />
          ))}
        </div>
      </div>

      <label class="field cc-name">
        <span class="eyebrow">Name your dish</span>
        <input
          class="input"
          value={title}
          placeholder={meal}
          maxLength={TITLE_MAX}
          onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
        />
      </label>

      {picked ? (
        <div class="cc-adjust">
          <label>
            <span class="eyebrow">Size</span>
            <input type="range" min={30} max={300} value={Math.round(picked.s * 100)} onInput={(e) => patch(picked.uid, { s: Number((e.target as HTMLInputElement).value) / 100 })} />
          </label>
          <label>
            <span class="eyebrow">Turn</span>
            <input type="range" min={-180} max={180} value={picked.r} onInput={(e) => patch(picked.uid, { r: Number((e.target as HTMLInputElement).value) })} />
          </label>
          <button type="button" class="btn btn-s" onClick={front}>
            Bring to front
          </button>
          <button type="button" class="btn btn-s btn-danger" onClick={remove}>
            Remove
          </button>
        </div>
      ) : (
        <p class="g-muted cc-hint">{placed.length ? 'Tap a prop on the plate to move it.' : 'Tap a prop below to put it on the plate.'}</p>
      )}

      {hand.length ? (
        <div class="cc-tray" role="group" aria-label="Your props, drawn by the others: tap one to add it">
          {hand.map((i) => (
            <button key={i} type="button" class="cc-tray-item" disabled={placed.length >= MAX_STICKERS} onClick={() => add(i)} aria-label={`Add ${view.pantry[i]?.name}`}>
              <Art asset={view.pantry[i]?.asset} assets={assets} outline label="" />
              <span>{view.pantry[i]?.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <p class="g-muted">The pantry is empty, so there is nothing to cook with.</p>
      )}

      <div class="cc-dock cc-dock-cook">
        <button type="button" class="btn btn-primary btn-block" disabled={!placed.length} onClick={submit}>
          Serve it up ({placed.length}/{MAX_STICKERS})
        </button>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ phone: waiting and ranking

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

/** Tap dishes in order: they get 1, 2, 3. Tap a ranked dish to take it off (the ones below move up). */
function PhoneRank({ view, send, assets }: { view: CookView; send(a: CookAction): void; assets: AssetMap }) {
  const you = view.you!;
  const need = you.need;
  const [picks, setPicks] = useState<number[]>([]);
  const toggle = (id: number) =>
    setPicks((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < need ? [...p, id] : p));
  // A partial ranking still counts when time runs out.
  useDraft(picks, (r) => send({ type: 'draft', ranking: r }), { deadline: view.deadline });
  const full = picks.length === need;
  return (
    <section class="cc-phone cc-rank">
      <Ask
        eyebrow="Rank the dishes"
        text={`Tap your top ${need === 1 ? 'dish' : need}, best first`}
        deadline={view.deadline}
        total={VOTE_MS}
      />
      <div class="cc-rank-grid" role="group" aria-label="Dishes">
        {view.dishes.map((d) => {
          const own = d.id === you.ownDish;
          const at = picks.indexOf(d.id);
          return (
            <button
              key={d.id}
              type="button"
              class={`cc-rank-tile${at >= 0 ? ' is-ranked' : ''}`}
              disabled={own || (at < 0 && full)}
              aria-pressed={at >= 0}
              aria-label={`${d.title}${own ? ' (yours)' : ''}${at >= 0 ? `, ${ORDINAL[at]}` : ''}`}
              onClick={() => toggle(d.id)}
            >
              <DishPlate dish={d} pantry={view.pantry} assets={assets} />
              <span class="cc-rank-title">{d.title}</span>
              {own && <span class="cc-rank-own">Yours</span>}
              {at >= 0 && <b class="cc-rank-badge">{at + 1}</b>}
            </button>
          );
        })}
      </div>
      <div class="cc-dock">
        <button type="button" class="btn btn-primary btn-block" disabled={!full} onClick={() => send({ type: 'rank', dishes: picks })}>
          {full ? 'Submit ranking' : `Pick ${need - picks.length} more`}
        </button>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ reveal (phones without a screen, and the screen)

function DishReveal({ dish, res, lobby, pantry, assets }: { dish: DishView; res: DishResult; lobby: Lobby; pantry: Pantry; assets: AssetMap }) {
  const placed = res.places.flatMap((n, i) => (n > 0 ? [`${ORDINAL[i]} × ${n}`] : []));
  return (
    <article class="cc-reveal">
      <DishPlate dish={dish} pantry={pantry} assets={assets} />
      <div class="cc-reveal-info">
        <p class="eyebrow">{dish.meal}</p>
        <h2 class="cc-reveal-name">{dish.title}</h2>
        <p class="cc-by">
          cooked by <PlayerChip lobby={lobby} id={dish.by ?? ''} />
        </p>
        <p class="cc-votes">
          {placed.length ? <b>{placed.join(' · ')}</b> : <span class="g-muted">Nobody ranked it</span>}
          {res.pts > 0 && <span class="g-muted"> · +{res.pts} pts</span>}
        </p>
        {res.pts > 0 && res.artists.length > 0 && (
          <div class="cc-credit">
            <span class="eyebrow">Prop artists, +{PROP_PTS} per ranking</span>
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

/** The player's own points, with where each came from. */
function MyPoints({ lines, size }: { lines: PointsLine[]; size?: 'm' | 'l' }) {
  if (!lines.length) return <p class="g-muted">No points from the dishes this time.</p>;
  return <PointsNote lines={lines} total={lines.length > 1 ? lines.reduce((a, l) => a + l.pts, 0) : undefined} size={size} />;
}

/** True once the last dish has been revealed (the same clock the RevealStage runs on). */
function useRevealed(view: CookView): boolean {
  const now = useServerNow(500);
  const r = view.reveal;
  return !!r && now >= r.startAt + r.order.length * r.interval;
}

function RevealBoard({ view, assets, lobby, closer }: { view: CookView; assets: AssetMap; lobby: Lobby; closer: ComponentChildren }) {
  const r = view.reveal!;
  const items = r.order.map((id) => <DishReveal key={id} dish={view.dishes[id]} res={r.detail[id]} lobby={lobby} pantry={view.pantry} assets={assets} />);
  items.push(<div key="closer" class="cc-closer">{closer}</div>);
  // Each dish arrives with the service bell; the closing card with the points ding.
  const sound = (i: number) => (i < r.order.length ? play('serve') : sfx.play('score'));
  return <RevealStage items={items} startAt={r.startAt} interval={r.interval} layout="single" class="cc-stage" sound={sound} />;
}

// ------------------------------------------------------------------ top-level components

function Player({ view, send, lobby, assets: _shared }: PlayerProps<CookView, CookAction>) {
  useCookCues(view, lobby);
  const assets = useAssets(assetIds(view));
  const revealed = useRevealed(view);
  const you = view.you;
  if (!you) return <p class="g-muted">You joined after this game started. Watch the screen.</p>;

  if (view.phase === 'draw') {
    return you.submitted ? (
      <PhoneWait view={view} lobby={lobby} assets={assets} title="Drawing submitted. Waiting for the other players." note={`Pantry ${view.round} of ${view.rounds}`} />
    ) : (
      <DrawProp key={view.round} view={view} send={send} />
    );
  }
  if (view.phase === 'cook') {
    return you.submitted ? (
      <PhoneWait view={view} lobby={lobby} assets={assets} title="Dish served. Waiting for the other players." note="Cooking round" />
    ) : (
      <Compose view={view} send={send} assets={assets} />
    );
  }
  if (view.phase === 'vote') {
    return you.submitted ? (
      <PhoneWait view={view} lobby={lobby} assets={assets} title="Ranking sent. Waiting for the other players." note="Ranking round" />
    ) : (
      <PhoneRank view={view} send={send} assets={assets} />
    );
  }

  // reveal / done
  return (
    <section class="cc-phone">
      <Bar view={view} />
      {lobby.screenConnected ? (
        <>
          <PromptCard eyebrow="The reveal">Look at the screen.</PromptCard>
          {revealed && <MyPoints lines={you.points} />}
        </>
      ) : (
        <RevealBoard view={view} assets={assets} lobby={lobby} closer={<MyPoints lines={you.points} />} />
      )}
    </section>
  );
}

function Screen({ view, lobby, assets: _shared }: ScreenProps<CookView>) {
  useCookCues(view, lobby);
  const assets = useAssets(assetIds(view));

  if (view.phase === 'draw') {
    return (
      <section class="cc-screen">
        <header class="cc-head">
          <div>
            <p class="cc-tape eyebrow">{phaseLabel(view)}</p>
            <h1 class="g-title">{view.round === 1 ? 'Draw an ingredient on your phone, then name it.' : 'Draw a scene element on your phone, then name it.'}</h1>
          </div>
          <Timer deadline={view.deadline} total={view.drawMs} size="l" />
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
            <h1 class="g-title">Cook on your phone with other players’ drawings, then name your dish.</h1>
          </div>
          <Timer deadline={view.deadline} total={view.cookMs} size="l" />
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
                <PlayerChip lobby={lobby} id={id} size="4vh" trailing={done ? 'Done' : null} />
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
            <h1 class="g-title">Pick your top three dishes on your phone.</h1>
          </div>
          <Timer deadline={view.deadline} total={VOTE_MS} size="l" />
        </header>
        <div class="cc-vgrid" style={{ '--cols': cols }}>
          {view.dishes.map((d) => (
            <figure key={d.id} class="cc-dish">
              <DishPlate dish={d} pantry={view.pantry} assets={assets} />
              <figcaption>{d.title}</figcaption>
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
          <h1 class="g-title">The ranking is in</h1>
        </div>
      </header>
      <RevealBoard view={view} assets={assets} lobby={lobby} closer={<p class="cc-closer-text">That is dinner. Your points, and where they came from, are on your phone.</p>} />
    </section>
  );
}

function Rules() {
  return (
    <RulesSheet
      story="The kitchen is empty, and the guests are already seated. So everyone stocks the pantry with their own drawings, then cooks dinner from whatever the others left behind. Put it on a plate, give it a name worth ordering, and let the table decide."
      how={[
        'Two pantry rounds. First you get an ingredient, then a scene element. Draw it and name it. Every drawing goes into the shared pantry.',
        <>
          Then you cook. You get a meal order (Breakfast, Lunch or Dessert, with a twist) and a hand of props that other players drew. You do not
          draw now: drag the props onto your plate, resize and turn them (up to {MAX_STICKERS}), and give your dish a name.
        </>,
        <>
          Everyone ranks their top {RANK_SLOTS} dishes: tap them best first. You cannot rank your own. With fewer dishes to choose from, you rank fewer.
        </>,
      ]}
      scoring={[
        <>
          The cook earns {RANK_PTS[0]} points for each 1st place, {RANK_PTS[1]} for each 2nd and {RANK_PTS[2]} for each 3rd.
        </>,
        <>Every artist whose prop is on a dish earns {PROP_PTS} points each time that dish is ranked in someone’s top {RANK_SLOTS}. This counts once per dish, and never on your own.</>,
      ]}
      note="Anything half-finished when time runs out is handed in as it is."
    />
  );
}

export default { Player, Screen, Rules } satisfies ClientGameModule;
