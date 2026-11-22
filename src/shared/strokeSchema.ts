// Zod schemas for the stroke format (src/shared/strokes.ts). Game logic validates
// incoming drawings with these in its actionSchema, then stores them with ctx.putAsset().
import { z } from 'zod';
import {
  countPoints,
  MAX_DRAWING_POINTS,
  MAX_STROKE_POINTS,
  MAX_STROKE_WIDTH,
  MAX_STROKES,
  MIN_STROKE_WIDTH,
  STROKE_UNITS,
} from './strokes';

const Coord = z
  .number()
  .int()
  .min(0)
  .max(STROKE_UNITS * 4); // tall boxes (aspect < 1) go past 1000 in y

export const StrokeSchema = z
  .object({
    c: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    w: z.number().min(MIN_STROKE_WIDTH).max(MAX_STROKE_WIDTH),
    p: z
      .array(Coord)
      .min(2)
      .max(MAX_STROKE_POINTS * 2)
      .refine((p) => p.length % 2 === 0, 'points must be x,y pairs'),
  })
  .strict();

export const StrokesSchema = z
  .array(StrokeSchema)
  .max(MAX_STROKES)
  .refine((s) => countPoints(s) <= MAX_DRAWING_POINTS, `at most ${MAX_DRAWING_POINTS} points per drawing`);

export const DrawingSchema = z
  .object({
    v: z.literal(1),
    aspect: z.number().min(0.25).max(4),
    strokes: StrokesSchema,
  })
  .strict();
