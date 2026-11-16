import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  BOW_HELD_FRAME,
  BOW_RELOAD,
  BOW_TICK,
  type AttackInput,
  type Direction,
  type MachineEvents,
  RECORD_OF,
  WeaponMachine,
  swingFrameSeconds,
} from './weaponMachine.ts';

const press: AttackInput = { attackHeld: true, attackPressed: true, attackReleased: false };
const hold: AttackInput = { attackHeld: true, attackPressed: false, attackReleased: false };
const letGo: AttackInput = { attackHeld: false, attackPressed: false, attackReleased: true };
const none: AttackInput = { attackHeld: false, attackPressed: false, attackReleased: false };

/** A random source that always picks `direction` from the six. */
function always(direction: Direction): () => number {
  return () => (RECORD_OF[direction] - 1 + 0.5) / 6;
}

/** Steps the machine `count` times by `seconds` with `input`, keeping each step's frame and events. */
function run(machine: WeaponMachine, count: number, seconds: number, input: AttackInput) {
  const steps: { record: number; frame: number; events: MachineEvents }[] = [];
  for (let i = 0; i < count; i++) {
    const events = machine.update(seconds, input);
    steps.push({ record: machine.record, frame: machine.frame, events });
  }
  return steps;
}

test('a strike frame lasts 0.199 s for a sword, quicker for a dagger, slower for a two-handed warhammer', () => {
  assert.equal(swingFrameSeconds('sword').toFixed(3), '0.199');
  assert.ok(swingFrameSeconds('dagger') < swingFrameSeconds('sword'));
  assert.equal(swingFrameSeconds('warhammer').toFixed(3), (0.199 * 1.06 * 1.06).toFixed(3));
});

test('a click swings once: five frames a tick each, the blow on frame 2, then rest', () => {
  const machine = new WeaponMachine('sword', always('right'));
  const tick = swingFrameSeconds('sword');
  machine.update(0.01, press);
  assert.deepEqual([machine.record, machine.frame], [RECORD_OF.right, 0]);
  const steps = run(machine, 5, tick, none);
  assert.deepEqual(
    steps.map((step) => step.frame),
    [1, 2, 3, 4, 0],
  );
  assert.deepEqual(
    steps.map((step) => step.events.blow?.direction ?? null),
    [null, 'right', null, null, null],
  );
  assert.equal(machine.record, 0);
  assert.equal(machine.busy, false);
});

test('the blow lands two frame-times after the click, whatever the frame rate', () => {
  const machine = new WeaponMachine('mace', always('down'));
  machine.update(0.016, press);
  const tick = swingFrameSeconds('mace');
  let elapsed = 0;
  let landed = -1;
  while (landed < 0 && elapsed < 2) {
    elapsed += 0.004;
    if (machine.update(0.004, none).blow) landed = elapsed;
  }
  assert.ok(Math.abs(landed - 2 * tick) < 0.005, `landed at ${landed}`);
});

test('holding the button swings again as each blow ends, a fresh direction each time', () => {
  const picks = [0.05, 0.95];
  const machine = new WeaponMachine('sword', () => picks.shift() ?? 0.5);
  const tick = swingFrameSeconds('sword');
  machine.update(0.01, press);
  assert.equal(machine.striking, 'down');
  const blows = run(machine, 10, tick, hold)
    .map((step) => step.events.blow?.direction)
    .filter(Boolean);
  assert.deepEqual(blows, ['down', 'up']);
  assert.equal(machine.busy, true);
});

test('bare hands strike to the left up and back down: 0 1 2 3 4 2 1 0, one blow', () => {
  const machine = new WeaponMachine('fists', always('left'));
  const tick = swingFrameSeconds('fists');
  machine.update(0.01, press);
  const frames = [machine.frame];
  const steps = run(machine, 8, tick, none);
  frames.push(...steps.map((step) => step.frame));
  assert.deepEqual(frames, [0, 1, 2, 3, 4, 2, 1, 0, 0]);
  assert.equal(steps.filter((step) => step.events.blow).length, 1);
  assert.ok(steps[1]?.events.blow);
  assert.equal(machine.busy, false);
});

