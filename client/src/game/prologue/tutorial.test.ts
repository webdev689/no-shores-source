import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Action, FighterView } from '../../rules/fighters.ts';
import { justMet } from '../tasks.ts';
import { type Done, DODGE_AT, Freeze, PARRY_AT, REMINDER, ticksToLand, Tutorial } from './tutorial.ts';

const STILL: Done = {
  seconds: 0.1,
  x: 10,
  y: 10,
  yaw: 0,
  speed: 0,
  rising: false,
  action: 'idle',
  arms: 'lying',
  menu: false,
  healed: false,
  parried: false,
  dodged: false,
  boarder: 'none',
  foes: 0,
  boss: false,
};

const ticked = (tutorial: Tutorial, done: Done) =>
  tutorial
    .frame(done)
    .steps.filter((step) => step.done)
    .map((step) => step.text);

/** Frames `done` until the teaching has moved on from the stage it stands at, a second and a half on. */
function onFrom(tutorial: Tutorial, done: Done): void {
  const from = tutorial.stage;
  for (let frame = 0; frame < 40 && tutorial.stage === from; frame++) tutorial.frame(done);
  assert.notEqual(tutorial.stage, from, `${from} never ended`);
}

/** The frames that meet each stage before the duel. */
const MEETS: Readonly<Record<string, readonly Partial<Done>[]>> = {
  find: [{ arms: 'carried' }],
  equip: [{ arms: 'worn', menu: true }, { arms: 'worn' }],
  feet: [{ arms: 'worn', x: 13, yaw: 1.2, speed: 7, rising: true }],
  ready: [
    { arms: 'worn', action: 'attack' },
    { arms: 'worn', action: 'guard' },
    { arms: 'worn', healed: true },
  ],
};

/** A teaching brought on to `stage` by meeting each stage before it, the player placed as `extra` says. */
function broughtTo(stage: Tutorial['stage'], tutorial = new Tutorial(), extra: Partial<Done> = {}): Tutorial {
  while (tutorial.stage !== stage) {
    const frames = MEETS[tutorial.stage] ?? [];
    assert.ok(frames.length > 0, `no way on from ${tutorial.stage}`);
    for (const each of frames) tutorial.frame({ ...STILL, ...extra, ...each });
    onFrom(tutorial, { ...STILL, ...extra, ...frames.at(-1) });
  }
  return tutorial;
}

test('the player wakes to find their sword and shield, and takes them up by walking over them', () => {
  const tutorial = new Tutorial();
  const quest = tutorial.frame(STILL);
  assert.equal(quest.task, 'Find your sword and shield');
  assert.deepEqual(ticked(tutorial, STILL), []);
  assert.deepEqual(ticked(tutorial, { ...STILL, arms: 'carried' }), ['Take them up']);
  assert.equal(
    tutorial.frame({ ...STILL, arms: 'carried', seconds: 1 }).task,
    'Find your sword and shield',
    'seen ticked',
  );
  tutorial.frame({ ...STILL, arms: 'carried', seconds: 1 });
  assert.equal(tutorial.frame({ ...STILL, arms: 'carried' }).task, 'Equip your sword and shield', 'a second on');
});

test('equipping is taught on the Character page: opened, the arms equipped, and the page closed again', () => {
  const tutorial = broughtTo('equip');
  const carried = { ...STILL, arms: 'carried' } as const;
  const quest = tutorial.frame(carried);
  assert.deepEqual(
    quest.steps.map((step) => [step.text, step.keys]),
    [
      ['Open your Character page', ['I']],
      ['Equip them from the Melee slot', undefined],
      ['Close it', ['Esc']],
    ],
  );
  assert.deepEqual(ticked(tutorial, { ...carried, menu: true }), ['Open your Character page']);
  assert.deepEqual(ticked(tutorial, { ...STILL, arms: 'worn', menu: true }), [
    'Open your Character page',
    'Equip them from the Melee slot',
  ]);
  assert.equal(ticked(tutorial, { ...STILL, arms: 'worn', seconds: 2 }).length, 3, 'the page closed');
  assert.equal(tutorial.frame({ ...STILL, arms: 'worn' }).task, 'Find your feet');
});

