// A townsperson's routine: a loop of walks and stays laid on the world clock, so where they are and what they do is a
// pure function of the clock's time. Every browser reading the same time shows them at the same place doing the
// same thing, a reload lands them where they were, and nothing is carried from frame to frame to drift.
import type { Post, Task } from '../nodes.ts';
import { type Path, alongPath, pathThrough } from './paths.ts';
import type { WayGraph } from './ways.ts';

type Point = readonly [number, number];

/** The townsfolk's pace, metres a second. */
export const WALK_M_S = 1.25;

/** A stretch of a routine, seconds into its loop: a walk along a path, or a stay at a post doing its task. */
export interface Leg {
  readonly start: number;
  readonly end: number;
  readonly path?: Path;
  readonly post?: Post;
}

/** A routine: its loop's length, seconds, how far into it the world clock's zero falls, and its legs in turn, the
 *  first starting at 0 and the last ending at the loop's length. */
export interface Routine {
  readonly loop: number;
  readonly offset: number;
  readonly legs: readonly Leg[];
}

/** What someone is doing at a moment: where they stand, the compass bearing they face, and their move. */
export interface Doing {
  readonly place: Point;
  readonly facing: number;
  readonly anim: Task | 'walk';
}

/** How long someone stays at a post, by its task, seconds at least and at most: looking at a view, at a stall or a
 *  counter, talking or drinking, and working at a round's post. */
const STAYS_S = {
  view: [8, 16],
  stall: [6, 14],
  talk: [20, 40],
  work: [16, 28],
} as const satisfies Record<string, readonly [number, number]>;

/** How long a stay at a post of `task` may last, seconds at least and at most. */
export function stayRange(task: Post['task']): readonly [number, number] {
  if (task === 'idle') return STAYS_S.view;
  if (task === 'hold') return STAYS_S.stall;
  return task === 'gesture' || task === 'drink' ? STAYS_S.talk : STAYS_S.work;
}

/** How long a stay at `post` lasts, drawn from `random`, seconds. */
export function stayAt(post: Post, random: () => number): number {
  const [least, most] = stayRange(post.task);
  return least + random() * (most - least);
}

/** What someone keeping `routine` does at world time `worldS`, seconds. */
export function doingAt(routine: Routine, worldS: number): Doing {
  const { loop, offset, legs } = routine;
  const into = (((worldS + offset) % loop) + loop) % loop;
  let [low, high] = [0, legs.length - 1];
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if ((legs[middle]?.start ?? 0) <= into) low = middle;
    else high = middle - 1;
  }
  const leg = legs[low] as Leg;
  if (leg.path) {
    const { place, facing } = alongPath(leg.path, (into - leg.start) * WALK_M_S);
    return { place, facing, anim: 'walk' };
  }
  const post = leg.post as Post;
  return { place: post.at, facing: post.facing, anim: post.task };
}

/** Someone always at a post. */
export function keptAt(post: Post): Routine {
  return { loop: 1, offset: 0, legs: [{ start: 0, end: 1, post }] };
}

/** The path from one post to another by the ways, from the way point the first is reached from to the second's;
 *  null where no way joins them. */
export function pathBetween(graph: WayGraph, from: Post, to: Post): Path | null {
  const route = graph.route(from.reached_from, to.reached_from);
  if (route.length === 0) return null;
  return pathThrough([from.at, ...route.map((index) => graph.points[index] as Point), to.at]);
}

/** One person walking a round's posts in turn, working a while at each, and back to the first. */
export function roundOf(graph: WayGraph, posts: readonly Post[], random: () => number): Routine {
  const legs: Leg[] = [];
  let time = 0;
  posts.forEach((post, nth) => {
    const stay = stayAt(post, random);
    legs.push({ start: time, end: time + stay, post });
    time += stay;
    const path = posts.length > 1 ? pathBetween(graph, post, posts[(nth + 1) % posts.length] as Post) : null;
    if (!path) return;
    const walk = path.length / WALK_M_S;
    legs.push({ start: time, end: time + walk, path });
    time += walk;
  });
  return { loop: Math.max(time, 1), offset: 0, legs };
}
