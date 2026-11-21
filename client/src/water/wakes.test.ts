import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HULL_FIT, type HullMask } from './hullMask.ts';
import { WAKE, wakeAt } from './wakes.ts';

/** A Sloop heading north under way: its bow at y = -9, its stern at y = 9; starboard is east. */
const SLOOP: HullMask = { x: 0, y: 0, heading: 0, halfLength: 9, halfBeam: 2.8, way: 4 };
const stern = SLOOP.halfLength * HULL_FIT;
const beam = SLOOP.halfBeam * HULL_FIT;

/** Across its track (east), where its wake's arm is `aft` metres behind its stern. */
const armAt = (aft: number) => beam + aft * WAKE.armTan;

test("its wake's arms open 19.5 degrees either side of its track, as foam and a small wave", () => {
  assert.ok(Math.abs(WAKE.armTan - Math.tan((19.5 * Math.PI) / 180)) < 1e-15);
  for (const aft of [20, 60, 120]) {
    const onArm = wakeAt(SLOOP, [armAt(aft), stern + aft]);
    const port = wakeAt(SLOOP, [-armAt(aft), stern + aft]);
    const off = wakeAt(SLOOP, [armAt(aft) + 8, stern + aft]);
    assert.ok(onArm.foam > 0.3 && onArm.height > 0.05, `on the arm ${aft} m aft: ${JSON.stringify(onArm)}`);
    assert.ok(Math.abs(port.foam - onArm.foam) < 1e-12, 'both arms alike');
    assert.ok(off.foam < onArm.foam * 0.3 && off.height < onArm.height * 0.2, 'outside the V the sea lies still');
  }
  assert.ok(wakeAt(SLOOP, [beam * 0.5, stern + 5]).foam > 0.5, 'its track churns white close aft');
});

test('its wake runs a minute of its way aft and fades, and grows with its drawn size', () => {
  const aft = (seconds: number) => SLOOP.way * seconds;
  const young = wakeAt(SLOOP, [armAt(aft(10)), stern + aft(10)]);
  const old = wakeAt(SLOOP, [armAt(aft(45)), stern + aft(45)]);
  const gone = wakeAt(SLOOP, [armAt(aft(70)), stern + aft(70)]);
  assert.ok(young.foam > old.foam && old.foam > 0 && gone.foam === 0, `${young.foam} ${old.foam} ${gone.foam}`);
  assert.equal(wakeAt({ ...SLOOP, way: 0 }, [armAt(20), stern + 20]).foam, 0, 'at rest, none');
  // Drawn four times its size, as the raised view draws it, its wake is four times as long and wide.
  const big: HullMask = { ...SLOOP, halfLength: 36, halfBeam: 11.2, scale: 4 };
  const bigStern = 36 * HULL_FIT;
  const bigArm = (behind: number) => 11.2 * HULL_FIT + behind * WAKE.armTan;
  const far = wakeAt(big, [bigArm(4 * aft(45)), bigStern + 4 * aft(45)]);
  assert.ok(Math.abs(far.foam - old.foam) < 0.15, `the same share of its minute: ${far.foam} ${old.foam}`);
  assert.ok(far.height > old.height * 3, 'its wave as high as it is large');
});

test('its bow throws a bow wave and spray', () => {
  const bowWave = wakeAt(SLOOP, [4 * WAKE.armTan * 1.6, -stern + 4]);
  assert.ok(bowWave.foam > 0.3 && bowWave.height > 0.1, JSON.stringify(bowWave));
  const still = wakeAt(SLOOP, [beam * 0.8, -stern]).foam;
  const sprayed = wakeAt({ ...SLOOP, spray: 1 }, [beam * 0.8, -stern]).foam;
  assert.ok(sprayed > still + 0.4, `${sprayed} ${still}`);
});
