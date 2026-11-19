import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Hands, everyView } from './hands.ts';
import { handsPlan } from './handsLaw.ts';
import { SHOOTER_FEEL } from './shotMachine.ts';
import { type AttackInput, RECORD_OF, swingFrameSeconds } from './weaponMachine.ts';

const press: AttackInput = { attackHeld: true, attackPressed: true, attackReleased: false };
const hold: AttackInput = { attackHeld: true, attackPressed: false, attackReleased: false };
const none: AttackInput = { attackHeld: false, attackPressed: false, attackReleased: false };
const still = { running: false, stride: 0 };

/** Steps `hands` with `plan` by `seconds` up to `count` times with `input`, keeping each blow's or shot's hand. */
function run(hands: Hands, plan: ReturnType<typeof handsPlan>, count: number, seconds: number, input: AttackInput) {
  const struck: string[] = [];
  for (let step = 0; step < count; step++) {
    const events = hands.update(seconds, input, plan, still);
    if (events.hand) struck.push(`${events.hand}:${events.blow ? events.blow.direction : 'loose'}`);
  }
  return struck;
}

test('a pair held to the button takes turns, right then left, each blow its own hand', () => {
  const hands = new Hands(() => 0);
  const plan = handsPlan('sword_iron', 'sword_iron_l');
  hands.update(0.01, press, plan, still);
  assert.deepEqual(hands.swing && [hands.swing.hand, hands.swing.paired], ['right', true]);
  const struck = run(hands, plan, 200, 0.02, hold);
  assert.deepEqual(struck.slice(0, 4), ['right:down', 'left:down', 'right:down', 'left:down']);
});

test("a flurry's blow is thrown from a raised hand: it lands a frame sooner than the opening blow", () => {
  const hands = new Hands(() => 0);
  const plan = handsPlan('dagger_iron', 'dagger_iron_l');
  const tick = swingFrameSeconds('dagger');
  const landings: number[] = [];
  let elapsed = 0;
  let begun = 0;
  hands.update(0.001, press, plan, still);
  while (landings.length < 2 && elapsed < 5) {
    const was = hands.swing?.hand;
    elapsed += 0.001;
    const events = hands.update(0.001, hold, plan, still);
    if (hands.swing?.hand !== was) begun = elapsed;
    if (events.blow) landings.push(elapsed - begun);
  }
  assert.ok(Math.abs((landings[0] ?? 0) - 2 * tick) < 0.01, `opening ${landings[0]}`);
  assert.ok(Math.abs((landings[1] ?? 0) - tick) < 0.01, `flurry ${landings[1]}`);
});

test('the resting hand of a pair lowers while the other strikes, and the striker is drawn over it', () => {
  const hands = new Hands(() => 0);
  const plan = handsPlan('mace_iron', 'mace_iron_l');
  hands.update(0.01, press, plan, still);
  hands.update(0.2, none, plan, still);
  const [under, over] = hands.views();
  assert.deepEqual([under?.hand, over?.hand], ['left', 'right']);
  assert.ok((under?.lower ?? 0) > 0.1 && (under?.lower ?? 0) <= 0.12);
  assert.equal(over?.lower, 0);
  assert.deepEqual([under?.flip, over?.flip, over?.record], [true, false, RECORD_OF.down]);
});

test('a lone weapon keeps one machine; a pause past the flurry lets the lead open again', () => {
  const hands = new Hands(() => 0);
  const plan = handsPlan('sword_iron', 'sword_iron_l');
  hands.update(0.01, press, plan, still);
  run(hands, plan, 40, 0.05, none);
  hands.update(0.01, press, plan, still);
  assert.equal(hands.swing?.hand, 'right');
});

test('a brace of pistols: a click fires one, a second click the other while the first still smokes', () => {
  const hands = new Hands();
  const plan = handsPlan('pistolet', 'pistolet_l');
  hands.update(0.01, press, plan, still);
  hands.update(0.05, none, plan, still);
  hands.update(0.01, press, plan, still);
  assert.deepEqual(hands.swing && [hands.swing.hand, hands.swing.direction], ['left', null]);
  const views = hands.views();
  assert.ok(
    views.every((view) => view.dy < 0),
    'both kicked up',
  );
  // Both reloading, a click fires nothing.
  run(hands, plan, 10, 0.06, none);
  hands.update(0.01, press, plan, still);
  assert.equal(hands.swing?.hand, 'left');
});

