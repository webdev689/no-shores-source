import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arrivalFacing, bearingTo, type CityPlan, clearedBy, socialNode, windowRect } from './nodes.ts';

const plan: CityPlan = {
  id: 'overlook',
  name: 'Overlook',
  motif: 'beacon',
  centre: [1000, 1000],
  harbour: [1000, 2000],
  social: {
    bounds: [870, 1100, 1130, 1220],
    level: 75,
    ring: [
      [872, 1102],
      [1128, 1102],
      [1128, 1218],
      [872, 1218],
    ],
    spawns: [
      [940, 1112],
      [980, 1112],
    ],
  },
  pads: [{ bounds: [870, 1100, 1130, 1220], level: 75 }],
};

test("a node's window reaches 100 m past its ring each way, as the bake cuts it", () => {
  assert.deepEqual(
    windowRect([
      [0, 200],
      [300, 200],
      [300, 400],
    ]),
    [-100, 100, 400, 500],
  );
});

test("a city's social space is a node named for the city, with the plaza's section and spawns", () => {
  const node = socialNode(plan, 'continent-1');
  assert.equal(node.id, 'overlook-social');
  assert.equal(node.kind, 'social');
  assert.equal(node.name, 'Overlook');
  assert.deepEqual(node.spawns[0], [940, 1112]);
  assert.deepEqual(node.centre, [1000, 1160]);
});

test('bearings are compass bearings: north 0, east a quarter turn, south half', () => {
  assert.equal(bearingTo([0, 0], [0, -10]), 0);
  assert.ok(Math.abs(bearingTo([0, 0], [10, 0]) - Math.PI / 2) < 1e-12);
  assert.ok(Math.abs(Math.abs(bearingTo([0, 0], [0, 10])) - Math.PI) < 1e-12);
});

test('arriving in the social space faces out from the landmark; elsewhere inland from the ship', () => {
  const social = socialNode(plan, 'continent-1');
  assert.ok(Math.abs(Math.abs(arrivalFacing(social, plan, null)) - Math.PI) < 1e-12, 'the plaza lies south');
  const downs = { ...social, id: 'downs', kind: 'patrol' as const, spawns: [[5000, 5000]] as const };
  assert.ok(Math.abs(arrivalFacing(downs, plan, [4000, 5000]) - Math.PI / 2) < 1e-12, 'ashore from the west');
  assert.equal(arrivalFacing(downs, null, null), 0);
});

test("the city's pads are cleared ground; the land beyond them is not", () => {
  const cleared = clearedBy(plan.pads);
  assert.equal(cleared(1000, 1150), true);
  assert.equal(cleared(1000, 1300), false);
});
