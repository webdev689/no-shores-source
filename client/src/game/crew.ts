// Stand-in crew on the Sloop's deck until crew management comes: a few hands walking between spots on her deck and
// pausing at each, each leg one the deck leaves clear, all kept away from her wheel. Seeded, so a voyage's hands move
// the same however it is drawn. In her own frame.
import { type Race } from '../player/dressing.ts';
import { cellHeight, type Deck, deckCells } from '../ships/deck.ts';

/** How many hands stand in for her crew. */
export const STAND_INS = 3;
/** A hand's walk, metres a second, and how long they stand at each spot, seconds. */
const WALK_M_S = 1.3;
const PAUSE_S = [2, 7] as const;
/** No hand comes nearer her wheel than this, metres: the helm is the player's, or her helmsman's. */
const WHEEL_CLEAR_M = 1.2;
/** A leg's step up or down between two of its points, at most, metres: the deck's own, not over a fitting. */
const LEG_STEP_M = 0.25;
/** Each hand's race and skin tone, in turn. */
const LOOKS: readonly (readonly [Race, number])[] = [
  ['human', 0.35],
  ['felid', 0.5],
  ['human', 0.75],
];

/** A hand on her deck: where they stand (her frame), the way they face, whether walking, and how they look. */
export interface Hand {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly facing: number;
  readonly walking: boolean;
  readonly race: Race;
  readonly tone: number;
}

/** A small seeded stream of numbers in [0, 1). */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** How long a hand stands at a spot, seconds. */
const pause = (draw: () => number) => PAUSE_S[0] + draw() * (PAUSE_S[1] - PAUSE_S[0]);

/** Whether a hand may walk straight from one spot to another: every point between on the deck, with no step up or
 *  down past the deck's own. */
export function clearLeg(deck: Deck, from: readonly [number, number], to: readonly [number, number]): boolean {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const steps = Math.max(1, Math.ceil(length / (deck.cell / 2)));
  let last = cellHeight(deck, from[0], from[1]);
  for (let step = 1; step <= steps; step++) {
    const share = step / steps;
    const here = cellHeight(deck, from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share);
    if (here === null || last === null || Math.abs(here - last) > LEG_STEP_M) return false;
    last = here;
  }
  return true;
}

interface Walking {
  x: number;
  y: number;
  z: number;
  facing: number;
  target: readonly [number, number, number] | null;
  waiting: number;
  /** The hand's own numbers, so no hand's draws wait on another's, however the seconds are cut. */
  readonly draw: () => number;
}

/** The stand-in crew on a deck, stepped by the seconds that pass. */
export class Crew {
  private readonly deck: Deck;
  private readonly spots: readonly (readonly [number, number, number])[];
  private readonly walking: Walking[];

  constructor(deck: Deck, seed: number) {
    this.deck = deck;
    const [helmX, helmY] = deck.helm;
    this.spots = deckCells(deck)
      .filter((cell) => Math.hypot(cell.x - helmX, cell.y - helmY) > WHEEL_CLEAR_M)
      .map((cell) => [cell.x, cell.y, cell.z] as const);
    this.walking = LOOKS.slice(0, STAND_INS).map((_look, index) => {
      const draw = seeded(seed * STAND_INS + index);
      const [x = 0, y = 0, z = 0] = this.pick(draw) ?? [0, 0, 0];
      return { x, y, z, facing: draw() * 2 * Math.PI, target: null, waiting: pause(draw), draw };
    });
  }

  private pick(draw: () => number): readonly [number, number, number] | null {
    return this.spots[Math.floor(draw() * this.spots.length)] ?? null;
  }

  /** The crew `seconds` on: a hand at a spot waits, then sets off for another the deck leaves a clear way to. */
  step(seconds: number): void {
    for (const hand of this.walking) {
      let left = seconds;
      while (left > 0) {
        if (!hand.target) {
          const waited = Math.min(left, hand.waiting);
          hand.waiting -= waited;
          left -= waited;
          if (hand.waiting > 0) break;
          // A few tries for a spot with a clear way there; none, and the hand stays put a while longer.
          for (let tries = 0; tries < 12 && !hand.target; tries++) {
            const spot = this.pick(hand.draw);
            if (spot && clearLeg(this.deck, [hand.x, hand.y], [spot[0], spot[1]])) hand.target = spot;
          }
          if (!hand.target) hand.waiting = pause(hand.draw);
          continue;
        }
        const [toX, toY, toZ] = hand.target;
        const away = Math.hypot(toX - hand.x, toY - hand.y);
        const walked = Math.min(away, WALK_M_S * left);
        left -= walked / WALK_M_S;
        if (away > 1e-9) {
          hand.facing = Math.atan2(toX - hand.x, -(toY - hand.y));
          hand.x += ((toX - hand.x) * walked) / away;
          hand.y += ((toY - hand.y) * walked) / away;
        }
        if (walked >= away) {
          [hand.x, hand.y, hand.z, hand.target, hand.waiting] = [toX, toY, toZ, null, pause(hand.draw)];
        } else {
          hand.z = cellHeight(this.deck, hand.x, hand.y) ?? hand.z;
          break;
        }
      }
    }
  }

  /** Each hand as they stand now. */
  get hands(): readonly Hand[] {
    return this.walking.map((hand, index) => {
      const [race, tone] = LOOKS[index % LOOKS.length] ?? ['human', 0.5];
      return { x: hand.x, y: hand.y, z: hand.z, facing: hand.facing, walking: hand.target !== null, race, tone };
    });
  }
}
