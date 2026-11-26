import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EVENT } from '../../combat/cues.ts';
import type { FightEvent } from '../../network/messages.ts';
import { DEFAULTS, rebind } from '../../player/binds.ts';
import { BINDS } from '../../player/input.ts';
import type { Action, FighterView } from '../../rules/fighters.ts';
import { justMet } from '../tasks.ts';
import {
  AGAIN_PAUSE_S,
  type Done,
  DODGE_AT,
  DodgeWatch,
  Freeze,
  STORM_PAUSE_S,
  PARRY_AT,
  reminder,
  ticksToLand,
  Tutorial,
} from './tutorial.ts';

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
  bow: 'none',
  ranged: false,
  loosed: false,
  storm: false,
  cast: [],
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
  duel: [
    { arms: 'worn', boarder: 'standing', parried: true, dodged: true },
    { arms: 'worn', boarder: 'fallen' },
  ],
  bow: [
    { arms: 'worn', bow: 'carried' },
    { arms: 'worn', bow: 'worn', ranged: true },
    { arms: 'worn', bow: 'worn', ranged: true, loosed: true },
    { arms: 'worn', bow: 'worn' },
  ],
  wisp: [{ arms: 'worn', bow: 'worn', storm: true }],
};

/** A teaching brought on to `stage` by meeting each stage before it, the player placed as `extra` says. */
function broughtTo(stage: Tutorial['stage'], tutorial = new Tutorial(), extra: Partial<Done> = {}): Tutorial {
  while (tutorial.stage !== stage) {
    const from = tutorial.stage;
    const frames = MEETS[from] ?? [];
    assert.ok(frames.length > 0, `no way on from ${from}`);
    for (const each of frames) tutorial.frame({ ...STILL, ...extra, ...each });
    // The wisp's stage ends at once, with no task to see ticked.
    if (tutorial.stage === from) onFrom(tutorial, { ...STILL, ...extra, ...frames.at(-1) });
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
  assert.equal(tutorial.reminder, reminder(), 'both made, whichever came last: the reminder');
  tutorial.frame({ ...worn, boarder: 'standing', seconds: 6 });
  assert.equal(tutorial.reminder, null, 'for a few seconds');
  assert.deepEqual(ticked(tutorial, { ...worn, boarder: 'fallen' }), [
    'Parry a blow',
    'Dodge a blow',
    'Bring the boarder down',
  ]);
  assert.ok(tutorial.bowDrops, 'the boarder that fell drops the bow');
  onFrom(tutorial, { ...worn, boarder: 'fallen' });
  assert.equal(tutorial.stage, 'bow');
  assert.ok(tutorial.holding, 'the waves still wait');
});

test('the bow the boarder dropped is taught: taken up, equipped, drawn, an arrow loosed, and the sword back', () => {
  const tutorial = broughtTo('bow');
  const worn = { ...STILL, arms: 'worn' } as const;
  const quest = tutorial.frame({ ...worn, bow: 'lying' });
  assert.equal(quest.task, 'Arm yourself with the bow');
  assert.deepEqual(
    quest.steps.map((step) => step.text),
    ['Take up the bow', 'Equip it', 'Switch to the bow', 'Loose an arrow', 'Back to your sword'],
  );
  assert.deepEqual(ticked(tutorial, { ...worn, bow: 'carried' }), ['Take up the bow']);
  assert.deepEqual(ticked(tutorial, { ...worn, bow: 'worn' }), ['Take up the bow', 'Equip it']);
  assert.deepEqual(ticked(tutorial, { ...worn, bow: 'worn', loosed: true }).length, 2, 'no arrow before the bow drawn');
  assert.deepEqual(ticked(tutorial, { ...worn, bow: 'worn', ranged: true }).at(-1), 'Switch to the bow');
  assert.deepEqual(ticked(tutorial, { ...worn, bow: 'worn', ranged: true, loosed: true }).at(-1), 'Loose an arrow');
  assert.equal(tutorial.stage, 'bow');
  assert.deepEqual(ticked(tutorial, { ...worn, bow: 'worn' }).at(-1), 'Back to your sword');
  onFrom(tutorial, { ...worn, bow: 'worn' });
  assert.equal(tutorial.stage, 'wisp', 'then the wisp comes');
  assert.ok(tutorial.holding, 'and the waves wait for it');
});

test('a boarder that falls before both lessons drops no bow, and once one has dropped it none is wanted', () => {
  const tutorial = broughtTo('duel');
  const worn = { ...STILL, arms: 'worn' } as const;
  tutorial.frame({ ...worn, boarder: 'standing', parried: true });
  tutorial.frame({ ...worn, boarder: 'fallen' });
  assert.ok(!tutorial.bowDrops, 'fallen before the dodge');
  const met = broughtTo('bow');
  assert.ok(met.bowDrops, 'the one that fell once both were met drops it');
  assert.ok(!met.wantsBoarder('fallen') && !met.wantsBoarder('none'), 'and no boarder comes after it');
});

