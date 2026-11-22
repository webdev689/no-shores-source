import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HULL_NAMES, hullBox, hullMouths, hullSails } from '../ships/hulls.ts';
import { SailRig } from '../ships/sails.ts';
import { aimStation } from './aimStation.ts';

const HULLS = HULL_NAMES.map((_name, hull) => hull);

/** The nearest any of a rig's canvas comes to `eye` (its frame), over every wind from ahead round to astern on either
 *  side, its sails set and trimmed to it. */
function nearestCanvas(hull: number, eye: readonly number[]): number {
  let nearest = Infinity;
  for (let offDeg = -180; offDeg <= 180; offDeg += 10) {
    const rig = new SailRig(hullSails(hull));
    for (let step = 0; step < 60; step++) rig.step(0.1, { offDeg, set: true }, step * 0.1);
    for (const points of rig.canvas())
      for (let point = 0; point < points.length; point += 3) {
        const gap = Math.hypot(
          (points[point] ?? 0) - (eye[0] ?? 0),
          (points[point + 1] ?? 0) - (eye[1] ?? 0),
          (points[point + 2] ?? 0) - (eye[2] ?? 0),
        );
        nearest = Math.min(nearest, gap);
      }
  }
  return nearest;
}

test("every hull's aim eye stands out past its hull and its guns' mouths, abreast its battery's middle", () => {
  for (const hull of HULLS) {
    const { eye, ports } = aimStation(hull);
    const [low, high] = hullBox(hull);
    const mouths = hullMouths(hull);
    const widest = Math.max(Math.abs(low[1]), Math.abs(high[1]), ...mouths.map((mouth) => Math.abs(mouth[1])));
    assert.ok(eye[1] >= widest + 1.5 - 1e-9, `${HULL_NAMES[hull]}: ${eye[1]} m out, its side ${widest} m`);
    assert.ok(eye[0] > low[0] && eye[0] < high[0], 'along its own length');
    assert.ok(eye[2] > ports[2] + 3, 'over its gun line');
    assert.ok(ports[1] <= widest && ports[1] > 0, 'going out from its ports');
  }
});

test('no wind brings any of its own canvas within a metre of the aim eye, on either side', () => {
  for (const hull of HULLS) {
    const { eye } = aimStation(hull);
    for (const side of [1, -1]) {
      const nearest = nearestCanvas(hull, [eye[0], eye[1] * side, eye[2]]);
      assert.ok(
        nearest > 1,
        `${HULL_NAMES[hull]}, side ${side}: its canvas comes ${nearest.toFixed(2)} m from the eye`,
      );
    }
  }
});

test("the Sloop's eye stands forward of its mast, where its boom never swings", () => {
  const sails = hullSails(0);
  const gaff = sails.find((sail) => sail.kind === 'gaff');
  assert.ok(gaff?.kind === 'gaff');
  assert.ok(aimStation(0).eye[0] > gaff.tack[0] + 1);
});

test('the guns lay no nearer than their lowest elevation reaches the water from their mouths', () => {
  for (const hull of HULLS) {
    const { ports, nearestM } = aimStation(hull);
    const reach = ports[2] / Math.tan((10 * Math.PI) / 180);
    assert.ok(Math.abs(nearestM - (ports[1] + reach)) < 1e-9);
    assert.ok(nearestM > ports[1] + 10, `${HULL_NAMES[hull]}: ${nearestM} m`);
  }
});
