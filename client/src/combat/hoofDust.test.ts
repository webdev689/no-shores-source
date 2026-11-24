import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIG_DUST, HoofDust, MOST_MOTES, SETTLE_DUST, STRIKES_PER_S } from './hoofDust.ts';
import { MARK_FLOATS } from './marks.ts';

const OPEN = { blocks: [] };
const PAVED = { blocks: [{ minX: -50, minY: -50, maxX: 50, maxY: 50, top: 0, bottom: -1 }] };
const RIDER = { feet: [0, 0, 0] as const, facing: 0, mounted: true, boosting: 0 };
const FRAME = 1 / 60;

/** A random draw that goes round the same few numbers, so a test's dust falls alike each run. */
function seeded(): () => number {
  let seed = 7;
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

test('a boost digs in with dust and clods, kicks dust up a strike at a time, and settles in a cloud ahead', () => {
  const dust = new HoofDust(seeded());
  dust.frame(RIDER, OPEN, FRAME);
  assert.equal(dust.count, 0, 'nothing while it does not boost');
  dust.frame({ ...RIDER, boosting: 4 }, OPEN, 0);
  assert.ok(dust.count > DIG_DUST, 'dust and clods as it begins');
  // Half a second riding north at a boosted walk, beside a horse boosted standing still: none of it has settled yet.
  const standing = new HoofDust(seeded());
  standing.frame({ ...RIDER, boosting: 4 }, OPEN, 0);
  for (let frame = 1; frame <= 30; frame++) {
    dust.frame({ ...RIDER, feet: [0, (-9 * frame) / 60, 0], boosting: 3 }, OPEN, FRAME);
    standing.frame({ ...RIDER, boosting: 3 }, OPEN, FRAME);
  }
  const strikes = dust.count - standing.count;
  assert.ok(strikes >= (STRIKES_PER_S / 2 - 1) * 3, `half a second of strikes, none standing: ${strikes}`);
  const out: number[] = [];
  dust.lay(out, [0, 20, 2]);
  assert.equal(out.length, dust.count * 6 * MARK_FLOATS, 'a quad each, facing the eye');
  // Thrown back from a horse facing north: the dust lies south of where it stands now.
  const souths = out.filter((_value, index) => index % MARK_FLOATS === 1);
  assert.ok(souths.reduce((sum, south) => sum + south, 0) / souths.length > -4.5, 'behind the horse');
  const running = dust.count;
  dust.frame({ ...RIDER, feet: [0, -4.5, 0], boosting: 0 }, OPEN, 0);
  assert.equal(dust.count, running + SETTLE_DUST, 'the cloud as it settles');
});

test('the pool never holds more than its most, and paving throws no clods', () => {
  const dust = new HoofDust(seeded());
  dust.frame({ ...RIDER, boosting: 4 }, PAVED, 0);
  assert.equal(dust.count, DIG_DUST, 'dust alone off stone');
  for (let frame = 0; frame < 600; frame++) dust.frame({ ...RIDER, feet: [0, -9 * frame, 0], boosting: 4 }, OPEN, 1);
  assert.ok(dust.count <= MOST_MOTES);
  const onFoot = new HoofDust(seeded());
  for (let frame = 0; frame < 60; frame++) onFoot.frame({ ...RIDER, mounted: false, boosting: 4 }, OPEN, FRAME);
  assert.equal(onFoot.count, 0, 'on foot no horse boosts');
});
