import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MODEL_INSTANCE_BYTES } from './cityGpu.ts';
import { crustMoved, WreckCrust } from './crystalInstances.ts';
import { wreckCrust } from './overtaken.ts';

const WRECK = { ship: 'schooner', at: [5000, 6000], heading: 1, heel: 0.4 } as const;

test("a wreck's crust is written again only once the ships' size has moved a step", () => {
  assert.equal(crustMoved(0, 4), true, 'never written');
  assert.equal(crustMoved(4, 4.05), false);
  assert.equal(crustMoved(4, 4.1), true);
  assert.equal(crustMoved(1, 0.97), true);
});

test("a wreck's crust is written where wreckCrustAt sets it out, into bytes kept from write to write", () => {
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
