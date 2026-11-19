import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cellShows, flagAt, harmedCanvas, mastFalls } from './harmDrawn.ts';
import { hullSails } from './hulls.ts';
import { SAIL_CELLS, SailRig } from './sails.ts';
import { FALL_S, FLOAT_S, mastsOf, ShipHarm, SINK_S, STRIKE_S } from './shipHarm.ts';

const BRIG = hullSails(2);
const SLOOP = hullSails(0);
const MASTS = [
  { footZ: 2, topZ: 28 },
  { footZ: 2, topZ: 30 },
];

test("her masts are where her sails' heads and luffs stand, fore to aft, each sail on one", () => {
  const brig = mastsOf(BRIG);
  assert.equal(brig.masts.length, 2);
  assert.ok((brig.masts[0] ?? 0) > (brig.masts[1] ?? 0), 'the foremast first');
  assert.equal(brig.sailMast.length, BRIG.length);
  assert.equal(mastsOf(SLOOP).masts.length, 1);
  assert.ok(mastsOf(hullSails(3)).masts.length === 3);
});

test("her canvas's holes grow with her sail harm, new holes beside old", () => {
  const harm = new ShipHarm(SLOOP);
  harm.wear(0);
  assert.ok(harm.holes.every((holes) => holes.size === 0));
  harm.wear(0.3);
  const some = harm.holes.map((holes) => holes.size);
  harm.wear(0.9);
  harm.holes.forEach((holes, sail) => assert.ok(holes.size > (some[sail] ?? 0)));
  harm.wear(1);
  assert.ok(harm.holes.every((holes) => holes.size === Math.round(SAIL_CELLS / 3)));
  harm.wear(0.2);
  assert.ok(harm.holes.every((holes) => holes.size === Math.round(SAIL_CELLS / 3)), 'a hole never closes');
});

test('a ball through a sail opens a hole there that stays', () => {
  const rig = new SailRig(SLOOP);
  for (let tick = 0; tick < 240; tick++) rig.step(1 / 60, { offDeg: 90, set: true }, tick / 60);
  const gaff = rig.canvas()[1] ?? new Float32Array(3);
  // Its grid's middle point, which the ball passes.
  const middle = ((3 * 8 + 4) * 3) as number;
  const near = rig.cellNear([gaff[middle] ?? 0, gaff[middle + 1] ?? 0, gaff[middle + 2] ?? 0]);
  assert.ok(near && near.distanceM < 1.5 && near.sail === 1, 'the gaff sail is struck');
  rig.harm.hole(near.sail, near.cell);
  assert.equal(cellShows(rig.harm, near.sail, near.cell, 100), false);
  assert.equal(cellShows(rig.harm, 0, near.cell, 100), true);
});

test('a torn sail falls to the sea over her side, floats astern a while, then is gone', () => {
  const rig = new SailRig(SLOOP);
  rig.step(0, { offDeg: 90, set: true }, 0);
  rig.harm.loseSail(1, 0, 1);
  const before = rig.canvas();
  const lying = (now: number) => harmedCanvas(rig.canvas(), rig.harm, [{ footZ: 1.4, topZ: 9 }], 2, now)[1];
  const landed = lying(FALL_S);
  assert.ok(landed && Math.max(...[...landed].filter((unused, index) => index % 3 === 2)) < 0.1, 'it lies on the water');
  assert.ok(landed && Math.min(...[...landed].filter((unused, index) => index % 3 === 1)) > 2, 'over her side to leeward');
  for (let second = 0; second < 10; second++) rig.harm.step(1, 3, FALL_S + second);
  const astern = lying(FALL_S + 10);
  assert.ok(astern && (astern[0] ?? 0) < (before[1]?.[0] ?? 0) - 20, 'she has sailed on from it');
  assert.equal(cellShows(rig.harm, 1, 0, FALL_S + 5), true);
  assert.equal(cellShows(rig.harm, 1, 0, FALL_S + FLOAT_S + 1), false);
  assert.equal(rig.cellNear([0, 0, 8])?.sail, 0, 'no ball holes a sail gone');
});

test('a fallen mast leans over her side into the water, and its sails go with it', () => {
  const harm = new ShipHarm(BRIG);
  harm.fellMast(0, 0, -1);
  const turned = (now: number) => mastFalls(harm, MASTS, now);
  assert.equal(turned(0)[1], 1, 'it stands at first');
  const half = turned(FALL_S / 2);
  const over = turned(FALL_S);
  assert.ok((over[2] ?? 0) < (half[2] ?? 0) && (half[2] ?? 0) < 0, 'it goes over to port, faster as it falls');
  // Its head lies in the water: its foot's height plus its length turned by the fall.
  assert.ok(Math.abs(2 + 26 * (over[1] ?? 1)) < 1e-6);
  assert.deepEqual([...turned(FALL_S).slice(8, 12)], [2, 1, 0, 1], 'the mainmast stands');
  const foreSail = harm.layout.sailMast.indexOf(0);
  const rig = new SailRig(BRIG);
  const canvas = harmedCanvas(rig.canvas(), harm, MASTS, 4, FALL_S)[foreSail];
  assert.ok(canvas && Math.max(...[...canvas].filter((unused, index) => index % 3 === 2)) < 3, 'its sails are down');
  assert.equal(turned(FALL_S + FLOAT_S + 1)[3], 0, 'and gone under at last');
});

test('her colours come down her mast when she strikes, and are gone once down', () => {
  const harm = new ShipHarm(SLOOP);
  const masthead = [0, 0, 12] as const;
  assert.deepEqual(flagAt(masthead, harm, [{ footZ: 2, topZ: 12 }], 5), { at: masthead, shows: true });
  harm.strike(0);
  const halfway = flagAt(masthead, harm, [{ footZ: 2, topZ: 12 }], STRIKE_S / 2);
  assert.ok(Math.abs(halfway.at[2] - 7.5) < 1e-9 && halfway.shows);
  assert.equal(flagAt(masthead, harm, [{ footZ: 2, topZ: 12 }], STRIKE_S).shows, false);
});

test('sinking, she settles by her worse-hit end and lists, and is under in twenty seconds', () => {
  const harm = new ShipHarm(SLOOP);
  harm.scar([6, 2, 1]);
  harm.scar([4, 2, 0.5]);
  const place = { x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0 };
  assert.deepEqual(harm.settle(place, 10, 12), place);
  harm.sink(0);
  const early = harm.settle(place, SINK_S / 4, 12);
  const late = harm.settle(place, SINK_S, 12);
  assert.ok(early.z < 0 && late.z < early.z && late.z <= -12, 'under her masthead at the last');
  assert.ok(late.pitch < 0, 'down by her bow, where she is holed');
  assert.ok(late.roll > 0 && Math.abs(late.roll - (20 * Math.PI) / 180) < 1e-9, 'listed twenty degrees to starboard');
  assert.equal(harm.sunkShare(SINK_S * 2), 1);
});
