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
 *  sea (a social space, or an outpost site, whose rooms are at Normal alone), its island's coast, and the nodes whose
 *  gates lead into it. */
export interface Reach {
  readonly social: boolean;
  readonly coast: readonly Point[];
  readonly gatedFrom: readonly string[];
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
  return { social: node.kind === 'social' || node.kind === 'outpost', coast, gatedFrom };
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
  if (passageRoom(room)) return room === from || (passages !== null && intoPassage(room, from, passages));
  if (!room.startsWith('node-') || room === from || room === FIRST_ROOM) return true;
  const [to, was] = [nodeOf(room), nodeOf(from)];
  if (!to) return false;
  const left = passageRoom(from);
  if (left) return passages !== null && !inside(to) && to.guild === null && litHome(left, to.id, passages);
  // A run started from the Playlist, beside any port, is entered from the sea alone.
  if (startedAtSea(room)) return from !== null && seaRoom(from) !== null;
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
    // A run started from the Playlist is left back to the sea, never onto its dungeon's island.
    if (inside(was)) return was.seas === to.seas && !startedAtSea(from ?? '');
  }
  if (inside(to)) return false;
  // Through a gate, from a node whose gate leads here, at the same seas.
  if (was && !inside(was) && was.seas === to.seas && reach?.gatedFrom.includes(was.id)) return true;
  // Ashore from the sea at the node's seas (a social space's from any), the ship off its island's coast.
  const seas = from ? seaRoom(from) : null;
  if (seas === null || !reach || !ship || (!reach.social && seas !== to.seas)) return false;
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
 *  room's seas; or by the Delve Gate, its guild dungeon's run at any tier. */
export function cameOutOf(room: string, from: string | null, number: number): boolean {
  const [to, was] = [nodeOf(room), nodeOf(from)];
  if (!to || !was || inside(to) || was.id !== to.id || startedAtSea(from ?? '')) return false;
  // Out of a guild dungeon's run, at any tier, before its outpost's Delve Gate, entrance 0.
  if (to.guild !== null || was.guild !== null) return was.guild === to.guild && was.run !== null && number === 0;
  if (was.seas !== to.seas) return false;
  return was.dungeon === number || (was.dungeon === null && was.run !== null && number === 0);
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

/** What a passage's arrivals are judged by: the character's body as the keeper holds it (never what a page says), and
 *  an island's passages' web for a week, null for none. */
export interface Passages {
  readonly body: string | null;
  readonly web: (island: string, week: number) => PassageWeb | null;
}

/** The dive and the lamps of a kept character's body, as `gear::dive::Dive` and `gear::activity::ThisWeek` keep them;
 *  empty for a body that does not read. */
interface Diving {
  readonly passage?: {
    readonly island?: unknown;
    readonly week?: unknown;
    readonly route?: unknown;
    readonly mouth?: unknown;
    readonly zone?: unknown;
    readonly lamp?: unknown;
  } | null;
  readonly activity?: { readonly this_week?: { readonly week?: unknown; readonly passage_lamps?: unknown } };
}

function divingOf(body: string | null): Diving {
  try {
    const read: unknown = JSON.parse(body ?? 'null');
    return typeof read === 'object' && read !== null ? (read as Diving) : {};
  } catch {
    return {};
  }
}

/** Whether a body's character lit lamp `number` of an island's passages this week. */
function lit(diving: Diving, island: string, number: number): boolean {
  const lamps = (diving.activity?.this_week?.passage_lamps as Record<string, unknown> | undefined)?.[island];
  return Array.isArray(lamps) && lamps.includes(number);
}

/** Whether a kept character may come into the passage zone's room `room` from `from`: on a dive of its island, week
 *  and zone, by its route (a company's route's room for a company's dive, a public room for a public one); from the
 *  island's patrol zone where the dive begins at the mouth leading to the zone or at the zone's lamp lit this week; or
 *  from a passage zone of the same web and route whose ways on lead to it, as the dive went on from it once its deal
 *  was done there. */
function intoPassage(room: string, from: string | null, passages: Passages): boolean {
  const to = passageRoom(room);
  const diving = divingOf(passages.body);
  const dive = diving.passage;
  if (!to || !dive || dive.island !== to.island || dive.week !== to.week || dive.zone !== to.zone) return false;
  if ((dive.route === 'company') !== (to.run !== null)) return false;
  const web = passages.web(to.island, to.week);
  const zone = web?.zones.find((each) => each.number === to.zone);
  if (!web || !zone) return false;
  const was = passageRoom(from);
  if (was)
    return (
      was.island === to.island &&
      was.week === to.week &&
      (was.run === null) === (to.run === null) &&
      web.zones.some((each) => each.number === was.zone && each.onward.includes(to.zone))
    );
  const patrol = nodeOf(from);
  if (!patrol || patrol.id !== web.patrol || inside(patrol) || patrol.guild !== null) return false;
  const lamp = typeof dive.lamp === 'number' ? dive.lamp : 0;
  if (lamp === 0) return typeof dive.mouth === 'number' && web.mouths[dive.mouth]?.zone === to.zone;
  return zone.lamp === lamp && diving.activity?.this_week?.week === to.week && lit(diving, to.island, lamp);
}

/** Whether a kept character comes home to the patrol zone `patrol` out of the passage zone `left`: the patrol zone of
 *  its island, from a lamp's zone whose lamp it lit. */
function litHome(left: NonNullable<ReturnType<typeof passageRoom>>, patrol: string, passages: Passages): boolean {
  const web = passages.web(left.island, left.week);
  const lamp = web?.zones.find((each) => each.number === left.zone)?.lamp ?? null;
  return web?.patrol === patrol && lamp !== null && lit(divingOf(passages.body), left.island, lamp);
}
