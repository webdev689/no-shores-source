/**
 * Where a kept character may arrive, judged by the room that held it before (the accounts' word, `characters.ts`),
 * never by its page. Overlook's social space, where every session begins, takes anyone. Any other node's room takes a
 * character that rejoins it, lands from the sea with its ship lying off the node's island, comes through a gate from
 * a node whose gate leads there, or comes out of the node's own dungeon; a dungeon's room or a run takes one from its
 * node's room, and a guild dungeon's run from its guild's outpost alone. A join to one of the company playing in the
 * room is the keeper's to judge (`keeping.ts`). A passage zone's room takes a character on the dive its kept body
 * holds, by the ways the dive allows (`intoPassage`), and an island's patrol zone one that lit a lamp in the zone it
 * comes from.
 */

import islands from '../content/world/islands.json' with { type: 'json' };
import { nodeRoom, passageRoom, seaRoom, startedAtSea } from './roomNames.ts';

type Point = readonly [number, number];

/** Where every session begins: Overlook's social space, one room at every tier. */
export const FIRST_ROOM = 'node-overlook-social';

/** Why a room turns away a character that came by no way leading to it. */
export const NO_WAY_HERE = 'You cannot reach this place from where you were.';

/** How far off an island's coast a kept ship may lie to land there: the page offers a landfall within 30 km
 *  (`SIDE.coastReachM`), and the ship heaves to a moment after it does. */
export const LANDFALL_M = 32_000;

/** What a node's room knows of where its node lies and what leads into it: whether it is landed on from every tier's
 *  sea (a social space, or an outpost site, whose rooms are at Normal alone), its island (its continent's id) and that
 *  island's coast, and the nodes whose gates lead into it. */
export interface Reach {
  readonly social: boolean;
  readonly continent: string;
  readonly coast: readonly Point[];
  readonly gatedFrom: readonly string[];
  /** Whether its island has no name yet, so its sea is locked: no one comes ashore there from the sea. */
  readonly locked: boolean;
}

/** A node as the bake's index lists it (`generated/nodes/index.json`). */
export interface Listed {
  readonly id: string;
  readonly kind: string;
  readonly continent: string;
  readonly gates?: readonly string[];
}

/** A node's reach from the bake's index and the world layout's continents; null for a node the index does not list. */
export function reachOf(
  index: readonly Listed[],
  continents: readonly { readonly id: string; readonly outline: readonly (readonly number[])[] }[],
  id: string,
): Reach | null {
  const node = index.find((each) => each.id === id);
  if (!node) return null;
  const outline = continents.find((each) => each.id === node.continent)?.outline ?? [];
  const coast = outline.map(([x = 0, y = 0]): Point => [x, y]);
  const gatedFrom = index.filter((each) => each.gates?.includes(id)).map((each) => each.id);
  const locked = !Object.hasOwn(islands, node.continent);
  return {
    social: node.kind === 'social' || node.kind === 'outpost',
    continent: node.continent,
    coast,
    gatedFrom,
    locked,
  };
}

/** Where a kept character's ship lies, as the sea last kept it; null for none, or a character that does not read. */
export function shipOf(body: string | null): Point | null {
  try {
    const lies = (JSON.parse(body ?? 'null') as { ship_at?: unknown } | null)?.ship_at;
    return Array.isArray(lies) && lies.length === 2 && lies.every(Number.isFinite)
      ? [lies[0] as number, lies[1] as number]
      : null;
  } catch {
    return null;
  }
}

/** A node's room by its whole name, or null for a room that is no node's. */
const nodeOf = (room: string | null) => (room?.startsWith('node-') ? nodeRoom(room.slice('node-'.length)) : null);

/** Whether a node's room is a dungeon's or a run's. */
const inside = (place: NonNullable<ReturnType<typeof nodeRoom>>) => place.dungeon !== null || place.run !== null;

/** Whether a kept character may arrive in `room` by a way that needs no one there: from `from`, the room that held it
 *  before (null for none), its ship lying at `ship` as the sea kept it; `reach` is the node's, null where unknown. A
 *  room that is no node's is not judged here. */
