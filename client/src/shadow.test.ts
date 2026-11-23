import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countingGpu } from './gpuForTests.ts';
import {
  aheadOf,
  boxCasts,
  CASCADES,
  castPlanes,
  type CascadeView,
  FAR,
  FAR_HOLD_M,
  FAR_TURN,
  heldToward,
  heldView,
  NEAR,
  SHADOW_SIZE,
  ShadowMap,
  shadowMatrix,
  sphereCasts,
  sunAxes,
  viewOf,
} from './shadow.ts';
import { FAR_HELD_FRAMES } from './shadowCache.ts';

type Vector = readonly [number, number, number];
const apply = (matrix: Float32Array, point: Vector): Vector => {
  const row = (index: number) =>
    (matrix[index] ?? 0) * point[0] +
    (matrix[index + 4] ?? 0) * point[1] +
    (matrix[index + 8] ?? 0) * point[2] +
    (matrix[index + 12] ?? 0);
  return [row(0), row(1), row(2)];
};
const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const along = (point: Vector, axis: Vector, metres: number): Vector => [
  point[0] + axis[0] * metres,
  point[1] + axis[1] * metres,
  point[2] + axis[2] * metres,
];
/** The clear afternoon's sun, the key light the maps are cast along until a sky sets one. */
const AFTERNOON: Vector = [-0.5417, 0.5417, 0.6428];
const TOWARD = heldToward(AFTERNOON);
/** The planes round a cascade's square for an eye at the world's origin, the square `ahead` of it. */
const planesAt = (cascade: typeof NEAR, ahead: readonly [number, number]) =>
  castPlanes(shadowMatrix([0, 0, 0], { toward: TOWARD, middle: [ahead[0], ahead[1], 0] }, cascade));

test("the sun's axes are square to each other and its light falls down and away from the sun", () => {
  const { right, up, along: light } = sunAxes();
  assert.ok(
    Math.abs(dot(right, up)) < 1e-12 && Math.abs(dot(right, light)) < 1e-12 && Math.abs(dot(up, light)) < 1e-12,
  );
  assert.ok(light[2] < 0, 'the light falls');
  assert.ok(up[2] > 0, "the map's up leans up");
});

test("each cascade maps its square's middle to its middle and its edges to the clip edges, wherever the eye stands", () => {
  for (const cascade of CASCADES)
    for (const eye of [
      [2_809_154.37, 1_201_255.43, 89.6],
      [12.5, -40.2, 3],
    ] as const) {
      const ahead = aheadOf(cascade, Math.PI);
      const matrix = shadowMatrix(eye, viewOf(cascade, eye, Math.PI, TOWARD), cascade);
      const middle = apply(matrix, [ahead[0], ahead[1], 0]);
      const texel = 2 / SHADOW_SIZE;
      assert.ok(Math.abs(middle[0]) <= texel && Math.abs(middle[1]) <= texel, `${middle}`);
      assert.ok(Math.abs(middle[2] - 0.5) < 1e-6, `${middle[2]}`);
      const { right, along: light } = sunAxes();
      const edge = apply(matrix, along([ahead[0], ahead[1], 0], right, cascade.reachM));
      assert.ok(Math.abs(edge[0] - 1) <= texel, `${edge}`);
      const toward = apply(matrix, along([ahead[0], ahead[1], 0], light, -100));
      assert.ok(toward[2] < middle[2], 'nearer the sun is shallower in the map');
    }
});

test("each square's middle is snapped to its texels, so a step of the eye moves its shadows a whole texel or none", () => {
  for (const cascade of CASCADES) {
    const texel = (2 * cascade.reachM) / SHADOW_SIZE;
    const seenAt = (eyeX: number) => {
      const eye = [eyeX, 500, 10] as const;
      const matrix = shadowMatrix(eye, viewOf(cascade, eye, 0, TOWARD), cascade);
      // A fixed world point, seen from the moved eye.
      return apply(matrix, [1000 - eyeX, 0, 0])[0] * (SHADOW_SIZE / 2);
    };
    const shift = seenAt(1000 + texel * 0.3) - seenAt(1000);
    assert.ok(Math.abs(shift) < 1e-3 || Math.abs(Math.abs(shift) - 1) < 1e-3, `${shift}`);
  }
});

