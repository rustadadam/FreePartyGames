// Pick one option. Big touch targets, a clear "your pick" state, and a lock once voted
// unless `changeable`. Options can carry custom content (e.g. a StrokeView thumbnail).
import type { ComponentChildren } from 'preact';

export interface VoteOption {
  id: string;
  label: ComponentChildren;
  /** Secondary line under the label. */
  hint?: ComponentChildren;
  /** Seat color dot (e.g. when voting for a player). */
  color?: string;
  /** Rich content above the label (a drawing, a comic strip). */
  media?: ComponentChildren;
  disabled?: boolean;
}

export interface VoteProps {
  options: VoteOption[];
  /** The chosen option id (from the view, so it survives reconnects). */
  value?: string | null;
  onVote?(id: string): void;
  /** Whole control read-only (e.g. results shown, or waiting on others). */
  disabled?: boolean;
  /** Allow changing the vote after picking. Default false. */
  changeable?: boolean;
  /** 'list' (default, one per row) or 'grid' (two columns, for media). */
  layout?: 'list' | 'grid';
  /** Accessible group label, e.g. "Who is the forger?". */
  label?: string;
  /** Per-option vote counts to show after the reveal. */
  counts?: Record<string, number>;
}

export function Vote({ options, value, onVote, disabled, changeable, layout = 'list', label = 'Vote', counts }: VoteProps) {
  const locked = disabled || (!changeable && value != null);
  return (
    <div class={`k-vote k-vote-${layout}`} role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const chosen = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={chosen}
            class={`k-vote-opt${chosen ? ' is-chosen' : ''}`}
            disabled={o.disabled || (locked && !chosen)}
            onClick={() => !locked && !o.disabled && onVote?.(o.id)}
          >
            {o.media && <span class="k-vote-media">{o.media}</span>}
            <span class="k-vote-row">
              {o.color && <span class="k-vote-dot" style={{ background: o.color }} aria-hidden="true" />}
              <span class="k-vote-label">
                {o.label}
                {o.hint && <span class="k-vote-hint">{o.hint}</span>}
              </span>
              {counts && o.id in counts ? (
                <span class="k-vote-count">{counts[o.id]}</span>
              ) : (
                chosen && <span class="k-vote-check">Your pick</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
