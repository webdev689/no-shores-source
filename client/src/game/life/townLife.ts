// A social space's townsfolk at their routines (`routine.ts`): one person at each kept post, one walking each round
// of posts, and the walkers visiting the rest (`walkers.ts`), all laid on the world clock from the plan's ways and
// posts and a seed, so every browser and every reload has the same people in the same places.
import type { Post, Ways } from '../nodes.ts';
import { type Doing, type Routine, doingAt, keptAt, roundOf } from './routine.ts';
import { seeded } from './seeded.ts';
import { walkerRoutines, walkersFor } from './walkers.ts';
import { WayGraph } from './ways.ts';

/** The round a post is walked in, if it is a round's. */
const roundOfPost = (post: Post): number | null => (typeof post.keep === 'object' ? post.keep.round : null);

export class TownLife {
  readonly graph: WayGraph;
  /** Each person's routine: the kept posts' first, in the posts' order, then each round's, then the walkers'. */
  readonly routines: readonly Routine[];

  constructor(ways: Ways, posts: readonly Post[], seed: number) {
    const random = seeded(seed);
    this.graph = new WayGraph(ways);
    const kept = posts.filter((post) => post.keep === 'kept').map(keptAt);
    const rounds = [...new Set(posts.map(roundOfPost).filter((round) => round !== null))].sort((a, b) => a - b);
    const walked = rounds.map((round) =>
      roundOf(
        this.graph,
        posts.filter((post) => roundOfPost(post) === round),
        random,
      ),
    );
    const visited = posts.filter((post) => post.keep === 'visited');
    const walkers = walkerRoutines(this.graph, visited, walkersFor(visited.length), random);
    this.routines = [...kept, ...walked, ...walkers];
  }

  /** What each person is doing at world time `worldS`, seconds, in the routines' order. */
  everyoneAt(worldS: number): Doing[] {
    return this.routines.map((routine) => doingAt(routine, worldS));
  }
}
