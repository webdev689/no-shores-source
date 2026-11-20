import assert from 'node:assert/strict';
import { test } from 'node:test';
import { poseOf } from '../overworld/overworldCamera.ts';
import type { Mark } from '../overworld/overworldMarks.ts';
import { LOCKED_WORDS, OPEN_SOCIAL_SPACES, socialLocked } from './nodes.ts';
import { islandMarks, landable, landingChoice, seaMarks } from './seaMarks.ts';
import { type WorldData, arrivalAt } from './worldData.ts';

test('only the listed cities’ social spaces open: Overlook’s; the rest of every island is open', () => {
  assert.deepEqual([...OPEN_SOCIAL_SPACES], ['overlook']);
  for (const city of OPEN_SOCIAL_SPACES) assert.equal(socialLocked(`${city}-social`), false, city);
  assert.equal(socialLocked('cairnwatch-social'), true);
  assert.equal(socialLocked('cairnwatch-patrol-1'), false, 'the rest of a locked city’s island is open');
});

test('a locked social space shows "Opens later" over the island’s side and cannot be landed at', () => {
  const side: Mark[] = [
    { id: 'sunspire-social', kind: 'social', name: 'Sunspire', at: [0, -100, 5], edge: true, locked: true },
    { id: 'sunspire-patrol', kind: 'patrol', name: 'Dunes', at: [40, -100, 5], edge: true },
  ];
  const forward = [0, -100 / Math.hypot(100, 50), -50 / Math.hypot(100, 50)] as const;
  const pose = poseOf({ eye: [0, 0, 50], forward });
  const { shown } = seaMarks('landing', [], side, [0, 0], pose, { width: 800, height: 600 }, null);
  const note = (id: string) => shown.find((mark) => mark.id === id)?.note;
  assert.equal(note('sunspire-social'), LOCKED_WORDS);
  assert.match(note('sunspire-patrol') ?? '', /m$/, 'the rest show how far');
  assert.equal(landable(side, 'sunspire-social'), null);
  assert.equal(landable(side, 'sunspire-patrol')?.name, 'Dunes');
});

test('a page asked to start in a locked social space starts in Overlook instead', () => {
  const world = {
    cities: [
      { id: 'overlook', name: 'Overlook', continent: 'continent-1' },
      { id: 'rimeholt', name: 'Rimeholt', continent: 'continent-9' },
    ],
    nodes: [],
  } as unknown as WorldData;
  assert.equal(arrivalAt(world, 'rimeholt-social'), null);
  assert.deepEqual(arrivalAt(world, 'overlook-social'), {
    continent: 'continent-1',
    node: 'overlook-social',
    name: 'Overlook',
  });
});

test('of the locked social spaces only the two other ports’ say "Opens later"; a desolate city’s shows no mark', () => {
  const side: Mark[] = [
    { id: 'rimeholt-social', kind: 'social', name: 'Rimeholt', at: [0, -100, 5], edge: true, locked: true },
    { id: 'cairnwatch-social', kind: 'social', name: 'Cairnwatch', at: [20, -100, 5], edge: true, locked: true },
  ];
  const forward = [0, -100 / Math.hypot(100, 50), -50 / Math.hypot(100, 50)] as const;
  const pose = poseOf({ eye: [0, 0, 50], forward });
  const { shown, placed } = seaMarks('landing', [], side, [0, 0], pose, { width: 800, height: 600 }, null);
  assert.deepEqual(
    shown.map((mark) => [mark.id, mark.note]),
    [['rimeholt-social', LOCKED_WORDS]],
  );
  assert.deepEqual(
    placed.map((mark) => mark.id),
    ['rimeholt-social'],
  );
  assert.equal(landable(side, 'cairnwatch-social'), null);
});

test('a social space still locked is a locked mark, which says it opens later when chosen', () => {
  const where = { continent: 'continent-4', ring: [], spawns: [], centre: [0, 0] as const };
  const nodes = [
    { id: 'sunspire-social', kind: 'social', name: 'Sunspire', ...where },
    { id: 'sunspire-patrol', kind: 'patrol', name: 'Dunes', ...where },
  ] as const;
  const marks = islandMarks({ nodes, plan: null, heightAt: () => 0 });
  assert.deepEqual(
    marks.map((mark) => mark.locked),
    [true, false],
  );
  assert.deepEqual(landingChoice(marks, null, 'sunspire-social'), { kind: 'locked', words: 'Sunspire opens later' });
  assert.equal(landable(marks, 'sunspire-social'), null);
});
