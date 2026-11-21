// What the wreck's teaching stands on its deck: the player's sword and shield lying where the ram threw them, drawn as
// any dropped piece of gear is (a Normal Vestige and its line of light), until the player walks over them; and where
// the Tithe boarder the player meets one on one comes from.
import { DropsShown, inReach } from '../../combat/drops.ts';
import { DROPPED, type GearDrop, type GearState } from '../../network/gearMessages.ts';
import { CARRIED, KINDS, WORN } from '../../player/gear.ts';
import type { Arms } from './tutorial.ts';
import { pointAlong, topAt, type WreckLayout } from './wreckLayout.ts';

type Point = readonly [number, number, number];

/** How far along the path from where the player wakes their arms lie, metres: just ahead of them as they stand. */
export const ARMS_ALONG_M = 3;
/** The boarder's two places along the path, metres: at the far end of the quiet deck, or, should the player stand
 *  there, back by their arms, below the step up to where they woke. Either way the farther from the player. */
const BOARDER_ALONG_M = [13, 4.5] as const;
/** The boarder: a Grey Tithe Hookman, an axe fought as a swordsman fights, at the lowest rank. */
export const BOARDER = { type: 8, rank: 1 } as const;

const SWORD_AND_SHIELD = KINDS.indexOf('sword_and_shield');

/** Where the player's sword and shield lie on the deck. */
export function armsAt(layout: WreckLayout): Point {
  const [x, y] = pointAlong(layout.path, ARMS_ALONG_M);
  return [x, y, topAt(layout.course, x, y)];
}

/** Where the player's sword and shield are, by their gear as the room last sent it: none in it, they lie on the deck. */
export function armsOf(gear: GearState | null): Arms {
  const held = gear?.items.find((item) => item.kind === SWORD_AND_SHIELD);
  if (!held) return 'lying';
  return held.at >= WORN ? 'worn' : held.at === CARRIED ? 'carried' : 'lying';
}

/** Where the boarder stands, and the way it faces: toward the player at (`x`, `y`). */
export function boarderAt(layout: WreckLayout, x: number, y: number): { at: [number, number]; facing: number } {
  const places = BOARDER_ALONG_M.map((metres) => pointAlong(layout.path, metres));
  const far = (place: readonly [number, number]) => Math.hypot(place[0] - x, place[1] - y);
  const [standX, standY] = places.reduce((best, place) => (far(place) > far(best) ? place : best));
  return { at: [standX, standY], facing: Math.atan2(x - standX, -(y - standY)) };
}

/** The arms lying on the deck as the player sees them. */
export class LyingArms {
  private readonly drop: GearDrop;
  private readonly shown = new DropsShown();

  constructor(layout: WreckLayout) {
    const lies = armsAt(layout);
    this.drop = { id: 0, rarity: 0, slot: 0, kind: DROPPED.vestige, at: lies, from: lies, flying: 0 };
  }

  /** The marks that draw them for an eye at `eye`, `clock` seconds on the page's clock. */
  marks(clock: number, eye: Point): number[] {
    return this.shown.frame([this.drop], clock, eye).marks;
  }

  /** Whether feet at `feet` stand over them, near enough to take them up. */
  reached(feet: Point): boolean {
    return inReach(feet, this.drop.at);
  }
}
