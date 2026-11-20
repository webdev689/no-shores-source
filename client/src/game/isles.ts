// The sea's islands as the page holds them: each the room tells of, built once through the room module (its plan in
// its own frame, its ground in the world's metres), for the view to draw, the voyage to keep clear of, the ship to be
// offered a landing at and the player to walk.
import { type IsleBuilt, islePlanner } from '../network/islePlans.ts';
import type { SeenIsle } from '../network/seaHarbour.ts';
import type { Point2 } from '../overworld/ground.ts';
import { type IslePlan, type IsleShown, readIslePlan } from '../islands/islePlan.ts';
import type { IsleAt } from './isleLaw.ts';

/** An island built: the room's word on it, its climate, its plan, and its ground's numbers in the world's metres (what
 *  the page predicts the player on). */
export interface IsleHeld {
  readonly seen: SeenIsle;
  readonly climate: string;
  readonly plan: IslePlan;
  readonly heights: Float64Array;
  /** The same ground in the island's own frame, as the islands' view draws it. */
  readonly own: Float64Array;
}

/** An island's key: its number and its seed, as a sea that opens again numbers its new islands from 1. */
const keyOf = (seen: SeenIsle): string => `${seen.id}:${seen.seed}`;

/** The islands the room told the page of, each built once it is first seen, at most one a frame. */
export class Isles {
  private readonly build: Promise<(seed: string, climate: string, at: Point2) => IsleBuilt | null>;
  private planner: ((seed: string, climate: string, at: Point2) => IsleBuilt | null) | null = null;
  private readonly climates: readonly (string | null)[];
  private readonly held = new Map<string, IsleHeld | null>();
  private seen: readonly SeenIsle[] = [];

  /** `climates` each continent's, in the layout's order, which its water's islands are dressed by. */
  constructor(module: Promise<WebAssembly.Module>, climates: readonly (string | null)[]) {
    this.build = module.then(islePlanner);
    void this.build.then((planner) => (this.planner = planner));
    this.climates = climates;
  }

  /** Takes the room's latest word, and builds the first island seen that is not built yet: whether an island the
   *  room tells of is new to the page since the last word. */
  update(seen: readonly SeenIsle[]): boolean {
    const before = new Set(this.seen.map(keyOf));
    this.seen = seen;
    const changed = seen.some((isle) => !before.has(keyOf(isle)));
    // An island the room no longer tells of is let go of: it faded, or the player sailed out of its sight.
    const told = new Set(seen.map(keyOf));
    for (const key of this.held.keys()) if (!told.has(key)) this.held.delete(key);
    const planner = this.planner;
    const next = seen.find((isle) => !this.held.has(keyOf(isle)));
    if (!planner || !next) return changed;
    const climate = this.climates[next.continent] ?? null;
    const built = climate ? planner(next.seed, climate, next.at) : null;
    // A plan the page cannot read is an island it cannot stand on: it is not shown at all.
    let plan: IslePlan | null = null;
    try {
      plan = built ? readIslePlan(built.json) : null;
    } catch (error) {
      console.warn(`island ${next.id} does not read:`, error);
    }
    if (!built || !plan || !climate) {
      this.held.set(keyOf(next), null);
      return changed;
    }
    const own = Float64Array.from(built.heights);
    own[0] = (own[0] ?? 0) - next.at[0];
    own[1] = (own[1] ?? 0) - next.at[1];
    this.held.set(keyOf(next), { seen: next, climate, plan, heights: built.heights, own });
    return changed;
  }

  /** Every island the room tells of now, built or not yet. */
  all(): IsleAt[] {
    return this.seen.map((seen) => {
      const held = this.held.get(keyOf(seen));
      if (!held) return { seen, built: null };
      const [x, y] = held.plan.anchorage;
      const anchorage: Point2 = [x + seen.at[0], y + seen.at[1]];
      return { seen, built: { reach: held.plan.reach, anchorage, landing: held.plan.landing } };
    });
  }

  /** Every island built that the room tells of now. */
  built(): IsleHeld[] {
    return this.seen.flatMap((seen) => {
      const held = this.held.get(keyOf(seen));
      return held ? [held] : [];
    });
  }

  /** Every island built that the room tells of now, and the one the player stands on, as the islands' view draws
   *  them: its ground moved back into its own frame. */
  shown(ashore: IsleHeld | null): IsleShown[] {
    const held = this.built();
    if (ashore && !held.includes(ashore)) held.push(ashore);
    return held.map(({ seen, climate, plan, own }) => ({ id: seen.id, at: seen.at, climate, plan, heights: own }));
  }

  /** An island built, by its number, while the room tells of it. */
  byId(id: number): IsleHeld | null {
    const seen = this.seen.find((each) => each.id === id);
    return seen ? (this.held.get(keyOf(seen)) ?? null) : null;
  }
}
