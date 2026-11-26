// Where the compass points for the quest walked, wherever the player stands, step by step: in the zone a goal is in,
// at the goal (the room's own mark where it gives one); in a patrol whose gate leads to that zone, at the gate; on any
// other land, across the water at the zone's landing, with a word to return to the ship; at sea, at that landing. A
// goal with no single place points at the nearest place it can be done, and one done anywhere at nothing, its step
// saying so. The rules judge every goal; this only points.
import type { QuestState } from '../../network/questMessages.ts';
import type { LayoutArea } from '../../layout/layouts.ts';
import type { NodeInfo } from '../worldData.ts';
import { type Goal, SMITH_OF, openGoals } from './questBook.ts';
import { doneAnywhere } from './lessons.ts';

type Point = readonly [number, number];

/** A foe the player sees: its roster name, its rank (1 a Minor to 5 a Boss) and where it stands. */
export interface SeenFoe {
  readonly name: string;
  readonly rank: number;
  readonly at: Point;
}

/** Where the player stands as the waypoint reads it: on land, the room's node, their feet, the room's own mark for
 *  the goal it marks, the foes they see, whether they are inside a dungeon (its own ground, in its own frame, its
 *  node's places and landing not where they stand) and, on a sea's island, the wrecks they have searched by their
 *  place in its `wrecks`; at sea, the ship, the isles in sight by kind, the hostile ships by faction, and the sea's own
 *  mark for the goal it marks (the Harbourmaster's hulk). */
export type Standing =
  | {
      readonly on: 'land';
      readonly node: NodeInfo;
      readonly at: Point;
      readonly marked: Point | null;
      readonly foes: readonly SeenFoe[];
      readonly inside?: boolean;
      readonly spent?: readonly number[];
    }
  | {
      readonly on: 'sea';
      readonly at: Point;
      readonly isles: readonly { readonly kind: string; readonly at: Point }[];
      readonly hostiles: readonly { readonly faction: number; readonly at: Point }[];
      readonly marked?: Point | null;
    };

/** The world the waypoint reads: every zone, and the laid zones' gates (a layout's areas leading on). */
export interface Chart {
  readonly nodes: readonly NodeInfo[];
  readonly layouts: readonly { readonly id: string; readonly areas: readonly LayoutArea[] }[];
}

/** Where the compass points, if anywhere, and each goal's word under its step in the tracker, by its place in the
 *  task: the leg for the goal pointed at, and "Anywhere" for a goal done anywhere. */
export interface Guide {
  readonly at: Point | null;
  readonly notes: readonly (string | null)[];
  /** The goal pointed at, by its place in the task; null for none. */
  readonly goal?: Goal | null;
}

/** The goals done anywhere, which nothing points at. */
const ANYWHERE: ReadonlySet<string> = new Set(['cast', 'wear']);
/** The goals done at sea, or on an island the sea holds: pointed at the nearest in sight; a sailing lesson's at the
 *  sea's own mark. */
const AT_SEA: ReadonlySet<string> = new Set(['sea', 'land', 'scavenge', 'sail']);
/** The houses' chapels, any of which a pledge is made at. */
const HOUSES = ['stormcallers', 'lamplighters', 'veiled'] as const;
/** A goal's rank by name, as the foes' ranks number them. */
const RANKS = ['Minor', 'Major', 'Elite', 'Miniboss', 'Boss'] as const;
/** A goal's side by name, as the foes' factions number it. */
const SIDES: Readonly<Record<string, number>> = { tithe: 1 };
/** The goal's island word by the kinds of isle a sea holds. */
const ISLANDS: Readonly<Record<string, readonly string[]>> = { cove: ['cove'], isle: ['ruin', 'quarry'] };

/** The words for each leg. */
export const LEGS = {
  ship: 'Hold M to return to your ship',
  sail: (name: string) => `Sail to ${name}`,
  gate: (name: string) => `Through the gate to ${name}`,
  anywhere: 'Anywhere',
  here: 'Anywhere here',
  search: 'None in sight: sail the open sea',
} as const;

const apart = (from: Point, to: Point): number => Math.hypot(to[0] - from[0], to[1] - from[1]);
const nearest = <T>(from: Point, all: readonly T[], spot: (each: T) => Point): T | null =>
  all.reduce<T | null>(
    (best, each) => (best === null || apart(from, spot(each)) < apart(from, spot(best)) ? each : best),
    null,
  );

/** Where a zone is landed at: its first spawn, or its middle. */
const landingOf = (node: NodeInfo): Point => node.spawns[0] ?? node.centre;

