// Step-through reveal. Three ways to drive it:
//  - `step` (controlled): the game puts the current index in its view; every device follows.
//  - `startAt` + `interval`: a server-time start; each device computes the step from the
//    server clock, so the screen and every phone stay in sync with no extra messages.
//  - `interval` alone: local auto-advance from mount (single-device previews).
// Each new step plays a cue on the room's audio device (see `sound`).
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { pentatonic, playSound, type Sound } from '../audio/sfx';
import { useServerClock } from './hooks';

/** Steps closer together than this are a stagger (a list popping in), not separate reveals. */
const STAGGER_MS = 400;

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
  /**
   * The cue for each new step: a shared effect name, or `(step) => ...` to play a game's own
   * (per step, e.g. a different sting for the last one). `false` is silent. Default: 'reveal'
   * (whoosh + thump), or for fast staggers 'count' (a coin tick climbing with the step).
   */
  sound?: Sound | false;
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

export function RevealStage({ items, step, startAt, interval, layout = 'stack', onDone, sound, class: cls }: RevealStageProps) {
  const auto = useAutoStep(startAt, interval, items.length, step === undefined);
  const current = Math.min(items.length - 1, step ?? auto);
  const done = useRef(false);
  const clock = useServerClock();

  // A step is heard when it appears while mounted. On mount, only if it appeared just now
  // (a reveal starting), not when a late joiner lands mid-reveal.
  const heard = useRef<number | null>(null);
  useEffect(() => {
    const was = heard.current;
    heard.current = current;
    if (current < 0 || sound === false) return;
    if (was === null) {
      if (step !== undefined || !interval) return;
      const shownAt = (startAt ?? clock.now()) + current * interval;
      if (current > 0 || clock.now() - shownAt > 300) return;
    } else if (current <= was) return;
    const fast = interval !== undefined && interval < STAGGER_MS;
    playSound(sound ?? (fast ? 'count' : 'reveal'), current, fast ? { pitch: pentatonic(Math.min(current, 9)) } : undefined);
  }, [current]);
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
