import social from '../../../content/world/social.json' with { type: 'json' };
import { type NodeInfo, ringMiddle } from './worldData.ts';

type Point = readonly [number, number];

/** A rect of the world: west, north, east and south, metres. */
export type Rect = readonly [number, number, number, number];

/** A pad: a rect of ground the city sets to a level. */
export interface Pad {
  readonly bounds: Rect;
  readonly level: number;
}

/** What the game reads of a city's plan, as the land worker hands it over (the city crate's `Plan` as JSON). */
export interface CityPlan {
  readonly id: string;
  readonly name: string;
  readonly motif: string;
  readonly centre: Point;
  readonly harbour: Point | null;
  readonly social: {
    readonly bounds: Rect;
    readonly level: number;
    readonly ring: readonly Point[];
    readonly spawns: readonly Point[];
    readonly stations?: readonly StationInfo[];
    /** Overlook's bounty board: its middle, the way its face looks, and where a player stands to read it. */
    readonly board?: { readonly at: Point; readonly facing: number; readonly front: Point } | null;
    readonly visitor_spots?: readonly Point[];
    readonly ways?: Ways;
    readonly posts?: readonly Post[];
    /** Its places by name, as the held map names them: a court, a walk, a yard. */
    readonly areas?: readonly { readonly name: string; readonly at: Point }[];
    /** Ships moored beside its pier: each one's middle (east, south) and her bow's bearing. */
    readonly moorings?: readonly (readonly [number, number, number])[];
  };
  readonly pads: readonly Pad[];
  /** Whether the city is a ruin: no port, no docking, no one in its plaza. */
  readonly ruined?: boolean;
}

/** A station in a social space's arcades (the city crate's `Station`): what it is, where its keeper stands, and its
 *  counter, where a player comes to it. */
export interface StationInfo {
  readonly kind: string;
  readonly keeper: Point;
  readonly counter: Point;
}

/** A point of a social space's ways (the city crate's `WayPoint`): where it stands, and what it is, as
 *  "counter:mage" or "view:seaward-2", or "" for a plain turn. */
export interface WayPoint {
  readonly at: Point;
  readonly name: string;
}

/** The ways a social space's townsfolk walk: its points, and the links between them by their place among the points,
 *  each walked either way. */
export interface Ways {
  readonly points: readonly WayPoint[];
  readonly links: readonly (readonly [number, number])[];
}

/** What someone does at a post: a move the forge draws for every townsfolk garment, an instrument's naming it. */
export type Task =
  | 'idle'
  | 'sweep'
  | 'carry'
  | 'smith'
  | 'gesture'
  | 'drink'
  | 'dance'
  | 'juggle'
  | 'charm'
  | 'hold'
  | 'pray'
  | 'play_lute'
  | 'play_flute'
  | 'play_recorder'
  | 'play_tambourine';

/** Who keeps a post: one person always there, one walking the posts of a round in turn, or the walkers by. */
export type Keep = 'kept' | 'visited' | { readonly round: number };

/** A place where someone works, plays or stays (the city crate's `Post`): their task, where they stand and face (the
 *  compass bearing, `bearingTo`), who keeps it, and the way point it is reached from, by its place among the points. */
export interface Post {
  readonly task: Task;
  readonly at: Point;
  readonly facing: number;
  readonly keep: Keep;
  readonly reached_from: number;
}

/** How far past a section's ring its window of the ground reaches, as the bake cuts it: past the 60 m where a body
 *  dies, so every place a living body stands is on it. */
export const WINDOW_MARGIN_M = 100;

/** The rect a node's window of the ground covers: its ring's bounds and the margin past them each way. */
export function windowRect(ring: readonly Point[]): Rect {
  const eastings = ring.map((point) => point[0]);
  const southings = ring.map((point) => point[1]);
  return [
    Math.min(...eastings) - WINDOW_MARGIN_M,
    Math.min(...southings) - WINDOW_MARGIN_M,
    Math.max(...eastings) + WINDOW_MARGIN_M,
    Math.max(...southings) + WINDOW_MARGIN_M,
  ];
}

