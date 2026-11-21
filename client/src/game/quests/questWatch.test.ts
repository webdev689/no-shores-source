import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GearState } from '../../network/gearMessages.ts';
import { standing, state } from '../../network/gearForTests.ts';
import { BEGUN_KEY, QuestWatch, SETTLE_MS } from './questWatch.ts';

/** A character's gear on quest `quest` at task `task`: that task's counts, pledged to `pledge`, each quest done by
 *  `done`, each Art's road earned by `earned` and its fragment choices waiting by `choices`. */
function gear(
  quest: number,
  task: number,
  more: {
    counts?: number[];
    pledge?: number;
    done?: number[];
    earned?: number[];
    choices?: number[];
    fails?: number[];
    figures?: number[];
  } = {},
): GearState {
  const { counts = [], pledge = 0, done = [0, 0, 0, 0], earned = [0, 0, 0], choices = [0, 0, 0] } = more;
  const { fails = [], figures = [] } = more;
  const walking = figures.map((figureState) => ({ look: 22, x: 0, y: 0, z: 0, facing: 0, state: figureState }));
  return state({
    standing: standing({ pledge }),
    arts: { art: 0, cores: [], anima: 0, tenets: [0, 0], earned },
    quest: { quest, task, counts, done, choices, at: null, fails, figures: walking },
  });
}

/** A browser's keeping, as a map. */
function browser() {
  const kept = new Map<string, string>();
  return { kept, keeping: { getItem: (key: string) => kept.get(key) ?? null, setItem: kept.set.bind(kept) } };
}

/** A watch past its first word and its first settled word, both `first`, at `now` milliseconds. */
function settled(first: GearState): { watch: QuestWatch; now: number } {
  const watch = new QuestWatch();
  watch.look(first, true, 0);
  watch.look(first, true, SETTLE_MS + 1);
  return { watch, now: SETTLE_MS + 2 };
}

const STORM = 2;
const LAMP = 3;
const VEIL = 4;

test('a task done says its end, then the next task’s start, in order', () => {
  const { watch, now } = settled(gear(STORM, 1, { pledge: 1 }));
  assert.deepEqual(watch.look(gear(STORM, 1, { pledge: 1 }), true, now).scenes, [], 'unchanged, nothing');
  assert.deepEqual(watch.look(gear(STORM, 2, { pledge: 1 }), true, now).scenes, ['stormGlass', 'stormHold']);
  assert.deepEqual(watch.look(gear(STORM, 5, { pledge: 1 }), true, now).scenes, [
    'stormCalled',
    'stormMill',
    'stormLedger',
    'stormSea',
  ]);
  assert.deepEqual(watch.look(gear(STORM, 5, { pledge: 1 }), true, now + 1).scenes, [], 'said once');
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
  const choosing = settled(gear(1, 1));
  assert.deepEqual(choosing.watch.look(gear(1, 0), true, choosing.now).scenes, [], 'a task gone back');
  assert.deepEqual(choosing.watch.look(gear(1, 1), true, choosing.now).scenes, []);
});

test('a road begins as it is pledged to, once; a switch back to a road on its first task says nothing again', () => {
  const { watch, now } = settled(gear(1, 1));
  const pledged = (pledge: number, quest: number) => gear(quest, 0, { pledge, done: [1, 0, 0, 0] });
  assert.deepEqual(watch.look(pledged(1, STORM), true, now).scenes, ['stormBegin'], 'pledged at the chapel');
  assert.deepEqual(watch.look(pledged(2, LAMP), true, now).scenes, ['lampBegin'], 'a road not walked');
  assert.deepEqual(watch.look(pledged(1, STORM), true, now).scenes, [], 'back to the Stormcallers, still on task 0');
});

test('the opening begins once the welcome passes; never while the story or the welcome holds', () => {
  const watch = new QuestWatch();
  assert.deepEqual(watch.look(gear(1, 0), false, 0).scenes, [], 'the welcome plays');
  assert.deepEqual(watch.look(gear(1, 0), false, SETTLE_MS + 1).scenes, [], 'settled, held');
  assert.deepEqual(watch.look(gear(1, 0), true, SETTLE_MS + 2).scenes, ['houseBegin'], 'the welcome given');
  assert.deepEqual(watch.look(gear(1, 0), true, SETTLE_MS + 3).scenes, [], 'once');
  const pledged = new QuestWatch();
  pledged.look(gear(STORM, 2, { pledge: 1 }), false, 0);
  pledged.look(gear(STORM, 2, { pledge: 1 }), false, SETTLE_MS + 1);
  assert.deepEqual(pledged.look(gear(STORM, 2, { pledge: 1 }), true, SETTLE_MS + 2).scenes, [], 'on a road already');
});

