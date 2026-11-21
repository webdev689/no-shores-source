import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HULL_NAMES,
  hullName,
  hullOfCaptain,
  hullPaint,
  hullSails,
  hullWaterline,
  plateOverM,
  SLOOP_HULL,
} from './hulls.ts';
import { BAR_OVER_M } from './shipBars.ts';

test("a hull's wire number names it: the Sloop, the Schooner, the Brig and the Frigate", () => {
  assert.deepEqual([0, 1, 2, 3].map(hullName), ['sloop', 'schooner', 'brig', 'frigate']);
  assert.equal(hullName(9), 'sloop', 'a number with no model is drawn as the Sloop');
});

test('each hull reads its own waterline and sails from the manifest, the larger ranks the longer', () => {
  const lengths = HULL_NAMES.map((name, hull) => hullWaterline(hull).lengthM);
  assert.deepEqual(
    lengths.map((length) => Math.round(length)),
    [19, 25, 31, 38],
  );
  assert.ok(
    hullSails(2).some((sail) => sail.kind === 'square'),
    'the Brig sets square sails',
  );
  assert.ok(
    hullSails(SLOOP_HULL).every((sail) => sail.kind !== 'square'),
    'the Sloop none',
  );
});

test("a hull's plate stands as far over its highest sail as the Sloop's over its own", () => {
  assert.equal(plateOverM(SLOOP_HULL), BAR_OVER_M);
  assert.ok(plateOverM(3) > plateOverM(2) && plateOverM(2) > plateOverM(SLOOP_HULL) + 5, 'over the taller masts');
});

test('its stripe runs along the mouths of its upper guns, not a lower deck', () => {
  const sloop = hullPaint(SLOOP_HULL);
  assert.ok(Math.abs(sloop.atM - 2.37) < 0.05, `the Sloop's at ${sloop.atM} m`);
  const frigate = hullPaint(3);
  assert.ok(frigate.atM > 3, `the Frigate's upper deck, at ${frigate.atM} m`);
  assert.ok(Math.abs(frigate.rise) < 0.05, 'following its sheer gently');
});

test("a fight captain's hull points are never read as its hull's number", () => {
  // In a fight's view `hull` is its hull points and `hull_kind` its hull.
  assert.equal(hullOfCaptain({ hull: 240, max_hull: 240 }), SLOOP_HULL, 'a room that names no hull: the Sloop');
  assert.equal(hullOfCaptain({ hull: 240, max_hull: 240, hull_kind: 2 }), 2, 'the Brig, by its hull_kind');
});

test('a ship at sea and a fleet vessel name their hull in `hull`', () => {
  assert.equal(hullOfCaptain({ hull: 1 }), 1, "a Pirate's Schooner at sea");
  assert.equal(hullOfCaptain({}), SLOOP_HULL, 'a room from before hulls: the Sloop');
});