test('the far square holds the near one whichever way the eye looks, held as far behind the eye as it may be', () => {
  const { right, up } = sunAxes();
  for (let step = 0; step < 16; step++) {
    const yaw = (step / 16) * 2 * Math.PI;
    const [near, far] = [aheadOf(NEAR, yaw), aheadOf(FAR, yaw)];
    const offset: Vector = [near[0] - far[0], near[1] - far[1], 0];
    for (const axis of [right, up]) {
      const apart = Math.abs(dot(offset, axis)) + NEAR.reachM;
      assert.ok(apart + FAR_HOLD_M + (2 * FAR.reachM) / SHADOW_SIZE < FAR.reachM, `yaw ${yaw.toFixed(2)}`);
    }
  }
});

test("the far square's depth holds the ground anywhere in it, 400 m under the eye to 300 m over, and a tower over that", () => {
  const { right, up, along: light } = sunAxes();
  // Its middle held as far over or under the eye as it may be.
  for (const held of [-FAR_HOLD_M, FAR_HOLD_M]) {
    const matrix = shadowMatrix([0, 0, 0], { toward: TOWARD, middle: [0, 0, held] }, FAR);
    for (const [across, upward] of [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ] as const)
      for (const height of [-400, 300]) {
        // The point at this corner of the square, slid along the sun to this height.
        const corner: Vector = along(along([0, 0, 0], right, across * FAR.reachM), up, upward * FAR.reachM);
        const ground = along(corner, light, (height - corner[2]) / light[2]);
        // A tower 300 m over that ground, its top toward the sun from where its shadow falls.
        const top = along(ground, light, -300 / -light[2]);
        for (const point of [ground, top]) {
          const depth = apply(matrix, point)[2];
          assert.ok(depth > 0 && depth < 1, `${across}, ${upward} at ${height} m: ${depth}`);
        }
      }
  }
});

test('the far view is held while the eye walks, turns a little or the sun creeps, and set again past that', () => {
  const eye = [2_809_154.37, 1_201_255.43, 89.6] as const;
  const held = viewOf(FAR, eye, 0.4, TOWARD);
  const moved = (east: number, yaw = 0.4, toward = TOWARD) =>
    heldView(held, viewOf(FAR, [eye[0] + east, eye[1], eye[2]], yaw, toward));
  assert.equal(moved(0), held);
  assert.equal(moved(30), held, 'a walk of 30 m');
  assert.notEqual(moved(45), held, 'of 45 m');
  assert.equal(moved(0, 0.4 + (1 * Math.PI) / 180), held, 'a turn of a degree');
  assert.notEqual(moved(0, 0.4 + (5 * Math.PI) / 180), held, 'of five');
  const turned = (angle: number) => heldToward([AFTERNOON[0] + angle, AFTERNOON[1] + angle, AFTERNOON[2]]);
  assert.equal(moved(0, 0.4, turned(FAR_TURN / 4)), held, 'the sun some seconds on');
  assert.notEqual(moved(0, 0.4, turned(FAR_TURN * 2)), held, 'the sun a while on');
  assert.equal(heldView(null, held), held);
});

test('a held view takes a world point to the same texel of its map wherever the eye has moved to since', () => {
  const view: CascadeView = viewOf(FAR, [2_809_154.37, 1_201_255.43, 89.6], 1.1, TOWARD);
  const point = [2_809_700.25, 1_201_010.5, 40] as const;
  const seenFrom = (eye: Vector) =>
    apply(shadowMatrix(eye, view, FAR), [point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]]);
  const [first, later] = [seenFrom([2_809_154.37, 1_201_255.43, 89.6]), seenFrom([2_809_170.9, 1_201_233.1, 92])];
  for (let axis = 0; axis < 3; axis++)
    assert.ok(Math.abs((first[axis] ?? 0) - (later[axis] ?? 0)) < 1e-5, `${first} against ${later}`);
});

