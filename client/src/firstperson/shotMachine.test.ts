import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Carry, Recoil, SHOOTER_FEEL, ShotMachine, reloadDip } from './shotMachine.ts';

/** Steps `machine` by `seconds` until `until` holds or `limit` seconds pass; answers the seconds taken and the events. */
function run(machine: ShotMachine, seconds: number, limit: number, until: () => boolean) {
  const events: { at: number; event: string }[] = [];
  let elapsed = 0;
  while (elapsed < limit && !until()) {
    elapsed += seconds;
    const event = machine.step(seconds);
    if (event) events.push({ at: elapsed, event });
  }
  return { elapsed, events };
}

test('a crossbow looses on its second frame, plays seven frames at seven a second, then reloads for 0.6 s', () => {
  const machine = new ShotMachine(SHOOTER_FEEL.crossbow);
  assert.equal(machine.fire(), true);
  assert.equal(machine.fire(), false);
  const { elapsed, events } = run(machine, 0.01, 3, () => machine.loaded);
  assert.deepEqual(
    events.map((each) => each.event),
    ['hit', 'ready'],
  );
  assert.ok(Math.abs((events[0]?.at ?? 0) - 1 / 7) < 0.011);
  assert.ok(Math.abs(elapsed - 1.6) < 0.03, `a bolt every ${elapsed} s`);
});

test('a frame on its edge steps on, though the frames summed fall a hair short of it', () => {
  const machine = new ShotMachine(SHOOTER_FEEL.thunderlock);
  machine.fire();
  for (let step = 0; step < 14; step++) machine.step(1 / 196);
  assert.equal(machine.frame, 1);
});

test('the progress runs through the shot, the reload after it, and a gun beside a blade reloads twice as long', () => {
  const alone = new ShotMachine(SHOOTER_FEEL.pistolet);
  const beside = new ShotMachine(SHOOTER_FEEL.pistolet, 2);
  assert.equal(alone.progress, null);
  alone.fire();
  beside.fire();
  alone.step(0.25);
  assert.deepEqual([alone.progress, alone.reloading], [0.5, null]);
  alone.step(0.26);
  alone.step(0.7);
  assert.deepEqual([alone.progress, alone.reloading], [null, 0.5]);
  assert.equal(beside.reload, 2.8);
  const timed = run(beside, 0.01, 5, () => beside.loaded);
  assert.ok(Math.abs(timed.elapsed - (6 / 12 + 2.8)) < 0.03);
});

test('the kick is up at once and rides back down to rest', () => {
  const recoil = new Recoil();
  recoil.punch(5);
  const first = recoil.step(0.016);
  assert.ok(first > 3 && first <= 5);
  let rise = first;
  for (let step = 0; step < 60; step++) rise = recoil.step(0.016);
  assert.ok(Math.abs(rise) < 0.05);
});

test('the reload dips the gun in quickly, holds it, and brings it back up for the end', () => {
  assert.equal(reloadDip(null), 0);
  assert.equal(reloadDip(0), 0);
  assert.equal(reloadDip(0.5), 1);
  assert.ok(reloadDip(0.1) > 0 && reloadDip(0.1) < 1);
  assert.ok(reloadDip(0.9) > 0 && reloadDip(0.9) < 1);
  assert.equal(reloadDip(1), 0);
});

test('a gun comes into its carry over a fifth of a second, dipping most at the swap', () => {
  const carry = new Carry();
  carry.step(0.1, true);
  assert.equal(carry.carried, true);
  assert.equal(carry.dip, 70);
  carry.step(0.1, true);
  assert.equal(carry.dip, 0);
  carry.step(0.1, false);
  carry.step(0.1, false);
  assert.equal(carry.carried, false);
});
