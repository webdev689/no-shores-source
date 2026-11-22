// Hands going about a ship's deck: the stand-in crew on the player's Sloop until crew management comes, and every
// other ship's hands. Each walks between spots on its deck and pauses at each, each leg one the deck leaves clear, all
// kept away from its wheel; one posted to a spot (a gun run out) walks there and stands. Seeded, so a voyage's hands
// move the same however it is drawn. In its own frame.
import { type Race } from '../player/dressing.ts';
import { cellHeight, cellsReached, type Deck } from '../ships/deck.ts';

/** How many hands stand in for its crew. */
export const STAND_INS = 3;
/** A hand's walk, metres a second, and how long they stand at each spot, seconds. */
const WALK_M_S = 1.3;
const PAUSE_S = [2, 7] as const;
/** No hand comes nearer its wheel than this, metres: the helm is the player's, or its helmsman's. */
const WHEEL_CLEAR_M = 1.2;
/** A leg's step up or down between two of its points, at most, metres: the deck's own, not over a fitting. */
const LEG_STEP_M = 0.25;
/** Each hand's race and skin tone, in turn. */
export const HAND_LOOKS: readonly (readonly [Race, number])[] = [
  ['human', 0.35],
  ['felid', 0.5],
  ['human', 0.75],
];

/** A hand on its deck: where they stand (its frame), the way they face, whether walking, and how they look. */
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

/** A spot a hand is posted to on its deck (a gun run out), and the way they face there. */
export interface Post {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly facing: number;
}

interface Walking {
  x: number;
  y: number;
  z: number;
  facing: number;
  target: readonly [number, number, number] | null;
  waiting: number;
  post: Post | null;
  /** The hand's own numbers, so no hand's draws wait on another's, however the seconds are cut. */
  readonly draw: () => number;
}

/** Each deck's spots a hand walks between, found once: every cell a body walks to from its helm (never a rail's top
 *  beyond a wall), clear of its wheel. */
const deckSpots = new WeakMap<Deck, readonly (readonly [number, number, number])[]>();
function spotsOf(deck: Deck): readonly (readonly [number, number, number])[] {
  const known = deckSpots.get(deck);
  if (known) return known;
  const [helmX, helmY] = deck.helm;
  const spots = cellsReached(deck, helmX, helmY)
    .filter((cell) => Math.hypot(cell.x - helmX, cell.y - helmY) > WHEEL_CLEAR_M)
    .map((cell) => [cell.x, cell.y, cell.z] as const);
  deckSpots.set(deck, spots);
  return spots;
}

/** The hands on a deck, `count` of them (the player's stand-ins unless said), stepped by the seconds that pass. */
export class Crew {
  private readonly deck: Deck;
  private readonly spots: readonly (readonly [number, number, number])[];
  private readonly walking: Walking[];

  constructor(deck: Deck, seed: number, count: number = STAND_INS) {
    this.deck = deck;
    this.spots = spotsOf(deck);
    this.walking = Array.from({ length: count }, (_unused, index) => {
      const draw = seeded(seed * STAND_INS + index);
      const [x = 0, y = 0, z = 0] = this.pick(draw) ?? [0, 0, 0];
      return { x, y, z, facing: draw() * 2 * Math.PI, target: null, waiting: pause(draw), post: null, draw };
    });
  }

  private pick(draw: () => number): readonly [number, number, number] | null {
    return this.spots[Math.floor(draw() * this.spots.length)] ?? null;
  }

  /** The crew `seconds` on: a hand at a spot waits, then sets off for another the deck leaves a clear way to. A hand
   *  `posts` names a spot for walks straight there once the deck leaves a clear way to it (else walks on, and asks
   *  again from where it comes to), and stands facing its way; let go, they wait a moment, then walk on as before. */
  step(seconds: number, posts: readonly (Post | null)[] = []): void {
    this.walking.forEach((hand, index) => {
      const post = posts[index] ?? null;
      const clear = post === null || clearLeg(this.deck, [hand.x, hand.y], [post.x, post.y]);
      if (post !== hand.post && clear)
        [hand.post, hand.target, hand.waiting] = [post, post && [post.x, post.y, post.z], PAUSE_S[0]];
      if (hand.post) {
        if (hand.target && this.walkOn(hand, seconds) !== null) hand.facing = hand.post.facing;
        return;
      }
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
        const after = this.walkOn(hand, left);
        if (after === null) break;
        [left, hand.waiting] = [after, pause(hand.draw)];
      }
    });
  }

  /** Walks `hand` toward its target for up to `seconds`: once there, the target let go and the seconds left; still
   *  on the way, null. */
  private walkOn(hand: Walking, seconds: number): number | null {
    const [toX, toY, toZ] = hand.target ?? [hand.x, hand.y, hand.z];
    const away = Math.hypot(toX - hand.x, toY - hand.y);
    const walked = Math.min(away, WALK_M_S * seconds);
    if (away > 1e-9) {
      hand.facing = Math.atan2(toX - hand.x, -(toY - hand.y));
      hand.x += ((toX - hand.x) * walked) / away;
      hand.y += ((toY - hand.y) * walked) / away;
    }
    if (walked < away) {
      hand.z = cellHeight(this.deck, hand.x, hand.y) ?? hand.z;
      return null;
    }
    [hand.x, hand.y, hand.z, hand.target] = [toX, toY, toZ, null];
    return seconds - walked / WALK_M_S;
  }

  /** Each hand as they stand now. */
  get hands(): readonly Hand[] {
    return this.walking.map((hand, index) => {
      const [race, tone] = HAND_LOOKS[index % HAND_LOOKS.length] ?? ['human', 0.5];
      return { x: hand.x, y: hand.y, z: hand.z, facing: hand.facing, walking: hand.target !== null, race, tone };
    });
  }
}
