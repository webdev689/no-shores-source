// Going into a dungeon and out again: a patrol's or an Elite Dungeon's from its node's entrance, back out before the
// door the player went in by, facing away from it; a sea island's from its door on the sea, back out onto the island;
// and a run launched or found from the Playlist, from the sea and back out onto it where the ship lies. Every dungeon
// at Elite or Abyss and every Elite Dungeon is a run: the company's where a member is in one.
import { delveInstance, delveWeek, seaDungeonRoom } from '../../../server/roomNames.ts';
import { activitiesAt, eliteRun } from './activities.ts';
import { roomNow } from '../sky/worldClock.ts';
import { askLayout, type DungeonAsk, type DungeonLayout, type StyleKey } from './dungeonLayout.ts';
import { BEFORE_DOOR_M, beforeDoor, type Entrance } from './entrances.ts';
import type { AtEntrance } from './footPlace.ts';
import { delveBase, delveLaid } from './guild/delveRoom.ts';
import { gateOut } from './guild/outpostHere.ts';
import { weekOf } from './guild/guildLaw.ts';
import { type InDungeon, type Trips, seaPlace } from './footTrips.ts';
import type { Opened } from './companyJoin.ts';
import type { Happening } from './flow.ts';
import type { DungeonDoor } from './isleLaw.ts';
import type { Difficulty } from '../heldmap/heldMap.ts';
import type { PropTable } from '../models/tables.ts';
import { dungeonRoom, nodeOfRoom, nodeRoom, runInstance, runOf, sharedRun, startedAtSea } from './rooms.ts';
import type { NodeInfo } from './worldData.ts';
import type { InBreach } from './breachView.ts';
import type { GearAsk, GearState } from '../network/gearMessages.ts';

/** What a trip reads of where the player stands on foot: the place, its node file's text, the seas of its room, the
 *  dungeon or the Breach's run they are in, the entrances its room last gave, and their gear and the way to ask of
 *  it. */
export interface TripFoot {
  readonly node: NodeInfo;
  readonly text: string;
  readonly seas: Difficulty;
  readonly dungeon: InDungeon | null;
  readonly run: InBreach | null;
  readonly held: { readonly entrances: { readonly entrances: readonly Entrance[] } };
  readonly gear: { readonly gear: GearState | null; ask(ask: GearAsk): void } | null;
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
  /** Onto a node; at an outpost site, into the room of the outpost of the guild of key `guild` where one is given. */
  readonly ontoPatrol: (
    patrol: NodeInfo,
    facing: number,
    seas: Difficulty,
    arriving?: AtEntrance,
    guild?: string | null,
  ) => Promise<void>;
  /** Into a Breach's run, from its gate or a company member's place. */
  readonly intoBreach?: (into: InBreach) => Promise<void>;
  readonly ontoSea: (back?: SeaBack) => Promise<void>;
  readonly companyPlaces: () => Promise<readonly (string | null)[]>;
  readonly drawers: {
    readonly props: PropTable | null;
    show(layout: DungeonLayout, patrol: NodeInfo, entrance: Entrance | undefined): Promise<void> | void;
  };
}

/** A new run's instance and the Unix minute it opens, by the rooms' clock, unless a test pins them. */
const CHANCE = { instance: () => runInstance(), minute: () => Math.floor(roomNow() / 60_000) };

