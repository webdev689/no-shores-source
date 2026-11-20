// A social space's life on foot: its keepers and townsfolk (`townsfolk.ts`) placed among the figures drawn, moved each
// frame, standing on the plaza's floor; and the station a player stands at, whose counter offers what it deals in.

import type { Placed } from '../player/figures.ts';
import type { Others } from '../player/others.ts';
import type { Opening } from './gearScreen.ts';
import { KEEPERS, KEEPER_KINDS } from './keepers.ts';
import type { StationInfo } from './nodes.ts';
import { Townsfolk } from './townsfolk.ts';
import type { NodeInfo } from './worldData.ts';

/** How near a counter a player stands to be served, metres. */
export const SERVED_M = 3;

/** What a station's counter opens in the menu, and its words. */
export interface Offer {
  readonly words: string;
  readonly opens: Opening;
}

/** What each station that deals with a player offers: its keeper's screen, named by its keeper's title. Shape keeps
 *  no station; his prompt is the plaza's own. */
const OFFERS: Readonly<Record<string, Offer>> = Object.fromEntries(
  KEEPER_KINDS.filter((kind) => kind !== 'shape').map((kind) => [
    kind,
    { words: KEEPERS[kind].title, opens: { view: kind } },
  ]),
);

/** The offer of the station whose counter a player stands at, if one deals with them. */
export function offerAt(stations: readonly StationInfo[], x: number, y: number): Offer | null {
  for (const station of stations) {
    const offer = OFFERS[station.kind];
    const near = Math.hypot(station.counter[0] - x, station.counter[1] - y) <= SERVED_M;
    if (offer && near) return offer;
  }
  return null;
}

/** How far a person walks before the floor under them is found again, in metres. */
const FLOOR_STEP_M = 0.5;

/** The figures of a social space's people, kept among those drawn while the player is there. */
export class PlazaLife {
  private readonly folk: Townsfolk;
  private readonly figures = new Map<number, Placed>();
  /** Where each person's floor was last found: it is found again only once they have walked a step from there. */
  private readonly floored = new Map<number, readonly [number, number]>();
  private readonly others: Others;
  private readonly floor: (x: number, y: number) => number | null;

  constructor(node: NodeInfo, others: Others, floor: (x: number, y: number) => number | null) {
    const eastings = node.ring.map((point) => point[0]);
    const southings = node.ring.map((point) => point[1]);
    const bounds = [
      Math.min(...eastings),
      Math.min(...southings),
      Math.max(...eastings),
      Math.max(...southings),
    ] as const;
    // Seeded by the plaza, so its people walk the same each visit.
    const seed = Math.round(bounds[0] * 31 + bounds[1]);
    this.folk = new Townsfolk({ bounds, spawns: node.spawns, stations: node.stations ?? [] }, seed);
    this.others = others;
    this.floor = floor;
  }

  /** Moves everyone on by `seconds` and places their figures. */
  frame(seconds: number): void {
    for (const person of this.folk.step(seconds)) {
      const placed = this.figures.get(person.id) ?? this.others.place(person.dress, person.x, person.y, person.facing);
      this.figures.set(person.id, placed);
      placed.x = person.x;
      placed.y = person.y;
      const [floorX, floorY] = this.floored.get(person.id) ?? [Infinity, Infinity];
      if (Math.hypot(person.x - floorX, person.y - floorY) > FLOOR_STEP_M) {
        placed.z = this.floor(person.x, person.y) ?? placed.z;
        this.floored.set(person.id, [person.x, person.y]);
      }
      placed.facing = person.facing;
      placed.anim = person.walking ? 'walk' : 'idle';
    }
  }

  /** Takes every figure away, as the player leaves. */
  close(): void {
    for (const placed of this.figures.values()) this.others.remove(placed);
    this.figures.clear();
    this.floored.clear();
  }
}
