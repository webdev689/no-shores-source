import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { QuestState } from '../../network/questMessages.ts';
import { DEFAULTS, rebind } from '../../player/binds.ts';
import type { StationInfo } from '../nodes.ts';
import type { NodeInfo } from '../worldData.ts';
import { QUESTS } from './questBook.ts';
import { doneAnywhere, lessonKeys } from './lessons.ts';
import { LEGS, type Standing, guideOf } from './waypoint.ts';

const OPENING = QUESTS.findIndex((quest) => quest.id === 'house');
const taskAt = (id: string): number => QUESTS[OPENING]?.tasks.findIndex((task) => task.id === id) ?? -1;
const goalsOf = (id: string) => QUESTS[OPENING]?.tasks[taskAt(id)]?.goals ?? [];

/** The room's word on a character at the opening's task `id`, its goals' counts `counts`. */
function onTask(id: string, counts: readonly number[] = []): QuestState {
  return { quest: OPENING + 1, task: taskAt(id), counts, done: [], choices: [], at: null };
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
  // No pace dial: sailing on sets a click's ×60 and a voyage planned on the map ×200, so those are the trim's keys.
  assert.deepEqual(lessonKeys(trim, 'keys', DEFAULTS), ['W', 'N']);
  assert.deepEqual(lessonKeys(map, 'keys', DEFAULTS), ['N']);
  assert.ok(lessonKeys(fire, 'pad', DEFAULTS).length > 0, 'the pad fires on its own trigger');
  const talk = goalsOf('your-ship')[0];
  assert.ok(talk);
  assert.deepEqual(lessonKeys(talk, 'keys', DEFAULTS), [], 'no other goal names keys');
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

test('after Put them on, Use your gifts asks each gift used, at its counter or by its key', () => {
  const ids = QUESTS[OPENING]?.tasks.map((task) => task.id) ?? [];
  assert.equal(ids[ids.indexOf('wear-them') + 1], 'use-your-gifts');
  const [identify, withdraw, dye, letter] = goalsOf('use-your-gifts');
  assert.ok(identify && withdraw && dye && letter);
  assert.deepEqual(
    [identify, withdraw, dye, letter].map((goal) => [goal.act, goal.to]),
    [
      ['identify', 'mage'],
      ['withdraw', 'vault'],
      ['dye', undefined],
      ['letter', 'mail'],
    ],
  );
  assert.deepEqual(lessonKeys(dye, 'keys', DEFAULTS), ['I'], 'the dye worn on the Character screen');
  assert.deepEqual(lessonKeys(identify, 'keys', DEFAULTS), [], 'a counter, not a key');
  assert.ok(doneAnywhere(dye, false) && !doneAnywhere(letter, false));
  const stations = ['mage', 'vault', 'mail'].map((kind, place): StationInfo => ({
    kind,
    keeper: [1100 + place, 0],
    counter: [1100 + place, 1],
  }));
  const square: NodeInfo = { ...OVERLOOK, stations };
  const guide = guideOf(onTask('use-your-gifts'), { ...ashore, node: square }, { nodes: [square], layouts: [] });
  assert.deepEqual(guide.at, [1100, 1], 'the Mage first');
});
