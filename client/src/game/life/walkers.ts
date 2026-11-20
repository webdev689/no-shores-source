// The walkers of a social space: townsfolk who loop through a seeded round of the posts walkers visit (views,
// stalls, benches), staying a while at each. Every walker's loop is `LOOP_S` long, so the stays of all of them can
// be booked against one another once: no two stand at one post at once, however long the clock runs.
import type { Post } from '../nodes.ts';
import type { Path } from './paths.ts';
import { type Leg, type Routine, WALK_M_S, pathBetween, stayAt } from './routine.ts';
import { shuffled } from './seeded.ts';
import type { WayGraph } from './ways.ts';

/** How long each walker's loop lasts, seconds. */
export const LOOP_S = 600;
/** How many walk a social space: at least the fewest, one for every few posts they visit, and at most the most. */
const FEWEST_WALKERS = 14;
const POSTS_A_WALKER = 3;
const MOST_WALKERS = 24;
/** How long a post stands empty at least between one walker's stay and the next's, seconds: the one leaving is well
 *  on their way before the next comes. */
const BETWEEN_S = 4;
/** How far apart in time two walkers come to or leave posts reached from one way point, seconds at least: longer
 *  than a walk between a post and its way point takes, so no two are ever on those short walks at once, where they
 *  would cross. */
const MOVES_APART_S = 10;
/** How many loops are drawn for a walker before they are left out, where every one meets others at a post. */
const ATTEMPTS = 12;

/** How many walkers a social space with `visited` posts to visit has: none without any. */
export function walkersFor(visited: number): number {
  if (visited === 0) return 0;
  return Math.min(MOST_WALKERS, Math.max(FEWEST_WALKERS, Math.ceil(visited / POSTS_A_WALKER)));
}

/** The stays booked at each post, seconds of the loop of the world's clock, each [from, to), and when walkers come to
 *  and leave the posts reached from each way point. */
class Booked {
  private readonly held = new Map<Post, [number, number][]>();
  private readonly moves = new Map<number, number[]>();

  /** Whether no walker comes to or leaves a post reached from `wayPoint` within `MOVES_APART_S` of `times`. */
  calm(wayPoint: number, times: readonly number[]): boolean {
    const apart = (one: number, two: number) => {
      const gap = (((one - two) % LOOP_S) + LOOP_S) % LOOP_S;
      return Math.min(gap, LOOP_S - gap);
    };
    const held = this.moves.get(wayPoint) ?? [];
    return times.every((time) => held.every((other) => apart(time, other) >= MOVES_APART_S));
  }

  moved(wayPoint: number, time: number): void {
    this.moves.set(wayPoint, [...(this.moves.get(wayPoint) ?? []), time]);
  }

  free(post: Post, from: number, to: number): boolean {
    const start = ((from % LOOP_S) + LOOP_S) % LOOP_S;
    const end = start + (to - from);
    return (this.held.get(post) ?? []).every(([heldFrom, heldTo]) =>
      [-LOOP_S, 0, LOOP_S].every((shift) => !(start < heldTo + shift && heldFrom + shift < end)),
    );
  }

  book(post: Post, from: number, to: number): void {
    const start = ((from % LOOP_S) + LOOP_S) % LOOP_S;
    const held = this.held.get(post) ?? [];
    held.push([start, start + (to - from)]);
    this.held.set(post, held);
  }
}

/** A stay a walker makes: the post, when they get there and when they leave, seconds of their own loop. */
interface Stay {
  readonly post: Post;
  readonly arrive: number;
  readonly leave: number;
}

