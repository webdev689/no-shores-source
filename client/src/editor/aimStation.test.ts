import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HULL_NAMES, hullBox, hullMouths, hullSails } from '../ships/hulls.ts';
import { SailRig } from '../ships/sails.ts';
import { HULL_DECKS, cellHeight } from '../ships/deck.ts';
import { aimStation, railAt } from './aimStation.ts';

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

test("every hull's aim eye stands aboard, over its deck and rail beside its battery, the nearest lay seen over its rail", () => {
  for (const hull of HULLS) {
    const { eye, ports, onDeck, nearestM } = aimStation(hull);
    const deck = HULL_DECKS[hull];
    assert.ok(onDeck && deck, `${HULL_NAMES[hull]} stands its eye aboard`);
    const under = cellHeight(deck, eye[1], -eye[0]);
    assert.ok(under !== null && eye[2] >= under + 1.7, `${HULL_NAMES[hull]}: ${eye[2]} m up, its deck ${under} m`);
    const rail = railAt(deck, eye[0]);
    assert.ok(eye[2] > rail + 0.3, `over its rail at ${rail} m`);
    const halfBeam = Math.abs(hullBox(hull)[1][1]);
    // Its rail at the foot of the view: its top well under the look to the water its guns lay nearest.
    const [toLay, toRail] = [Math.atan2(eye[2], nearestM - eye[1]), Math.atan2(eye[2] - rail, halfBeam - eye[1])];
    assert.ok(
      toRail - toLay > 0.15,
      `${HULL_NAMES[hull]}: its rail ${(((toRail - toLay) * 180) / Math.PI).toFixed(1)}° under the look`,
    );
    const battery = hullMouths(hull).map((mouth) => mouth[0]);
    assert.ok(eye[0] > Math.min(...battery) - 4.01 && eye[0] < Math.max(...battery) + 4.01, 'by its battery');
    assert.ok(Math.abs(eye[1]) < halfBeam && ports[1] > 0, 'inboard of its side, its ports outboard');
    // Square off its guns, its rail at the foot of the view: beside its battery's middle, out toward the side laid.
    assert.ok(
      Math.abs(eye[0] - ports[0]) < 1.5,
      `${HULL_NAMES[hull]}: ${(eye[0] - ports[0]).toFixed(2)} m from its guns' middle`,
    );
    assert.ok(eye[1] > halfBeam / 2, `${HULL_NAMES[hull]}: ${eye[1].toFixed(2)} m out of ${halfBeam} m`);
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