export function arrives(
  room: string,
  from: string | null,
  ship: Point | null,
  reach: Reach | null,
  passages: Passages | null = null,
): boolean {
  if (passageRoom(room)) return passages !== null && intoPassage(room, from, passages);
  if (!room.startsWith('node-') || room === from || room === FIRST_ROOM) return true;
  const [to, was] = [nodeOf(room), nodeOf(from)];
  if (!to) return false;
  const left = passageRoom(from);
  if (left) return passages !== null && !inside(to) && to.guild === null && litHome(left, to, passages);
  // A run started at sea (from the Playlist, beside any port, or an Elite Dungeon's at Normal) is entered from the
  // sea alone; one at Normal, from its island's tile, with the ship off that island's coast.
  if (startedAtSea(room)) {
    if (from === null || seaRoom(from) === null) return false;
    const offIsland = !!ship && !!reach && !reach.locked && toCoast(ship, reach.coast) <= LANDFALL_M;
    return to.seas > 0 || to.playlist !== null || offIsland;
  }
  // A guild dungeon's run is entered from its guild's outpost alone and left back to it, at whatever tier it runs.
  if ((to.guild !== null && inside(to)) || (was !== null && was.guild !== null && inside(was)))
    return was?.id === to.id && was.guild === to.guild && inside(was) !== inside(to);
  if (was && was.id === to.id) {
    // An outpost site's wild ground and a guild's plot on it are one place at Normal: a player walks between them.
    const plot = to.guild !== null || was.guild !== null;
    if (plot && !inside(to) && !inside(was) && was.seas === to.seas) return true;
    // Into a dungeon from its node's room at its seas, an Elite Dungeon's run (the week's at its own tier, or at
    // Normal) from its node at any, as its tier is its own whatever the seas; out of the node's own dungeon or run at
    // the seas it was gone into at.
    if (inside(to)) return !inside(was) && (was.seas === to.seas || (to.dungeon === null && to.run !== null));
    // A run started at sea is left back to the sea, never onto its dungeon's island.
    if (inside(was)) return was.seas === to.seas && !startedAtSea(from ?? '');
  }
  if (inside(to)) return false;
  // Through a gate, from a node whose gate leads here, at the same seas.
  if (was && !inside(was) && was.seas === to.seas && reach?.gatedFrom.includes(was.id)) return true;
  // Ashore from the sea at the node's seas (a social space's from any), the ship off its island's coast.
  const seas = from ? seaRoom(from) : null;
  if (seas === null || !reach || !ship || reach.locked || (!reach.social && seas !== to.seas)) return false;
  return toCoast(ship, reach.coast) <= LANDFALL_M;
}

/** How far a point lies from a ring's nearest edge, metres, as the page measures a ship off a coast. */
export function toCoast([x, y]: Point, ring: readonly Point[]): number {
  let nearest = Number.POSITIVE_INFINITY;
  ring.forEach(([fromX, fromY], index) => {
    const [toX, toY] = ring[(index + 1) % ring.length] ?? [fromX, fromY];
    const [edgeX, edgeY] = [toX - fromX, toY - fromY];
    const squared = edgeX * edgeX + edgeY * edgeY;
    const along = squared > 0 ? ((x - fromX) * edgeX + (y - fromY) * edgeY) / squared : 0;
    const share = Math.max(0, Math.min(1, along));
    nearest = Math.min(nearest, Math.hypot(fromX + edgeX * share - x, fromY + edgeY * share - y));
  });
  return nearest;
}

/** Whether a character that came from `from` comes out of the dungeon behind entrance `number` of the node's room
 *  `room`: that patrol's dungeon of the number or a run of it, or by its one entrance an Elite Dungeon's run, at the
 *  room's seas; or by the Delve Gate, its guild dungeon's run at any tier. A crossing gate, named for the node it
 *  leads to, is come through from that node's own room at the room's seas. */
export function cameOutOf(room: string, from: string | null, number: number | string): boolean {
  const [to, was] = [nodeOf(room), nodeOf(from)];
  if (typeof number === 'string')
    return !!to && !!was && was.id === number && !inside(to) && !inside(was) && was.seas === to.seas && !to.guild;
  if (!to || !was || inside(to) || was.id !== to.id || startedAtSea(from ?? '')) return false;
  // Out of a guild dungeon's run, at any tier, before its outpost's Delve Gate, entrance 0.
  if (to.guild !== null || was.guild !== null) return was.guild === to.guild && was.run !== null && number === 0;
  if (was.seas !== to.seas) return false;
  return was.dungeon === number || (was.dungeon === null && was.run !== null && number === 0);
}

/** A patrol zone's gate crossing to another, named for the node it leads to, at its middle (`bake::crossings_of`). */
export interface Crossing {
  readonly name: string;
  readonly at: Point;
}

/** A node file's crossing gates, read leniently: none for a file with none, or no file. */
export function crossingsOf(text: string | null): readonly Crossing[] {
  try {
    const read = (JSON.parse(text ?? 'null') as { crossings?: unknown } | null)?.crossings;
    const each = (Array.isArray(read) ? read : []) as { name?: unknown; at?: unknown }[];
    return each.flatMap(({ name, at }) => {
      const [x, y] = Array.isArray(at) ? (at as unknown[]) : [];
      return typeof name === 'string' && typeof x === 'number' && typeof y === 'number' ? [{ name, at: [x, y] }] : [];
    });
  } catch {
    return [];
  }
}

/** The crossing gate toward the node a join says it crosses from (`?from=<node>`), or null for none of the room's. */
export function crossingAsked(request: Request, crossings: readonly Crossing[]): Crossing | null {
  const from = new URL(request.url).searchParams.get('from');
  return crossings.find((each) => each.name === from) ?? null;
}