test("a box casts into a square when, seen along the sun, it overlaps it, even far below the eye's height", () => {
  const ahead = aheadOf(NEAR, 0);
  const planes = planesAt(NEAR, ahead);
  // A block 40 m across on the ground in the square's middle, the eye standing level with it.
  assert.ok(boxCasts(planes, NEAR, [ahead[0] - 20, ahead[1] - 20, 0], [ahead[0] + 20, ahead[1] + 20, 20]));
  // One far off, out of the square every way.
  assert.ok(!boxCasts(planes, NEAR, [5000, 5000, 0], [5040, 5040, 20]));
  // A house 100 m under an eye on a plaza: the square meets the ground there displaced away from the sun, and the
  // house's shadow falls in it.
  const { along: light } = sunAxes();
  const under = [ahead[0] + light[0] * 140, ahead[1] + light[1] * 140, -100] as const;
  assert.ok(boxCasts(planes, NEAR, [under[0] - 5, under[1] - 5, -100], [under[0] + 5, under[1] + 5, -90]));
  // The same house toward the sun from the middle by as far is out of it.
  const toward = [ahead[0] - light[0] * 400, ahead[1] - light[1] * 400, -100] as const;
  assert.ok(!boxCasts(planes, NEAR, [toward[0] - 5, toward[1] - 5, -100], [toward[0] + 5, toward[1] + 5, -90]));
});

test('a tower toward the sun from the square casts into it from its top', () => {
  const ahead = aheadOf(NEAR, 0);
  const planes = planesAt(NEAR, ahead);
  const { along: light } = sunAxes();
  const horizontal = Math.hypot(light[0], light[1]);
  // 300 m toward the sun along the ground from the square's middle; a 300 m tower there throws its top's shadow
  // 300 / tan(elevation) metres away from the sun, into the square.
  const base = [ahead[0] - (light[0] / horizontal) * 300, ahead[1] - (light[1] / horizontal) * 300] as const;
  assert.ok(!boxCasts(planes, NEAR, [base[0] - 5, base[1] - 5, 0], [base[0] + 5, base[1] + 5, 10]));
  assert.ok(boxCasts(planes, NEAR, [base[0] - 5, base[1] - 5, 0], [base[0] + 5, base[1] + 5, 300]));
});

test('a caster under two texels of a map either side of its middle casts nothing into it: a crate into the far map', () => {
  const [near, far] = [planesAt(NEAR, aheadOf(NEAR, 0)), planesAt(FAR, aheadOf(FAR, 0))];
  const crate = [
    [-0.4, -80.4, 0],
    [0.4, -79.6, 0.8],
  ] as const;
  assert.ok(boxCasts(near, NEAR, ...crate), 'a crate into the near map');
  assert.ok(!boxCasts(far, FAR, ...crate), 'not into the far');
  assert.ok(boxCasts(far, FAR, [-3, -83, 0], [3, -77, 6]), 'a cottage into both');
  assert.ok(!boxCasts(near, NEAR, [-0.1, -80.1, 0], [0.1, -79.9, 0.2]), 'a stone into neither');
  assert.ok(!sphereCasts(far, FAR, [0, -80, 1], 2), 'a cart into neither');
  assert.ok(sphereCasts(far, FAR, [0, -80, 1], 2.5), 'a wagon into the far map');
});

test("a ship casts into a square its ball overlaps seen along the sun, out of the camera's view or not", () => {
  const ahead = aheadOf(NEAR, 0);
  const planes = planesAt(NEAR, ahead);
  const { right } = sunAxes();
  // 40 m about her middle, in the square's middle, then off its side by less and by more than that.
  assert.ok(sphereCasts(planes, NEAR, [ahead[0], ahead[1], 0], 40));
  const off = (metres: number): Vector => along([ahead[0], ahead[1], 0], right, NEAR.reachM + metres);
  assert.ok(sphereCasts(planes, NEAR, off(30), 40));
  assert.ok(!sphereCasts(planes, NEAR, off(50), 40));
  // Behind the eye but under the far square: it casts there, though the camera looks away.
  const behind = aheadOf(FAR, 0);
  assert.ok(sphereCasts(planesAt(FAR, behind), FAR, [0, 200, 0], 40));
  assert.ok(!sphereCasts(planes, NEAR, [0, 400, 0], 40));
});

