import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GearState } from '../../network/gearMessages.ts';
import { standing, state } from '../../network/gearForTests.ts';
import { QuestWatch, SETTLE_MS } from './questWatch.ts';

/** A character's gear on quest `quest` at task `task`: pledged to `pledge`, each quest done by `done`, each Art's road
 *  earned by `earned` and its fragment choices waiting by `choices`. */
function gear(
  quest: number,
  task: number,
  more: { pledge?: number; done?: number[]; earned?: number[]; choices?: number[] } = {},
): GearState {
  const { pledge = 0, done = [0, 0, 0, 0], earned = [0, 0, 0], choices = [0, 0, 0] } = more;
  return state({
    standing: standing({ pledge }),
    arts: { art: 0, cores: [], anima: 0, tenets: [0, 0], earned },
    quest: { quest, task, counts: [], done, choices, at: null },
  });
}

/** A watch past its first word, which was `first`, at `now` milliseconds. */
function settled(first: GearState): { watch: QuestWatch; now: number } {
  const watch = new QuestWatch();
  watch.look(first, true, 0);
  return { watch, now: SETTLE_MS + 1 };
}

const STORM = 2;

test('a task done says its end, then the next task’s start, in order', () => {
  const { watch, now } = settled(gear(STORM, 0, { pledge: 1 }));
  assert.deepEqual(watch.look(gear(STORM, 0, { pledge: 1 }), true, now).scenes, [], 'unchanged, nothing');
  assert.deepEqual(watch.look(gear(STORM, 1, { pledge: 1 }), true, now).scenes, ['stormBeacon', 'stormCamp']);
  assert.deepEqual(watch.look(gear(STORM, 1, { pledge: 1 }), true, now + 1).scenes, [], 'said once');
});

test('a page that loads mid-road says nothing it said before: its first word, and what settles after it', () => {
  const watch = new QuestWatch();
  assert.deepEqual(watch.look(gear(STORM, 4, { pledge: 1 }), true, 0), { scenes: [], toasts: [] });
  // A room's starting character, then the player's own once claimed: neither is news.
  assert.deepEqual(watch.look(gear(1, 0), true, 500).scenes, []);
  assert.deepEqual(watch.look(gear(STORM, 4, { pledge: 1, earned: [3, 0, 0] }), true, 1500), {
    scenes: [],
    toasts: [],
  });
  assert.deepEqual(watch.look(gear(STORM, 5, { pledge: 1, earned: [3, 0, 0] }), true, SETTLE_MS + 1).scenes, [
    'stormLedger',
    'stormSea',
  ]);
});

test("a room joined later, holding its starting character first, says nothing of it or of the player's own", () => {
  const own = gear(STORM, 3, { pledge: 1, done: [1, 0, 0, 0], earned: [1, 0, 0] });
  const { watch, now } = settled(own);
  assert.deepEqual(watch.look(gear(1, 0), true, now), { scenes: [], toasts: [] }, 'behind: no pledge, nothing earned');
  assert.deepEqual(watch.look(own, true, now + 10), { scenes: [], toasts: [] }, 'the same as before it');
  // A new character's placeholder is the same as theirs, and on the opening's first task the same task alone moves.
  const fresh = settled(gear(1, 1));
  assert.deepEqual(fresh.watch.look(gear(1, 0), true, fresh.now).scenes, [], 'a task gone back');
  assert.deepEqual(fresh.watch.look(gear(1, 1), true, fresh.now).scenes, []);
});

test('the opening begins as the welcome passes, on its first task; never while the story or the welcome holds', () => {
  const watch = new QuestWatch();
  assert.deepEqual(watch.look(gear(1, 0), false, 0).scenes, [], 'the welcome plays');
  assert.deepEqual(watch.look(gear(1, 0), false, SETTLE_MS + 1).scenes, []);
  assert.deepEqual(watch.look(gear(1, 0), true, SETTLE_MS + 2).scenes, ['houseBegin'], 'the welcome given');
  assert.deepEqual(watch.look(gear(1, 0), true, SETTLE_MS + 3).scenes, [], 'once');
  const loaded = new QuestWatch();
  assert.deepEqual(loaded.look(gear(1, 0), true, 0).scenes, [], 'loaded with the welcome past: said before');
  const pledged = new QuestWatch();
  pledged.look(gear(STORM, 2, { pledge: 1 }), false, 0);
  assert.deepEqual(pledged.look(gear(STORM, 2, { pledge: 1 }), true, 1).scenes, [], 'on a road already');
  const held = settled(gear(STORM, 0, { pledge: 1 }));
  assert.deepEqual(held.watch.look(gear(STORM, 1, { pledge: 1 }), false, held.now).scenes, [], 'unsaid while it holds');
});

test('what a road gives is toasted: its Art, each Tenet, and a fragment to choose', () => {
  const { watch, now } = settled(gear(STORM, 2, { pledge: 1 }));
  assert.deepEqual(watch.look(gear(STORM, 3, { pledge: 1, earned: [1, 0, 0] }), true, now).toasts, [
    'Storm Art earned: Tempest',
  ]);
  assert.deepEqual(watch.look(gear(STORM, 4, { pledge: 1, earned: [3, 0, 0] }), true, now).toasts, [
    'Tenet earned: Quicken',
  ]);
  assert.deepEqual(watch.look(gear(STORM, 7, { pledge: 1, earned: [3, 0, 0], choices: [1, 0, 0] }), true, now).toasts, [
    'A Storm fragment to choose',
  ]);
  assert.deepEqual(
    watch.look(gear(STORM, 7, { pledge: 1, earned: [3, 0, 0] }), true, now).toasts,
    [],
    'a choice spent is no gift',
  );
});
