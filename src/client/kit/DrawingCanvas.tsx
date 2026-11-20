// Vector drawing input. Produces Stroke[] in the shared format (src/shared/strokes.ts):
// integer points in a virtual box 1000 wide, color + width per stroke.
// Two stacked canvases: `base` (underlay + finished strokes, redrawn on change) and
// `live` (the stroke under the finger, redrawn each frame).
import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import {
  countPoints,
  MAX_DRAWING_POINTS,
  MAX_STROKE_POINTS,
  MAX_STROKES,
  STROKE_UNITS,
  strokeBoxHeight,
  type Stroke,
} from '../../shared/strokes';
import { drawStroke } from './strokeRender';

/** Default ink set: reads on the default paper. Games may pass their own. */
export const DEFAULT_COLORS = ['#1a1033', '#ff5e87', '#ff8a1f', '#ffd447', '#3fbf6f', '#36a5f4', '#7a5cff', '#8b5a2b', '#ffffff'];
/** Brush widths in virtual units (1000 = canvas width). */
export const DEFAULT_WIDTHS = [6, 14, 32];

export interface DrawingCanvasProps {
  /** Controlled strokes. Omit to let the canvas keep its own. */
  strokes?: Stroke[];
  /** Every change (new stroke, undo). */
  onChange?(strokes: Stroke[]): void;
  /** A stroke was finished. `all` includes it. */
  onStroke?(stroke: Stroke, all: Stroke[]): void;
  /** Live points while drawing, about every 50 ms: `points` are the new flat [x,y,...] since
   *  the last call, `stroke` is the stroke so far. Send these as an action for others to watch. */
  onStrokeProgress?(points: number[], stroke: Stroke): void;
  /** width / height. Default 1. */
  aspect?: number;
  /** Ink choices. One color hides the palette (e.g. the player's seat color). */
  colors?: string[];
  /** Brush widths; one width hides the size picker. */
  widths?: number[];
  /** Max strokes this canvas accepts. */
  maxStrokes?: number;
  /** One continuous stroke, then the canvas locks (no undo). Same as maxStrokes=1 without undo. */
  singleStroke?: boolean;
  disabled?: boolean;
  /** Read-only strokes drawn under the user's (other players' strokes, live or finished). */
  underlay?: readonly Stroke[];
  /** Paper color. Default '#fffdf7'. */
  paper?: string;
  /** Show the palette / size / undo bar. Default true. */
  tools?: boolean;
  /** Overlay content positioned over the canvas (e.g. stickers). Pointer events pass through
   *  unless the child sets pointer-events itself. */
  children?: ComponentChildren;
  /** Accessible label. */
  label?: string;
  class?: string;
}

const PROGRESS_MS = 50;
/** Minimum spacing between kept points, virtual units (thins dense pointer input). */
const MIN_STEP = 3;

