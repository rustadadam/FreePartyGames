// Invariant: the largest drawing the format allows still fits in one client message.
import { describe, expect, it } from 'vitest';
import { MAX_MESSAGE_BYTES } from '../src/shared/protocol';
import { DrawingSchema } from '../src/shared/strokeSchema';
import { makeDrawing, MAX_DRAWING_POINTS, MAX_STROKE_POINTS, STROKE_UNITS, type Stroke } from '../src/shared/strokes';

function worstCase(points: number): Stroke[] {
  const strokes: Stroke[] = [];
  for (let left = points; left > 0; left -= MAX_STROKE_POINTS) {
    const n = Math.min(MAX_STROKE_POINTS, left);
    const p: number[] = [];
    for (let i = 0; i < n; i++) p.push(STROKE_UNITS - (i % 10), STROKE_UNITS - 1 - (i % 10)); // 3-4 digit coords
    strokes.push({ c: '#abcdef', w: 80, p });
  }
  return strokes;
}

describe('stroke format', () => {
  it('a max-size drawing validates and fits in one action message', () => {
    const drawing = makeDrawing(worstCase(MAX_DRAWING_POINTS));
    expect(DrawingSchema.safeParse(drawing).success).toBe(true);
    const msg = JSON.stringify({ type: 'action', payload: { type: 'submit', drawing } });
    expect(msg.length).toBeLessThan(MAX_MESSAGE_BYTES);
  });

  it('rejects drawings over the point cap and malformed strokes', () => {
    expect(DrawingSchema.safeParse(makeDrawing(worstCase(MAX_DRAWING_POINTS + 1))).success).toBe(false);
    expect(DrawingSchema.safeParse(makeDrawing([{ c: 'red', w: 10, p: [1, 2] }])).success).toBe(false);
    expect(DrawingSchema.safeParse(makeDrawing([{ c: '#ff0000', w: 10, p: [1, 2, 3] }])).success).toBe(false);
  });
});