test('a pledge made during the welcome is said once it passes, and the opening it left never is', () => {
  const watch = new QuestWatch();
  watch.look(gear(1, 0), false, 0);
  watch.look(gear(1, 0), false, 20_000);
  // Pledged at the Stormcallers' stop of the welcome, their counter open.
  const pledged = gear(STORM, 0, { pledge: 1, done: [1, 0, 0, 0] });
  assert.deepEqual(watch.look(pledged, false, 30_000).scenes, [], 'held while the welcome holds');
  assert.deepEqual(watch.look(pledged, true, 40_000).scenes, ['stormBegin'], 'said as it ends');
  assert.deepEqual(watch.look(pledged, true, 40_001).scenes, []);
  // A task done during the welcome waits the same way.
  const { watch: walking, now } = settled(gear(STORM, 0, { pledge: 1 }));
  walking.look(gear(STORM, 1, { pledge: 1 }), false, now);
  assert.deepEqual(walking.look(gear(STORM, 1, { pledge: 1 }), true, now + 1).scenes, ['stormBeacon', 'stormCamp']);
});

test('a character from before the roads hears its road begin once for its account, on task 0 with nothing counted', () => {
  const { kept, keeping } = browser();
  let account: string | null = 'arlo-fan';
  const first = (look: GearState) => {
    const watch = new QuestWatch(keeping, () => account);
    watch.look(look, true, 0);
    return watch.look(look, true, SETTLE_MS + 1).scenes;
  };
  const pledged = gear(STORM, 0, { pledge: 1 });
  assert.deepEqual(first(pledged), ['stormBegin'], 'pledged before the roads, on their first task');
  assert.equal(kept.get(`${BEGUN_KEY}.arlo-fan`), 'stormcallers', 'kept for the account');
  assert.deepEqual(first(pledged), [], 'a page loaded again says it no more');
  account = 'another';
  assert.deepEqual(first(pledged), ['stormBegin'], 'another account in the same browser hears its own');
  assert.deepEqual(first(gear(1, 0)), ['houseBegin'], 'unpledged, the opening');
  assert.equal(kept.get(`${BEGUN_KEY}.another`), 'stormcallers,house');
  account = 'third';
  assert.deepEqual(first(gear(STORM, 0, { pledge: 1, counts: [1] })), [], 'something counted: begun already');
  assert.deepEqual(first(gear(STORM, 1, { pledge: 1 })), [], 'past its first task');
});

test('a browser that keeps nothing says a begin once in the page', () => {
  const refuse = () => {
    throw new Error('this browser keeps nothing');
  };
  const watch = new QuestWatch({ getItem: refuse, setItem: refuse }, () => 'arlo-fan');
  const now = SETTLE_MS + 1;
  watch.look(gear(1, 1), true, 0);
  watch.look(gear(1, 1), true, now);
  const pledged = gear(STORM, 0, { pledge: 1, done: [1, 0, 0, 0] });
  assert.deepEqual(watch.look(pledged, true, now).scenes, ['stormBegin']);
  assert.deepEqual(watch.look(gear(LAMP, 0, { pledge: 2, done: [1, 0, 0, 0] }), true, now).scenes, ['lampBegin']);
  assert.deepEqual(watch.look(pledged, true, now).scenes, [], 'kept in the page');
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

test("a goal's own line is said as its failures rise; an escort's shout as an ambush holds it; neither on the first word", () => {
  // The Stormcallers holding the storm-glass on the High Downs (task 2), the glass broken twice.
  const holding = (fails: number[]) => gear(STORM, 2, { pledge: 1, fails });
  const first = new QuestWatch();
  first.look(holding([1]), true, 0);
  assert.deepEqual(first.look(holding([2]), true, 500).scenes, [], 'settling: where it stands');
  assert.deepEqual(first.look(holding([2]), true, SETTLE_MS + 1).scenes, [], 'nor on the first settled word');
  assert.deepEqual(first.look(holding([3]), true, SETTLE_MS + 2).scenes, ['stormLost'], 'broken again');
  assert.deepEqual(first.look(holding([3]), true, SETTLE_MS + 3).scenes, [], 'once');
  assert.deepEqual(first.look(gear(STORM, 3, { pledge: 1 }), true, SETTLE_MS + 4).scenes, ['stormCalled'], 'held');
  // Tobin on the Moors (the Lamplighters' task 2): wreckers spring, then he walks on, then a second ambush.
  const tobin = (figure: number, fails: number[] = []) => gear(LAMP, 2, { pledge: 2, figures: [figure], fails });
  const { watch, now } = settled(tobin(1));
  assert.deepEqual(watch.look(tobin(4), true, now).scenes, ['lampAmbush']);
  assert.deepEqual(watch.look(tobin(4), true, now).scenes, [], 'still held');
  watch.look(tobin(1), true, now);
  assert.deepEqual(watch.look(tobin(4), true, now).scenes, ['lampAmbush'], 'held again');
  // Seen under Valeguard, the Veiled's task 2.
  const valeguard = settled(gear(VEIL, 2, { pledge: 3 }));
  const seen = valeguard.watch.look(gear(VEIL, 2, { pledge: 3, fails: [1] }), true, valeguard.now);
  assert.deepEqual(seen.scenes, ['veilSeen']);
});
