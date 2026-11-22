// Read-only drawing renderer (SVG, so it scales crisply on a TV). Used to show assets.
import { strokeBoxHeight, STROKE_UNITS, type Drawing, type Stroke } from '../../shared/strokes';
import { strokePath } from './strokeRender';

export interface StrokeViewProps {
  /** A stored drawing (aspect comes from it)... */
  drawing?: Drawing | null;
  /** ...or bare strokes plus `aspect`. Both may be given: strokes draw over the drawing. */
  strokes?: readonly Stroke[];
  /** width / height. Default: the drawing's, else 1. */
  aspect?: number;
  /** Paper color. Default '#fffdf7'. Pass 'transparent' for stickers. */
  paper?: string;
  /** Draw-on animation: true (1.2 s total) or total ms. Respects reduced motion via CSS. */
  animate?: boolean | number;
  /** Accessible label. Default "Drawing". */
  label?: string;
  class?: string;
}

export function StrokeView({ drawing, strokes, aspect, paper = '#fffdf7', animate, label = 'Drawing', class: cls }: StrokeViewProps) {
  const a = aspect ?? drawing?.aspect ?? 1;
  const h = strokeBoxHeight(a);
  const all = [...(drawing?.strokes ?? []), ...(strokes ?? [])];
  const total = animate === true ? 1200 : typeof animate === 'number' ? animate : 0;
  const per = all.length ? total / all.length : 0;
  return (
    <svg
      class={`k-strokes${total ? ' is-animated' : ''}${cls ? ` ${cls}` : ''}`}
      viewBox={`0 0 ${STROKE_UNITS} ${h}`}
      style={{ aspectRatio: String(a), background: paper }}
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid meet"
    >
      {all.map((s, i) => (
        <path
          key={i}
          d={strokePath(s.p)}
          stroke={s.c}
          stroke-width={s.w}
          fill="none"
          stroke-linecap="round"
          stroke-linejoin="round"
          {...(total
            ? {
                pathLength: 1,
                style: { animationDelay: `${Math.round(i * per)}ms`, animationDuration: `${Math.max(120, Math.round(per))}ms` },
              }
            : {})}
        />
      ))}
    </svg>
  );
}
