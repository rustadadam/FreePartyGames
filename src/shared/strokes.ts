// Vector drawing format shared by game logic (server-safe) and the client kit.
// Pure TypeScript, no DOM and no zod (so the client can import it cheaply). The zod
// schemas that game logic validates drawings with live in strokeSchema.ts.
//
// Coordinates are integers in a virtual box STROKE_UNITS wide. The box height is
// STROKE_UNITS / aspect (aspect = width / height, chosen by the game, default 1).
// A stroke stores its points flat: [x0, y0, x1, y1, ...] so the JSON stays compact.

/** Virtual width of every drawing. Points are integers 0..STROKE_UNITS. */
export const STROKE_UNITS = 1000;
/** Max points (x,y pairs) in one stroke. The canvas thins input to stay under it. */
export const MAX_STROKE_POINTS = 1000;
/** Max strokes in one drawing. */
export const MAX_STROKES = 300;
/** Max points across a whole drawing: about 45 KB of JSON, under the 64 KB message cap. */
export const MAX_DRAWING_POINTS = 5000;
/** Brush width bounds, in virtual units (1000 = full width). */
export const MIN_STROKE_WIDTH = 2;
export const MAX_STROKE_WIDTH = 80;

export interface Stroke {
  /** Color as #rrggbb. */
  c: string;
  /** Width in virtual units. */
  w: number;
  /** Flat integer points [x0, y0, x1, y1, ...], at least one point. */
  p: number[];
}

/** A finished drawing, ready for ctx.putAsset(). */
export interface Drawing {
  /** Format version. */
  v: 1;
  /** width / height of the virtual box. */
  aspect: number;
  strokes: Stroke[];
}

/** Wraps strokes as a Drawing (the shape games store with ctx.putAsset). */
export function makeDrawing(strokes: Stroke[], aspect = 1): Drawing {
  return { v: 1, aspect, strokes };
}

export function countPoints(strokes: readonly Stroke[]): number {
  let n = 0;
  for (const s of strokes) n += s.p.length >> 1;
  return n;
}

/** Height of the virtual box for an aspect ratio. */
export function strokeBoxHeight(aspect: number): number {
  return Math.round(STROKE_UNITS / aspect);
}

/** Bounding box of the drawn points, or null for an empty drawing. */
export function strokeBounds(strokes: readonly Stroke[]): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of strokes) {
    const pad = s.w / 2;
    for (let i = 0; i < s.p.length; i += 2) {
      x0 = Math.min(x0, s.p[i] - pad);
      x1 = Math.max(x1, s.p[i] + pad);
      y0 = Math.min(y0, s.p[i + 1] - pad);
      y1 = Math.max(y1, s.p[i + 1] + pad);
    }
  }
  return x0 === Infinity ? null : { x0, y0, x1, y1 };
}
