// One smoothing rule for both renderers (canvas while drawing, SVG for display),
// so a drawing looks the same on the phone that drew it and on the TV.
import type { Stroke } from '../../shared/strokes';

/** SVG path data: quadratic curves through midpoints. */
export function strokePath(p: readonly number[]): string {
  const n = p.length >> 1;
  if (n === 0) return '';
  if (n === 1) return `M${p[0]} ${p[1]}L${p[0]} ${p[1]}`;
  let d = `M${p[0]} ${p[1]}`;
  for (let i = 1; i < n - 1; i++) {
    const x = p[i * 2];
    const y = p[i * 2 + 1];
    d += `Q${x} ${y} ${(x + p[i * 2 + 2]) / 2} ${(y + p[i * 2 + 3]) / 2}`;
  }
  return d + `L${p[(n - 1) * 2]} ${p[(n - 1) * 2 + 1]}`;
}

/** Draws one stroke on a 2D context. `scale` = canvas pixels per virtual unit. */
export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, scale: number): void {
  const p = s.p;
  const n = p.length >> 1;
  if (!n) return;
  ctx.strokeStyle = s.c;
  ctx.fillStyle = s.c;
  ctx.lineWidth = s.w * scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (n === 1) {
    ctx.beginPath();
    ctx.arc(p[0] * scale, p[1] * scale, (s.w * scale) / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(p[0] * scale, p[1] * scale);
  for (let i = 1; i < n - 1; i++) {
    const x = p[i * 2];
    const y = p[i * 2 + 1];
    ctx.quadraticCurveTo(x * scale, y * scale, ((x + p[i * 2 + 2]) / 2) * scale, ((y + p[i * 2 + 3]) / 2) * scale);
  }
  ctx.lineTo(p[(n - 1) * 2] * scale, p[(n - 1) * 2 + 1] * scale);
  ctx.stroke();
}