/** A frame's encoder that counts the passes begun, each a list of the calls made into it. */
function countingEncoder(): { encoder: GPUCommandEncoder; passes: unknown[][][] } {
  const passes: unknown[][][] = [];
  const begin = () => {
    const calls: unknown[][] = [];
    passes.push(calls);
    return new Proxy({} as GPURenderPassEncoder, {
      get:
        (_target, name) =>
        (...args: unknown[]) =>
          calls.push([name, ...args]),
    });
  };
  return { encoder: { beginRenderPass: begin } as unknown as GPUCommandEncoder, passes };
}

test('the near map is drawn every frame; the far one only when its view or its casters change, or once a second', () => {
  const map = new ShadowMap(countingGpu().gpu);
  const pipeline = { getBindGroupLayout: () => ({}) } as unknown as GPURenderPipeline;
  let eye: Vector = [2_809_154.37, 1_201_255.43, 89.6];
  // A city's block, 300 m ahead, standing still; a ship 500 m ahead in the far square, out of the near one.
  let ship: Vector = [eye[0], eye[1] - 500, 88];
  const block = [eye[0] - 20, eye[1] - 320, 80] as const;
  const frame = (aboveM = 10): number => {
    const { encoder, passes } = countingEncoder();
    map.update(eye, 0, aboveM, AFTERNOON);
    map.cast(encoder, (pass) => {
      const low = [block[0] - eye[0], block[1] - eye[1], block[2] - eye[2]] as const;
      if (map.reaches(low, [low[0] + 40, low[1] + 40, low[2] + 30])) {
        pass.setPipeline(pipeline);
        pass.setBindGroup(1, map.casterGroup(pipeline));
        pass.draw(36, 1, 0, 0);
      }
      if (map.sphereReaches([ship[0] - eye[0], ship[1] - eye[1], ship[2] - eye[2]], 40)) {
        map.tally(...ship);
        pass.drawIndexed(3000);
      }
    });
    return passes.length;
  };
  assert.equal(frame(), 2, 'the first frame draws both');
  assert.equal(frame(), 1, 'a still frame the near alone');
  eye = [eye[0] + 1, eye[1], eye[2]];
  assert.equal(frame(), 1, 'a step of the eye');
  ship = [ship[0] + 0.5, ship[1], ship[2]];
  assert.equal(frame(), 2, 'the ship moved');
  assert.equal(frame(), 1);
  ship = [ship[0] + 5000, ship[1], ship[2]];
  assert.equal(frame(), 2, 'the ship sailed out of the far square');
  ship = [ship[0] + 10, ship[1], ship[2]];
  assert.equal(frame(), 1, 'and moves out there unseen');
  eye = [eye[0] + 60, eye[1], eye[2]];
  assert.equal(frame(), 2, 'the eye walked past the hold');
  let drawn = 0;
  for (let still = 0; still <= FAR_HELD_FRAMES; still++) drawn += frame() - 1;
  assert.equal(drawn, 1, 'once in a second of still frames');
  assert.equal(frame(500), 0, 'high over the ground nothing');
  assert.equal(frame(), 2, 'and back down a far map drawn afresh');
});

test("the far map is drawn from its casters' recorded calls, into its own layer's pass, with its own matrix's group", () => {
  const map = new ShadowMap(countingGpu().gpu);
  const pipeline = { getBindGroupLayout: () => ({}) } as unknown as GPURenderPipeline;
  const { encoder, passes } = countingEncoder();
  const groups: GPUBindGroup[] = [];
  map.update([0, 0, 10], 0, 10, AFTERNOON);
  map.cast(encoder, (pass) => {
    const group = map.casterGroup(pipeline);
    groups.push(group);
    pass.setPipeline(pipeline);
    pass.setBindGroup(1, group);
    pass.draw(36, map.cascade === FAR ? 2 : 1, 0, 0);
  });
  assert.deepEqual(passes, [
    [['setPipeline', pipeline], ['setBindGroup', 1, groups[0]], ['draw', 36, 1, 0, 0], ['end']],
    [['setPipeline', pipeline], ['setBindGroup', 1, groups[1]], ['draw', 36, 2, 0, 0], ['end']],
  ]);
  assert.notEqual(groups[0], groups[1]);
  assert.equal(map.cascade, NEAR);
});
