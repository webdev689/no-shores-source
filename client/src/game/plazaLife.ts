// A social space's life on foot: its keepers and townsfolk (`townsfolk.ts`) placed among the figures drawn, moved each
// frame, standing on the plaza's floor; and the station a player stands at, whose counter offers what it deals in, the
// bounty board's among them. A ruin's plaza keeps no station (the city crate's `ruins`), and no one lives there.

import type { GearState } from '../network/gearMessages.ts';
import type { Placed } from '../player/figures.ts';
import type { Others } from '../player/others.ts';
import type { Opening } from './gearScreen.ts';
import { HARBOURMASTER, KEEPERS, KEEPER_KINDS } from './keepers.ts';
import type { StationInfo } from './nodes.ts';
import { Townsfolk, awayFromCounters, plazaOf, shapeSpot } from './townsfolk.ts';
import type { NodeInfo } from './worldData.ts';

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
  board: { words: 'The Bounty Board: bounties for XP and Aurem', opens: { view: 'board' } },
};

/** Where a social space serves a player, as its rings and E read it: each station's counter with the bounty board
 *  where it stands, which no keeper keeps, and where Shape may stand. */
export function countersOf(
  node: Pick<NodeInfo, 'stations' | 'board' | 'visitorSpots'>,
): Pick<NodeInfo, 'stations' | 'visitorSpots'> {
  const board = node.board ? [{ kind: 'board', keeper: node.board, counter: node.board }] : [];
  return { stations: [...(node.stations ?? []), ...board], visitorSpots: node.visitorSpots ?? [] };
}

/** The offer of the station whose counter a player stands at, if one deals with them. */
export function offerAt(stations: readonly StationInfo[], x: number, y: number): Offer | null {
  for (const station of stations) {
    const offer = OFFERS[station.kind];
    // A keeper away from their counter (the elder on her welcome) is called back to it as it is opened.
    if (offer && Math.hypot(station.counter[0] - x, station.counter[1] - y) <= SERVED_M) return offer;
  }
  return null;
}

/** How far a person walks before the floor under them is found again, in metres. */
const FLOOR_STEP_M = 0.5;

/** The figures of a social space's people, kept among those drawn while the player is there. */
export class PlazaLife {
  private readonly folk: Townsfolk | null;
  private readonly figures = new Map<number, Placed>();
  /** Where each person's floor was last found: it is found again only once they have walked a step from there. */
  private readonly floored = new Map<number, readonly [number, number]>();
  private readonly others: Others;
  private readonly floor: (x: number, y: number) => number | null;
  private readonly visitorSpots: readonly (readonly [number, number])[];

  constructor(node: NodeInfo, others: Others, floor: (x: number, y: number) => number | null) {
    const plaza = plazaOf(node);
    // Seeded by the plaza, so its people walk the same each visit.
    // A ruin's plaza keeps no station, and no one lives there.
    this.folk = node.stations?.length ? new Townsfolk(plaza, Math.round(plaza.bounds[0] * 31 + plaza.bounds[1])) : null;
    this.visitorSpots = plaza.visitorSpots ?? [];
    this.others = others;
    this.floor = floor;
  }

  /** Moves everyone on by `seconds` and places their figures: Shape among them while the room's `gear` says he is
   *  here, and a keeper away from their counter taken from it. */
  frame(seconds: number, gear: GearState | null = null): void {
    const shape = shapeSpot(gear?.shape, this.visitorSpots);
    const here = new Set<number>();
    for (const person of this.folk?.step(seconds, { away: awayFromCounters, shape }) ?? []) {
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
      placed.anim = person.walking ? 'walk' : 'idle';
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