export function DrawingCanvas(props: DrawingCanvasProps) {
  const {
    aspect = 1,
    colors = DEFAULT_COLORS,
    widths = DEFAULT_WIDTHS,
    singleStroke,
    disabled,
    underlay,
    paper = '#fffdf7',
    tools = true,
    label = 'Drawing canvas',
  } = props;
  const [own, setOwn] = useState<Stroke[]>([]);
  const strokes = props.strokes ?? own;
  const [color, setColor] = useState(colors[0]);
  const [width, setWidth] = useState(widths[Math.min(1, widths.length - 1)]);
  const maxStrokes = singleStroke ? 1 : Math.min(props.maxStrokes ?? MAX_STROKES, MAX_STROKES);
  const pointsLeft = MAX_DRAWING_POINTS - countPoints(strokes);
  const full = strokes.length >= maxStrokes || pointsLeft < 2;
  const locked = disabled || full;

  const wrap = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLCanvasElement>(null);
  const live = useRef<HTMLCanvasElement>(null);
  const scale = useRef(1); // canvas px per virtual unit
  const cur = useRef<{ id: number; s: Stroke; sent: number; lastFlush: number } | null>(null);
  const raf = useRef(0);
  const latest = useRef(props);
  latest.current = props;
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  // keep the chosen color valid if the palette changes
  useEffect(() => {
    if (!colors.includes(color)) setColor(colors[0]);
  }, [colors.join()]);

  const redrawBase = () => {
    const c = base.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    for (const s of underlay ?? []) drawStroke(ctx, s, scale.current);
    for (const s of strokesRef.current) drawStroke(ctx, s, scale.current);
  };

  const redrawLive = () => {
    raf.current = 0;
    const c = live.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    if (cur.current) drawStroke(ctx, cur.current.s, scale.current);
    flushProgress(false);
  };

  // size canvases to the box at device resolution
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth;
      if (!w) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const h = w / aspect;
      for (const c of [base.current, live.current]) {
        if (!c) continue;
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      scale.current = (w * dpr) / STROKE_UNITS;
      redrawBase();
      redrawLive();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);

  useEffect(redrawBase, [strokes, underlay]);

  const toPoint = (e: PointerEvent): [number, number] => {
    const r = live.current!.getBoundingClientRect();
    const k = STROKE_UNITS / r.width;
    const maxY = strokeBoxHeight(aspect);
    return [
      Math.max(0, Math.min(STROKE_UNITS, Math.round((e.clientX - r.left) * k))),
      Math.max(0, Math.min(maxY, Math.round((e.clientY - r.top) * k))),
    ];
  };

  const flushProgress = (force: boolean) => {
    const c = cur.current;
    const cb = latest.current.onStrokeProgress;
    if (!c || !cb || c.sent >= c.s.p.length) return;
    const now = performance.now();
    if (!force && now - c.lastFlush < PROGRESS_MS) return;
    c.lastFlush = now;
    const pts = c.s.p.slice(c.sent);
    c.sent = c.s.p.length;
    cb(pts, { ...c.s, p: c.s.p.slice() });
  };

  const schedule = () => {
    if (!raf.current) raf.current = requestAnimationFrame(redrawLive);
  };

  const addPoint = (x: number, y: number): boolean => {
    const c = cur.current!;
    const p = c.s.p;
    const n = p.length;
    if (n >= 2 && Math.hypot(x - p[n - 2], y - p[n - 1]) < MIN_STEP) return true;
    if (n / 2 >= Math.min(MAX_STROKE_POINTS, pointsLeft)) return false;
    p.push(x, y);
    return true;
  };

  const onDown = (e: PointerEvent) => {
    if (locked || cur.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    live.current!.setPointerCapture(e.pointerId);
    const [x, y] = toPoint(e);
    cur.current = { id: e.pointerId, s: { c: colors.includes(color) ? color : colors[0], w: width, p: [x, y] }, sent: 0, lastFlush: 0 };
    schedule();
  };

  const onMove = (e: PointerEvent) => {
    const c = cur.current;
    if (!c || c.id !== e.pointerId) return;
    const evs = (e.getCoalescedEvents?.() ?? []).length ? e.getCoalescedEvents() : [e];
    for (const ev of evs) {
      const [x, y] = toPoint(ev);
      if (!addPoint(x, y)) return finish(e);
    }
    schedule();
  };

  const finish = (e: PointerEvent) => {
    const c = cur.current;
    if (!c || c.id !== e.pointerId) return;
    flushProgress(true);
    cur.current = null;
    try {
      live.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    schedule();
    const stroke = c.s;
    const next = [...strokesRef.current, stroke];
    if (latest.current.strokes === undefined) setOwn(next);
    strokesRef.current = next;
    redrawBase();
    latest.current.onChange?.(next);
    latest.current.onStroke?.(stroke, next);
  };

  const undo = () => {
    if (!strokes.length || singleStroke || disabled) return;
    const next = strokes.slice(0, -1);
    if (props.strokes === undefined) setOwn(next);
    props.onChange?.(next);
  };

  const showPalette = colors.length > 1;
  const showWidths = widths.length > 1;
  const showUndo = !singleStroke;
  return (
    <div class={`k-draw${locked ? ' is-locked' : ''}${props.class ? ` ${props.class}` : ''}`}>
      <div ref={wrap} class="k-draw-paper" style={{ aspectRatio: String(aspect), background: paper }}>
        <canvas ref={base} class="k-draw-canvas" aria-hidden="true" />
        <canvas
          ref={live}
          class="k-draw-canvas k-draw-live"
          role="img"
          aria-label={label}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={finish}
          onPointerCancel={finish}
        />
        {props.children && <div class="k-draw-overlay">{props.children}</div>}
      </div>
      {tools && (showPalette || showWidths || showUndo) && (
        <div class="k-draw-tools">
          {showPalette && (
            <div class="k-draw-swatches" role="radiogroup" aria-label="Ink color">
              {colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={c === color}
                  aria-label={`Color ${c}`}
                  class={`k-swatch${c === color ? ' is-on' : ''}`}
                  style={{ '--sw': c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          )}
          <div class="k-draw-actions">
            {showWidths &&
              widths.map((w) => (
                <button
                  key={w}
                  type="button"
                  aria-pressed={w === width}
                  aria-label={`Brush ${w}`}
                  class={`k-width${w === width ? ' is-on' : ''}`}
                  onClick={() => setWidth(w)}
                >
                  <span
                    style={{
                      width: `${Math.max(4, Math.min(28, w * 0.75))}px`,
                      height: `${Math.max(4, Math.min(28, w * 0.75))}px`,
                      background: colors.includes(color) ? color : colors[0],
                    }}
                  />
                </button>
              ))}
            {showUndo && (
              <button type="button" class="btn btn-s k-draw-undo" disabled={!strokes.length || disabled} onClick={undo}>
                Undo
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
