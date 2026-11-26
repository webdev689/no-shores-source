import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { QuestState } from '../../network/questMessages.ts';
import { DEFAULTS, rebind } from '../../player/binds.ts';
import type { NodeInfo } from '../worldData.ts';
import { QUESTS } from './questBook.ts';
import { type Kept, lessonsBetween } from './questNews.ts';
import { doneAnywhere, lessonKeys, lessonNotice } from './lessons.ts';
import { LEGS, type Standing, guideOf } from './waypoint.ts';

const OPENING = QUESTS.findIndex((quest) => quest.id === 'house');
const taskAt = (id: string): number => QUESTS[OPENING]?.tasks.findIndex((task) => task.id === id) ?? -1;
const goalsOf = (id: string) => QUESTS[OPENING]?.tasks[taskAt(id)]?.goals ?? [];

/** The room's word on a character at the opening's task `id`, its goals' counts `counts`. */
function onTask(id: string, counts: readonly number[] = []): QuestState {
  return { quest: OPENING + 1, task: taskAt(id), counts, done: [], choices: [], at: null };
}

/** What the page keeps of that word. */
function kept(id: string, counts: readonly number[] = []): Kept {
  const empty: readonly number[] = [];
  return {
    quest: OPENING + 1,
    task: taskAt(id),
    counts,
    fails: empty,
    figures: empty,
    done: empty,
    pledge: 0,
    aurem: 0,
    earned: empty,
    choices: empty,
  };
}

test('the opening rides after the round and sails after the Harbourmaster, each lesson a step an act', () => {
  const ids = QUESTS[OPENING]?.tasks.map((task) => task.id);
  assert.deepEqual(ids?.slice(1, 6), ['find-your-way', 'ride-the-bay', 'your-ship', 'learn-the-helm', 'bring-it-home']);
  assert.deepEqual(
    goalsOf('ride-the-bay').map((goal) => goal.act),
    ['mount', 'walk', 'gallop', 'boost', 'dismount', 'arrive'],
  );
  assert.deepEqual(
    goalsOf('learn-the-helm').map((goal) => goal.act),
    ['board', 'sail', 'steer', 'trim', 'map', 'fire'],
  );
});

test('each step names its keys as bound now, on the keys or on the pad', () => {
  const [mount, walk, gallop, boost] = goalsOf('ride-the-bay');
  assert.ok(mount && walk && gallop && boost);
  assert.deepEqual(lessonKeys(mount, 'keys', DEFAULTS), [',']);
  assert.deepEqual(lessonKeys(gallop, 'keys', DEFAULTS), ['Shift']);
  assert.deepEqual(lessonKeys(boost, 'keys', DEFAULTS), ['Space'], 'a rider’s jump is its boost');
  const { binds } = rebind(DEFAULTS, { id: 'jump', device: 'keys', place: 0 }, 'j');
  assert.ok(binds, 'J takes the jump');
  assert.deepEqual(lessonKeys(boost, 'keys', binds), ['J'], 'as rebound');
  assert.notDeepEqual(lessonKeys(gallop, 'pad', DEFAULTS), lessonKeys(gallop, 'keys', DEFAULTS), 'the pad’s own');
  const [, , steer, trim, map, fire] = goalsOf('learn-the-helm');
  assert.ok(steer && trim && map && fire);
  assert.deepEqual(lessonKeys(steer, 'keys', DEFAULTS), ['A', 'D']);
  assert.deepEqual(lessonKeys(trim, 'keys', DEFAULTS), ['[', ']']);
  assert.deepEqual(lessonKeys(map, 'keys', DEFAULTS), ['N']);
  assert.ok(lessonKeys(fire, 'pad', DEFAULTS).length > 0, 'the pad fires on its own trigger');
  const talk = goalsOf('your-ship')[0];
  assert.ok(talk);
  assert.deepEqual(lessonKeys(talk, 'keys', DEFAULTS), [], 'no other goal names keys');
});

test('each step the room ticks is announced once, through the quest’s news', () => {
  assert.deepEqual(lessonsBetween(kept('ride-the-bay'), kept('ride-the-bay', [1, 0, 1])), [
    'Riding: Get up on your horse',
    'Riding: Gallop',
  ]);
  assert.deepEqual(lessonsBetween(kept('ride-the-bay', [1]), kept('ride-the-bay', [1])), [], 'nothing new');
  // The last step met ends the task: the steps left are announced with it.
  assert.deepEqual(lessonsBetween(kept('learn-the-helm', [1, 1, 1, 1, 1]), kept('bring-it-home')), [
    'Sailing: Put a ball in the Tithe hulk',
  ]);
  const fire = goalsOf('learn-the-helm')[5];
  assert.ok(fire);
  assert.equal(lessonNotice(fire), 'Sailing: Put a ball in the Tithe hulk');
});

const OVERLOOK: NodeInfo = {
  id: 'overlook-social',
  kind: 'social',
  name: 'Overlook',
  continent: 'continent-1',
  ring: [],
  spawns: [[1000, 0]],
  centre: [1000, 0],
  stations: [{ kind: 'harbourmaster', keeper: [1060, 5], counter: [1060, 4] }],
};
const CHART = { nodes: [OVERLOOK], layouts: [] };
const ashore: Standing = { on: 'land', node: OVERLOOK, at: [1000, 0], marked: null, foes: [] };
const afloat = (marked: readonly [number, number] | null): Standing => ({
  on: 'sea',
  at: [0, -3000],
  isles: [],
  hostiles: [],
  marked,
});

test('the riding acts are done anywhere and the compass points at the Harbourmaster’s stall to ride up to', () => {
  const guide = guideOf(onTask('ride-the-bay'), ashore, CHART);
  assert.deepEqual(guide.at, [1060, 4]);
  assert.deepEqual(guide.notes.slice(0, 5), Array(5).fill(LEGS.anywhere));
  assert.ok(doneAnywhere(goalsOf('ride-the-bay')[0] ?? { kind: '', text: '' }, false));
});

test('the sailing lesson sends the player to their ship, then points at the hulk where the sea marks it', () => {
  assert.deepEqual(guideOf(onTask('learn-the-helm'), ashore, CHART).notes[0], LEGS.ship, 'from Overlook');
  const atSea = guideOf(onTask('learn-the-helm'), afloat([200, -3500]), CHART);
  assert.deepEqual(atSea.at, [200, -3500], 'the hulk');
  assert.deepEqual(atSea.notes.slice(0, 5), Array(5).fill(LEGS.anywhere), 'the helm’s acts anywhere at sea');
  assert.equal(guideOf(onTask('learn-the-helm'), afloat(null), CHART).notes[5], null, 'nothing to search for');
  const home = guideOf(onTask('bring-it-home'), afloat(null), CHART);
  assert.deepEqual(home, { at: [1000, 0], notes: [LEGS.sail('Overlook')], goal: goalsOf('bring-it-home')[0] });
});