/** Every walker's routine, `count` of them, through the posts `visited`, drawn from `random`. */
export function walkerRoutines(
  graph: WayGraph,
  visited: readonly Post[],
  count: number,
  random: () => number,
): Routine[] {
  const booked = new Booked();
  const paths = new Map<string, Path | null>();
  const between = (from: Post, to: Post): Path | null => {
    const key = `${visited.indexOf(from)}>${visited.indexOf(to)}`;
    if (!paths.has(key)) paths.set(key, pathBetween(graph, from, to));
    return paths.get(key) ?? null;
  };
  const routines: Routine[] = [];
  for (let walker = 0; walker < count && visited.length > 0; walker++) {
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const offset = random() * LOOP_S;
      const stays = staysOf(visited, booked, offset, between, random);
      if (!stays) continue;
      const first = (stays[0] as Stay).post;
      const legs = legsOf(stays, first, between);
      // Their own loop's second `at` falls at the world clock's second `at - offset` of the loop.
      legs.forEach(({ post, start, end }, nth) => {
        if (!post) return;
        booked.book(post, start - offset, end - offset);
        if (legs[nth - 1]?.path) booked.moved(post.reached_from, start - offset);
        if (legs[nth + 1]?.path) booked.moved(post.reached_from, end - offset);
      });
      routines.push({ loop: LOOP_S, offset, legs });
      break;
    }
  }
  return routines;
}

/** A walker's stays through a loop starting `offset` into the world clock's, each at a post no other walker
 *  `booked` holds then: from a first post, on to others while there is time to get home to it, and home to stay there
 *  until the loop comes round; null where the first post is held. */
function staysOf(
  visited: readonly Post[],
  booked: Booked,
  offset: number,
  between: (from: Post, to: Post) => Path | null,
  random: () => number,
): Stay[] | null {
  const free = (post: Post, from: number, to: number) =>
    booked.free(post, from - offset - BETWEEN_S, to - offset + BETWEEN_S) &&
    booked.calm(post.reached_from, [from - offset, to - offset]);
  const first = shuffled(visited, random)[0] as Post;
  const firstStay = stayAt(first, random);
  if (!free(first, 0, firstStay)) return null;
  const stays: Stay[] = [{ post: first, arrive: 0, leave: firstStay }];
  for (;;) {
    const here = stays[stays.length - 1] as Stay;
    const next = shuffled(visited, random).find((post) => {
      if (post === first || post.reached_from === here.post.reached_from) return false;
      const [there, home] = [between(here.post, post), between(post, first)];
      if (!there || !home) return false;
      const arrive = here.leave + there.length / WALK_M_S;
      const leave = arrive + stayAt(post, random);
      if (leave + home.length / WALK_M_S > LOOP_S || !free(post, arrive, leave)) return false;
      stays.push({ post, arrive, leave });
      return true;
    });
    if (!next) break;
  }
  // Home to the first post, staying there into their own first stay as the loop comes round: where another stands
  // there before then, the last stays are given up until it is free.
  const homeAt = () => {
    const last = stays[stays.length - 1] as Stay;
    return stays.length > 1 ? last.leave + (between(last.post, first)?.length ?? 0) / WALK_M_S : last.leave;
  };
  const home = () =>
    booked.free(first, homeAt() - offset - BETWEEN_S, LOOP_S - offset) &&
    (stays.length === 1 || booked.calm(first.reached_from, [homeAt() - offset]));
  while (stays.length > 1 && !home()) stays.pop();
  return home() ? stays : null;
}

/** The legs of a walker's loop: each stay and the walk on from it, the last home to the first post, and the stay
 *  there to the loop's end, which goes on into the first stay as the loop comes round. */
function legsOf(stays: readonly Stay[], first: Post, between: (from: Post, to: Post) => Path | null): Leg[] {
  if (stays.length === 1) return [{ start: 0, end: LOOP_S, post: first }];
  const legs: Leg[] = [];
  stays.forEach((stay, nth) => {
    legs.push({ start: stay.arrive, end: stay.leave, post: stay.post });
    // Every walk on is found before its stay is booked.
    const path = between(stay.post, stays[nth + 1]?.post ?? first) as Path;
    legs.push({ start: stay.leave, end: stay.leave + path.length / WALK_M_S, path });
  });
  legs.push({ start: (legs[legs.length - 1] as Leg).end, end: LOOP_S, post: first });
  return legs;
}
