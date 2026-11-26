// Going into a dungeon and out again on foot: what E offers at a patrol's or an Elite Dungeon's entrance's door or a
// dungeon's exit door, and the place a dungeon is played as.
import { runAsk } from '../../../server/roomNames.ts';
import { EVENT } from '../combat/cues.ts';
import type { Difficulty } from '../heldmap/heldMap.ts';
import { roomNow } from '../sky/worldClock.ts';
import type { GearAsk } from '../network/gearMessages.ts';
import { RoomThread } from '../network/roomThread.ts';
import type { Reviving, SeenShip } from '../network/messages.ts';
import type { EncounterSeen } from '../network/encounterMessages.ts';
import type { PassageSeenState } from '../network/passageMessages.ts';
import type { BreachSeen } from '../network/breachMessages.ts';
import { TIERS } from './activityWords.ts';
import { askDungeon, type DungeonAsk, type DungeonLayout } from './dungeonLayout.ts';
import { cacheOf } from './dungeonChest.ts';
import { DOOR_REACH_M, type Entrance, entranceAt, entrancesOf } from './entrances.ts';
import type { PropTable } from '../models/tables.ts';
import type { CombatRules } from '../rules/combatRules.ts';
import type { Block, MovementRules } from '../rules/movementRules.ts';
import { type Speak, type Use, useAt } from './footGear.ts';
import type { GearHere } from './gearScreen.ts';
import type { Heard, Held } from './footPlace.ts';
import type { RoomLink, Snapshot } from '../network/roomConnection.ts';
import type { NodeInfo } from './worldData.ts';

/** A dungeon the player plays in: the place outside it (a patrol, an Elite Dungeon's node, or a sea island's
 *  `seaPlace`), its number among that place's entrances, the ask it is laid by, its room's name, and its layout. */
export interface InDungeon {
  readonly patrol: NodeInfo;
  readonly number: number;
  readonly ask: DungeonAsk;
  readonly room: string;
  readonly layout: DungeonLayout;
  /** A passage zone under ground: its layout's exit is its way in, and no way out. */
  readonly passage?: boolean;
}

/** What going in and out asks of the game: the forged props' table once read, and the ways in and out: a dungeon's,
 *  and a Breach's run's from its gate and back to it. */
