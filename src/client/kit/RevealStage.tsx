// Step-through reveal. Three ways to drive it:
//  - `step` (controlled): the game puts the current index in its view; every device follows.
//  - `startAt` + `interval`: a server-time start; each device computes the step from the
//    server clock, so the screen and every phone stay in sync with no extra messages.
//  - `interval` alone: local auto-advance from mount (single-device previews).
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useServerClock } from './hooks';

export interface RevealStageProps {
  /** The items, in reveal order. */
  items: ComponentChildren[];
  /** Controlled: index of the last visible item (-1 = nothing yet). */
  step?: number;
  /** Server ms when item 0 appears (with `interval`). */
  startAt?: number;
  /** ms between items. */
  interval?: number;
  /** 'stack' (default): items accumulate top to bottom. 'row': side by side (comic panels).
   *  'single': only the current item, centred and large. */
  layout?: 'stack' | 'row' | 'single';
  /** Called once when the last item has appeared. */
  onDone?(): void;
  class?: string;
}

function useAutoStep(startAt: number | undefined, interval: number | undefined, count: number, enabled: boolean): number {
  const clock = useServerClock();
  const mountedAt = useRef(clock.now());
  const origin = startAt ?? mountedAt.current;
  const calc = () => (interval ? Math.min(count - 1, Math.floor((clock.now() - origin) / interval)) : count - 1);
  const [step, setStep] = useState(calc);
  useEffect(() => {
    if (!enabled || !interval) return;
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      const s = calc();
      setStep(s);
      if (s < count - 1) t = setTimeout(tick, Math.max(16, origin + (s + 1) * interval - clock.now()));
    };
    tick();
    return () => clearTimeout(t);
  }, [enabled, origin, interval, count, clock]);
  return step;
}

export function RevealStage({ items, step, startAt, interval, layout = 'stack', onDone, class: cls }: RevealStageProps) {
  const auto = useAutoStep(startAt, interval, items.length, step === undefined);
  const current = Math.min(items.length - 1, step ?? auto);
  const done = useRef(false);
  useEffect(() => {
    if (!done.current && items.length && current >= items.length - 1) {
      done.current = true;
      onDone?.();
    }
  }, [current, items.length]);

  const visible = layout === 'single' ? (current >= 0 ? [current] : []) : items.map((_, i) => i).filter((i) => i <= current);
  return (
    <div class={`k-reveal k-reveal-${layout}${cls ? ` ${cls}` : ''}`} aria-live="polite">
      {visible.map((i) => (
        <div key={i} class={`k-reveal-item${i === current ? ' is-current' : ''}`}>
          {items[i]}
        </div>
      ))}
    </div>
  );
}
