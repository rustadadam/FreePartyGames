// Countdown to a server-time deadline. Uses the room's server clock, so every
// device shows the same number regardless of its own clock.
import { useEffect, useRef } from 'preact/hooks';
import { useServerNow } from './hooks';

export interface TimerProps {
  /** Deadline in server ms (e.g. from ctx.timerAt(key) put in the view). Null hides the timer. */
  deadline: number | null | undefined;
  /** Full duration in ms: draws the ring. Omit for a bare number. */
  total?: number;
  /** 'm' (default, 56px phone / 9vh screen) or 'l' (twice that). */
  size?: 'm' | 'l';
  /** Seconds left at which the timer turns urgent. Default 5. */
  urgentAt?: number;
  /** Called once when it reaches zero (local estimate; the server is still the authority). */
  onExpire?(): void;
  /** Accessible label prefix. Default "Time left". */
  label?: string;
}

export function Timer({ deadline, total, size = 'm', urgentAt = 5, onExpire, label = 'Time left' }: TimerProps) {
  const now = useServerNow(deadline ? 200 : 0);
  const fired = useRef<number | null>(null);
  const left = deadline ? Math.max(0, deadline - now) : 0;
  const secs = Math.ceil(left / 1000);

  useEffect(() => {
    if (deadline && left === 0 && fired.current !== deadline) {
      fired.current = deadline;
      onExpire?.();
    }
  }, [deadline, left, onExpire]);

  if (!deadline) return null;
  const frac = total ? Math.min(1, left / total) : 1;
  const C = 2 * Math.PI * 22;
  return (
    <div
      class={`k-timer k-timer-${size}${secs <= urgentAt ? ' is-urgent' : ''}${left === 0 ? ' is-done' : ''}`}
      role="timer"
      aria-label={`${label}: ${secs} seconds`}
    >
      <svg viewBox="0 0 50 50" aria-hidden="true">
        <circle class="k-timer-track" cx="25" cy="25" r="22" />
        {total ? <circle class="k-timer-ring" cx="25" cy="25" r="22" stroke-dasharray={C} stroke-dashoffset={C * (1 - frac)} /> : null}
      </svg>
      <span class="k-timer-num" aria-hidden="true">
        {secs}
      </span>
    </div>
  );
}
