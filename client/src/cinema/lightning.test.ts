import assert from 'node:assert/strict';
import { test } from 'node:test';
import { flashAt, Lightning } from './lightning.ts';

test('a strike flashes twice and fades within a second', () => {
  assert.equal(flashAt(0), 1);
  assert.ok(flashAt(0.1) < 0.5, 'the dip between flashes');
  assert.ok(flashAt(0.15) > 0.5, 'the second flash');
  assert.ok(flashAt(0.6) < 0.2);
  assert.equal(flashAt(1), 0);
  assert.equal(flashAt(-0.1), 0);
});

test('a called strike lights the frame, shows its bolt briefly, and thunders by its distance', () => {
  const heard: number[] = [];
  const storm = new Lightning(7, (distanceKm) => heard.push(distanceKm));
  storm.strike(300, 400, [0, 0]);
  assert.deepEqual(heard, [0.5]);
  const first = storm.step(0.02, [0, 0]);
  assert.ok(first.flash > 0.5);
  assert.deepEqual([first.bolt?.x, first.bolt?.y], [300, 400]);
  const later = storm.step(0.5, [0, 0]);
  assert.equal(later.bolt, null);
});

test('strikes come by themselves only when on, seeded alike, spaced apart', () => {
  const times = (seed: number) => {
    const struck: number[] = [];
    let clock = 0;
    const storm = new Lightning(seed, () => struck.push(clock));
    storm.on = true;
    for (let frame = 0; frame < 60 * 60; frame++) {
      clock += 1 / 60;
      storm.step(1 / 60, [0, 0]);
    }
    return struck;
  };
  const once = times(3);
  assert.deepEqual(once, times(3));
  assert.ok(once.length >= 5 && once.length <= 16, `${once.length} strikes in a minute`);
  for (let index = 1; index < once.length; index++) assert.ok((once[index] ?? 0) - (once[index - 1] ?? 0) >= 4 - 1e-6);
  const quiet = new Lightning(3, () => assert.fail('no strike while off'));
  for (let frame = 0; frame < 900; frame++) quiet.step(1 / 60, [0, 0]);
});
