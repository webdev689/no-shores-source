import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MODEL_INSTANCE_BYTES } from './cityGpu.ts';
import { crustMoved, WreckCrust, writeInstances } from './crystalInstances.ts';
import { MIDDLE_BAND_M, MIDDLE_M, middleFade } from './tiers.ts';
import { wreckCrust } from './overtaken.ts';

const WRECK = { ship: 'schooner', at: [5000, 6000], heading: 1, heel: 0.4 } as const;

test("a wreck's crust is written again only once the ships' size has moved a step", () => {
  assert.equal(crustMoved(0, 4, 4), true, 'never written');
  assert.equal(crustMoved(4, 4.05, 4.02), false, 'still moving, within a step');
  assert.equal(crustMoved(4, 4.1, 4.05), true);
  assert.equal(crustMoved(1, 0.97, 0.99), true);
  // settled within a step of where it was written, it is written once more where it rests
  assert.equal(crustMoved(1.015, 1, 1), true);
  assert.equal(crustMoved(1, 1, 1), false);
});

test("a wreck's crust is written set out round its wreck as large as it is drawn, into bytes kept from write to write", () => {
  const crust = new WreckCrust([{ wreck: WRECK, crust: wreckCrust(WRECK) }], [4000, 5000], 7);
  const bytes = crust.bytes;
  for (const scale of [1, 4]) {
    crust.write(scale);
    assert.equal(crust.bytes, bytes, 'the same bytes');
    const floats = new Float32Array(crust.bytes);
    // each patch set out from the wreck's middle as far as the wreck is drawn larger, and as large
    const expected = wreckCrust(WRECK)
      .sort((a, b) => a.formation - b.formation)
      .map((place) => ({ ...place, at: [WRECK.at[0] + place.at[0] * scale], scale: place.scale * scale }));
    expected.forEach((place, index) => {
      const slot = (index * MODEL_INSTANCE_BYTES) / 4;
      assert.ok(
        Math.abs(floats[slot] - (place.at[0] - 4000)) < 1e-3 && Math.abs(floats[slot + 7] - place.scale) < 1e-6,
      );
    });
    assert.equal(
      crust.draws.reduce((sum, draw) => sum + draw.count, 0),
      expected.length,
    );
    assert.ok(crust.draws.every((draw) => draw.model >= 7));
  }
});

test("the middle distance's crystal fades out over a band as the masses do, gone by MIDDLE_M, never popping", () => {
  assert.equal(middleFade(MIDDLE_M - MIDDLE_BAND_M - 1), 0);
  assert.equal(middleFade(MIDDLE_M), 1);
  assert.ok(Math.abs(middleFade(MIDDLE_M - MIDDLE_BAND_M / 2) - 0.5) < 1e-9);
  let last = 0;
  for (let distance = 0; distance < MIDDLE_M + 100; distance += 10) {
    assert.ok(middleFade(distance) >= last && middleFade(distance) - last < 0.1, `${distance}`);
    last = middleFade(distance);
  }
  // a middle-distance formation is written for the shader to fade, a great one never
  const bytes = new ArrayBuffer(2 * MODEL_INSTANCE_BYTES);
  const place = { formation: 0, at: [1, 2, 3], yaw: 0, scale: 1 };
  writeInstances(
    [
      { ...place, reach: 'middle' },
      { ...place, reach: 'great' },
    ],
    [0, 0],
    bytes,
  );
  const whole = new Uint32Array(bytes);
  assert.deepEqual([whole[4], whole[MODEL_INSTANCE_BYTES / 4 + 4]], [1, 0]);
});
