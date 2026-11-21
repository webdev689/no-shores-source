// What the wreck's teaching stands on its deck: the player's sword and shield lying where the ram threw them, drawn as
// a dropped piece of gear is (its picture and its Normal line of light), until the player walks over them; and where
// the Tithe boarder the player meets one on one comes from.
import { inReach, markLying } from '../../combat/drops.ts';
import { OUTLINE, type PixelPicture } from '../../combat/dropPictures.ts';
import type { GearState } from '../../network/gearMessages.ts';
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

/** The gear crate's number for a Sword & Shield. */
export const SWORD_AND_SHIELD = KINDS.indexOf('sword_and_shield');

/** The sword and shield as they lie, in the drops' pixel style: a steel kite shield with a brass boss, and a steel
 *  sword, its grip in leather and its guard and pommel in brass. */
export const ARMS_PICTURE: PixelPicture = {
  rows: [
    '...........a..',
    'aaaaaaaa..afa.',
    'abbbbbba..aea.',
    'abccccda.afffa',
    'abcffcda..aba.',
    'abcffcda..aba.',
    '.abccda...aba.',
    '.abccda...aba.',
    '..abda....aba.',
    '..abda....aba.',
    '...aa.....aba.',
    '...........a..',
  ],
  colours: [OUTLINE, '#d4d8dc', '#9aa0a7', '#5d636b', '#6b4a2b', '#c9a25a'],
};

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
  private readonly place: Point;

  constructor(layout: WreckLayout) {
    this.place = armsAt(layout);
  }

  /** Lays the marks that draw them for an eye at `eye` into `out`, `clock` seconds on the page's clock. */
  mark(out: number[], clock: number, eye: Point): void {
    markLying(out, ARMS_PICTURE, { place: this.place, rarity: 0 }, clock, eye);
  }

  /** Whether feet at `feet` stand over them, near enough to take them up. */
  reached(feet: Point): boolean {
    return inReach(feet, this.place);
  }
}