/** What the arrivals read of an island's passages' web for a week (`web_json`): its patrol zone, the zone behind each
 *  of its mouths, and each zone's number, the zones its ways on lead to and its lamp's number (null for none). */
export interface PassageWeb {
  readonly patrol: string;
  readonly mouths: readonly { readonly zone: number }[];
  readonly zones: readonly {
    readonly number: number;
    readonly onward: readonly number[];
    readonly lamp: number | null;
  }[];
}

/** What a passage's arrivals are judged by: the character's body as the keeper holds it (never what a page says), the
 *  week it is now, and an island's passages' web for a week, null for none. */
export interface Passages {
  readonly body: string | null;
  readonly week: number;
  readonly web: (island: string, week: number) => PassageWeb | null;
}

/** The dive of a kept character's body, as `gear::dive::Dive` keeps it; empty for a body that does not read. */
interface Diving {
  readonly passage?: {
    readonly island?: unknown;
    readonly week?: unknown;
    readonly route?: unknown;
    readonly mouth?: unknown;
    readonly zone?: unknown;
    readonly depth?: unknown;
    readonly began?: unknown;
    readonly lamp?: unknown;
    readonly homeward?: unknown;
    readonly seas?: unknown;
  } | null;
}

function divingOf(body: string | null): Diving {
  try {
    const read: unknown = JSON.parse(body ?? 'null');
    return typeof read === 'object' && read !== null ? (read as Diving) : {};
  } catch {
    return {};
  }
}

/** Whether a kept character may come into the passage zone's room `room` from `from`: on a dive of its island, week
 *  and zone, by its route (a company's route's room for a company's dive, a public room for a public one); from the
 *  island's patrol zone, at the seas the dive began at, where it begins at the mouth leading to the zone or at the
 *  zone's lamp; from a passage zone of the same web and route whose ways on lead to it, as the dive went
 *  on from it once its deal was done there; or from another public copy of its zone. */
function intoPassage(room: string, from: string | null, passages: Passages): boolean {
  const to = passageRoom(room);
  const diving = divingOf(passages.body);
  const dive = diving.passage;
  if (!to || !dive || dive.island !== to.island || dive.week !== to.week || dive.zone !== to.zone) return false;
  // Once the week turns, the web's ways lead elsewhere: no dive goes on into last week's.
  if ((dive.route === 'company') !== (to.run !== null) || to.week !== passages.week) return false;
  if (room === from) return true;
  const web = passages.web(to.island, to.week);
  const zone = web?.zones.find((each) => each.number === to.zone);
  if (!web || !zone) return false;
  const was = passageRoom(from);
  if (was)
    return (
      was.island === to.island &&
      was.week === to.week &&
      (was.run === null) === (to.run === null) &&
      // Another public copy of the dive's own zone, as a full one sends it on, or a zone its ways lead to.
      ((was.zone === to.zone && to.run === null) ||
        web.zones.some((each) => each.number === was.zone && each.onward.includes(to.zone)))
    );
  const patrol = nodeOf(from);
  if (!patrol || patrol.id !== web.patrol || inside(patrol) || patrol.guild !== null || patrol.seas !== seasOf(dive))
    return false;
  const lamp = typeof dive.lamp === 'number' ? dive.lamp : 0;
  if (lamp === 0) return typeof dive.mouth === 'number' && web.mouths[dive.mouth]?.zone === to.zone;
  // Begun at the zone's lamp, still at the depth it began at: the rules begin a dive there only at a lamp lit this
  // week or one whose zone's foes stand at or under the player's level (`begin_dive`), as only they can judge.
  return zone.lamp === lamp && typeof dive.began === 'number' && dive.began === dive.depth;
}

/** Whether a kept character comes home to the patrol zone `to` out of the passage zone `left`, as the rules sent it
 *  (`go_home`): its dive homeward from that very zone, whose lamp it lit this dive, to its island's patrol zone at the
 *  seas it began at. The dive is judged, not this week's lamps, which a week turned since may have cleared. */
function litHome(
  left: NonNullable<ReturnType<typeof passageRoom>>,
  to: NonNullable<ReturnType<typeof nodeOf>>,
  passages: Passages,
): boolean {
  const web = passages.web(left.island, left.week);
  const lamp = web?.zones.find((each) => each.number === left.zone)?.lamp ?? null;
  const dive = divingOf(passages.body).passage;
  if (web?.patrol !== to.id || lamp === null || !dive || dive.homeward !== true) return false;
  const here = dive.island === left.island && dive.week === left.week && dive.zone === left.zone;
  return here && typeof dive.lamp === 'number' && dive.lamp >= lamp && seasOf(dive) === to.seas;
}

/** The seas a dive began at, by their number (0 Normal, 1 Elite, 2 Abyss); a dive kept before it kept them, Normal. */
function seasOf(dive: NonNullable<Diving['passage']>): number {
  return Math.max(0, ['normal', 'elite', 'abyss'].indexOf(typeof dive.seas === 'string' ? dive.seas : 'normal'));
}
