// A small footer that says where a player's points came from: one line per source, never a table.
// Sits just above the dock / primary button on a phone (the last child of the page body).
export interface PointsLine {
  /** Points from this source. Negative shows a minus. */
  pts: number;
  /** Plain words: "pizza matched", "spotted the forger". */
  why: string;
}

export interface PointsNoteProps {
  lines: readonly PointsLine[];
  /** Adds a closing "Total" line (only worth showing with two or more lines). */
  total?: number;
  /** 'm' (default, --t-s) or 'l' for the TV (--t-m, vh based). */
  size?: 'm' | 'l';
}

const signed = (n: number) => (n < 0 ? `−${-n}` : `+${n}`);

export function PointsNote({ lines, total, size = 'm' }: PointsNoteProps) {
  if (!lines.length) return null;
  return (
    <ul class={`k-points k-points-${size}`} aria-label="Where the points came from">
      {lines.map((l, i) => (
        <li key={i}>
          <b>{signed(l.pts)}</b>
          <span>{l.why}</span>
        </li>
      ))}
      {total !== undefined && (
        <li class="k-points-total">
          <b>{signed(total)}</b>
          <span>Total</span>
        </li>
      )}
    </ul>
  );
}
