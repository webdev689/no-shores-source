// The ways a social space's townsfolk walk, as a graph (the city crate's `Ways`): its named points joined by links,
// the shortest way between two found by A* over the links' lengths. From off the ways a walker goes straight to the
// nearest place on them, along them, and straight off them to where it is going.
import type { Ways } from '../nodes.ts';

type Point = readonly [number, number];

const NEAR = 1e-6;
const apart = (one: Point, two: Point) => Math.hypot(two[0] - one[0], two[1] - one[1]);

/** Where `place` falls on the line from `from` to `to`, nearest it: the share of the way along, 0 to 1. */
function shareAlong(from: Point, to: Point, place: Point): number {
  const along = [to[0] - from[0], to[1] - from[1]] as const;
  const length = along[0] * along[0] + along[1] * along[1];
  if (length < NEAR) return 0;
  return Math.min(1, Math.max(0, ((place[0] - from[0]) * along[0] + (place[1] - from[1]) * along[1]) / length));
}

/** A place on the ways: where it is, and the two points of the link it lies on. */
export interface OnWays {
  readonly place: Point;
  readonly link: readonly [number, number];
}

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
  readonly names: readonly string[];
  readonly links: readonly (readonly [number, number])[];
  private readonly joined: readonly (readonly number[])[];

  constructor(ways: Ways) {
    this.points = ways.points.map((point) => point.at);
    this.names = ways.points.map((point) => point.name);
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

  /** The point nearest `near`, by its place among the points; -1 on ways with none. */
  nearestPoint(near: Point, among: (index: number) => boolean = () => true): number {
    let best = -1;
    for (let index = 0; index < this.points.length; index++)
      if (among(index) && (best < 0 || apart(this.point(index), near) < apart(this.point(best), near))) best = index;
    return best;
  }

  /** The place on the ways nearest `near`; null on ways with no link. */
  onWays(near: Point): OnWays | null {
    let best: OnWays | null = null;
    for (const link of this.links) {
      const [from, to] = [this.point(link[0]), this.point(link[1])];
      const share = shareAlong(from, to, near);
      const place: Point = [from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share];
      if (!best || apart(place, near) < apart(best.place, near)) best = { place, link };
    }
    return best;
  }

  /** The points from one to another, both included, the shortest way by the links' lengths; none where no way
   *  joins them. */
  route(from: number, to: number): number[] {
    return this.search([[from, 0]], [[to, 0]], this.point(to));
  }

  /** The way from `from` to `to` by the ways: the points to walk to in turn, `to` the last; straight to it where the
   *  ways have no link. */
  between(from: Point, to: Point): Point[] {
    const [start, end] = [this.onWays(from), this.onWays(to)];
    if (!start || !end) return [to];
    const middle: Point[] = [];
    const sameLink = start.link[0] === end.link[0] && start.link[1] === end.link[1];
    if (!sameLink) {
      const ends = (place: OnWays) =>
        place.link.map((index) => [index, apart(place.place, this.point(index))] as [number, number]);
      for (const index of this.search(ends(start), ends(end), end.place)) middle.push(this.point(index));
    }
    const way: Point[] = [];
    let behind = from;
    for (const point of [start.place, ...middle, end.place, to]) {
      if (apart(point, behind) < NEAR) continue;
      way.push(point);
      behind = point;
    }
    return way;
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
