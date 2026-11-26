import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LaidRun } from '../../layout/layouts.ts';
import type { PassagePlan, PassageWeb } from '../../rules/passageRules.ts';
import type { NodeInfo } from '../worldData.ts';
import resources from '../../../../content/gear/resources.json' with { type: 'json' };
import { holdAt, homeSpot, mouthAt, onwardAt, zonePlace } from './passageReach.ts';

const run = (name: string, door: readonly [number, number]): LaidRun => ({
  name,
  kind: 'keep',
  place: name,
  mouth: door,
  line: [],
  beats: [],
  door,
});
const web = {
  mouths: [
    { run: 'The Chalk Adit', zone: 0 },
    { run: 'The Beacon Stair', zone: 1 },
  ],
} as unknown as PassageWeb;
const plan = {
  sites: {
    onward: [
      { at: [10, 0], facing: 0 },
      { at: [40, 0], facing: 0 },
    ],
  },
  pieces: [
    { module: 'lamp', kind: 'lamp', number: 0, at: [0, 20, 0], facing: 0 },
    { module: 'kindle', kind: 'kindle', number: 2, at: [30, 20, 0], facing: 0 },
  ],
} as unknown as PassagePlan;

test('a mouth is used within 4 m of its run’s sealed door, by its place among the web’s mouths', () => {
  const runs = [run('The Beacon Stair', [100, 100]), run('The Chalk Adit', [0, 0])];
  assert.deepEqual(mouthAt(web, runs, 103, 102), { mouth: 1, run: 'The Beacon Stair' });
  assert.equal(mouthAt(web, runs, 105, 100), null, 'five metres off');
  assert.equal(mouthAt(web, [run('A run the web lacks', [0, 0])], 0, 0), null);
});

test('in a zone, an onward mouth within 4 m and the lamp or a dead lamp within 3 m', () => {
  assert.equal(onwardAt(plan, 38, 1), 1);
  assert.equal(onwardAt(plan, 25, 0), null);
  assert.deepEqual(holdAt(plan, 1, 21), { lamp: true });
  assert.deepEqual(holdAt(plan, 32, 19), { kindle: 2 });
  assert.equal(holdAt(plan, 34, 20), null, 'four metres off');
});

test('home, a player stands 2 m out from the mouth they began at, toward its run’s end arena, as the room does', () => {
  assert.deepEqual(homeSpot([0, 0], [0, 100]), [0, 2]);
  assert.deepEqual(homeSpot([5, 5], [5, 5]), [5, 5], 'no arena apart from the door');
});

test('a vein zone holds its node pieces as its island resource’s nodes, in the room’s order', () => {
  const resource = resources.resources[0]!;
  const patrol = { id: 'p', kind: 'patrol', name: 'P', continent: resource.continent } as unknown as NodeInfo;
  const node = (x: number) => ({ module: 'node', kind: 'node', number: 0, at: [x, 5, 0], facing: 0 });
  const vein = {
    zone: { name: 'A Vein' },
    sites: { arrive: [0, 0] },
    ground: { kind: 'open' },
    pieces: [node(1), { module: 'lamp', kind: 'lamp', number: 0, at: [0, 20, 0], facing: 0 }, node(2)],
  } as unknown as PassagePlan;
  assert.deepEqual(zonePlace(vein, patrol, 'z').resources, [
    { at: [1, 5], holds: resource.id },
    { at: [2, 5], holds: resource.id },
  ]);
  assert.equal(zonePlace({ ...vein, pieces: [] }, patrol, 'z').resources, undefined, 'none where no node stands');
});
