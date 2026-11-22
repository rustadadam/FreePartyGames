// Countdown to a server-time deadline. Uses the room's server clock, so every
// device shows the same number regardless of its own clock. On the room's audio device it ticks
// through the last seconds (climbing in pitch) and buzzes at zero.
import { useEffect, useRef } from 'preact/hooks';
import { sfx } from '../audio/sfx';
import { useServerClock, useServerNow } from './hooks';

/** Ticks start at this many seconds left (or at `urgentAt`, if that is sooner). */
const TICK_FROM = 5;
/** A deadline that changes closer than this to zero ran out (the server moved on at the deadline). */
const ENDED_EARLY_MS = 400;

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
  /** No ticks or buzzer: for countdowns nobody acts against (a reveal, results). */
  quiet?: boolean;
}

export function Timer({ deadline, total, size = 'm', urgentAt = 5, onExpire, label = 'Time left', quiet }: TimerProps) {
  const now = useServerNow(deadline ? 200 : 0);
  const clock = useServerClock();
  const fired = useRef<number | null>(null);
  const left = deadline ? Math.max(0, deadline - now) : 0;
  const secs = Math.ceil(left / 1000);

  // Ticks: only for seconds this Timer watched go by (never on mount or a new deadline).
  const heard = useRef<{ deadline: number | null | undefined; secs: number } | null>(null);
  useEffect(() => {
    const was = heard.current;
    heard.current = { deadline, secs };
    if (quiet || !deadline || !was || was.deadline !== deadline || secs >= was.secs || secs === 0) return;
    if (secs <= Math.min(TICK_FROM, urgentAt)) sfx.play('tick', { pitch: TICK_FROM - secs });
  }, [deadline, secs, quiet, urgentAt]);

  // The buzzer is scheduled for the deadline itself: the server moves on at that moment, often
  // before this Timer renders a zero. It is cancelled only if the phase ends early.
  useEffect(() => {
    const ms = deadline ? deadline - clock.now() : 0;
    if (quiet || !deadline || ms <= 0) return;
    const t = setTimeout(() => sfx.play('timeUp'), ms);
    return () => {
      if (clock.now() < deadline - ENDED_EARLY_MS) clearTimeout(t);
    };
  }, [deadline, quiet, clock]);

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