test('a bow draws while held and stays drawn, looses on frame 5 when let go, then reloads', () => {
  const machine = new WeaponMachine('bow');
  machine.update(0.01, press);
  assert.deepEqual([machine.record, machine.frame], [0, 0]);
  const drawn = run(machine, 6, BOW_TICK, hold).map((step) => step.frame);
  assert.deepEqual(drawn, [1, 2, 3, 3, 3, 3]);
  const released = run(machine, 4, BOW_TICK, letGo);
  assert.deepEqual(
    released.map((step) => step.frame),
    [4, 5, 6, 0],
  );
  assert.deepEqual(
    released.map((step) => step.events.loose),
    [false, true, false, false],
  );
  assert.equal(machine.busy, false);
  machine.update(BOW_RELOAD / 2, press);
  assert.equal(machine.busy, false, 'still reloading');
  machine.update(BOW_RELOAD, hold);
  assert.equal(machine.busy, true, 'held through the reload, it draws again');
  assert.equal(BOW_HELD_FRAME, 3);
});

test('a quick click on a bow plays the whole draw and release', () => {
  const machine = new WeaponMachine('bow');
  machine.update(0.01, { attackHeld: false, attackPressed: true, attackReleased: true });
  const frames = run(machine, 7, BOW_TICK, none).map((step) => step.frame);
  assert.deepEqual(frames, [1, 2, 3, 4, 5, 6, 0]);
});

test('a swing and a shot report how far through them they are, for the figure seen from outside', () => {
  const sword = new WeaponMachine('sword', () => 0);
  assert.equal(sword.progress, null);
  sword.update(0, { attackHeld: false, attackPressed: true, attackReleased: false });
  assert.equal(sword.progress, 0);
  sword.update(swingFrameSeconds('sword') * 2.5, { attackHeld: false, attackPressed: false, attackReleased: false });
  assert.ok(Math.abs((sword.progress ?? 0) - 0.5) < 1e-9);
  const bow = new WeaponMachine('bow');
  bow.update(0, { attackHeld: true, attackPressed: true, attackReleased: false });
  bow.update(1, { attackHeld: true, attackPressed: false, attackReleased: false });
  assert.equal(bow.progress, 0.5);
});

/** Steps a machine through `seconds` at 60 frames a second, pressed on each tick the fight's rules begin a swing (every
 *  `every` ticks), and counts the blows it lands. */
function blowsWhenRulesBegin(machine: WeaponMachine, every: number, seconds: number): number {
  let blows = 0;
  for (let tick = 0; tick < seconds * 60; tick += 1) {
    const begun = tick % every === 0;
    if (machine.update(1 / 60, { attackHeld: false, attackPressed: begun, attackReleased: false }).blow) blows += 1;
  }
  return blows;
}

test('a swing the rules begin while the last strike follows through starts again: a mace held 20 s lands 20 blows', () => {
  // The rules end a mace's swing on its 61st tick; its five strike frames last 61.5.
  assert.ok(5 * swingFrameSeconds('mace') * 60 > 61);
  assert.equal(blowsWhenRulesBegin(new WeaponMachine('mace', always('down')), 61, 20), 20);
});

test('a press before the blow lands does not start the strike again', () => {
  const machine = new WeaponMachine('sword', always('down'));
  machine.update(0, press);
  machine.update(swingFrameSeconds('sword') * 1.5, none);
  machine.update(0, press);
  assert.deepEqual([machine.frame, machine.followingThrough], [1, false]);
});

test('a strike or a draw cancelled ends at once, with no blow and no arrow, and the weapon at rest', () => {
  const sword = new WeaponMachine('sword', always('right'));
  sword.update(0, press);
  sword.cancel();
  assert.deepEqual([sword.busy, sword.record, sword.frame, sword.progress], [false, 0, 0, null]);
  assert.equal(
    run(sword, 6, swingFrameSeconds('sword'), none).some((step) => step.events.blow),
    false,
  );
  sword.pose({ record: 3, frame: 2 });
  assert.deepEqual([sword.record, sword.frame], [3, 2], 'a guard takes the weapon at once');
  const bow = new WeaponMachine('bow');
  bow.update(0, press);
  run(bow, 2, BOW_TICK, hold);
  bow.cancel();
  assert.equal(
    run(bow, 8, BOW_TICK, none).some((step) => step.events.loose),
    false,
  );
  bow.update(0, press);
  assert.equal(bow.busy, true, 'with no shot, no reload');
});
