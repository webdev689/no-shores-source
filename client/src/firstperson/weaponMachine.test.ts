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

/** Plays a click's swing in small steps: each frame shown as it changes and when, when its blow landed, how many
 *  blows landed, and when the swing ended. */
function shownThrough(machine: WeaponMachine, seconds: number) {
  const shown: { record: number; frame: number; at: number }[] = [];
  let [elapsed, landed, blows] = [0, -1, 0];
  machine.update(0, press);
  shown.push({ record: machine.record, frame: machine.frame, at: 0 });
  while (machine.busy && elapsed < seconds) {
    elapsed += 0.002;
    if (machine.update(0.002, none).blow) [landed, blows] = [elapsed, blows + 1];
    const last = shown.at(-1);
    if (last?.record !== machine.record || last.frame !== machine.frame)
      shown.push({ record: machine.record, frame: machine.frame, at: elapsed });
  }
  return { shown, landed, blows, ended: elapsed };
}

test("a click swings once, faster than DFO's frames: the blow's frame as the rules land it, then rest", () => {
  const machine = new WeaponMachine('sword', always('right'));
  const tick = swingFrameSeconds('sword');
  const { shown, landed, ended } = shownThrough(machine, 2);
  assert.deepEqual(
    shown.map(({ record, frame }) => [record, frame]),
    [0, 1, 2, 3, 4].map((frame) => [RECORD_OF.right, frame]).concat([[0, 0]]),
  );
  // The wind-up's last frame only through the last stretch before the blow; the blow's frame as it lands.
  const shownAt = (frame: number) => shown.find((each) => each.frame === frame && each.record !== 0)?.at ?? -1;
  assert.ok(shownAt(1) > 1.2 * tick && shownAt(1) < 2 * tick, `frame 1 at ${shownAt(1)}`);
  assert.ok(Math.abs(shownAt(2) - 2 * tick) < 0.005 && Math.abs(landed - 2 * tick) < 0.005, `landed at ${landed}`);
  // Followed through in a little over half the time to the blow, at rest while the swing runs out on DFO's clock.
  const rest = shown.at(-1)?.at ?? -1;
  assert.ok(Math.abs(rest - 2 * tick * 1.55) < 0.005, `at rest at ${rest}`);
  assert.ok(Math.abs(ended - 5 * tick) < 0.005, `swing ended at ${ended}`);
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
  const { shown, blows } = shownThrough(machine, 4);
  assert.deepEqual(
    shown.filter(({ record }) => record !== 0).map(({ frame }) => frame),
    [0, 1, 2, 3, 4, 2, 1, 0],
  );
  assert.equal(blows, 1);
  assert.equal(machine.busy, false);
});

test('a bow aimed draws and stays drawn, looses on its loose frame at a pull, then reloads', () => {
  const machine = new WeaponMachine('bow');
  const aimed: AttackInput = { ...none, aimHeld: true };
  machine.update(0.01, aimed);
  assert.deepEqual([machine.record, machine.frame], [0, 0]);
  const drawn = run(machine, 6, BOW_TICK, aimed).map((step) => step.frame);
  assert.deepEqual(drawn, [1, 2, 3, 3, 3, 3]);
  const pulled = machine.update(0, { ...press, aimHeld: true });
  assert.deepEqual([machine.frame, pulled.loose], [5, true], 'the arrow leaves on the pull');
  const released = run(machine, 2, BOW_TICK, aimed);
  assert.deepEqual(
    released.map((step) => [step.frame, step.events.loose]),
    [
      [6, false],
      [0, false],
    ],
  );
  machine.update(BOW_RELOAD / 2, aimed);
  assert.equal(machine.busy, false, 'still reloading');
  machine.update(BOW_RELOAD, aimed);
  assert.equal(machine.busy, true, 'aimed through the reload, it draws again');
  assert.equal(BOW_HELD_FRAME, 3);
});

test('a bow not aimed looses a quick shot at once on a pull; an aim let go lowers it unloosed', () => {
  const machine = new WeaponMachine('bow');
  const quick = machine.update(0.01, { attackHeld: false, attackPressed: true, attackReleased: true });
  assert.deepEqual([machine.frame, quick.loose], [5, true]);
  const frames = run(machine, 2, BOW_TICK, none).map((step) => step.frame);
  assert.deepEqual(frames, [6, 0]);
  const lowered = new WeaponMachine('bow');
  run(lowered, 4, BOW_TICK, { ...none, aimHeld: true });
  const events = lowered.update(BOW_TICK, none);
  assert.deepEqual([lowered.busy, lowered.frame, events.loose], [false, 0, false]);
});

test('a swing and a shot report how far through them they are, for the figure seen from outside', () => {
  const sword = new WeaponMachine('sword', () => 0);
  assert.equal(sword.progress, null);
  sword.update(0, { attackHeld: false, attackPressed: true, attackReleased: false });
  assert.equal(sword.progress, 0);
  sword.update(swingFrameSeconds('sword') * 2.5, { attackHeld: false, attackPressed: false, attackReleased: false });
  assert.ok(Math.abs((sword.progress ?? 0) - 0.5) < 1e-9);
  const bow = new WeaponMachine('bow');
  bow.update(0, { ...none, aimHeld: true });
  bow.update(1, { ...none, aimHeld: true });
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
