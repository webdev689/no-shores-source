// The people of a social space, as the Tower's: a keeper behind each station's counter, and townsfolk walking the
// plaza's open lanes, stopping at the stations and at the seaward parapet to look over the city. Seeded, so a visit's
// people move the same however its frames fall. Each walks only the lanes the courtyard leaves clear: before the
// arcades, either side of the obelisk's plinth and its braziers, and inside the benches; to a counter and back, along
// the landward lane to its column first, so no one crosses the portico's steps.

import type { Dress, Race } from '../player/dressing.ts';
import type { Outfit } from '../forge/outfit.ts';
import { KEEPERS, keeperOf } from './keepers.ts';
import { type StationInfo, bearingTo } from './nodes.ts';
import type { NodeInfo } from './worldData.ts';

type Point = readonly [number, number];

/** How many townsfolk walk a plaza, their pace (metres a second), and how long they stand at each kind of stop. */
export const WALKERS = 14;
const WALK_M_S = 1.25;
const PAUSE_S = { lane: [1, 5], station: [6, 14], view: [8, 16] } as const;
/** The lane before the arcades, metres toward the sea: clear of the portico's steps. */
export const LANDWARD_LANE = -38;
/** The lanes, in the plaza's own frame: metres toward the sea from its middle, and metres across it. Clear of the
 *  portico's steps, the obelisk's plinth and braziers, and the benches. */
export const TOWARD = [LANDWARD_LANE, -14, 14, 34] as const;
export const ACROSS = [-110, -70, -20, 20, 70, 110] as const;
/** Where a customer stands before a counter, and a looker at the parapet, metres toward the sea. */
export const AT_COUNTER = -48.5;
export const AT_PARAPET = 52;
/** How often a walker on the landward lane goes to a station, and on the seaward lane to the parapet. */
const TO_STATION = 0.3;
const TO_VIEW = 0.25;

/** One of the plaza's people as drawn: their number among them, where they stand and face, whether walking, and
 *  their dress. */
export interface Townsperson {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly facing: number;
  readonly walking: boolean;
  readonly dress: Dress;
}

/** What a plaza is to its people: its bounds (west, north, east, south), spawns and stations, and the places Shape
 *  may stand on his weekends, one a week. */
export interface Plaza {
  readonly bounds: readonly [number, number, number, number];
  readonly spawns: readonly Point[];
  readonly stations: readonly StationInfo[];
  readonly visitorSpots?: readonly Point[];
}

/** The keepers away from their counters while a scene of their own walks them round the plaza (the elder's welcome),
 *  by their station's kind: the plaza leaves their place empty, so no one is drawn twice. A page walks one plaza. */
export const awayFromCounters = new Set<string>();

/** What a plaza's people step by besides the time: the keepers away from their counters, and where Shape stands, if
 *  he is here. */
