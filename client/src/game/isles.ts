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
    // A plan the page cannot read is an island it cannot stand on: it is not shown at all.
    let plan: IslePlan | null = null;
    try {
      plan = built ? readIslePlan(built.json) : null;
    } catch (error) {
      console.warn(`island ${next.id} does not read:`, error);
    }
    this.held.set(next.id, built && plan && climate ? { seen: next, climate, plan, heights: built.heights } : null);
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

  /** Every island built that the room tells of now, and the one the player stands on, as the islands' view draws
   *  them: its ground moved back into its own frame. */
  shown(ashore: IsleHeld | null): IsleShown[] {
    const held = this.built();
    if (ashore && !held.some((each) => each.seen.id === ashore.seen.id)) held.push(ashore);
    return held.map(({ seen, climate, plan, heights }) => {
      const own = Float64Array.from(heights);
      own[0] = (own[0] ?? 0) - seen.at[0];
      own[1] = (own[1] ?? 0) - seen.at[1];
      return { id: seen.id, at: seen.at, climate, plan, heights: own };
    });
  }

  /** An island built, by its number, while the room tells of it. */
  byId(id: number): IsleHeld | null {
    return this.seen.some((seen) => seen.id === id) ? (this.held.get(id) ?? null) : null;
  }
}
