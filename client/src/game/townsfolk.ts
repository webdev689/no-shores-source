// The people of a social space, as the Tower's: a keeper behind each station's counter, and townsfolk at their
// routines on the plan's ways and posts (`life/`): working, playing and walking by to the counters, the views and
// the benches, the same in every browser at the same moment. Their dress, drawn from the plaza's seed, is the same
// each visit.

import type { Dress, Race } from '../player/dressing.ts';
import type { Outfit } from '../forge/outfit.ts';
import { KEEPERS, keeperOf } from './keepers.ts';
import { seeded } from './life/seeded.ts';
import { TownLife } from './life/townLife.ts';
import { type Post, type StationInfo, type Ways, bearingTo } from './nodes.ts';
import type { NodeInfo } from './worldData.ts';

type Point = readonly [number, number];

/** One of the plaza's people as drawn: their number among them, where they stand and face, their move (the forge's
 *  name for it), and their dress. */
export interface Townsperson {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly facing: number;
  readonly anim: string;
  readonly dress: Dress;
}

/** What a plaza is to its people: its bounds (west, north, east, south), spawns and stations, the places Shape may
 *  stand on his weekends, one a week, and the ways and posts of its townsfolk. */
export interface Plaza {
  readonly bounds: readonly [number, number, number, number];
  readonly spawns: readonly Point[];
  readonly stations: readonly StationInfo[];
  readonly visitorSpots?: readonly Point[];
  readonly ways?: Ways;
  readonly posts?: readonly Post[];
}

/** What a plaza's people step by besides the time: where Shape stands, if he is here. */
export interface PlazaNow {
  readonly shape?: Point | null;
}

/** Where Shape stands while the room's gear says he is here: the plaza's visitor spot his place indexes. */
export function shapeSpot(shape: { readonly place: number } | null | undefined, spots: readonly Point[]): Point | null {
  return shape ? (spots[shape.place] ?? null) : null;
}

/** A plaza's own frame: its middle, and the way to the sea along the world's axes. The spawns stand just inside the
 *  seaward parapet, spread across it, so the way to their middle, square to the world, is the way to the sea. */
export interface PlazaFrame {
  readonly middle: Point;
  readonly seaward: Point;
}

/** A social space's plaza, from its node: its plaza's bounds, or its ring's where it names none, spawns, stations,
 *  visitor spots, ways and posts. */
export function plazaOf(
  node: Pick<NodeInfo, 'ring' | 'spawns' | 'stations' | 'visitorSpots' | 'ways' | 'posts' | 'plazaBounds'>,
): Plaza {
  const eastings = node.ring.map((point) => point[0]);
  const southings = node.ring.map((point) => point[1]);
  const bounds =
    node.plazaBounds ??
    ([Math.min(...eastings), Math.min(...southings), Math.max(...eastings), Math.max(...southings)] as const);
  const { spawns, stations = [], visitorSpots = [], ways, posts = [] } = node;
  return { bounds, spawns, stations, visitorSpots, ...(ways ? { ways, posts } : {}) };
}

export function plazaFrameOf(plaza: Pick<Plaza, 'bounds' | 'spawns'>): PlazaFrame {
  const [west, north, east, south] = plaza.bounds;
  const middle: Point = [(west + east) / 2, (north + south) / 2];
  const count = Math.max(1, plaza.spawns.length);
  const toward = plaza.spawns.reduce((sum, spawn) => sum + spawn[0], 0) / count - middle[0];
  const along = plaza.spawns.reduce((sum, spawn) => sum + spawn[1], 0) / count - middle[1];
  const seaward: Point = Math.abs(toward) >= Math.abs(along) ? [Math.sign(toward), 0] : [0, Math.sign(along)];
  return { middle, seaward };
}

/** How far toward the sea and across the plaza a point of the world stands, metres from its middle. */
export function inPlaza({ middle, seaward }: PlazaFrame, point: Point): { toward: number; across: number } {
  const [east, south] = [point[0] - middle[0], point[1] - middle[1]];
  return { toward: east * seaward[0] + south * seaward[1], across: east * -seaward[1] + south * seaward[0] };
}

/** A point of the plaza's frame in the world. */
export function plazaPoint({ middle, seaward }: PlazaFrame, toward: number, across: number): [number, number] {
  return [middle[0] + seaward[0] * toward - seaward[1] * across, middle[1] + seaward[1] * toward + seaward[0] * across];
}

