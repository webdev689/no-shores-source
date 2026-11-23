// Going into a dungeon and out again on foot: what E offers at a patrol's or an Elite Dungeon's entrance's door or a
// dungeon's exit door, and the place a dungeon is played as.
import { runAsk } from '../../../server/roomNames.ts';
import { EVENT } from '../combat/cues.ts';
import { roomNow } from '../sky/worldClock.ts';
import type { GearAsk } from '../network/gearMessages.ts';
import { RoomThread } from '../network/roomThread.ts';
import type { FightEvent } from '../network/messages.ts';
import type { EncounterSeen } from '../network/encounterMessages.ts';
import { askDungeon, type DungeonAsk, type DungeonLayout } from './dungeonLayout.ts';
import { DOOR_REACH_M, type Entrance, entranceAt, entrancesOf } from './entrances.ts';
import type { PropTable } from '../models/tables.ts';
import type { CombatRules } from '../rules/combatRules.ts';
import type { MovementRules } from '../rules/movementRules.ts';
import { type Speak, type Use, useAt } from './footGear.ts';
import type { GearHere } from './gearScreen.ts';
import type { Heard } from './footPlace.ts';
import type { NodeInfo } from './worldData.ts';

/** A dungeon the player plays in: the place outside it (a patrol, an Elite Dungeon's node, or a sea island's
 *  `seaPlace`), its number among that place's entrances, the ask it is laid by, its room's name, and its layout. */
export interface InDungeon {
  readonly patrol: NodeInfo;
  readonly number: number;
  readonly ask: DungeonAsk;
  readonly room: string;
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

/** The place outside a sea island's dungeon, as a trip reads a patrol's: no place on land, its continent's climate. */
export function seaPlace(continent: string, layout: DungeonLayout): NodeInfo {
  return { id: 'sea-dungeon', kind: 'dungeon', name: layout.name, continent, ring: [], spawns: [], centre: [0, 0] };
}

/** Takes a run's word from a snapshot: an Abyss run's revives left, whether it told this player their company fell,
 *  and an Elite Dungeon's encounters. */
export function heardRun(
  held: { revives: number; wiped: boolean; encounter: EncounterSeen | null },
  snapshot: {
    readonly revives: number;
    readonly events: readonly FightEvent[];
    readonly encounter: EncounterSeen | null;
  },
  own: number | null,
): void {
  held.revives = snapshot.revives;
  held.encounter = snapshot.encounter;
  if (snapshot.events.some((event) => event.kind === EVENT.wiped && event.defender === own)) held.wiped = true;
}

/** Whether the room said this player's company fell, taken once and only on foot (`onFoot`): a trip's veil refuses the
 *  way out, so a fall heard behind it waits for the place. */
export function takeWipe(held: { wiped: boolean }, onFoot: boolean): boolean {
  if (!onFoot) return false;
  const wiped = held.wiped;
  held.wiped = false;
  return wiped;
}

/** A dungeon's room played alone, in the rooms' worker: a patrol's shared dungeon from the patrol's node file, any
 *  other room (a run, a sea island's dungeon) from its name, a patrol's run with the patrol's file too, as the servers
 *  open them (`runAsk`). */
export function openAlone(
  module: WebAssembly.Module,
  outsideText: string,
  into: { readonly number: number; readonly room: string },
  heard: Heard,
): Promise<RoomThread> {
  const ask = runAsk(into.room, Math.floor(roomNow() / 60_000));
  return ask === null
    ? RoomThread.openDungeon(module, outsideText, into.number, heard.snapshot, heard.gear)
    : RoomThread.openRun(module, ask, outsideText, heard.snapshot, heard.gear);
}

/** Stands the fight's rules on the dungeon an ask names as its room stands its bodies, on the dungeon's own ground;
 *  the movement rules, which only find the floor, on open ground at 0 m with no course. */
export function standInDungeon(movement: MovementRules, combat: CombatRules, ask: DungeonAsk): void {
  movement.setCourse([]);
  movement.setGround(null);
  if (!combat.setDungeon(ask)) throw new Error('the dungeon’s ground did not load');
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

  /** The dungeon's name behind entrance `number`: an Elite Dungeon's node's own, or a patrol's dungeon's. */
  nameOf(module: WebAssembly.Module, patrol: NodeInfo, number: number): string {
    if (patrol.kind === 'dungeon') return patrol.name;
    const known = this.names.get(number);
    if (known) return known;
    const named = askDungeon(module, patrol.id, patrol.name, number).name;
    this.names.set(number, named);
    return named;
  }
}

/** What E offers about going in and out where a player stands at (x, y): in a dungeon, "Leave" within reach of its
 *  exit door, or of its return portal while that stands open; on a patrol or an Elite Dungeon's node, "Enter" and the
 *  dungeon's name within reach of an entrance's door. */
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
  if ((here.patrol.kind !== 'patrol' && here.patrol.kind !== 'dungeon') || !props) return null;
  const number = entranceAt(here.entrances.entrances, props, x, y);
  if (number === null) return null;
  const name = here.entrances.nameOf(here.module, here.patrol, number);
  return { words: `Enter ${name}`, run: () => trips.enter(number, name) };
}

/** What E does at (x, y) on foot: the place's own use, else a counter's within reach (the board's among them; its
 *  keeper spoken with where `speak` says so) or a node's, none on horseback (`mounted`), else a way in or out of a
 *  dungeon. */
export function useOnFoot(
  x: number,
  y: number,
  place: Use | null,
  counters: Parameters<typeof useAt>[2],
  gear: GearHere | null,
  here: Parameters<typeof tripAt>[2],
  trips: Trips,
  speak?: Speak,
  mounted = false,
): Use | null {
  const ask = (asked: GearAsk) => gear?.ask(asked);
  return place ?? useAt(x, y, counters, gear?.gear ?? null, ask, speak, mounted) ?? tripAt(x, y, here, trips);
}

/** What a room has said of a place before it says anything: no entrances, no cache, no run, no encounters. */
export const unheard = () => ({
  entrances: new Entrances(),
  cache: null,
  revives: -1,
  wiped: false,
  encounter: null as EncounterSeen | null,
});