test('the wisp gives the Storm, and the next fight teaches each of its abilities in turn as each is cast', () => {
  const tutorial = broughtTo('wisp');
  const worn = { ...STILL, arms: 'worn', bow: 'worn' } as const;
  assert.ok(tutorial.wantsWisp);
  tutorial.frame({ ...worn, storm: true });
  assert.equal(tutorial.stage, 'storm');
  assert.ok(!tutorial.wantsWisp);
  assert.ok(!tutorial.holding, 'the next wave comes');
  const storm = { ...worn, storm: true, foes: 3 } as const;
  const quest = tutorial.frame(storm);
  assert.equal(quest.task, 'Call the Storm');
  assert.deepEqual(
    quest.steps.map((step) => step.text),
    ['Cast Arc Lash', 'Cast Quicken', 'Release Tempest'],
  );
  assert.equal(tutorial.spell, 'arcLash', 'Arc Lash first');
  assert.deepEqual(ticked(tutorial, { ...storm, cast: ['quicken'] }), ['Cast Quicken'], 'one cast early counts');
  assert.equal(tutorial.spell, null, 'and the fight runs on a while after it too');
  for (let held = 0; held < STORM_PAUSE_S; held += 0.5) tutorial.frame({ ...storm, seconds: 0.5 });
  assert.equal(tutorial.spell, 'arcLash');
  ticked(tutorial, { ...storm, cast: ['arcLash'] });
  assert.equal(tutorial.spell, null, 'the fight runs on a while first');
  for (let held = 0; held < STORM_PAUSE_S; held += 0.5) tutorial.frame({ ...storm, seconds: 0.5 });
  assert.equal(tutorial.spell, 'tempest');
  assert.deepEqual(ticked(tutorial, { ...storm, cast: ['tempest'] }).length, 3);
  assert.equal(tutorial.spell, null);
  onFrom(tutorial, storm);
  assert.equal(tutorial.frame(storm).task, 'Fight your way through the wreck');
  assert.deepEqual(tutorial.frame(storm).steps, [{ text: 'Foes standing', count: 3 }]);
  assert.deepEqual(tutorial.frame({ ...storm, foes: 0 }).steps, [], 'between waves');
});

