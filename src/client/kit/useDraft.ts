// Autosave for half-finished work (docs/ADDING_A_GAME.md, "Drafts"). The engine re-projects every
// viewer's view on every action, so a draft is never streamed: it is sent at most twice per
// phase, at the two moments work is actually at risk.
//   1. The page goes hidden (app switched, screen locked, tab closed): visibilitychange / pagehide.
//   2. `leadMs` (1500 ms) before the server-time deadline, on the room's ServerClock.
// Nothing is sent when the value is empty, unchanged since the last send, or `enabled` is false
// (already submitted). Nothing is ever sent after unmount.
import { useEffect, useRef } from 'preact/hooks';
import { useServerClock } from './hooks';

export interface UseDraftOptions<T> {
  /** Server-ms deadline of the phase (from the view). Null/undefined: only the hidden trigger. */
  deadline?: number | null;
  /** False once the real answer is submitted (or the phase has no input). Default true. */
  enabled?: boolean;
  /** How long before the deadline to send. Default 1500 ms. */
  leadMs?: number;
  /** What counts as "nothing to save". Default: null, blank string or empty array. */
  isEmpty?: (value: T) => boolean;
}

const blank = (v: unknown) => v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && v.length === 0);

/**
 * `value` is the live input (a string, a strokes array, ...). `send` is called with the value to
 * save, e.g. `(text) => send({ type: 'draft', text })`; it may change every render.
 */
export function useDraft<T>(value: T, send: (value: T) => void, opts: UseDraftOptions<T> = {}): void {
  const { deadline, enabled = true, leadMs = 1500, isEmpty = blank } = opts;
  const clock = useServerClock();
  const live = useRef({ value, send, enabled, isEmpty });
  live.current = { value, send, enabled, isEmpty };
  const lastSent = useRef<string | null>(null);
  const mounted = useRef(false);

  // Send the latest value unless there is nothing worth saving.
  const flush = useRef(() => {
    if (!mounted.current) return;
    const { value, send, enabled, isEmpty } = live.current;
    if (!enabled || isEmpty(value)) return;
    const key = JSON.stringify(value);
    if (key === lastSent.current) return;
    lastSent.current = key;
    send(value);
  }).current;

  useEffect(() => {
    mounted.current = true;
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      mounted.current = false;
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
    };
  }, [flush]);

  // A new deadline is a new phase: the server dropped the old draft, so the same text may be sent again.
  useEffect(() => {
    lastSent.current = null;
  }, [deadline]);

  useEffect(() => {
    if (!deadline || !enabled) return;
    if (clock.now() >= deadline) return; // already over: the server has moved on
    const t = setTimeout(flush, Math.max(0, deadline - leadMs - clock.now()));
    return () => clearTimeout(t);
  }, [deadline, enabled, leadMs, clock, flush]);
}