test('the menu opened before the arms are taken is no lesson in equipping them', () => {
  const tutorial = new Tutorial();
  tutorial.frame({ ...STILL, menu: true });
  onFrom(tutorial, { ...STILL, arms: 'carried' });
  assert.deepEqual(ticked(tutorial, { ...STILL, arms: 'carried' }), []);
});

test('finding their feet: move, look round, run and jump, each ticked once done, walking to the arms counted', () => {
  const tutorial = new Tutorial();
  tutorial.frame(STILL);
  tutorial.frame({ ...STILL, x: 12.5 });
  broughtTo('feet', tutorial, { x: 12.5 });
  const worn = { ...STILL, x: 12.5, arms: 'worn' } as const;
  assert.deepEqual(ticked(tutorial, worn), ['Move'], 'walked to the arms already');
  assert.deepEqual(ticked(tutorial, { ...worn, yaw: 0.6 }), ['Move'], 'a glance short of a look round');
  assert.deepEqual(ticked(tutorial, { ...worn, yaw: -0.5 }), ['Move', 'Look round'], 'turns add up either way');
  assert.deepEqual(ticked(tutorial, { ...worn, speed: 5 }), ['Move', 'Look round'], 'a walk is no run');
  assert.deepEqual(ticked(tutorial, { ...worn, speed: 7, action: 'dodge' }), ['Move', 'Look round'], 'nor a dodge');
  assert.deepEqual(ticked(tutorial, { ...worn, speed: 7 }), ['Move', 'Look round', 'Run']);
  assert.deepEqual(ticked(tutorial, { ...worn, rising: true }), ['Move', 'Look round', 'Run', 'Jump']);
});

test('readying themselves: a swing, a guard and a drink of a healing charge', () => {
  const tutorial = broughtTo('ready');
  const worn = { ...STILL, arms: 'worn' } as const;
  const quest = tutorial.frame(worn);
  assert.equal(quest.task, 'Ready yourself');
  assert.deepEqual(
    quest.steps.map((step) => [step.text, step.keys]),
    [
      ['Swing', ['Right button']],
      ['Guard', ['Left button', 'F']],
      ['Drink a healing charge', ['3']],
    ],
  );
  assert.deepEqual(ticked(tutorial, { ...worn, action: 'attack' }), ['Swing']);
  assert.deepEqual(ticked(tutorial, { ...worn, action: 'parry' }), ['Swing', 'Guard'], 'a parry is a guard too');
  assert.deepEqual(ticked(tutorial, { ...worn, healed: true }), ['Swing', 'Guard', 'Drink a healing charge']);
});

test('the duel: a boarder stands, the parry taught first, then the dodge, then the boarder brought down', () => {
  const tutorial = broughtTo('duel');
  const worn = { ...STILL, arms: 'worn' } as const;
  assert.equal(tutorial.lesson, 'parry');
  assert.ok(tutorial.wantsBoarder('none') && !tutorial.wantsBoarder('standing'));
  assert.ok(tutorial.holding, 'the waves wait');
  assert.equal(tutorial.frame({ ...worn, boarder: 'standing' }).task, 'Face the Tithe boarder');
  const dodged = tutorial.frame({ ...worn, boarder: 'standing', dodged: true });
  assert.equal(tutorial.lesson, 'parry', 'the parry is still asked first');
  assert.deepEqual(
    dodged.steps.filter((step) => step.done).map((step) => step.text),
    ['Dodge a blow'],
    'a dodge before the parry counts for the dodge',
  );
  assert.equal(tutorial.reminder, null);
  tutorial.frame({ ...worn, boarder: 'standing', parried: true });
  assert.equal(tutorial.lesson, null);
  assert.equal(tutorial.reminder, REMINDER, 'both made, whichever came last: the reminder');
  tutorial.frame({ ...worn, boarder: 'standing', seconds: 6 });
  assert.equal(tutorial.reminder, null, 'for a few seconds');
  assert.deepEqual(ticked(tutorial, { ...worn, boarder: 'fallen' }), [
    'Parry a blow',
    'Dodge a blow',
    'Bring the boarder down',
  ]);
  onFrom(tutorial, { ...worn, boarder: 'fallen' });
  assert.ok(!tutorial.holding, 'the waves come');
  assert.equal(tutorial.frame({ ...worn, foes: 4 }).task, 'Fight your way through the wreck');
  assert.deepEqual(tutorial.frame({ ...worn, foes: 4 }).steps, [{ text: 'Foes standing', count: 4 }]);
  assert.deepEqual(tutorial.frame(worn).steps, [], 'between waves');
});

