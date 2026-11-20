// The sea's islands as the page holds them: each the room tells of, built once through the room module (its plan in
// its own frame, its ground in the world's metres), for the view to draw, the voyage to keep clear of, the ship to be
// offered a landing at and the player to walk.
import { type IsleBuilt, islePlanner } from '../network/islePlans.ts';
import type { SeenIsle } from '../network/seaHarbour.ts';
import type { Point2 } from '../overworld/ground.ts';
import type { IsleAt } from './isleLaw.ts';

/** The parts of an island's plan the page reads beside the view (crates/room-wasm/src/isle_door.rs `plan_json`). */
interface PlanRead {
  readonly reach: number;
  readonly landing: number;
  readonly anchorage: Point2;
  readonly spawns: readonly Point2[];
  readonly facing: number;
  readonly ring: readonly Point2[];
  readonly door: { readonly at: Point2; readonly facing: number; readonly style: string };
  readonly wrecks: readonly (readonly [number, number, number])[];
  readonly blocks: readonly (readonly [number, number, number, number, number])[];
}

/** An island built: the room's word on it, its climate, its plan's JSON and what the page reads of it, and its
 *  ground's numbers in the world's metres. */
export interface IsleHeld {
  readonly seen: SeenIsle;
  readonly climate: string;
  readonly json: string;
  readonly plan: PlanRead;
  readonly heights: Float64Array;
}

const isPoint = (value: unknown): value is Point2 =>
  Array.isArray(value) && value.length === 2 && value.every((number) => Number.isFinite(number));

/** The plan's JSON read, or null where it is not one: an island the page cannot stand on is not shown at all. */
export function planRead(json: string): PlanRead | null {
  const plan = JSON.parse(json) as Partial<PlanRead>;
  const numbers = (list: unknown, count: number) =>
    Array.isArray(list) &&
    list.every((row) => Array.isArray(row) && row.length === count && row.every((n) => Number.isFinite(n)));
  const fine =
    Number.isFinite(plan.reach) &&
    Number.isFinite(plan.landing) &&
    isPoint(plan.anchorage) &&
    Array.isArray(plan.spawns) &&
    plan.spawns.length > 0 &&
    plan.spawns.every(isPoint) &&
    Array.isArray(plan.ring) &&
    plan.ring.length >= 3 &&
    plan.ring.every(isPoint) &&
    isPoint(plan.door?.at) &&
    numbers(plan.wrecks, 3) &&
    numbers(plan.blocks, 5);
  return fine ? (plan as PlanRead) : null;
}

/** The islands the room told the page of, each built once it is first seen, at most one a frame. */
export class Isles {
  private readonly build: Promise<(seed: string, climate: string, at: Point2) => IsleBuilt | null>;
  private planner: ((seed: string, climate: string, at: Point2) => IsleBuilt | null) | null = null;
  private readonly climates: readonly (string | null)[];
  private readonly held = new Map<number, IsleHeld | null>();
  private seen: readonly SeenIsle[] = [];

  /** `climates` each continent's, in the layout's order, which its water's islands are dressed by. */
  constructor(module: Promise<WebAssembly.Module>, climates: readonly (string | null)[]) {
    this.build = module.then(islePlanner);
    void this.build.then((planner) => (this.planner = planner));
    this.climates = climates;
  }

  /** Takes the room's latest word, and builds the first island seen that is not built yet. */
  update(seen: readonly SeenIsle[]): void {
    this.seen = seen;
    const planner = this.planner;
    const next = seen.find((isle) => !this.held.has(isle.id));
    if (!planner || !next) return;
    const climate = this.climates[next.continent] ?? null;
    const built = climate ? planner(next.seed, climate, next.at) : null;
    const plan = built ? planRead(built.json) : null;
    this.held.set(next.id, built && plan && climate ? { seen: next, climate, ...built, plan } : null);
  }

  /** Every island the room tells of now, built or not yet. */
  all(): IsleAt[] {
    return this.seen.map((seen) => {
      const held = this.held.get(seen.id);
      if (!held) return { seen, built: null };
      const [x, y] = held.plan.anchorage;
      const anchorage: Point2 = [x + seen.at[0], y + seen.at[1]];
      return { seen, built: { reach: held.plan.reach, anchorage, landing: held.plan.landing } };
    });
  }

  /** Every island built that the room tells of now. */
  built(): IsleHeld[] {
    return this.seen.flatMap((seen) => {
      const held = this.held.get(seen.id);
      return held ? [held] : [];
    });
  }

  /** An island built, by its number, while the room tells of it. */
  byId(id: number): IsleHeld | null {
    return this.seen.some((seen) => seen.id === id) ? (this.held.get(id) ?? null) : null;
  }
}