/** Whether a goal is done at a keeper's counter: a talk, a pledge, a buy, riding up to one, or a gift used at one. */
const atCounter = (goal: Goal): boolean =>
  goal.kind === 'talk' ||
  goal.kind === 'pledge' ||
  goal.kind === 'buy' ||
  ((goal.kind === 'ride' || goal.kind === 'use') && goal.to !== undefined);

/** The counters a talk, a pledge, a buy, a ride up to one or a gift used at one is done at, by their stations'
 *  kinds; the stranger, at none: she is heard anywhere in a social space. */
function countersOf(goal: Goal): readonly string[] {
  if (goal.kind === 'pledge') return HOUSES;
  if (goal.kind === 'buy') return [SMITH_OF[goal.slot ?? ''] ?? ''];
  return goal.to === 'stranger' ? [] : [goal.to ?? ''];
}

/** The zone a goal is done in: its node, a social space with its counter, the zone with materials to gather the
 *  player stands in or else the nearest patrol with them; the sea for a goal done there or on its islands; none where
 *  no zone holds it. A zone locked to the player is never one. */
function zoneOf(goal: Goal, standing: Standing, chart: Chart): NodeInfo | 'sea' | null {
  const from = standing.at;
  if (goal.island !== undefined || AT_SEA.has(goal.kind)) return 'sea';
  if (goal.node !== undefined) return chart.nodes.find((node) => node.id === goal.node) ?? null;
  const open = chart.nodes.filter((node) => !node.locked);
  if (atCounter(goal)) {
    const counters = countersOf(goal);
    const socials = open.filter((node) => node.kind === 'social');
    const keeping = socials.filter(
      (node) => counters.length === 0 || (node.stations ?? []).some((station) => counters.includes(station.kind)),
    );
    // A social space whose stations are not yet known still holds its keepers.
    return nearest(from, keeping.length > 0 ? keeping : socials, landingOf);
  }
  if (goal.kind === 'gather') {
    if (standing.on === 'land' && (standing.node.resources ?? []).length > 0) return standing.node;
    const patrols = open.filter((node) => node.kind === 'patrol' && (node.resources ?? []).length > 0);
    return nearest(from, patrols, landingOf);
  }
  return null;
}

/** The patrol whose gate leads to `zone`, if a laid one does. */
function gatedFrom(zone: string, chart: Chart): { readonly node: string; readonly gate: Point } | null {
  for (const layout of chart.layouts) {
    const gate = layout.areas.find((area) => area.leads_to === zone);
    if (gate) return { node: layout.id, gate: gate.at };
  }
  return null;
}

/** A goal's point in the zone it is done in, the player standing there: the room's mark, a place, a counter, a foe of
 *  its types, the nearest materials; none where it has none to show. */
function within(goal: Goal, zone: NodeInfo, standing: Extract<Standing, { on: 'land' }>): Point | null {
  const named = goal.place ?? goal.from ?? goal.checkpoints?.[0];
  // A goal at a place is the one the room marks: its figure walking, its next checkpoint, its ward.
  if (named !== undefined && standing.marked) return standing.marked;
  const place = named === undefined ? undefined : zone.places?.find((each) => each.name === named);
  if (place) return place.at;
  if (atCounter(goal)) {
    const counters = countersOf(goal);
    const stations = (zone.stations ?? []).filter((station) => counters.includes(station.kind));
    return nearest(standing.at, stations, (station) => station.counter)?.counter ?? null;
  }
  if (goal.kind === 'kill' && goal.types) return foeOf(goal, standing);
  if (goal.kind === 'gather') return nearest(standing.at, zone.resources ?? [], (each) => each.at)?.at ?? null;
  return null;
}

/** The foes of a kill goal's types and rank in sight, the nearest; none for another goal or none in sight. */
function foeOf(goal: Goal, standing: Extract<Standing, { on: 'land' }>): Point | null {
  if (goal.kind !== 'kill' || !goal.types) return null;
  const least = goal.rank === undefined ? 0 : RANKS.indexOf(goal.rank as (typeof RANKS)[number]) + 1;
  const foes = standing.foes.filter((foe) => goal.types?.includes(foe.name) && foe.rank >= least);
  return nearest(standing.at, foes, (foe) => foe.at)?.at ?? null;
}

/** A goal done at sea or on its islands, the player on one of its islands: there, if the island is of the goal's
 *  kind (its leader, its wrecks not yet searched); else back to the ship. */
function onIsle(goal: Goal, standing: Extract<Standing, { on: 'land' }>, kind: string): Leg {
  const fits = goal.island === undefined || (ISLANDS[goal.island] ?? []).includes(kind);
  if (goal.kind === 'scavenge') {
    const wrecks = (standing.node.wrecks ?? []).filter((_wreck, index) => !(standing.spent ?? []).includes(index));
    const wreck = nearest(standing.at, wrecks, (each) => each);
    return wreck ? { at: wreck, note: null, here: true } : { at: null, note: LEGS.ship };
  }
  if (goal.kind === 'kill' && fits) return { at: foeOf(goal, standing), note: null, here: true };
  return { at: null, note: LEGS.ship };
}

