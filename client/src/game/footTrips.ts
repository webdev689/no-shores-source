// Going into a patrol's dungeons and out again on foot: what E offers at an entrance's door or a dungeon's exit
// door, and the place a dungeon is played as.
import { askDungeon, type DungeonLayout } from './dungeonLayout.ts';
import { DOOR_REACH_M, type Entrance, entranceAt, entrancesOf } from './entrances.ts';
import type { PropTable } from '../models/tables.ts';
import type { CombatRules } from '../rules/combatRules.ts';
import type { MovementRules } from '../rules/movementRules.ts';
import type { Use } from './footGear.ts';
import type { NodeInfo } from './worldData.ts';

/** A dungeon the player plays in: its patrol, its number among the patrol's, and its layout. */
export interface InDungeon {
  readonly patrol: NodeInfo;
  readonly number: number;
  readonly layout: DungeonLayout;
}

/** What going in and out asks of the game: the forged props' table once read, and the ways in and out. */
export interface Trips {
  props(): PropTable | null;
  enter(number: number, name: string): void;
  leave(): void;
}

/** The name of the room a point stands in, or null in a corridor or past the grid: "the Ossuary". */
export function roomNameAt(layout: DungeonLayout, { x, y }: { readonly x: number; readonly y: number }): string | null {
  const [column, row] = [Math.floor(x / layout.cell), Math.floor(y / layout.cell)];
  if (column < 0 || row < 0 || column >= layout.columns || row >= layout.rows) return null;
  const room = layout.cells[row * layout.columns + column] ?? -1;
  return room >= 0 ? (layout.rooms[room]?.name ?? null) : null;
}

/** A dungeon as a place on foot: named for itself, its section the whole of its grid, its one spawn the way in. */
export function dungeonPlace(patrol: NodeInfo, layout: DungeonLayout): NodeInfo {
  const [east, south] = [layout.columns * layout.cell, layout.rows * layout.cell];
  const { x, y } = layout.arrival;
  return {
    id: patrol.id,
    kind: 'dungeon',
    name: layout.name,
    continent: patrol.continent,
    ring: [
      [0, 0],
      [east, 0],
      [east, south],
      [0, south],
    ],
    spawns: [[x, y]],
    centre: [x, y],
  };
}

/** Stands the fight's rules on dungeon `number` of `patrol` as its room stands its bodies, on the dungeon's own
 *  ground; the movement rules, which only find the floor, on open ground at 0 m with no course. */
export function standInDungeon(movement: MovementRules, combat: CombatRules, patrol: NodeInfo, number: number): void {
  movement.setCourse([]);
  movement.setGround(null);
  if (!combat.setDungeon(patrol.id, patrol.name, number)) throw new Error('the dungeon’s ground did not load');
}

/** A patrol's entrances as its room last gave them, and each one's dungeon's name, asked of the room's module once. */
export class Entrances {
  private numbers: readonly number[] = [];
  private names = new Map<number, string>();
  entrances: readonly Entrance[] = [];

  /** Takes the entrances' numbers from the room's word on the player's gear. */
  heard(numbers: readonly number[] | undefined): void {
    if (!numbers || numbers === this.numbers || numbers.join() === this.numbers.join()) return;
    this.numbers = numbers;
    this.entrances = entrancesOf(numbers);
  }

  /** The dungeon's name behind entrance `number`. */
  nameOf(module: WebAssembly.Module, patrol: NodeInfo, number: number): string {
    const known = this.names.get(number);
    if (known) return known;
    const named = askDungeon(module, patrol.id, patrol.name, number).name;
    this.names.set(number, named);
    return named;
  }
}

/** What E offers about going in and out where a player stands at (x, y): in a dungeon, "Leave" within reach of its
 *  exit door, or of its return portal while that stands open; on a patrol, "Enter" and the dungeon's name within
 *  reach of an entrance's door. */
export function tripAt(
  x: number,
  y: number,
  here: {
    dungeon: InDungeon | null;
    portalOpen: boolean;
    patrol: NodeInfo;
    entrances: Entrances;
    module: WebAssembly.Module;
  },
  trips: Trips,
): Use | null {
  const { dungeon } = here;
  if (dungeon) {
    const { exitDoor, portal } = dungeon.layout;
    const reaches = (door: { x: number; y: number }) => Math.hypot(door.x - x, door.y - y) <= DOOR_REACH_M;
    const out = reaches(exitDoor) || (here.portalOpen && reaches(portal));
    return out ? { words: 'Leave', run: () => trips.leave() } : null;
  }
  const props = trips.props();
  if (here.patrol.kind !== 'patrol' || !props) return null;
  const number = entranceAt(here.entrances.entrances, props, x, y);
  if (number === null) return null;
  const name = here.entrances.nameOf(here.module, here.patrol, number);
  return { words: `Enter ${name}`, run: () => trips.enter(number, name) };
}
