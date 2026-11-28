// A social space's life on foot: its keepers and townsfolk (`townsfolk.ts`) placed among the figures drawn, set each
// frame where the world clock has them, standing on the plaza's floor at their moves; and the station a player stands
// at, whose counter offers what it deals in, the bounty board's among them. A ruin's plaza keeps no station (the city
// crate's `ruins`), and no one lives there. A patrol zone's folk (`zoneFolk.ts`) are placed the same way.

import type { GearState } from '../network/gearMessages.ts';
import type { Placed } from '../player/figures.ts';
import type { Others } from '../player/others.ts';
import type { Block } from '../rules/movementRules.ts';
import type { Opening } from './gearScreen.ts';
import { HARBOURMASTER, KEEPERS, KEEPER_KINDS } from './keepers.ts';
import type { StationInfo } from './nodes.ts';
import { Townsfolk, plazaOf, shapeSpot } from './townsfolk.ts';
import type { NodeInfo } from './worldData.ts';
import { ZoneFolk } from './zoneFolk.ts';

/** How near a counter a player stands to be served, metres. */
export const SERVED_M = 3;

/** What a station's counter opens in the menu, and its words. */
export interface Offer {
  readonly words: string;
  readonly opens: Opening;
}

/** What each station that deals with a player offers: its keeper's screen, named by its keeper's title, the
 *  Harbourmaster's, and the bounty board's, which no keeper keeps. Shape keeps no station; his prompt is the plaza's
 *  own. */
const OFFERS: Readonly<Record<string, Offer>> = {
  ...Object.fromEntries(
    KEEPER_KINDS.filter((kind) => kind !== 'shape').map((kind) => [
      kind,
      { words: KEEPERS[kind].title, opens: { view: kind } },
    ]),
  ),
  harbourmaster: { words: HARBOURMASTER, opens: { view: 'harbourmaster' } },
  board: { words: 'The Bounty Board: the day’s bounties', opens: { view: 'board' } },
};

/** Where a social space serves a player, as its marks and E read it: each station's counter with the bounty board
 *  where it is read, which no keeper keeps, its mark over the board itself where its node says where that stands; and
 *  where Shape may stand. */
export function countersOf(
  node: Pick<NodeInfo, 'stations' | 'board' | 'boardAt' | 'visitorSpots'>,
): Pick<NodeInfo, 'stations' | 'visitorSpots'> {
  const board = node.board ? [{ kind: 'board', keeper: node.boardAt ?? node.board, counter: node.board }] : [];
  return { stations: [...(node.stations ?? []), ...board], visitorSpots: node.visitorSpots ?? [] };
}

/** What a station's keeper is called, as their counter offers them; null for a station that deals with no one. */
export const stationWords = (kind: string): string | null => OFFERS[kind]?.words ?? null;

/** The offer of the station whose counter a player stands at, if one deals with them. */
export function offerAt(stations: readonly StationInfo[], x: number, y: number): Offer | null {
  for (const station of stations) {
    const offer = OFFERS[station.kind];
    if (offer && Math.hypot(station.counter[0] - x, station.counter[1] - y) <= SERVED_M) return offer;
  }
  return null;
}

/** How far a person walks before the floor under them is found again, in metres. */
const FLOOR_STEP_M = 0.5;

/** The movement crate's step, metres: a body climbs a block's top this far above its feet. */
const CLIMB_M = 0.5;

/** The floor a placed figure stands on at (x, y): over the ground (`standing`, as the movement rules stand a body),
 *  on the highest top of the blocks under it whose underside is within a step of that floor, climbed in turn. A
 *  podium or a landing a plaza's ways lead onto is stood on; a roof or a bridge overhead is not. A figure inside a
 *  block from the ground up would stand on its top: a plaza's people and places keep clear of its solids. */
export function floorOver(
  blocks: readonly Block[],
  standing: (x: number, y: number) => number,
): (x: number, y: number) => number {
  return (x, y) => {
    const under = blocks.filter((b) => x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY);
    for (let z = standing(x, y); ;) {
      const climbed = under.reduce((top, b) => (b.top > top && b.bottom <= z + CLIMB_M ? b.top : top), z);
      if (climbed === z) return z;
      z = climbed;
    }
  };
}

/** The figures of a social space's people, or a patrol zone's folk, kept among those drawn while the player is here. */
export class PlazaLife {
  private readonly folk: Pick<Townsfolk, 'peopleAt'> | null;
  private readonly figures = new Map<number, Placed>();
  /** Where each person's floor was last found: it is found again only once they have walked a step from there. */
  private readonly floored = new Map<number, readonly [number, number]>();
  private readonly others: Others;
  private readonly floor: (x: number, y: number) => number | null;
  private readonly visitorSpots: readonly (readonly [number, number])[];

  constructor(node: NodeInfo, others: Others, floor: (x: number, y: number) => number | null) {
    const plaza = plazaOf(node);
    // Seeded by the plaza, so its people are the same each visit and in every browser.
    // A ruin's plaza keeps no station, and no one lives there.
    const seed = Math.round(plaza.bounds[0] * 31 + plaza.bounds[1]);
    const zone = node.folk?.length ? new ZoneFolk(node.folk, node.paths ?? []) : null;
    this.folk = node.stations?.length ? new Townsfolk(plaza, seed) : zone;
    this.visitorSpots = plaza.visitorSpots ?? [];
    this.others = others;
    this.floor = floor;
  }

  /** Places everyone's figures where they are at world time `worldS`, seconds: Shape among them while the room's
   *  `gear` says he is here. */
  frame(worldS: number, gear: GearState | null = null): void {
    const shape = shapeSpot(gear?.shape, this.visitorSpots);
    const here = new Set<number>();
    for (const person of this.folk?.peopleAt(worldS, { shape }) ?? []) {
      here.add(person.id);
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
      placed.anim = person.anim;
    }
    for (const [id, placed] of this.figures) {
      if (here.has(id)) continue;
      this.others.remove(placed);
      this.figures.delete(id);
      this.floored.delete(id);
    }
  }

  /** Takes every figure away, as the player leaves. */
  close(): void {
    for (const placed of this.figures.values()) this.others.remove(placed);
    this.figures.clear();
    this.floored.clear();
  }
}