/** A goal done at sea or on its islands, at sea: the nearest isle of its kind, the nearest of its side's ships. */
function atSea(goal: Goal, standing: Extract<Standing, { on: 'sea' }>): Point | null {
  if (goal.kind === 'sail') return standing.marked ?? null;
  if (goal.kind === 'sea') {
    const side = SIDES[goal.side ?? ''];
    const ships = standing.hostiles.filter((ship) => side === undefined || ship.faction === side);
    return nearest(standing.at, ships, (ship) => ship.at)?.at ?? null;
  }
  const kinds = goal.island === undefined ? null : (ISLANDS[goal.island] ?? []);
  const isles = standing.isles.filter((isle) => kinds === null || kinds.includes(isle.kind));
  return nearest(standing.at, isles, (isle) => isle.at)?.at ?? null;
}

/** A goal's leg from where the player stands: where the compass points and the step's word, and whether the goal
 *  holds the compass though it points nowhere yet (it is done where the player stands); null where it has no leg to
 *  show (a goal of a zone the world lacks). */
interface Leg {
  readonly at: Point | null;
  readonly note: string | null;
  readonly here?: boolean;
}

function legOf(goal: Goal, standing: Standing, chart: Chart): Leg | null {
  const zone = zoneOf(goal, standing, chart);
  // Inside a dungeon its ground is in its own frame: only what stands in it is pointed at (a foe of the goal's types,
  // the room's own mark), the rest waiting until the player is out.
  if (standing.on === 'land' && standing.inside) {
    const there = zone === 'sea' || zone?.id === standing.node.id;
    return { at: there ? (foeOf(goal, standing) ?? standing.marked) : null, note: null, here: true };
  }
  if (zone === 'sea') {
    if (standing.on === 'land') {
      // On an island the sea holds, what its kind holds is here; from a zone, back to the ship.
      const kind = standing.node.isle;
      return kind === undefined ? { at: null, note: LEGS.ship } : onIsle(goal, standing, kind);
    }
    const found = atSea(goal, standing);
    // The hulk lies where the sea marks it: nothing is searched for.
    return { at: found, note: found || goal.kind === 'sail' ? null : LEGS.search, here: goal.kind === 'sail' };
  }
  if (zone === null) return null;
  if (standing.on === 'land' && standing.node.id === zone.id) {
    const here = zone.kind === 'social' && countersOf(goal).length === 0 && goal.kind === 'talk';
    return here ? { at: null, note: LEGS.here } : { at: within(goal, zone, standing), note: null, here: true };
  }
  // A dungeon or a boss's zone is reached through its patrol's gate; any other zone is landed at.
  const gated = zone.kind === 'patrol' || zone.kind === 'social' ? null : gatedFrom(zone.id, chart);
  const landed = gated ? (chart.nodes.find((node) => node.id === gated.node) ?? zone) : zone;
  if (standing.on === 'sea') return { at: landingOf(landed), note: LEGS.sail(landed.name) };
  if (gated && standing.node.id === gated.node) return { at: gated.gate, note: LEGS.gate(zone.name) };
  // In an instance reached through a gate, back through it to the zone that leads on.
  const back = chart.layouts
    .find((layout) => layout.id === standing.node.id)
    ?.areas.find((area) => area.leads_to === landed.id);
  if (back) return { at: back.at, note: LEGS.gate(landed.name) };
  return { at: landingOf(landed), note: LEGS.ship };
}

/** Where the compass points for the task walked, `state` the room's word on it, from where the player stands, over
 *  `chart`: the first goal not yet met with somewhere to point; each step's word beside it. */
export function guideOf(state: QuestState | null | undefined, standing: Standing, chart: Chart): Guide {
  const open = openGoals(state);
  const notes: (string | null)[] = [];
  let point: Point | null = null;
  let led: Goal | null = null;
  for (const { goal, index } of open) {
    if (ANYWHERE.has(goal.kind) || doneAnywhere(goal, standing.on === 'sea')) {
      notes[index] = LEGS.anywhere;
      continue;
    }
    if (led !== null) continue;
    const leg = legOf(goal, standing, chart);
    if (!leg) continue;
    notes[index] = leg.note;
    if (leg.at || leg.note || leg.here) [point, led] = [leg.at, goal];
  }
  // A goal met has no word: no hole is left where it stands.
  return { at: point, notes: Array.from(notes, (note) => note ?? null), goal: led };
}
