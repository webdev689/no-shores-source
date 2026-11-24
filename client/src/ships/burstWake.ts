// A ship's burst of speed as the sea shows it. As it begins, its bow heaves up a sheet of spray to either side and a
// ring of foam spreads under its stern; while it runs, spray flies off both bows and foam is laid astern as a wake
// that stays where it was laid, so a bursting ship draws a white road behind it; as it ends, a last fall of spray at
// the bow and the wake's foam spreading as the ship settles. Its puffs are the fight's own (`Effects`), so they share
// its budget and are drawn and thinned as its spray and foam are.
import type { Effects } from './effects.ts';

type Point = readonly [number, number, number];
type Colour = readonly [number, number, number];

/** A ship as its burst is thrown from: its middle at the water (window metres), its heading (radians clockwise from
 *  north) and half its length (metres). */
export interface Bursting {
  readonly anchor: Point;
  readonly heading: number;
  readonly halfLength: number;
}

const SPRAY: Colour = [0.9, 0.95, 1];
const FOAM: Colour = [0.94, 0.97, 1];
const GRAVITY = 9.81;
/** The sheet of spray each bow heaves up as a burst begins, and the drops each bow throws as it ends. */
export const SURGE_SPRAY = 16;
const SETTLE_SPRAY = 7;
/** While it runs, drops off each bow and puffs of wake laid astern, a second. */
export const BOW_SPRAY_RATE = 14;
export const WAKE_RATE = 9;

/** Each ship's burst, by its number in the fight: the share still to run last frame, and the puffs it owes. */
interface Kept {
  share: number;
  owedSpray: number;
  owedWake: number;
}

export class BurstWake {
  private readonly effects: Effects;
  private readonly kept = new Map<number, Kept>();
  private seed: number;

  constructor(effects: Effects, seed: number) {
    this.effects = effects;
    this.seed = seed >>> 0 || 1;
  }

  /** A draw in [0, 1): the spray's variety, nothing the fight decides. */
  private draw(): number {
    this.seed = (Math.imul(this.seed, 1_664_525) + 1_013_904_223) >>> 0;
    return this.seed / 4_294_967_296;
  }

  private spread(most: number): number {
    return (this.draw() * 2 - 1) * most;
  }

  /** Ship `id`'s burst at `now`, `seconds` on, with `share` of it still to run (0 while it does not). */
  frame(id: number, ship: Bursting, share: number, now: number, seconds: number): void {
    const kept = this.kept.get(id) ?? { share: 0, owedSpray: 0, owedWake: 0 };
    this.kept.set(id, kept);
    if (share > 0 && kept.share <= 0) this.surge(ship, now);
    if (share <= 0 && kept.share > 0) this.settle(ship, now);
    kept.share = share;
    if (share <= 0) return;
    kept.owedSpray += BOW_SPRAY_RATE * seconds;
    kept.owedWake += WAKE_RATE * seconds;
    for (; kept.owedSpray >= 1; kept.owedSpray--) for (const side of [-1, 1]) this.bowSpray(ship, side, 1, now);
    for (; kept.owedWake >= 1; kept.owedWake--) this.wake(ship, [1.4, 4.5], 3 + this.draw(), now);
  }

  /** Forgets ship `id`'s burst, which ends with no settle: the ship is going down. */
  forget(id: number): void {
    this.kept.delete(id);
  }

  /** As the burst begins: a sheet of spray off each bow, thrown high and wide, and a ring of foam under the stern. */
  private surge(ship: Bursting, now: number): void {
    for (const side of [-1, 1]) this.bowSpray(ship, side, SURGE_SPRAY, now, 1.6);
    this.wake(ship, [2, 9], 3.5, now);
  }

  /** As the burst ends: a last low fall of spray at the bow, and the wake's foam spreading wide under the stern. */
  private settle(ship: Bursting, now: number): void {
    for (const side of [-1, 1]) this.bowSpray(ship, side, SETTLE_SPRAY, now, 0.6);
    this.wake(ship, [3, 12], 4.5, now);
  }

  /** `count` drops off the bow on `side` (-1 port, 1 starboard), thrown out, up and a little ahead, `lift` times. */
  private bowSpray(ship: Bursting, side: number, count: number, now: number, lift = 1): void {
    const [ahead, across] = [frameWay(ship.heading, 0), frameWay(ship.heading, 1)];
    const bow = ship.halfLength * 0.8;
    this.effects.add('spray', count, ship.anchor, now, () => {
      const [out, up, onward] = [2.5 + this.draw() * 3.5, (3.5 + this.draw() * 3.5) * lift, 1 + this.draw() * 2];
      return {
        from: [ahead[0] * bow + across[0] * side * 0.8, ahead[1] * bow + across[1] * side * 0.8, 0.3],
        velocity: [
          across[0] * side * out + ahead[0] * onward + this.spread(0.5),
          across[1] * side * out + ahead[1] * onward + this.spread(0.5),
          up,
        ],
        drag: 0.5,
        gravity: GRAVITY,
        floor: 0,
        colour: SPRAY,
        alpha: 0.8,
        size: [0.5, 1.4 * lift],
        life: 0.8 + this.draw() * 0.6,
      };
    });
  }

  /** A puff of foam lying on the water under the stern, spreading from one width to another over `life` seconds. */
  private wake(ship: Bursting, size: readonly [number, number], life: number, now: number): void {
    const [ahead, across] = [frameWay(ship.heading, 0), frameWay(ship.heading, 1)];
    const [stern, aside] = [-ship.halfLength * (0.9 + this.draw() * 0.3), this.spread(0.6)];
    this.effects.add('foam', 1, ship.anchor, now, () => ({
      from: [ahead[0] * stern + across[0] * aside, ahead[1] * stern + across[1] * aside, 0.04],
      velocity: [-ahead[0] * 0.6, -ahead[1] * 0.6, 0],
      drag: 0.6,
      colour: FOAM,
      alpha: 0.75,
      size,
      life,
      flat: true,
    }));
  }
}

/** A ship's way ahead (0) or to starboard (1) over the water, east and south, for its heading. */
function frameWay(heading: number, axis: 0 | 1): readonly [number, number] {
  return axis === 0 ? [Math.sin(heading), -Math.cos(heading)] : [Math.cos(heading), Math.sin(heading)];
}
