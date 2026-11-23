import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Post } from '../nodes.ts';
import { inPlaza } from '../townsfolk.ts';
import { FRAME, POSTS, SHAPE_SPOTS, WAYS, solidAt } from '../welcome/plazaForTests.ts';
import { type Doing, WALK_M_S, doingAt, stayRange } from './routine.ts';
import { TownLife } from './townLife.ts';
import { LOOP_S, walkersFor } from './walkers.ts';

type Point = readonly [number, number];
/** A moment of the world clock well on from its start, seconds. */
const NOW_S = 3_456_789.25;
const LIFE = new TownLife(WAYS, POSTS, 42);
const kept = POSTS.filter((post) => post.keep === 'kept');
const round = POSTS.filter((post) => typeof post.keep === 'object');
const visited = POSTS.filter((post) => post.keep === 'visited');
const standsAt = (post: Post, doing: Doing) =>
  Math.hypot(doing.place[0] - post.at[0], doing.place[1] - post.at[1]) < 1e-9;
/** Every half second of a whole loop of the walkers, from `NOW_S`. */
const MOMENTS = Array.from({ length: LOOP_S * 2 }, (unused, nth) => NOW_S + nth / 2);

test('one person at each kept post, one walking the round, and the walkers by', () => {
  assert.equal(LIFE.routines.length, kept.length + 1 + walkersFor(visited.length));
  assert.equal(walkersFor(visited.length), 14, 'at least fourteen walk');
  assert.equal(walkersFor(60), 20, 'one for every three posts they visit');
  assert.equal(walkersFor(120), 40, 'a crowd where there is much to see');
  assert.equal(walkersFor(300), 48, 'and at most forty-eight');
  assert.equal(walkersFor(0), 0, 'and none with nowhere to go');
});

test('where everyone is is a function of the clock alone: the same in two browsers and after a reload', () => {
  const browser = new TownLife(WAYS, POSTS, 42);
  for (const moment of MOMENTS.filter((unused, nth) => nth % 7 === 0))
    assert.deepEqual(browser.everyoneAt(moment), LIFE.everyoneAt(moment), `at ${moment}`);
  // A page reloaded half way through asks for moments in its own order: each answer is the same.
  const order = MOMENTS.filter((unused, nth) => nth % 13 === 0);
  const asked = new Map(order.map((moment) => [moment, LIFE.everyoneAt(moment)]));
  const reloaded = new TownLife(WAYS, POSTS, 42);
  for (const moment of [...order].reverse()) assert.deepEqual(reloaded.everyoneAt(moment), asked.get(moment));
  assert.notDeepEqual(
    new TownLife(WAYS, POSTS, 43).everyoneAt(NOW_S),
    LIFE.everyoneAt(NOW_S),
    'another seed, other routines',
  );
});

test('each kept post is held by its one person, always at its task and facing as it says', () => {
  for (const moment of MOMENTS.filter((unused, nth) => nth % 50 === 0)) {
    const people = LIFE.everyoneAt(moment);
    kept.forEach((post, nth) => {
      const doing = people[nth] as Doing;
      assert.ok(standsAt(post, doing), `the ${post.task} keeps their post`);
      assert.deepEqual([doing.anim, doing.facing], [post.task, post.facing]);
    });
  }
});

test('the sweeper walks the round’s posts in turn, sweeping at each, and comes round again', () => {
  const sweeper = LIFE.routines[kept.length];
  assert.ok(sweeper);
  const swept: number[] = [];
  for (let moment = NOW_S; moment < NOW_S + 2 * sweeper.loop; moment += 0.5) {
    const doing = doingAt(sweeper, moment);
    const post = round.findIndex((each) => standsAt(each, doing));
    if (post >= 0) {
      assert.deepEqual([doing.anim, doing.facing], ['sweep', (round[post] as Post).facing]);
      if (swept.at(-1) !== post) swept.push(post);
    } else assert.equal(doing.anim, 'walk');
  }
  const start = swept[0] ?? 0;
  const turn = swept.map((post) => (post - start + round.length) % round.length);
  assert.deepEqual(turn.slice(0, round.length + 1), [0, 1, 2, 3, 0], 'in turn, and round again');
});