export interface PlazaNow {
  readonly away?: ReadonlySet<string>;
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

/** A social space's plaza, from its node: its ring's bounds, spawns, stations and visitor spots. */
export function plazaOf(node: Pick<NodeInfo, 'ring' | 'spawns' | 'stations' | 'visitorSpots'>): Plaza {
  const eastings = node.ring.map((point) => point[0]);
  const southings = node.ring.map((point) => point[1]);
  const bounds = [
    Math.min(...eastings),
    Math.min(...southings),
    Math.max(...eastings),
    Math.max(...southings),
  ] as const;
  return { bounds, spawns: node.spawns, stations: node.stations ?? [], visitorSpots: node.visitorSpots ?? [] };
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

const outfit = (garments: string[], dyes: Record<string, string>, armour: Outfit['armour'] = {}): Outfit => ({
  armour,
  garments,
  dyes,
  right: null,
  left: null,
  drawn: false,
  hair: { style: 'crop', colour: 'brown' },
});

/** The dress of a station's keeper who deals with no one (the keepers who do wear their own, `keepers.ts`): what
 *  they deal in shows in what they wear. A garment a body is not drawn in is passed over, so each lists one for
 *  either body. */
const OTHER_KEEPERS: Readonly<Record<string, Outfit>> = {
  harbourmaster: outfit(['shirt_long_v', 'formal_tunic', 'formal_eodoric', 'breeches', 'tall_boots', 'formal_cloak'], {
    formal_tunic: 'Blue',
    formal_eodoric: 'Blue',
    formal_cloak: 'Blue',
  }),
};
/** The townsfolk's clothes, worn in turn and dyed in turn. */
const CLOTHES: readonly (readonly string[])[] = [
  ['shirt_long_v', 'peasant_blouse', 'breeches', 'long_skirt', 'shoes'],
  ['shirt_short_round', 'vest', 'casual_pants', 'tights', 'sandals'],
  ['shirt_long_round', 'short_tunic', 'casual_dress', 'breeches', 'tall_boots'],
  ['shirt_long_deep', 'day_gown', 'casual_pants', 'shoes', 'casual_cloak'],
];
const DYES = ['White', 'LightBrown', 'DarkBrown', 'Blue', 'Grey', 'Red', 'Green', 'Yellow', 'Purple', 'Aquamarine'];
const RACES: readonly Race[] = ['human', 'human', 'felid', 'human', 'anole'];
const STYLES: Readonly<Record<string, readonly string[]>> = {
  male: ['crop', 'shoulder', 'tied'],
  female: ['long', 'short', 'braid', 'tails'],
};

/** Someone's dress: a body, a race and tone, their clothes in their dyes, and their hair. */
function dressOf(index: number, clothes: Outfit | null, random: () => number): Dress {
  const body = index % 2 === 0 ? 'male' : 'female';
  const race = RACES[index % RACES.length] ?? 'human';
  const styles = STYLES[body] ?? ['crop'];
  const hair = { style: styles[Math.floor(random() * styles.length)] ?? 'crop', colour: 'brown' };
  if (clothes) return { body, race, tone: random(), outfit: { ...clothes, hair } };
  const garments = [...(CLOTHES[index % CLOTHES.length] ?? [])];
  const dyes = Object.fromEntries(garments.map((garment) => [garment, DYES[Math.floor(random() * DYES.length)]]));
  return { body, race, tone: random(), outfit: outfit(garments, dyes as Record<string, string>) };
}

interface Walker {
  readonly id: number;
  readonly dress: Dress;
  at: [number, number];
  /** Where they head on the lanes' grid, or a stop off it, and the grid point they leave the stop by; and the points
   *  still to walk to after `to` before they stop. */
  to: [number, number];
  ahead: [number, number][];
  lane: [number, number];
  pause: number;
  facing: number;
  stop: 'lane' | 'station' | 'view';
}

/**
 * A plaza's people. `step` moves them on by some seconds and answers where each stands: the keepers first, at their
 * counters, then the townsfolk.
 */
export class Townsfolk {
  private readonly random: () => number;
  private readonly keepers: { readonly kind: string; readonly person: Townsperson }[];
  private readonly walkers: Walker[] = [];
  private readonly frame: PlazaFrame;
  private readonly stations: readonly StationInfo[];
  /** Shape's number among the plaza's people, after the keepers and the townsfolk. */
  private readonly shapeId: number;

  constructor(plaza: Plaza, seed: number) {
    this.random = seeded(seed);
    this.frame = plazaFrameOf(plaza);
    this.stations = plaza.stations;
    this.keepers = plaza.stations.map((station, index) => ({
      kind: station.kind,
      person: {
        id: index,
        x: station.keeper[0],
        y: station.keeper[1],
        facing: bearingTo(station.keeper, station.counter),
        walking: false,
        dress: keeperOf(station.kind)?.dress ?? dressOf(index, OTHER_KEEPERS[station.kind] ?? null, this.random),
      },
    }));
    this.shapeId = this.keepers.length + WALKERS;
    for (let index = 0; index < WALKERS; index++) {
      const lane: [number, number] = [this.pick(TOWARD.length), this.pick(ACROSS.length)];
      const start = this.world(TOWARD[lane[0]] ?? 0, ACROSS[lane[1]] ?? 0);
      const walker: Walker = {
        id: this.keepers.length + index,
        dress: dressOf(index + 1, null, this.random),
        at: [start[0], start[1]],
        to: [start[0], start[1]],
        ahead: [],
        lane,
        pause: this.random() * PAUSE_S.lane[1],
        facing: this.random() * 2 * Math.PI,
        stop: 'lane',
      };
      this.walkers.push(walker);
    }
  }

  private pick(count: number): number {
    return Math.min(count - 1, Math.floor(this.random() * count));
  }

  /** How far across the plaza a point of the world stands, metres. */
  private acrossOf(point: Point): number {
    return inPlaza(this.frame, point).across;
  }

  /** A point of the plaza's frame in the world. */
  private world(toward: number, across: number): [number, number] {
    return plazaPoint(this.frame, toward, across);
  }

  /** Where a walker heads next from the lane's grid point they stand at: a neighbour on the lanes, or now and then a
   *  station's counter from the landward lane, or the parapet from the seaward one. */
  private next(walker: Walker): void {
    const [row, column] = walker.lane;
    const station = this.stations[this.pick(Math.max(1, this.stations.length))];
    if (row === 0 && station && this.random() < TO_STATION) {
      const across = this.acrossOf(station.counter);
      walker.to = this.world(TOWARD[0], across);
      walker.ahead = [this.world(AT_COUNTER, across)];
      walker.stop = 'station';
      return;
    }
    if (row === TOWARD.length - 1 && this.random() < TO_VIEW) {
      walker.to = this.world(AT_PARAPET, ACROSS[column] ?? 0);
      walker.stop = 'view';
      return;
    }
    const moves: [number, number][] = [
      [row - 1, column],
      [row + 1, column],
      [row, column - 1],
      [row, column + 1],
    ];
    const open = moves.filter(([one, two]) => one >= 0 && one < TOWARD.length && two >= 0 && two < ACROSS.length);
    const lane = open[this.pick(open.length)] ?? [row, column];
    walker.lane = lane;
    walker.to = this.world(TOWARD[lane[0]] ?? 0, ACROSS[lane[1]] ?? 0);
    walker.stop = 'lane';
  }

  /** Moves everyone on by `seconds`, and answers where each stands: the keepers at their counters but those away,
   *  the townsfolk, and Shape at his spot while he is here, idle, facing the plaza's middle. */
  step(seconds: number, { away = new Set(), shape = null }: PlazaNow = {}): Townsperson[] {
    const people = this.keepers.filter((keeper) => !away.has(keeper.kind)).map((keeper) => keeper.person);
    for (const walker of this.walkers) {
      let left = seconds;
      let walking = false;
      while (left > 0) {
        if (walker.pause > 0) {
          const waited = Math.min(walker.pause, left);
          walker.pause -= waited;
          left -= waited;
          continue;
        }
        const [east, south] = [walker.to[0] - walker.at[0], walker.to[1] - walker.at[1]];
        const distance = Math.hypot(east, south);
        if (distance < 1e-6) {
          const onward = walker.ahead.shift();
          if (onward) {
            walker.to = onward;
            continue;
          }
          if (walker.stop !== 'lane') {
            // Back to the lane they left by, after a while at the counter or the parapet.
            const [low, high] = PAUSE_S[walker.stop];
            walker.pause = low + this.random() * (high - low);
            const { seaward } = this.frame;
            walker.facing = walker.stop === 'view' ? bearingTo([0, 0], seaward) : bearingTo(seaward, [0, 0]);
            const back = this.world(TOWARD[walker.lane[0]] ?? 0, ACROSS[walker.lane[1]] ?? 0);
            // From a counter, back up to the landward lane at its column before along it.
            walker.to = walker.stop === 'station' ? this.world(TOWARD[0], this.acrossOf(walker.at)) : back;
            walker.ahead = walker.stop === 'station' ? [back] : [];
            walker.stop = 'lane';
          } else {
            walker.pause = PAUSE_S.lane[0] + this.random() * (PAUSE_S.lane[1] - PAUSE_S.lane[0]);
            this.next(walker);
          }
          continue;
        }
        const stride = Math.min(distance, WALK_M_S * left);
        walker.at = [walker.at[0] + (east / distance) * stride, walker.at[1] + (south / distance) * stride];
        walker.facing = Math.atan2(east, -south);
        left -= stride / WALK_M_S;
        walking = true;
      }
      const [x, y] = walker.at;
      people.push({ id: walker.id, x, y, facing: walker.facing, walking, dress: walker.dress });
    }
    if (shape) {
      const facing = bearingTo(shape, this.frame.middle);
      people.push({ id: this.shapeId, x: shape[0], y: shape[1], facing, walking: false, dress: KEEPERS.shape.dress });
    }
    return people;
  }
}
