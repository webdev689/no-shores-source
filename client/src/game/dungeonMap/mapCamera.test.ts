import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dragTurn,
  eased,
  fromPaper,
  type MapView,
  ORBIT,
  panned,
  planned,
  restView,
  tilted,
  toPaper,
  turned,
  zoomedAt,
} from './mapCamera.ts';

const near = (actual: number, expected: number, message?: string) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message ?? ''} ${actual} is not ${expected}`);

const view = (more: Partial<MapView> = {}): MapView => ({
  yaw: 0,
  pitch: Math.PI / 2,
  scale: 10,
  centre: [100, 50, 0],
  ...more,
});

test('the flat plan lies north up: east to the right, south down, metres times the scale', () => {
  const [across, down] = toPaper(view(), [103, 48, 0]);
  near(across, 30);
  near(down, -20);
});

test('a turned and tilted view foreshortens the plan and lifts what stands higher', () => {
  const tilt = view({ yaw: Math.PI / 2, pitch: Math.PI / 6 });
  const [across, down] = toPaper(tilt, [101, 50, 0]);
  near(across, 0, 'east turned a quarter lies down the paper');
  near(down, 5, 'foreshortened by the sine of the tilt');
  near(toPaper(tilt, [100, 50, 2])[1], -2 * Math.cos(Math.PI / 6) * 10, 'higher is up the paper');
});

test('a point on the paper reads back to the floor it lies on', () => {
  const tilt = view({ yaw: -0.62, pitch: 1.12 });
  const [across, down] = toPaper(tilt, [120, 70, 0]);
  const [x, y] = fromPaper(tilt, [across, down]);
  near(x, 120);
  near(y, 70);
});

test('Q and E turn by an eighth of a turn, R and F tilt within the orbit', () => {
  near(turned(view(), 1).yaw, Math.PI / 4);
  near(tilted(view({ pitch: 1 }), 1).pitch, 1 + ORBIT.pitchStep);
  near(tilted(view(), 1).pitch, Math.PI / 2, 'never past the plan');
  near(tilted(view({ pitch: 0.25 }), -1).pitch, ORBIT.pitchMin, 'never under the floor');
  const dragged = dragTurn(view({ pitch: 1 }), 100, 50);
  near(dragged.yaw, 0.8);
  near(dragged.pitch, 1 - 0.3);
});

test('the view eases toward its goal, turning the short way round', () => {
  const goal = view({ yaw: Math.PI - 0.1 });
  const shown = view({ yaw: -Math.PI + 0.1 });
  const after = eased(shown, goal, 0.05);
  assert.ok(after.yaw < shown.yaw, 'turned back past the half turn, not forward round it');
  near(eased(shown, goal, 100).yaw, goal.yaw - 2 * Math.PI, 'settled on the same bearing');
});

test('P lays the plan, turned to the nearest whole turn, and P again goes back', () => {
  const before = view({ yaw: 5.9, pitch: 1.1 });
  const plan = planned(before, null);
  near(plan.view.pitch, Math.PI / 2);
  near(plan.view.yaw, 2 * Math.PI);
  assert.deepEqual(planned(plan.view, plan.before).view, before);
});

test('a drag pans the paper with the pointer, and the wheel zooms about the pointer', () => {
  const tilt = view({ yaw: 0.7, pitch: 0.9 });
  const moved = panned(tilt, [15, -8]);
  const [across, down] = toPaper(moved, [100, 50, 0]);
  near(across, 15);
  near(down, -8);
  const under = fromPaper(tilt, [40, 30]);
  const zoomed = zoomedAt(tilt, 1.35, [40, 30]);
  near(zoomed.scale, 13.5);
  const [x, y] = fromPaper(zoomed, [40, 30]);
  near(x, under[0]);
  near(y, under[1]);
  near(zoomedAt(tilt, 10, [0, 0]).scale, ORBIT.scaleMost, 'no closer than the most');
});

test('the rest view fits what is explored, readable, and centres on the player far from its middle', () => {
  const explored: [number, number, number][] = [
    [0, 0, 0],
    [100, 0, 0],
    [0, 40, 0],
    [100, 40, 0],
  ];
  const paper = { width: 920, height: 600 };
  const flat = restView(explored, [50, 20, 0], paper, { yaw: 0, pitch: Math.PI / 2 });
  near(flat.scale, 8.464, 'the 100 m fit in 0.92 of the width');
  near(flat.centre[0], 50);
  near(flat.centre[1], 20);
  const wide = restView(
    [
      [0, 0, 0],
      [1000, 0, 0],
    ],
    [0, 0, 0],
    paper,
    { yaw: 0, pitch: Math.PI / 2 },
  );
  near(wide.scale, ORBIT.restLeast, 'never smaller than readable');
  near(wide.centre[0], 0, 'the player is centred where the fit would leave them near the edge');
  near(restView([], [7, 8, -8], paper, { yaw: 0, pitch: 1 }).centre[2], -8, 'nothing explored: on the player');
});
