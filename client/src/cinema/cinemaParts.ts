// What the story's screens draw with, shared by the cinema's screen, the tap to start, the boss's nameplate and the
// objective: a value eased to each new one over a time of its own, as a CSS transition eases, words with a hard shadow
// dropped straight down under them, as the sheets wrote `text-shadow: 0 4px 0`, and a rule faded at both ends.
import { easeInOut } from '../ui/ease.ts';
import type { Node, Picture, Text } from '../ui/node.ts';
import { colourOf } from '../ui/quads.ts';

/** Seconds on the page's clock, which the story's screens ease by. */
export const pageClock = (): number => performance.now() / 1000;

/** A value that eases to each new one it is set to, over the seconds asked, from wherever it stands: a CSS transition
 *  set again mid-way. */
export class Eased {
  private from: number;
  private to: number;
  private since = Number.NEGATIVE_INFINITY;
  private seconds = 0;
  private readonly ease: (share: number) => number;

  constructor(value: number, ease: (share: number) => number = easeInOut) {
    [this.from, this.to, this.ease] = [value, value, ease];
  }

  /** Eases to `value` over `seconds` from where it stands `now`; starting `hold` seconds later. */
  set(value: number, seconds: number, now: number, hold = 0): void {
    if (value === this.to && hold === 0) return;
    this.from = this.value(now);
    this.to = value;
    this.since = now + hold;
    this.seconds = Math.max(0, seconds);
  }

  /** Where it stands `now`. */
  value(now: number): number {
    if (now < this.since) return this.from;
    const share = this.seconds > 0 ? Math.min(1, (now - this.since) / this.seconds) : 1;
    return this.from + (this.to - this.from) * this.ease(share);
  }

  /** Where it is going. */
  get target(): number {
    return this.to;
  }
}

/** A prompt's breath: whole, down to 0.35 and back over `period` seconds, eased in and out each way, as the sheets'
 *  `breathe` keyframes ran. */
export function breath(now: number, period = 2.2): number {
  const into = (((now % period) + period) % period) / period;
  const half = into < 0.5 ? into * 2 : (1 - into) * 2;
  return 1 - 0.65 * easeInOut(half);
}

/** Words over a copy of them in `shadow` dropped `drop` pixels straight down. */
export function dropped(text: Text, shadow: string, drop: number, more: Partial<Node> = {}): Node {
  return {
    padding: [drop, 0, 0, 0],
    ...more,
    text: { ...text, colour: shadow },
    children: [{ text, float: { to: 'parent', anchor: [0, 0], at: [0, 0] } }],
  };
}

/** A horizontal gradient through `stops` (colour at share), clear at both ends: a rule as the sheets drew one. */
export function ruleOf(key: string, stops: readonly (readonly [number, string])[]): Picture {
  return {
    key,
    pixel: { width: 220, height: 1 },
    source: {
      draw: (context, width, height) => {
        const gradient = context.createLinearGradient(0, 0, width, 0);
        // Clear in the end stops' own colours, as CSS fades to `transparent` without darkening on the way.
        const clear = (css: string | undefined) => {
          const [red, green, blue] = colourOf(css ?? '#000').map((part) => Math.round(part * 255));
          return `rgba(${red},${green},${blue},0)`;
        };
        gradient.addColorStop(0, clear(stops[0]?.[1]));
        for (const [share, colour] of stops) gradient.addColorStop(share, colour);
        gradient.addColorStop(1, clear(stops.at(-1)?.[1]));
        context.fillStyle = gradient;
        context.fillRect(0, 0, width, height);
      },
    },
  };
}
