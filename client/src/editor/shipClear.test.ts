import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HULL_NAMES, hullSails } from '../ships/hulls.ts';
import { SailRig } from '../ships/sails.ts';
import { orbitClearance, sweptBoxes } from './shipClear.ts';

const HULLS = HULL_NAMES.map((_name, hull) => hull);

/** Each of a rig's canvases, every wind from ahead round to astern on either side, set and trimmed to it. */
function everyCanvas(hull: number): number[][] {
  const points: number[][] = [];
  for (let offDeg = -180; offDeg <= 180; offDeg += 15) {
    const rig = new SailRig(hullSails(hull));
    for (let step = 0; step < 60; step++) rig.step(0.1, { offDeg, set: true }, step * 0.1);
    for (const canvas of rig.canvas())
      for (let point = 0; point < canvas.length; point += 3)
        points.push([canvas[point] ?? 0, canvas[point + 1] ?? 0, canvas[point + 2] ?? 0]);
  }
  return points;
}

test("every hull's swept boxes hold all its canvas, whatever the wind", () => {
  for (const hull of HULLS) {
    const boxes = sweptBoxes(hull);
    const outside = everyCanvas(hull).filter(
      (point) =>
        !boxes.some(([low, high]) =>
          point.every((value, axis) => value >= low[axis] - 0.3 && value <= high[axis] + 0.3),
        ),
    );
    assert.equal(outside.length, 0, `${HULL_NAMES[hull]}: ${JSON.stringify(outside.slice(0, 3))}`);
  }
});

test("the fight's camera, from any side and pitch, stands back past every part of its ship", () => {
  for (const hull of HULLS) {
    const ship = { x: 50, y: -20, heading: 0.7, heave: 0.4, pitch: 0.05, roll: -0.1, hull };
    const target = [ship.x, ship.y, ship.heave + 6] as const;
    for (let yaw = 0; yaw < 2 * Math.PI; yaw += Math.PI / 8)
      for (const pitch of [0.05, 0.3, 0.8]) {
        const back = orbitClearance(ship, target, yaw, pitch);
        // Stepping in from that far, no point of its way back to the target is past the clearance in any box.
        const eye = [
          target[0] - Math.sin(yaw) * Math.cos(pitch) * back,
          target[1] + Math.cos(yaw) * Math.cos(pitch) * back,
          target[2] + Math.sin(pitch) * back,
        ];
        const further = orbitClearance(ship, eye as unknown as readonly [number, number, number], yaw, pitch);
        assert.ok(further === 0, `${HULL_NAMES[hull]} at yaw ${yaw.toFixed(2)}: ${further} m more to clear`);
      }
  }
});

test('a camera far out over open water needs no clearance', () => {
  const ship = { x: 0, y: 0, heading: 0, heave: 0, pitch: 0, roll: 0, hull: 0 };
  assert.equal(orbitClearance(ship, [0, 500, 6], 0, 0.3), 0);
});

test("the Brig's clearance from astern takes in its spanker's swing, wider than its hull", () => {
  const ship = { x: 0, y: 0, heading: 0, heave: 0, pitch: 0, roll: 0, hull: 2 };
  // Looking north from astern: the eye stands south, past the spanker's boom swung to its beam.
  assert.ok(orbitClearance(ship, [0, 0, 6], 0, 0.05) > 17);
  assert.ok(orbitClearance(ship, [0, 0, 6], Math.PI / 2, 0.05) < orbitClearance(ship, [0, 0, 6], 0, 0.05));
});