test('a boarder brought down before both lessons are learned is followed by another', () => {
  const tutorial = broughtTo('duel');
  const worn = { ...STILL, arms: 'worn' } as const;
  tutorial.frame({ ...worn, boarder: 'standing', parried: true });
  const quest = tutorial.frame({ ...worn, boarder: 'fallen' });
  assert.deepEqual(
    quest.steps.filter((step) => step.done).map((step) => step.text),
    ['Parry a blow'],
    'not yet brought down',
  );
  assert.ok(tutorial.wantsBoarder('fallen'));
  assert.equal(tutorial.stage, 'duel');
});

test('the boss fight has its own task, whatever stage the teaching stands at', () => {
  assert.equal(new Tutorial().frame({ ...STILL, boss: true }).task, 'Face Captain Brannoc Thule');
});

test('a step just met flashes in the tracker, and a new task begins without one', () => {
  const tutorial = new Tutorial();
  const first = tutorial.frame(STILL);
  const taken = tutorial.frame({ ...STILL, arms: 'carried' });
  assert.deepEqual(justMet(first, taken), [0]);
  onFrom(tutorial, { ...STILL, arms: 'carried' });
  assert.deepEqual(justMet(taken, tutorial.frame({ ...STILL, arms: 'carried' })), [], 'a new task');
});

test('a walk and a turn are counted again from where a fallen player rises', () => {
  const tutorial = new Tutorial();
  tutorial.frame({ ...STILL, yaw: 3.1 });
  tutorial.frame({ ...STILL, yaw: -3.1 });
  tutorial.frame({ ...STILL, x: 11.5, action: 'dead' });
  broughtTo('feet', tutorial, { x: 40 });
  assert.deepEqual(ticked(tutorial, { ...STILL, x: 40, arms: 'worn' }), [], 'raised far off, not walked; no turn');
  assert.deepEqual(ticked(tutorial, { ...STILL, x: 42.5, arms: 'worn' }), ['Move']);
});

/** A foe winding up `action` at `target`. */
const foe = (action: Action, target: number | null = 1): FighterView =>
  ({ target, action, x: 0, y: -2 }) as unknown as FighterView;
/** The player standing at rest 2 m south of the foe, facing it, as `more` changes them. */
const READY = { action: { kind: 'idle' }, mode: 'ground', health: 50, stamina: 50, x: 0, y: 0, facing: 0 };
const own = (more: Record<string, unknown> = {}) => ({ ...READY, ...more }) as unknown as FighterView;
const swing = (left: number): Action => ({
  kind: 'attack',
  stroke: 1,
  elapsed: 20 - left,
  strike: 20,
  end: 30,
  swing: 'plain',
  leftHand: false,
});
const telegraph = (left: number, more: Partial<Extract<Action, { kind: 'telegraph' }>> = {}): Action => ({
  kind: 'telegraph',
  shape: 'lunge',
  elapsed: 30 - left,
  windup: 30,
  origin: [0, 0, 0],
  bearing: 0,
  ahead: 2,
  iron: false,
  feintAt: null,
  ...more,
});

test('a blow lands in so many ticks: a swing or a telegraphed blow at the player, never a feint', () => {
  assert.equal(ticksToLand(foe(swing(6)), 1), 6);
  assert.equal(ticksToLand(foe(telegraph(9)), 1), 9);
  assert.equal(ticksToLand(foe(telegraph(9, { feintAt: 12 })), 1), null);
  assert.equal(ticksToLand(foe(swing(6), 2), 1), null, 'at another');
  assert.equal(ticksToLand(foe({ kind: 'idle' }), 1), null);
});

const NONE = { locked: true, guard: false, dodge: false };
const teaching = (lesson: 'parry' | 'dodge' | null, parryOpen = true, player = own()) => ({
  player: 1,
  own: player,
  lesson,
  parryOpen,
});

