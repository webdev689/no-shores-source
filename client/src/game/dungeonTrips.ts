// Going into a dungeon and out again: a patrol's or an Elite Dungeon's from its node's entrance, back out before the
// door the player went in by, facing away from it; a sea island's from its door on the sea, back out onto the island;
// and a run launched or found from the Playlist, from the sea and back out onto it where the ship lies. Every dungeon
// at Elite or Abyss and every Elite Dungeon is a run: the company's where a member is in one.
import { seaDungeonRoom } from '../../../server/roomNames.ts';
import { activitiesAt, eliteRun } from './activities.ts';
import { askLayout, type DungeonAsk, type DungeonLayout, type StyleKey } from './dungeonLayout.ts';
import { BEFORE_DOOR_M, beforeDoor, type Entrance } from './entrances.ts';
import type { AtEntrance } from './footPlace.ts';
import { type InDungeon, type Trips, seaPlace } from './footTrips.ts';
import type { Happening } from './flow.ts';
import type { DungeonDoor } from './isleLaw.ts';
import type { Difficulty } from '../heldmap/heldMap.ts';
import type { PropTable } from '../models/tables.ts';
import { dungeonRoom, nodeOfRoom, nodeRoom, runInstance, runOf, sharedRun, startedAtSea } from './rooms.ts';
import type { NodeInfo } from './worldData.ts';

/** What a trip reads of where the player stands on foot: the place, its node file's text, the seas of its room, the
 *  dungeon they are in, and the entrances its room last gave. */
export interface TripFoot {
  readonly node: NodeInfo;
  readonly text: string;
  readonly seas: Difficulty;
  readonly dungeon: InDungeon | null;
  readonly held: { readonly entrances: { readonly entrances: readonly Entrance[] } };
}

/** Where a sea island's dungeon leads back to: its door's point in the sea's room (x, y, metres) and the bearing out,
 *  the way a player walks out of it (radians clockwise from north). */
export interface SeaBack {
  readonly x: number;
  readonly y: number;
  readonly facing: number;
}

/** What going in and out asks of the game: the player's place on foot, its way behind the veil, the room's module, a
 *  way into a dungeon's room (`dungeon.room`) and onto a patrol or the sea, the places the company's members play in,
 *  and the dungeons' drawers. */
export interface TripGame {
  readonly foot: () => TripFoot | null;
  readonly travel: (happening: Happening, work: () => Promise<void>) => void;
  readonly module: Promise<WebAssembly.Module>;
  readonly intoDungeon: (
    outside: { readonly node: NodeInfo; readonly text: string },
    dungeon: { readonly number: number; readonly ask: DungeonAsk; readonly room: string },
    layout: DungeonLayout,
    seas: Difficulty,
  ) => Promise<void>;
  readonly ontoPatrol: (patrol: NodeInfo, facing: number, seas: Difficulty, arriving?: AtEntrance) => Promise<void>;
  readonly ontoSea: (back?: SeaBack) => Promise<void>;
  readonly companyPlaces: () => Promise<readonly (string | null)[]>;
  readonly drawers: {
    readonly props: PropTable | null;
    show(layout: DungeonLayout, patrol: NodeInfo, entrance: Entrance | undefined): Promise<void> | void;
  };
}

/** A new run's instance and the Unix minute it opens: the page's own, unless a test pins them. */
const CHANCE = { instance: () => runInstance(), minute: () => Math.floor(Date.now() / 60_000) };

/** A sea island's dungeon's name, its tier after it at Elite or Abyss. */
const SEA_TIER = /^(.*?)(?:--(elite|abyss))?$/;

/** The ways into a dungeon and out again, with the props' table their entrances stand by, and into a company member's
 *  dungeon from wherever the player is. */