test('walkers visit the counters, views and benches, staying as long as each task takes; no two at one post', () => {
  const walkers = LIFE.routines.slice(kept.length + 1);
  const seen = new Set<Post>();
  for (const moment of MOMENTS) {
    const holding = new Map<Post, number>();
    walkers.forEach((walker, nth) => {
      const doing = doingAt(walker, moment);
      const post = visited.find((each) => standsAt(each, doing));
      if (!post) return assert.equal(doing.anim, 'walk', 'off a post, walking');
      assert.deepEqual([doing.anim, doing.facing], [post.task, post.facing]);
      assert.equal(holding.get(post), undefined, `walkers ${holding.get(post)} and ${nth} at one ${post.task} post`);
      holding.set(post, nth);
      seen.add(post);
    });
  }
  assert.ok(seen.size > visited.length * 0.8, `${seen.size} of ${visited.length} posts visited in a loop`);
  const stays = walkers.flatMap((walker) => walker.legs.slice(1, -1).filter((leg) => leg.post));
  for (const { start, end, post } of stays) {
    const [least, most] = stayRange(post?.task ?? 'idle');
    assert.ok(end - start >= least - 1e-9 && end - start <= most + 1e-9, `a stay of ${end - start} s at ${post?.task}`);
  }
});

test('walkers walk at the townsfolk’s pace, and never two head on along one way', () => {
  const people = (moment: number) => LIFE.everyoneAt(moment);
  for (const moment of MOMENTS) {
    const [now, soon] = [people(moment), people(moment + 0.5)];
    now.forEach((doing, nth) => {
      const next = soon[nth] as Doing;
      const stride = Math.hypot(next.place[0] - doing.place[0], next.place[1] - doing.place[1]);
      assert.ok(stride <= WALK_M_S * 0.5 + 1e-6, `${stride} m in half a second`);
      if (doing.anim !== 'walk') return;
      now.forEach((other, nthOther) => {
        if (nthOther <= nth || other.anim !== 'walk') return;
        const apart = Math.hypot(other.place[0] - doing.place[0], other.place[1] - doing.place[1]);
        // Head on: facing each other within about 25 degrees; crossing at a corner is not.
        const meeting = Math.cos(other.facing - doing.facing) < -0.9;
        assert.ok(!(meeting && apart < 1), `${nth} and ${nthOther} meet head on ${apart.toFixed(2)} m apart`);
      });
    });
  }
});

test('no one stands or walks in any solid of the courtyard, nor where Shape stands', () => {
  for (const moment of MOMENTS.filter((unused, nth) => nth % 2 === 0))
    for (const { place } of LIFE.everyoneAt(moment)) {
      const { toward, across } = inPlaza(FRAME, place as Point);
      assert.equal(solidAt(toward, across, 0.3), null, `in a solid at (${toward.toFixed(2)}, ${across.toFixed(2)})`);
      for (const [spotToward, spotAcross] of SHAPE_SPOTS)
        assert.ok(Math.hypot(toward - spotToward, across - spotAcross) > 1, 'clear of Shape');
    }
});

test('two walking one way never walk in each other, whatever the seed, loop after loop of the walkers', () => {
  // The round's loop and the walkers' keep step: fifty loops on, the sweeper still never walks in a walker.
  const loops = Array.from({ length: 51 }, (unused, loop) => MOMENTS.map((moment) => moment + loop * LOOP_S));
  for (const seed of [42, 12345, 28910]) {
    const life = new TownLife(WAYS, POSTS, seed);
    for (const moment of loops.flat()) {
      const people = life.everyoneAt(moment);
      people.forEach((doing, nth) => {
        if (doing.anim !== 'walk') return;
        people.forEach((other, nthOther) => {
          if (nthOther <= nth || other.anim !== 'walk' || Math.cos(other.facing - doing.facing) < 0.9) return;
          const apart = Math.hypot(other.place[0] - doing.place[0], other.place[1] - doing.place[1]);
          assert.ok(apart >= 1, `seed ${seed}: ${nth} and ${nthOther} walk ${apart.toFixed(2)} m apart`);
        });
      });
    }
  }
});