test('the fight freezes on a blow the player can parry, inside the guard window', () => {
  const freeze = new Freeze();
  assert.ok(!freeze.frame(foe(swing(PARRY_AT + 1)), teaching('parry'), () => NONE), 'too far off');
  assert.ok(freeze.frame(foe(swing(PARRY_AT)), teaching('parry'), () => NONE));
  assert.ok(
    !freeze.frame(foe(swing(PARRY_AT)), teaching('parry', false), () => NONE),
    'a window just left unused: no parry now',
  );
  assert.ok(
    !freeze.frame(foe(telegraph(5, { iron: true })), teaching('parry'), () => NONE),
    'an iron blow is no parry',
  );
  assert.ok(!freeze.frame(foe(telegraph(5, { shape: 'aimed' })), teaching('parry'), () => NONE), 'nor a shot');
  assert.ok(!freeze.frame(foe(swing(1)), teaching('parry'), () => NONE), 'too late for a press to reach the room');
  assert.ok(!freeze.frame(foe(swing(5)), teaching(null), () => NONE), 'nothing left to teach');
});

test("frozen until the lesson's own press, the pointer the game's; then the blow plays on, and the next freezes", () => {
  const freeze = new Freeze();
  const blow = foe(swing(6));
  assert.ok(
    freeze.frame(blow, teaching('parry'), () => ({ ...NONE, dodge: true })),
    'a dodge does not answer a parry',
  );
  assert.ok(
    freeze.frame(blow, teaching('parry'), () => ({ locked: false, guard: true, dodge: false })),
    'nor a press off the game',
  );
  assert.ok(!freeze.frame(blow, teaching('parry'), () => ({ ...NONE, guard: true })), 'the guard answers it');
  assert.ok(!freeze.frame(foe(swing(4)), teaching('parry'), () => NONE), 'the same blow plays on');
  assert.ok(!freeze.frame(foe({ kind: 'idle' }), teaching('parry'), () => NONE));
  assert.ok(
    freeze.frame(foe(swing(6)), teaching('parry'), () => NONE),
    'the next',
  );
});

test('for the dodge the fight freezes a little sooner, on any blow, an iron one too, until the dodge', () => {
  const freeze = new Freeze();
  assert.ok(!freeze.frame(foe(telegraph(DODGE_AT + 1)), teaching('dodge'), () => NONE));
  const iron = foe(telegraph(DODGE_AT, { iron: true }));
  assert.ok(
    freeze.frame(iron, teaching('dodge', false), () => ({ ...NONE, guard: true })),
    'a guard does not answer a dodge',
  );
  assert.ok(!freeze.frame(iron, teaching('dodge', false), () => ({ ...NONE, dodge: true })));
});

test('a blow the player could not answer at once passes unfrozen, and the lesson waits for the next', () => {
  const blow = foe(swing(6));
  const frozenFor = (lesson: 'parry' | 'dodge', player: FighterView) =>
    new Freeze().frame(blow, teaching(lesson, true, player), () => NONE);
  assert.ok(frozenFor('parry', own()) && frozenFor('dodge', own()), 'at rest, facing it');
  assert.ok(frozenFor('parry', own({ action: { kind: 'guard' } })), 'guarding already');
  for (const lesson of ['parry', 'dodge'] as const) {
    assert.ok(!frozenFor(lesson, own({ action: { kind: 'attack' } })), `${lesson}: in a swing of their own`);
    assert.ok(!frozenFor(lesson, own({ action: { kind: 'drink' } })), `${lesson}: drinking`);
    assert.ok(!frozenFor(lesson, own({ action: { kind: 'flinch' } })), `${lesson}: flinching`);
    assert.ok(!frozenFor(lesson, own({ mode: 'air' })), `${lesson}: in the air`);
    assert.ok(!frozenFor(lesson, own({ health: 0, action: { kind: 'dead' } })), `${lesson}: fallen`);
  }
  assert.ok(!frozenFor('dodge', own({ stamina: 0 })), 'a dodge with no stamina left');
  assert.ok(frozenFor('dodge', own({ facing: Math.PI })), 'a dodge whichever way they face');
  assert.ok(!frozenFor('parry', own({ facing: Math.PI })), 'a parry with their back to it');
  assert.ok(frozenFor('parry', own({ facing: 0.9 })), 'a parry with the blow off to one side');
});