export function dungeonTrips(
  game: TripGame,
  chance: { readonly instance: () => string; readonly minute: () => number } = CHANCE,
): Omit<Trips, 'enter'> & {
  /** In by entrance `number`, its dungeon named `name`; into `found`, a run Find a Company found, only where it is
   *  one of this entrance's, else nowhere. */
  enter(number: number, name: string, found?: string): void;
  /** Out by the way in, the veil saying the company fell: before the entrance, or back to the sea. */
  fell(): void;
  join(node: NodeInfo, place: string): void;
  /** Into a sea island's dungeon by its door's room name (`sea-dungeon-...`, server/roomNames.ts), back out before
   *  the door; a name that is none goes nowhere. */
  enterSeaDungeon(door: DungeonDoor): void;
  /** Into a run of the Elite Dungeon `node` by its room's name, from the sea, as the Playlist launches or finds one;
   *  out of it back onto the sea. */
  intoRun(node: NodeInfo, run: string): void;
} {
  /** The way out of the dungeon the player is in, kept as they went in; `fell` when their company fell. */
  let out: ((fell: boolean) => void) | null = null;
  /** A dungeon's room at `seas` from its name before any run: shared at Normal unless it is `always` a run, else the
   *  company's run of it or a new one. */
  const roomOf = (base: string, seas: Difficulty, always: boolean) => async () =>
    !always && seas === 'normal'
      ? base
      : (sharedRun(base, await game.companyPlaces()) ?? runOf(base, chance.instance()));
  /** Out to a node at `seas`, before the entrance gone in by where there was one. */
  const toNode =
    (node: NodeInfo, seas: Difficulty, number: number, entrance?: Entrance) =>
    (layout: DungeonLayout, fell: boolean) => {
      const props = game.drawers.props;
      const before = entrance && props ? beforeDoor(entrance, props) : null;
      const arriving = before ? { number, ...before } : undefined;
      game.travel({ kind: fell ? 'wiped' : 'leave', node: node.id, name: layout.name }, () =>
        game.ontoPatrol(node, before?.facing ?? 0, seas, arriving),
      );
    };
  /** Out of a run the Playlist started, back onto the sea where the ship lies. */
  const toSea = (layout: DungeonLayout, fell: boolean) =>
    game.travel({ kind: 'surface', name: layout.name, fell }, () => game.ontoSea());
  const into =
    (
      outside: { readonly node: NodeInfo; readonly text: string },
      dungeon: { readonly number: number; readonly ask: DungeonAsk },
      seas: Difficulty,
      room: () => Promise<string>,
      away: (layout: DungeonLayout, fell: boolean) => void,
      entrance?: Entrance,
    ) =>
    async () => {
      const layout = askLayout(await game.module, dungeon.ask);
      await game.intoDungeon(outside, { ...dungeon, room: await room() }, layout, seas);
      await game.drawers.show(layout, outside.node, entrance);
      out = (fell) => away(layout, fell);
    };
  return {
    props: () => game.drawers.props,
    enter: (number, name, found) => {
      const from = game.foot();
      if (!from || from.dungeon) return;
      const { node, seas } = from;
      const entrance = from.held.entrances.entrances[number];
      const outside = { node, text: from.text };
      // A run found is gone into by its name alone; one of another dungeon or tier, or no run, goes nowhere.
      const fits = (base: string) => found === undefined || sharedRun(base, [found]) !== null;
      const roomFor = (base: string, tier: Difficulty, always: boolean) =>
        found === undefined ? roomOf(base, tier, always) : async () => found;
      if (node.kind !== 'dungeon') {
        const ask = { patrol: node.id, name: node.name, number };
        const base = dungeonRoom(node, seas, number);
        if (!fits(base)) return;
        const room = roomFor(base, seas, false);
        const work = into(outside, { number, ask }, seas, room, toNode(node, seas, number, entrance), entrance);
        game.travel({ kind: 'enter', node: `${node.id}--dungeon-${number}`, name }, work);
        return;
      }
      // An Elite Dungeon's entrance opens the week's run where this is the week's, else the Elite Dungeon at Normal;
      // its way out is at the run's own seas, as a member's who came in by the Roster is, so the company stays as one.
      void game.module.then((module) => {
        const run = eliteRun(node.id, seas, activitiesAt(module, chance.minute()));
        const words = run.seas === 'normal' ? node.name : `${node.name}, the ${run.words}`;
        const ask = { place: node.id, name: node.name };
        const base = nodeRoom(node, run.seas);
        if (!fits(base)) return;
        const room = roomFor(base, run.seas, true);
        const away = toNode(node, run.seas, number, entrance);
        const work = into(outside, { number, ask }, run.seas, room, away, entrance);
        game.travel({ kind: 'enter', node: `${node.id}--dungeon`, name: words }, work);
      });
    },
    leave: () => {
      if (game.foot()?.dungeon) out?.(false);
    },
    fell: () => {
      if (game.foot()?.dungeon) out?.(true);
    },
    // A company joins online only, where a dungeon's room never asks for its node's file.
    join: (node, place) => {
      const where = nodeOfRoom(place);
      if (!where) return;
      const number = where.dungeon ?? 0;
      const ask: DungeonAsk =
        where.dungeon === null ? { place: node.id, name: node.name } : { patrol: node.id, name: node.name, number };
      void game.module.then((module) => {
        const { name } = askLayout(module, ask);
        const inside = where.dungeon === null ? `${node.id}--dungeon` : `${node.id}--dungeon-${number}`;
        const away = startedAtSea(place) ? toSea : toNode(node, where.seas, number);
        const work = into({ node, text: '' }, { number, ask }, where.seas, async () => place, away);
        game.travel({ kind: 'join', node: inside, name }, work);
      });
    },
    intoRun: (node, run) => {
      const where = nodeOfRoom(run);
      if (!where || where.id !== node.id || where.run === null || where.dungeon !== null) return;
      const ask = { place: node.id, name: node.name };
      void game.module.then((module) => {
        const { name } = askLayout(module, ask);
        const work = into({ node, text: '' }, { number: 0, ask }, where.seas, async () => run, toSea);
        game.travel({ kind: 'enter', node: `${node.id}--dungeon`, name }, work);
      });
    },
    enterSeaDungeon: ({ room, at: [x, y], facing }) => {
      const [, base = '', tier = 'normal'] = SEA_TIER.exec(room) ?? [];
      const sea = seaDungeonRoom(base);
      if (!sea || sea.run !== null) return;
      const seas = tier as Difficulty;
      const ask = { seed: sea.seed, style: sea.style as StyleKey, name: 'the Sea' };
      void game.module.then((module) => {
        const layout = askLayout(module, ask);
        const outside = { node: seaPlace(sea.continent, layout), text: '' };
        // Out before the door, as a patrol's entrance stands a player out of it: x east, y south.
        const before = { x: x + Math.sin(facing) * BEFORE_DOOR_M, y: y - Math.cos(facing) * BEFORE_DOOR_M, facing };
        const away = (laid: DungeonLayout, fell: boolean) =>
          game.travel({ kind: 'surface', name: laid.name, fell }, () => game.ontoSea(before));
        const work = into(outside, { number: 0, ask }, seas, roomOf(room, seas, false), away);
        game.travel({ kind: 'enter', node: `${room}--dungeon`, name: layout.name }, work);
      });
    },
  };
}