test('after each ability is first cast the fight runs on with foes to try it again before the next is asked', () => {
  const tutorial = broughtTo('wisp');
  const worn = { ...STILL, arms: 'worn', bow: 'worn' } as const;
  tutorial.frame({ ...worn, storm: true });
  const storm = { ...worn, storm: true, foes: 3, seconds: 0.5 } as const;
  const fight = (seconds: number, more: Partial<Done> = {}) => {
    for (let held = 0; held < seconds - 1e-9; held += 0.5) tutorial.frame({ ...storm, ...more });
  };
  tutorial.frame(storm);
  assert.ok(!tutorial.chargeAgain(), 'nothing cast yet');
  tutorial.frame({ ...storm, cast: ['arcLash'] });
  assert.ok(tutorial.chargeAgain(), 'the Storm charged again, to try it again');
  assert.ok(!tutorial.chargeAgain(), 'once');
  fight(STORM_PAUSE_S - 1);
  assert.equal(tutorial.spell, null, 'not asked while the fight runs on');
  fight(30, { foes: 0 });
  assert.equal(tutorial.spell, null, 'the pause runs only while foes stand to try it on');
  fight(1);
  assert.equal(tutorial.spell, 'quicken', 'then the next');
  tutorial.frame({ ...storm, cast: ['quicken'] });
  assert.ok(tutorial.chargeAgain());
  fight(1);
  tutorial.frame({ ...storm, cast: ['quicken'] });
  assert.ok(!tutorial.chargeAgain(), 'cast again, it is not charged again');
  fight(AGAIN_PAUSE_S - 0.5);
  assert.equal(tutorial.spell, null, 'cast again, its moment plays out');
  fight(0.5);
  assert.equal(tutorial.spell, 'tempest', 'and the next is asked sooner');
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
/** The player standing at rest 2 m south of the foe, facing it and aimed at it, as `more` changes them. */
const READY = { action: { kind: 'idle' }, mode: 'ground', health: 50, stamina: 50, x: 0, y: 0, facing: 0, aim: 0 };
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

test('a dodge counts once it got the player clear of the blow, perfect or not, out of its reach or through it', () => {
  const dodging = own({ action: { kind: 'dodge', elapsed: 2, toward: [0, 1] } });
  const word = (kind: number) => [{ kind, defender: 1, striker: 2 }] as unknown as FightEvent[];
  /** The blow wound up at the player as they stand (`self`), landing, and then `after` the room's words over
   *  `waitS` seconds: whether any frame counted a dodge. */
  const watched = (
    self: FighterView,
    after: FightEvent[] = [],
    waitS = 1,
    boarder: FighterView | null = foe(swing(0)),
  ) => {
    const watch = new DodgeWatch();
    let met = watch.frame(foe(swing(8)), own(), 1, [], 1 / 60);
    met = watch.frame(foe(swing(4)), self, 1, [], 1 / 60) || met;
    met = watch.frame(boarder, self, 1, [], 1 / 60) || met;
    met = watch.frame(null, own(), 1, after, 1 / 60) || met;
    for (let waited = 0; waited < waitS; waited += 0.1) met = watch.frame(null, own(), 1, [], 0.1) || met;
    return met;
  };
  assert.ok(watched(dodging), 'clear of it, with no word from the room');
  assert.ok(!watched(own()), 'no dodge, no lesson');
  assert.ok(!watched(dodging, word(EVENT.hit)), 'the blow found them');
  assert.ok(!watched(dodging, word(EVENT.blocked)), 'their guard took it');
  assert.ok(!watched(dodging, [], 0.3), 'not before word of it could come');
  assert.ok(!watched(dodging, [], 1, null), 'the boarder fell before its blow landed');
  assert.ok(new DodgeWatch().frame(null, own(), 1, word(EVENT.dodged), 0), 'the room says it passed through');
  assert.ok(new DodgeWatch().frame(null, own(), 1, word(EVENT.perfect), 0), 'perfectly or not');
  assert.ok(
    !new DodgeWatch().frame(null, own(), 1, [{ kind: EVENT.dodged, defender: 3 }] as FightEvent[], 0),
    'another',
  );
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
  assert.ok(frozenFor('dodge', own({ facing: Math.PI, aim: Math.PI })), 'a dodge whichever way they face');
  assert.ok(!frozenFor('parry', own({ aim: Math.PI })), 'a parry aimed away from it');
  assert.ok(frozenFor('parry', own({ aim: 0.9 })), 'a parry with the blow off to one side');
  // The rules judge a guard by its aim: a body standing turned away, its aim on the foe, parries.
  assert.ok(frozenFor('parry', own({ facing: Math.PI })), 'a parry aimed at it, the body turned away');
});

test('the steps and the reminder name each control as bound now, on the keys or the pad played last', () => {
  const jumpJ = rebind(DEFAULTS, { id: 'jump', device: 'keys', place: 0 }, 'j').binds ?? DEFAULTS;
  BINDS.set(rebind(jumpJ, { id: 'guard', device: 'keys', place: 1 }, 'g').binds ?? jumpJ);
  try {
    const keysOf = () =>
      broughtTo('feet')
        .frame({ ...STILL, arms: 'worn' })
        .steps.map((step) => [step.text, step.keys]);
    assert.deepEqual(keysOf(), [
      ['Move', ['W', 'A', 'S', 'D']],
      ['Look round', ['Mouse']],
      ['Run', ['Shift']],
      ['Jump', ['J']],
    ]);
    assert.equal(reminder(), 'G parries a blow as it lands; V dodges it', 'a key before a mouse button');
    BINDS.device = 'pad';
    assert.deepEqual(keysOf(), [
      ['Move', ['pad:Left stick']],
      ['Look round', ['pad:Right stick']],
      ['Run', ['pad:LS']],
      ['Jump', ['pad:A']],
    ]);
    assert.equal(reminder(), 'LT parries a blow as it lands; B dodges it');
  } finally {
    BINDS.device = 'keys';
    BINDS.set(DEFAULTS);
  }
});

test('the bow’s and the Storm’s steps name their controls as bound now', () => {
  const keysOf = (stage: Tutorial['stage'], done: Partial<Done>) =>
    broughtTo(stage)
      .frame({ ...STILL, arms: 'worn', ...done })
      .steps.map((step) => [step.text, step.keys ?? []]);
  BINDS.set(rebind(DEFAULTS, { id: 'anima', device: 'keys', place: 0 }, 'y').binds ?? DEFAULTS);
  try {
    assert.deepEqual(keysOf('bow', { bow: 'lying' }), [
      ['Take up the bow', []],
      ['Equip it', ['I']],
      ['Switch to the bow', ['2']],
      ['Loose an arrow', ['Left button', 'F']],
      ['Back to your sword', ['1']],
    ]);
    BINDS.device = 'pad';
    const loose = keysOf('bow', { bow: 'lying' }).find(([text]) => text === 'Loose an arrow');
    assert.deepEqual(loose, ['Loose an arrow', ['pad:RT']], 'the bow drawn turns the triggers round: RT fires');
    BINDS.device = 'keys';
    assert.deepEqual(keysOf('storm', { bow: 'worn', storm: true }), [
      ['Cast Arc Lash', ['G']],
      ['Cast Quicken', ['Q']],
      ['Release Tempest', ['Y']],
    ]);
  } finally {
    BINDS.device = 'keys';
    BINDS.set(DEFAULTS);
  }
});

test('a teaching begun at the wisp passes every stage before it over', () => {
  const tutorial = new Tutorial('wisp');
  assert.ok(tutorial.wantsWisp && tutorial.holding);
  tutorial.frame({ ...STILL, storm: true });
  assert.equal(tutorial.stage, 'storm');
});