/** The middle of a node's spawns, or its centre where it has none. */
function spawnsMiddle(node: NodeInfo): Point {
  if (node.spawns.length === 0) return node.centre;
  const sum = node.spawns.reduce<[number, number]>(
    (total, [east, south]) => [total[0] + east, total[1] + south],
    [0, 0],
  );
  return [sum[0] / node.spawns.length, sum[1] / node.spawns.length];
}

/** A city's social space as a node: `<city id>-social`, named for its city, its plaza's section and spawns. */
export function socialNode(plan: CityPlan, continent: string): NodeInfo {
  const { ring, spawns, stations = [], visitor_spots: visitorSpots = [], ways, posts = [] } = plan.social;
  return {
    id: `${plan.id}-social`,
    kind: 'social',
    name: plan.name,
    continent,
    ring,
    spawns,
    centre: ringMiddle(ring),
    stations,
    board: plan.social.board?.front ?? null,
    boardAt: plan.social.board?.at ?? null,
    visitorSpots,
    plazaBounds: plan.social.bounds,
    ...(ways ? { ways, posts } : {}),
  };
}

/** A city's port, where a ship docks and the sea marks it: its name and harbour; none for a city with no harbour or
 *  a ruin, whose harbour is no port. */
export function portOf(plan: CityPlan | null): { readonly name: string; readonly harbour: Point } | null {
  return plan?.harbour && !plan.ruined ? { name: plan.name, harbour: plan.harbour } : null;
}

/** The cities whose social spaces open, by id (`content/world/social.json`, which the city crate reads too): Overlook's
 *  alone. The other two ports' wait, locked, for later: shown so, and never gone to. The desolate cities' are never
 *  gone to, and shown not at all. */
export const OPEN_SOCIAL_SPACES: readonly string[] = social.open;
const LATER_SOCIAL_SPACES: readonly string[] = social.later;
/** What a social space that opens later says where it is offered. */
export const LOCKED_WORDS = 'Opens later';
const SOCIAL_SUFFIX = '-social';

/** Whether the node `id` is a city's social space still locked. */
export function socialLocked(id: string): boolean {
  return id.endsWith(SOCIAL_SUFFIX) && !OPEN_SOCIAL_SPACES.includes(id.slice(0, -SOCIAL_SUFFIX.length));
}

/** Whether the node `id` is a locked social space that opens later, one of the other two ports'. */
export function socialLater(id: string): boolean {
  return socialLocked(id) && LATER_SOCIAL_SPACES.includes(id.slice(0, -SOCIAL_SUFFIX.length));
}

/** The compass bearing from one point to another: 0 north (-y), a quarter turn east (+x). */
export function bearingTo(from: Point, to: Point): number {
  return Math.atan2(to[0] - from[0], from[1] - to[1]);
}

/** Whether a point stands on ground the city has set (its terraces, plaza and landmark's ground), so nothing wild
 *  grows there. */
export function clearedBy(pads: readonly Pad[]): (x: number, y: number) => boolean {
  // Asked for every point nature scatters: a point outside every pad's box at once is outside each, and each pad's
  // corners are read in place.
  const [west, north] = [
    Math.min(...pads.map(({ bounds }) => bounds[0])),
    Math.min(...pads.map(({ bounds }) => bounds[1])),
  ];
  const [east, south] = [
    Math.max(...pads.map(({ bounds }) => bounds[2])),
    Math.max(...pads.map(({ bounds }) => bounds[3])),
  ];
  return (x, y) =>
    x >= west &&
    x <= east &&
    y >= north &&
    y <= south &&
    pads.some(({ bounds }) => x >= bounds[0] && x <= bounds[2] && y >= bounds[1] && y <= bounds[3]);
}

/** The way a player faces on arriving in a node: in a city's social space, out from its landmark through the middle
 *  of its spawns, over the city, however far its ring reaches elsewhere; elsewhere, inland, the way they came ashore
 *  from `from` (their ship), or north with nowhere to come from. */
export function arrivalFacing(node: NodeInfo, plan: CityPlan | null, from: Point | null): number {
  const spawn = node.spawns[0] ?? node.centre;
  if (node.kind === 'social' && plan) return bearingTo(plan.centre, spawnsMiddle(node));
  return from && Math.hypot(spawn[0] - from[0], spawn[1] - from[1]) > 1 ? bearingTo(from, spawn) : 0;
}
