// The ways a social space's townsfolk walk, as a graph (the city crate's `Ways`): its points joined by links, the
// shortest way between two found by A* over the links' lengths.
import type { Ways } from '../nodes.ts';

type Point = readonly [number, number];

const apart = (one: Point, two: Point) => Math.hypot(two[0] - one[0], two[1] - one[1]);

/** A smallest-first heap of numbered costs, for the search's open places. */
class Heap {
  private readonly items: { readonly index: number; readonly cost: number }[] = [];

  get size(): number {
    return this.items.length;
  }

  push(index: number, cost: number): void {
    const items = this.items;
    items.push({ index, cost });
    for (let slot = items.length - 1; slot > 0;) {
      const up = (slot - 1) >> 1;
      if ((items[up]?.cost ?? 0) <= cost) break;
      [items[slot], items[up]] = [items[up] as (typeof items)[number], items[slot] as (typeof items)[number]];
      slot = up;
    }
  }

  pop(): number {
    const items = this.items;
    const top = items[0]?.index ?? -1;
    const last = items.pop();
    if (items.length === 0 || !last) return top;
    items[0] = last;
    for (let slot = 0; ;) {
      const [left, right] = [2 * slot + 1, 2 * slot + 2];
      let least = slot;
      if ((items[left]?.cost ?? Infinity) < (items[least]?.cost ?? Infinity)) least = left;
      if ((items[right]?.cost ?? Infinity) < (items[least]?.cost ?? Infinity)) least = right;
      if (least === slot) break;
      [items[slot], items[least]] = [items[least] as typeof last, items[slot] as typeof last];
      slot = least;
    }
    return top;
  }
}

export class WayGraph {
  readonly points: readonly Point[];
  readonly links: readonly (readonly [number, number])[];
  private readonly joined: readonly (readonly number[])[];

  constructor(ways: Ways) {
    this.points = ways.points.map((point) => point.at);
    this.links = ways.links;
    const joined = this.points.map(() => [] as number[]);
    for (const [one, two] of ways.links) {
      joined[one]?.push(two);
      joined[two]?.push(one);
    }
    this.joined = joined;
  }

  private point(index: number): Point {
    return this.points[index] as Point;
  }

  /** The points from one to another, both included, the shortest way by the links' lengths; none where no way
   *  joins them. */
  route(from: number, to: number): number[] {
    return this.search([[from, 0]], [[to, 0]], this.point(to));
  }

  /** A* from the points `starts` (each with its cost to start from it) to any of `goals` (each with its cost on
   *  from it to the end), toward `aim`, by the links' lengths: the points walked, start to goal. */
  private search(
    starts: readonly (readonly [number, number])[],
    goals: readonly (readonly [number, number])[],
    aim: Point,
  ): number[] {
    const end = this.points.length;
    const cost = new Float64Array(end + 1).fill(Infinity);
    const from = new Int32Array(end + 1).fill(-1);
    const done = new Uint8Array(end + 1);
    const goalCost = new Map(goals);
    const open = new Heap();
    for (const [index, start] of starts)
      if (start < (cost[index] ?? Infinity)) {
        cost[index] = start;
        open.push(index, start + apart(this.point(index), aim));
      }
    while (open.size > 0) {
      const here = open.pop();
      if (here === end) break;
      if (done[here]) continue;
      done[here] = 1;
      const walked = cost[here] ?? Infinity;
      const onward = goalCost.get(here);
      if (onward !== undefined && walked + onward < (cost[end] ?? Infinity)) {
        cost[end] = walked + onward;
        from[end] = here;
        open.push(end, walked + onward);
      }
      for (const next of this.joined[here] ?? []) {
        const through = walked + apart(this.point(here), this.point(next));
        if (through >= (cost[next] ?? Infinity)) continue;
        cost[next] = through;
        from[next] = here;
        open.push(next, through + apart(this.point(next), aim));
      }
    }
    const walked: number[] = [];
    for (let back = from[end] ?? -1; back >= 0; back = from[back] ?? -1) walked.unshift(back);
    return walked;
  }
}
