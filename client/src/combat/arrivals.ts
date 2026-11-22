// A player arriving, as they spawn into a place or respawn: their figure builds from the feet up in 2 by 2 cells, each
// white as it lands, seen by everyone; and their own view opens from dark in two blinks. Drawing only: where they
// stand is the room's.
import type { FightEvent } from '../network/messages.ts';
import { EVENT } from './cues.ts';
import { dissolveShare } from './flashes.ts';

/** When the arriving player's view is first open, seconds after they arrive: their own figure begins building then,
 *  so they see it built. */
const FIRST_OPEN_S = 0.5;
/** The arriving player's view, dark (1) to open (0), at each time (seconds after they arrive): held dark, opened,
 *  shut once more, and open. */
const BLINK: readonly (readonly [number, number])[] = [
  [0, 1],
  [0.3, 1],
  [FIRST_OPEN_S, 0.15],
  [0.6, 0.9],
  [1, 0],
];

/** How dark the arriving player's view is `seconds` after they arrive, 1 dark to 0 open. */
export function blinkDark(seconds: number): number {
  let [from, to] = [BLINK[0], BLINK[0]];
  for (const stop of BLINK) {
    to = stop;
    if (stop[0] >= seconds) break;
    from = stop;
  }
  if (to[0] <= from[0]) return to[1];
  return from[1] + ((to[1] - from[1]) * (seconds - from[0])) / (to[0] - from[0]);
}

/** When each figure last began arriving, by its fighter's number (page seconds): one each, cleared on leaving. The
 *  other players already met, and whether the player has arrived, after which each one first met arrives. */
export class Arrivals {
  private readonly began = new Map<number, number>();
  private readonly met = new Set<number>();
  private here = false;

  /** `id` arrives at `clock`. */
  arrive(id: number, clock: number): void {
    this.began.set(id, clock);
  }

  /** The player, `id`, arrives at `clock`, as the veil lifts on the place. */
  arriveHere(id: number, clock: number): void {
    this.here = true;
    this.arrive(id, clock);
  }

  /** Another player `id` is seen at `clock`: one first met after the player arrived arrives. */
  meet(id: number, clock: number): void {
    if (this.met.has(id)) return;
    this.met.add(id);
    if (this.here) this.arrive(id, clock);
  }

  /** Each fighter `events` tells respawned arrives at `clock`. */
  told(events: readonly FightEvent[], clock: number): void {
    for (const event of events) if (event.kind === EVENT.respawned) this.arrive(event.defender, clock);
  }

  /** How much of `id`'s figure is still to come at `clock`, 1 none to 0 whole, as a plain death crumbles it in held
   *  steps; nothing once it stands whole. */
  shareOf(id: number, clock: number): number | undefined {
    const began = this.began.get(id);
    if (began === undefined) return undefined;
    const left = 1 - dissolveShare(0, clock - began);
    return left > 0 ? left : undefined;
  }

  /** As `shareOf`, for the player's own figure: it begins once their view is first open. */
  ownShareOf(id: number, clock: number): number | undefined {
    return this.shareOf(id, clock - FIRST_OPEN_S);
  }

  /** How dark `id`'s own view is at `clock` as they arrive, 1 dark to 0 open. */
  darkOf(id: number, clock: number): number {
    const began = this.began.get(id);
    return began === undefined ? 0 : blinkDark(clock - began);
  }

  clear(): void {
    this.began.clear();
    this.met.clear();
    this.here = false;
  }
}