test("a gun beside a blade: a pull the law gives the gun while it reloads is the blade's", () => {
  const hands = new Hands(() => 0);
  const plan = handsPlan('pistolet', 'sword_iron_l');
  hands.update(0.01, press, plan, still);
  assert.equal(hands.swing?.hand, 'right');
  const firing = SHOOTER_FEEL.pistolet.frames / SHOOTER_FEEL.pistolet.fps;
  run(hands, plan, Math.ceil((firing + 1) / 0.05), 0.05, none);
  hands.update(0.01, press, plan, still);
  assert.deepEqual(hands.swing && [hands.swing.hand, hands.swing.direction], ['left', 'down']);
});

test("a crossbow's bolt leaves on its second frame and its shot is reported to its reload's end", () => {
  const hands = new Hands();
  const plan = handsPlan('crossbow_iron', null);
  hands.update(0.01, press, plan, still);
  const struck = run(hands, plan, 20, 0.05, none);
  assert.deepEqual(struck, ['right:loose']);
  hands.update(0.05, none, plan, still);
  assert.deepEqual(hands.swing && [hands.swing.reload, hands.swing.progress > 0], [true, true]);
  run(hands, plan, 20, 0.05, none);
  assert.equal(hands.swing, null);
});

test('a gun is carried at a run while loaded, its stride a sixth a frame', () => {
  const hands = new Hands();
  const plan = handsPlan('thunderlock', null);
  hands.update(0.3, none, plan, { running: true, stride: 1.25 });
  const [view] = hands.views();
  assert.deepEqual([view?.record, view?.frame], [1, 0]);
  hands.update(0.01, none, plan, { running: true, stride: 2.5 });
  assert.equal(hands.views()[0]?.frame, 1);
});

test("every picture a plan shows is composed ahead: a pair's left hand mirrored throughout", () => {
  const views = everyView(handsPlan('sword_iron', 'sword_iron_l'));
  assert.equal(views.length, 2 * (1 + 6 * 5));
  assert.ok(views.filter((view) => view.hand === 'left').every((view) => view.flip));
  const brace = everyView(handsPlan('pistolet', 'pistolet_l'));
  assert.equal(brace.length, 2 * (6 + 6));
});

test('a pair: each swing the rules begin in a follow-through ends it and throws the other hand, one blow a swing', () => {
  const hands = new Hands(() => 0);
  const plan = handsPlan('mace_iron', 'mace_iron_l');
  const struck: string[] = [];
  for (let tick = 0; tick < 20 * 60; tick += 1) {
    const begun = tick % 61 === 0;
    const events = hands.update(
      1 / 60,
      { attackHeld: false, attackPressed: begun, attackReleased: false },
      plan,
      still,
    );
    if (events.blow) struck.push(events.blow.hand);
  }
  assert.equal(struck.length, 20);
  assert.deepEqual(struck.slice(0, 4), ['right', 'left', 'right', 'left']);
});

test('the hands cancelled stop their strike at once: no blow lands, and the weapon takes a pose', () => {
  const hands = new Hands(() => 0);
  const plan = handsPlan('sword_iron', null);
  hands.update(0.01, press, plan, still);
  hands.cancel();
  assert.equal(hands.swing, null);
  assert.deepEqual(run(hands, plan, 40, 0.05, none), []);
  hands.pose({ record: 3, frame: 2 });
  assert.deepEqual(
    hands.views().map((view) => [view.record, view.frame]),
    [[3, 2]],
  );
});

test("a gun the fight's rules have loaded fires at once, though its own reload would still run", () => {
  const hands = new Hands();
  const plan = handsPlan('thunderlock', null);
  hands.update(0.01, press, plan, still);
  const firing = SHOOTER_FEEL.thunderlock.frames / SHOOTER_FEEL.thunderlock.fps;
  run(hands, plan, Math.ceil(firing / 0.05) + 2, 0.05, none);
  assert.equal(hands.swing?.reload, true, 'reloading by its own clock');
  assert.deepEqual(run(hands, plan, 1, 0.01, press), [], 'unloaded, a pull fires nothing');
  hands.loaded();
  hands.update(0.01, press, plan, still);
  assert.deepEqual(run(hands, plan, 4, 0.05, none), ['right:loose'], 'loaded by the rules, it fires');
});
