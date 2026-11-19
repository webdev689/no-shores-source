// The player's Brig in the storm, from the first sight of her to the ram: where she sails (world metres), her deck as
// the ships manifest measures it, and her crew, each at work in a spot on her deck, the four who speak among them.
import ships from '../../../../content/ships/ships.json' with { type: 'json' };
import { type Dress, plainDress, type Race } from '../../player/dressing.ts';
import { cellHeight, deckOf, type Deck } from '../../ships/deck.ts';
import type { ShipPlace } from '../../ships/shipView.ts';
import { type Actor, ACTOR_IDS } from './actors.ts';
import { onDeck, type Sailed } from './sailing.ts';

export const BRIG_DECK: Deck = deckOf(ships.ships.brig.deck);
/** Her way through the storm under shortened sail, metres a second. */
const STORM_WAY_M_S = 3.2;
const CREW_IDS = ACTOR_IDS + 100;

/** A hand of her crew: who they are to the story (a speaker's name, or a plain hand), where they work (her deck's
 *  frame: x to starboard, y to her stern), which way they face from her bow, and the move they work at. */
interface Hand {
  readonly who: string;
  readonly at: readonly [number, number];
  readonly facing: number;
  readonly work: string;
  readonly race: Race;
  readonly tone: number;
  readonly body: 'male' | 'female';
}

/** Her crew at work in the storm: the lookout up forward pointing, the bosun and hands hauling and sweeping, the
 *  gunner at a gun, the mate on the quarterdeck by the helm. */
const CREW: readonly Hand[] = [
  { who: 'lookout', at: [0.4, -12.5], facing: 0, work: 'gesture', race: 'human', tone: 0.2, body: 'male' },
  { who: 'bosun', at: [-1.4, -5.5], facing: -1.4, work: 'hold', race: 'human', tone: 0.8, body: 'male' },
  { who: 'hand', at: [1.5, -7.5], facing: 1.6, work: 'hold', race: 'felid', tone: 0.5, body: 'male' },
  { who: 'hand', at: [0.3, -2], facing: 0.4, work: 'sweep', race: 'human', tone: 0.45, body: 'female' },
  { who: 'gunner', at: [1.9, 1.5], facing: 1.57, work: 'chop', race: 'human', tone: 0.65, body: 'male' },
  { who: 'hand', at: [-0.8, 4], facing: 3.1, work: 'carry', race: 'anole', tone: 0.5, body: 'male' },
  { who: 'mate', at: [-1.3, 10.6], facing: 0.3, work: 'idle', race: 'human', tone: 0.35, body: 'female' },
];

/** The spot behind her wheel, in her deck's frame, and its height. */
export function helmSpot(): readonly [number, number, number] {
  const [x, y] = BRIG_DECK.helm;
  return [x, y, cellHeight(BRIG_DECK, x, y) ?? 3.2];
}

/** A point of her deck's frame in the world, as she is placed. */
export function deckPoint(place: ShipPlace, x: number, y: number, z: number): [number, number, number] {
  return onDeck(place, -y, x, z);
}

const dressOf = (hand: Hand): Dress => ({ ...plainDress(hand.race, hand.tone), body: hand.body });

/** The Brig as the story sails her: she keeps her course through the storm until the story stops her. */
export class Brig {
  x: number;
  y: number;
  heading: number;
  way = STORM_WAY_M_S;
  private readonly dresses = CREW.map(dressOf);

  constructor(at: readonly [number, number], heading: number) {
    [this.x, this.y] = at;
    this.heading = heading;
  }

  /** Sails her on by a frame. */
  step(seconds: number): void {
    this.x += Math.sin(this.heading) * this.way * seconds;
    this.y -= Math.cos(this.heading) * this.way * seconds;
  }

  sailed(overrides: Partial<Sailed> = {}): Sailed {
    return {
      who: 'brig',
      hull: 'brig',
      x: this.x,
      y: this.y,
      heading: this.heading,
      underWay: this.way > 0,
      ...overrides,
    };
  }

  /** Her crew where they work, as she is placed; `moves` swaps a speaker's move (a cry, a cheer). */
  crew(place: ShipPlace, clock: number, moves: Readonly<Record<string, string>> = {}): Actor[] {
    return CREW.map((hand, index) => {
      const [x, y] = hand.at;
      const z = cellHeight(BRIG_DECK, x, y) ?? 2.3;
      const [worldX, worldY, worldZ] = deckPoint(place, x, y, z);
      const anim = moves[hand.who] ?? hand.work;
      return {
        id: CREW_IDS + index,
        dress: this.dresses[index] ?? plainDress('human', 0.5),
        anim,
        x: worldX,
        y: worldY,
        z: worldZ,
        facing: place.heading + hand.facing,
        // Each works on a clock of their own, so no two keep time.
        since: index * 0.37,
        scale: place.scale,
      } satisfies Actor;
    });
  }

  /** A crew member's head in the world, by the speaker's name. */
  head(place: ShipPlace, who: string): [number, number, number] | null {
    const hand = CREW.find((each) => each.who === who);
    if (!hand) return null;
    const z = cellHeight(BRIG_DECK, hand.at[0], hand.at[1]) ?? 2.3;
    return deckPoint(place, hand.at[0], hand.at[1], z + 2.1);
  }

  /** Every speaking hand's head, for the barks and emotes. */
  heads(place: ShipPlace): Map<string, readonly [number, number, number]> {
    const heads = new Map<string, readonly [number, number, number]>();
    for (const who of ['lookout', 'bosun', 'gunner', 'mate']) {
      const head = this.head(place, who);
      if (head) heads.set(who, head);
    }
    return heads;
  }
}