/** The guild dungeon's tiers by its gate's, 0 to 2. */
const DELVE_SEAS: readonly Difficulty[] = ['normal', 'elite', 'abyss'];

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
  /** Into a company member's dungeon or run by its room's name `place`, its node `node`; `opened` makes the work of
   *  the node as its landmass lays it, once open (`companyJoin.ts`), the node as given where none is. */
  join(node: NodeInfo, place: string, opened?: Opened): void;
  /** Into a sea island's dungeon by its door's room name (`sea-dungeon-...`, server/roomNames.ts), back out before
   *  the door; a name that is none goes nowhere. */
  enterSeaDungeon(door: DungeonDoor): void;
  /** Into a run of the Elite Dungeon `node` by its room's name, from the sea, as the Playlist launches or finds one;
   *  out of it back onto the sea. A patrol's dungeon's run (`--dungeon-<n>`, the address's `&run=` under `npm run
   *  dev`) is gone into as its entrance goes, and out to its patrol. */
  intoRun(node: NodeInfo, run: string): void;
  /** Into the Elite Dungeon `node` at Normal from the sea, from the island's panel: the company's run of it started at
   *  sea where one plays it, else a new one (`node-<id>--sea--run-<instance>`); out of it back onto the sea. */
  fromSea(node: NodeInfo): void;
  /** Into the guild dungeon behind an outpost's Delve Gate, for the guild of `key`, at `tier` (0 Normal to 2 Abyss):
   *  the company's run of it or a new one, laid by its week's seed and style; out before the gate at `gate`. */
  enterDelve(key: string, tier: number, gate: Omit<AtEntrance, 'number'>): void;
} {
  /** The way out of the dungeon the player is in, kept as they went in with the foot it is of; `fell` when their
   *  company fell. */
  let out: { readonly from: TripFoot | null; readonly way: (fell: boolean) => void } | null = null;
  /** Out of the dungeon stood in by the way it was gone into, once: none from a place it is not the way out of. */
  const leave = (fell: boolean) => {
    const foot = game.foot();
    const way = foot?.dungeon && out?.from === foot ? out.way : null;
    out = null;
    way?.(fell);
  };
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
  /** A guild's dungeon's ask for its run `room`, laid for the week the run's name carries, named for its outpost's
   *  place; and the way out of it to that guild's outpost at Normal, before its gate (`gate`, read as the player
   *  leaves), where the outpost's room stands a player by entrance 0. */
  const delveAsk = (key: string, name: string, room: string): DungeonAsk => {
    const run = nodeOfRoom(room)?.run;
    const { seed, style } = delveLaid(key, run ? delveWeek(run) : weekOf(roomNow()));
    return { seed, style: style as StyleKey, name };
  };
  const toGate =
    (node: NodeInfo, key: string, gate: () => Promise<Omit<AtEntrance, 'number'>>) =>
    (layout: DungeonLayout, fell: boolean) =>
      game.travel({ kind: fell ? 'wiped' : 'leave', node: node.id, name: layout.name }, async () => {
        const out = await gate();
        await game.ontoPatrol(node, out.facing, 'normal', { number: 0, ...out }, key);
      });
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
      out = { from: game.foot(), way: (fell) => away(layout, fell) };
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
    leave: () => leave(false),
    fell: () => leave(true),
    // A company joins online only, where a dungeon's room never asks for its node's file.
    join: (node, place, opened = (onIt) => () => onIt(node)) => {
      const where = nodeOfRoom(place);
      if (!where) return;
      // A member's guild dungeon is joined by its name; its way out is before its gate as the accounts keep the plot,
      // else the outpost's spawn.
      if (where.guild !== null && where.run !== null) {
        const key = where.guild;
        const ask = delveAsk(key, node.name, place);
        const work = opened((laid) => {
          const [x = 0, y = 0] = laid.spawns[0] ?? laid.centre;
          const away = toGate(laid, key, async () => (await gateOut(laid, key)) ?? { x, y, facing: 0 });
          return into({ node: laid, text: '' }, { number: 0, ask }, where.seas, async () => place, away)();
        });
        game.travel({ kind: 'join', node: `${node.id}--delve`, name: node.name }, work);
        return;
      }
      const number = where.dungeon ?? 0;
      const ask: DungeonAsk =
        where.dungeon === null ? { place: node.id, name: node.name } : { patrol: node.id, name: node.name, number };
      void game.module.then((module) => {
        const { name } = askLayout(module, ask);
        const inside = where.dungeon === null ? `${node.id}--dungeon` : `${node.id}--dungeon-${number}`;
        const work = opened((laid) => {
          const away = startedAtSea(place) ? toSea : toNode(laid, where.seas, number);
          return into({ node: laid, text: '' }, { number, ask }, where.seas, async () => place, away)();
        });
        game.travel({ kind: 'join', node: inside, name }, work);
      });
    },
    intoRun: (node, run) => {
      const where = nodeOfRoom(run);
      if (!where || where.id !== node.id || where.run === null) return;
      const number = where.dungeon ?? 0;
      const patrol = where.dungeon !== null;
      const ask: DungeonAsk = patrol
        ? { patrol: node.id, name: node.name, number }
        : { place: node.id, name: node.name };
      // A patrol's dungeon's run, played alone, reads of its patrol's file whose it is alone.
      const text = patrol ? JSON.stringify({ id: node.id, kind: node.kind, name: node.name }) : '';
      void game.module.then((module) => {
        const { name } = askLayout(module, ask);
        const away = patrol ? toNode(node, where.seas, number) : toSea;
        const work = into({ node, text }, { number, ask }, where.seas, async () => run, away);
        game.travel({ kind: 'enter', node: `${node.id}--dungeon${patrol ? `-${number}` : ''}`, name }, work);
      });
    },
    fromSea: (node) => {
      if (node.kind !== 'dungeon') return;
      const base = `${nodeRoom(node, 'normal')}--sea`;
      const ask = { place: node.id, name: node.name };
      void game.module.then((module) => {
        const { name } = askLayout(module, ask);
        const room = async () => sharedRun(base, await game.companyPlaces()) ?? runOf(base, chance.instance());
        const work = into({ node, text: '' }, { number: 0, ask }, 'normal', room, toSea);
        game.travel({ kind: 'enter', node: `${node.id}--dungeon`, name }, work);
      });
    },
    enterDelve: (key, tier, gate) => {
      const from = game.foot();
      if (!from || from.dungeon || from.node.kind !== 'outpost') return;
      const { node } = from;
      const seas = DELVE_SEAS[tier] ?? 'normal';
      const base = delveBase(key, node.id, tier);
      // A new run's name carries the week it is laid for; the company's is laid for its own.
      const fresh = () => runOf(base, delveInstance(weekOf(chance.minute() * 60_000), chance.instance()));
      const work = async () => {
        const room = sharedRun(base, await game.companyPlaces()) ?? fresh();
        const ask = delveAsk(key, node.name, room);
        await into(
          { node, text: from.text },
          { number: 0, ask },
          seas,
          async () => room,
          toGate(node, key, async () => gate),
        )();
      };
      game.travel({ kind: 'enter', node: `${node.id}--delve`, name: node.name }, work);
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