export interface Trips {
  props(): PropTable | null;
  enter(number: number, name: string): void;
  leave(): void;
  /** Into the guild dungeon behind an outpost's Delve Gate (`dungeonTrips.ts`), where the page has the way. */
  enterDelve?(
    key: string,
    tier: number,
    gate: { readonly x: number; readonly y: number; readonly facing: number },
  ): void;
  enterBreach?(): void;
  leaveBreach?(): void;
  /** Says a word of the Breach's to the player: a refusal, a moment. */
  tell?(words: string): void;
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
 *  an Elite Dungeon's encounters, the room's darkness and revives under way, and a Breach, in its run or at its gate. */
export function heardRun(
  held: Pick<Held, 'revives' | 'wiped' | 'encounter' | 'darkness' | 'reviving' | 'breach'>,
  snapshot: Pick<Snapshot, 'revives' | 'events' | 'encounter' | 'darkness' | 'reviving'> & {
    readonly breach?: BreachSeen | null;
  },
  own: number | null,
): void {
  [held.revives, held.darkness, held.reviving] = [snapshot.revives, snapshot.darkness, snapshot.reviving];
  held.encounter = snapshot.encounter;
  held.breach = snapshot.breach ?? null;
  if (snapshot.events.some((event) => event.kind === EVENT.wiped && event.defender === own)) held.wiped = true;
}

/** What the page hears of a node's or a dungeon's room, filling `held`: each snapshot (its cache and its run's word,
 *  `own` the fight's player once it stands), and the room's word on the gear: online the player's own; offline it
 *  tells only of the patrol's entrances and the chests, the figure keeping its dress. */
export function hearRoom(
  held: Held,
  own: () => number | null,
  received: (snapshot: Snapshot) => void,
  { online, asks }: { readonly online: boolean; readonly asks: boolean },
): Heard {
  return {
    snapshot: (snapshot) => {
      received(snapshot);
      held.cache = cacheOf(snapshot.cache);
      heardRun(held, snapshot, own());
      held.plots = snapshot.outpost;
      held.ships = snapshot.ships;
      held.passage = snapshot.passage ?? null;
    },
    gear: (sent) => {
      if (online) held.gear = sent;
      else held.alone = sent;
      held.entrances.heard(sent.dungeons);
    },
    asks,
  };
}

/** Whether the room said this player's company fell, taken once and only on foot (`onFoot`): a trip's veil refuses the
 *  way out, so a fall heard behind it waits for the place. */
export function takeWipe(held: { wiped: boolean }, onFoot: boolean): boolean {
  if (!onFoot) return false;
  const wiped = held.wiped;
  held.wiped = false;
  return wiped;
}

/** A dungeon's room played alone, in the rooms' worker: a patrol's shared dungeon from the patrol's node file at the
 *  voyage's `seas`, any other room (a run, a sea island's dungeon) from its name, which carries its tier, a patrol's run
 *  with the patrol's file too, as the servers open them (`runAsk`). */
export function openAlone(
  module: WebAssembly.Module,
  outsideText: string,
  into: { readonly number: number; readonly room: string },
  heard: Heard,
  seas: Difficulty = 'normal',
): Promise<RoomThread> {
  const ask = runAsk(into.room, Math.floor(roomNow() / 60_000));
  const tier = Math.max(0, TIERS.indexOf(seas));
  return ask === null
    ? RoomThread.openDungeon(module, outsideText, into.number, heard.snapshot, heard.gear, tier)
    : RoomThread.openRun(module, ask, outsideText, heard.snapshot, heard.gear);
}

/** Stands the fight's rules on the dungeon an ask names as its room stands its bodies, on the dungeon's own ground;
 *  the movement rules, which only find the floor, on open ground at 0 m with no course. */
export function standInDungeon(movement: MovementRules, combat: CombatRules, ask: DungeonAsk): void {
  movement.setCourse([]);
  movement.setGround(null);
  if (!combat.setDungeon(ask)) throw new Error('the dungeon’s ground did not load');
}

/** A passage zone under ground as a dungeon's way in takes it: its ask (`passageAsk`'s JSON), the blocks seen of it
 *  (its walls and pieces) and how its room is joined. */
export interface PassageInto {
  readonly ask: string;
  readonly blocks: readonly Block[];
  link(heard: Heard, session: string | null): Promise<RoomLink>;
}

/** Stands the fight's rules on the passage zone an ask names as its room stands bodies (`setPassage`); the movement
 *  rules, which only find the floor, on open ground at 0 m among `blocks`. */
export function standInPassage(movement: MovementRules, combat: CombatRules, passage: PassageInto): void {
  movement.setGround(null);
  movement.setCourse(passage.blocks);
  if (!combat.setPassage(passage.ask)) throw new Error('the passage’s ground did not load');
}

/** A patrol's entrances as its room last gave them, and each one's dungeon's name, asked of the room's module once:
 *  as the entrances are heard, once `namesFrom` says from which module and patrol, so the dungeon a name is forged
 *  from is forged behind the arrival's veil rather than as a player first reaches its door. */
export class Entrances {
  private numbers: readonly number[] = [];
  private names = new Map<number, string>();
  private namer: ((number: number) => void) | null = null;
  entrances: readonly Entrance[] = [];

  /** Takes the entrances' numbers from the room's word on the player's gear, naming each. */
  heard(numbers: readonly number[] | undefined): void {
    if (!numbers || numbers === this.numbers || numbers.join() === this.numbers.join()) return;
    this.numbers = numbers;
    this.entrances = entrancesOf(numbers);
    for (const number of this.entrances.keys()) this.namer?.(number);
  }

  /** Names each entrance's dungeon from `module` as it is heard, those heard already at once. */
  namesFrom(module: WebAssembly.Module, patrol: NodeInfo): void {
    this.namer = (number) => void this.nameOf(module, patrol, number);
    for (const number of this.entrances.keys()) this.namer?.(number);
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
 *  exit door, or of its return portal while that stands open, and none in a passage zone; on a patrol or an Elite
 *  Dungeon's node, "Enter" and the dungeon's name within reach of an entrance's door. */
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
  if (dungeon?.passage) return null;
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

/** What a room has said of a place before it says anything: no entrances, no cache, no run, no encounters, no plot,
 *  no Breach. */
export const unheard = () => ({
  entrances: new Entrances(),
  cache: null,
  revives: -1,
  wiped: false,
  darkness: false,
  reviving: [] as readonly Reviving[],
  encounter: null as EncounterSeen | null,
  plots: 0,
  passage: null as PassageSeenState | null,
  breach: null as BreachSeen | null,
  ships: [] as readonly SeenShip[],
});