const outfit = (garments: string[], dyes: Record<string, string>, armour: Outfit['armour'] = {}): Outfit => ({
  armour,
  garments,
  dyes,
  right: null,
  left: null,
  drawn: false,
  hair: { style: 'crop', colour: 'brown' },
});

/** The townsfolk's clothes by body, worn in turn and dyed in turn: only garments the forge draws on that body in
 *  every move the townsfolk make, at work and at play as well as walking, so no one at a post is left undrawn. */
export const CLOTHES: Readonly<Record<'male' | 'female', readonly (readonly string[])[]>> = {
  male: [
    ['shirt_long_v', 'breeches', 'shoes'],
    ['shirt_short_round', 'vest', 'casual_pants', 'sandals'],
    ['shirt_long_round', 'short_tunic', 'breeches', 'tall_boots'],
    ['shirt_long_deep', 'casual_pants', 'shoes'],
  ],
  female: [
    ['peasant_blouse', 'long_skirt', 'shoes'],
    ['shirt_short_round', 'vest', 'tights', 'sandals'],
    ['shirt_long_round', 'casual_dress', 'tall_boots'],
    ['shirt_long_deep', 'day_gown', 'shoes'],
  ],
};
const DYES = ['White', 'LightBrown', 'DarkBrown', 'Blue', 'Grey', 'Red', 'Green', 'Yellow', 'Purple', 'Aquamarine'];
const RACES: readonly Race[] = ['human', 'human', 'felid', 'human', 'anole'];

/** Someone's dress: a body, a race and tone, and their clothes in their dyes. */
function dressOf(index: number, random: () => number): Dress {
  const body = index % 2 === 0 ? 'male' : 'female';
  const race = RACES[index % RACES.length] ?? 'human';
  const worn = CLOTHES[body];
  const garments = [...(worn[Math.floor(index / 2) % worn.length] ?? [])];
  const dyes = Object.fromEntries(garments.map((garment) => [garment, DYES[Math.floor(random() * DYES.length)]]));
  return { body, race, tone: random(), outfit: outfit(garments, dyes as Record<string, string>) };
}

/**
 * A plaza's people. `peopleAt` answers where each stands and what they do at a moment of the world clock: the keepers
 * first, at their counters, then the townsfolk at their routines, then Shape while he is here.
 */
export class Townsfolk {
  private readonly keepers: { readonly kind: string; readonly person: Townsperson }[];
  private readonly life: TownLife | null;
  private readonly dresses: readonly Dress[];
  private readonly frame: PlazaFrame;
  /** Shape's number among the plaza's people, after the keepers and the townsfolk. */
  private readonly shapeId: number;

  constructor(plaza: Plaza, seed: number) {
    const random = seeded(seed);
    this.frame = plazaFrameOf(plaza);
    this.keepers = plaza.stations.map((station, index) => ({
      kind: station.kind,
      person: {
        id: index,
        x: station.keeper[0],
        y: station.keeper[1],
        facing: bearingTo(station.keeper, station.counter),
        anim: 'idle',
        dress: keeperOf(station.kind)?.dress ?? dressOf(index, random),
      },
    }));
    this.life = plaza.ways ? new TownLife(plaza.ways, plaza.posts ?? [], seed) : null;
    const count = this.life?.routines.length ?? 0;
    this.dresses = Array.from({ length: count }, (unused, index) => dressOf(index + 1, random));
    this.shapeId = this.keepers.length + count;
  }

  /** Where everyone stands and what they do at world time `worldS`, seconds: the keepers at their counters, the
   *  townsfolk, and Shape at his spot while he is here, idle, facing the plaza's middle. */
  peopleAt(worldS: number, { shape = null }: PlazaNow = {}): Townsperson[] {
    const people = this.keepers.map((keeper) => keeper.person);
    (this.life?.everyoneAt(worldS) ?? []).forEach(({ place, facing, anim }, index) => {
      const id = this.keepers.length + index;
      people.push({ id, x: place[0], y: place[1], facing, anim, dress: this.dresses[index] as Dress });
    });
    if (shape) {
      const facing = bearingTo(shape, this.frame.middle);
      people.push({ id: this.shapeId, x: shape[0], y: shape[1], facing, anim: 'idle', dress: KEEPERS.shape.dress });
    }
    return people;
  }
}
