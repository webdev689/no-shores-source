// Going into a patrol's dungeons and out again on foot: what E offers at an entrance's door or a dungeon's exit
// door, and the place a dungeon is played as.
import { askDungeon, courseOf, type DungeonLayout, floorGrid } from './dungeonLayout.ts';
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

/** Stands the movement rules and the fight's on a dungeon's floor, as its room stands its bodies: its grid of
 *  heights and its boxes. */
export function standInDungeon(movement: MovementRules, combat: CombatRules, layout: DungeonLayout): void {
  const course = courseOf(layout);
  movement.setCourse(course);
  combat.setCourse(course);
  combat.setGround(null);
  if (!movement.setHeights(floorGrid(layout))) throw new Error('the dungeon’s floor did not load');
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
 *  exit door; on a patrol, "Enter" and the dungeon's name within reach of an entrance's door. */
export function tripAt(
  x: number,
  y: number,
  here: { dungeon: InDungeon | null; patrol: NodeInfo; entrances: Entrances; module: WebAssembly.Module },
  trips: Trips,
): Use | null {
  const { dungeon } = here;
  if (dungeon) {
    const door = dungeon.layout.exitDoor;
    return Math.hypot(door.x - x, door.y - y) <= DOOR_REACH_M ? { words: 'Leave', run: () => trips.leave() } : null;
  }
  const props = trips.props();
  if (here.patrol.kind !== 'patrol' || !props) return null;
  const number = entranceAt(here.entrances.entrances, props, x, y);
  if (number === null) return null;
  const name = here.entrances.nameOf(here.module, here.patrol, number);
  return { words: `Enter ${name}`, run: () => trips.enter(number, name) };
}
