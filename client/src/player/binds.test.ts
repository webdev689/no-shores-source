import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BIND_IDS,
  type BindId,
  CONTROLS,
  DEFAULTS,
  isKeyName,
  isPadName,
  meet,
  overridesOf,
  readOverrides,
  rebind,
  withOverrides,
} from './binds.ts';

const keys = (id: BindId) => DEFAULTS[id].keys;
const pad = (id: BindId) => DEFAULTS[id].pad;

test("the keys are DFO's as they were, each control on its own where they act alike", () => {
  assert.deepEqual((['forward', 'left', 'back', 'right', 'run', 'jump', 'crouch', 'ready'] as const).map(keys), [
    ['w'],
    ['a'],
    ['s'],
    ['d'],
    ['shift'],
    [' '],
    ['c'],
    ['z'],
  ]);
  assert.deepEqual([keys('swing'), keys('guard'), keys('dodge')], [['mouse2'], ['mouse0', 'f'], ['v', 'mouse4']]);
  assert.deepEqual([keys('anima'), keys('tenetOne'), keys('tenetTwo')], [['r'], ['q'], ['g']]);
  assert.deepEqual([keys('melee'), keys('ranged'), keys('heal')], [['1'], ['2'], ['3']], 'a drink beside the loadouts');
  assert.deepEqual(
    [keys('menu'), keys('character'), keys('inventory'), keys('controls')],
    [['m'], ['i'], ['o'], ['k']],
  );
  assert.deepEqual([keys('use'), keys('respawn'), keys('voyage'), keys('map')], [['e'], ['enter'], [' '], ['n']]);
  for (const one of BIND_IDS)
    for (const other of BIND_IDS) {
      if (one >= other || !meet(one, other)) continue;
      for (const device of ['keys', 'pad'] as const)
        for (const name of DEFAULTS[one][device])
          assert.ok(!DEFAULTS[other][device].includes(name), `${one} and ${other} share ${device} ${name}`);
    }
});

test("the pad is Destiny's, but B taps to dodge and is held to crouch", () => {
  assert.deepEqual((['forward', 'run', 'jump', 'dodge', 'crouch', 'use', 'ready'] as const).map(pad), [
    ['LS up'],
    ['LS'],
    ['A'],
    ['B'],
    ['B hold'],
    ['X'],
    ['Y'],
  ]);
  assert.deepEqual([pad('swing'), pad('guard')], [['RT'], ['LT']], 'RT swings, LT guards');
  assert.deepEqual([pad('tenetOne'), pad('tenetTwo'), pad('anima')], [['LB'], ['RB'], ['LB+RB']]);
  assert.deepEqual([pad('melee'), pad('ranged'), pad('heal')], [['Left'], ['Right'], ['Down']], 'the D-pad');
  assert.deepEqual([pad('character'), pad('controls'), pad('turnLeft')], [['Start'], ['View'], ['RS left']]);
  assert.deepEqual(
    [pad('steerLeft'), pad('sailOn'), pad('aim'), pad('fire')],
    [['LS left'], ['LS up'], ['LT'], ['RT']],
  );
  for (const id of BIND_IDS) {
    for (const name of keys(id)) assert.ok(isKeyName(name), `${id}: ${name}`);
    for (const name of pad(id)) assert.ok(isPadName(name) || /^[LR]S (up|down|left|right)$/.test(name), name);
  }
});

test('a key another control acts with where this one does is swapped between them', () => {
  const after = rebind(DEFAULTS, { id: 'jump', device: 'keys', place: 0 }, 'c');
  assert.ok(after.binds);
  assert.equal(after.swapped, 'crouch');
  assert.deepEqual([after.binds?.jump.keys, after.binds?.crouch.keys], [['c'], [' ']]);
  const padded = rebind(DEFAULTS, { id: 'dodge', device: 'pad', place: 0 }, 'A');
  assert.ok(padded.binds);
  assert.deepEqual([padded.binds.dodge.pad, padded.binds.jump.pad, padded.swapped], [['A'], ['B'], 'jump']);
  const second = rebind(DEFAULTS, { id: 'guard', device: 'keys', place: 1 }, 'v');
  assert.deepEqual(
    [second.binds?.guard.keys, second.binds?.dodge.keys],
    [
      ['mouse0', 'v'],
      ['f', 'mouse4'],
    ],
  );
});

test('a key held only elsewhere is shared, and one bound twice to a control moves within it', () => {
  const helm = rebind(DEFAULTS, { id: 'voyage', device: 'keys', place: 0 }, 'e');
  assert.ok(helm.binds);
  assert.deepEqual([helm.binds.voyage.keys, helm.binds.use.keys, helm.swapped], [['e'], ['e'], null]);
  const within = rebind(DEFAULTS, { id: 'guard', device: 'keys', place: 0 }, 'f');
  assert.deepEqual(within.binds?.guard.keys, ['f', 'mouse0']);
  assert.equal(rebind(DEFAULTS, { id: 'jump', device: 'keys', place: 0 }, ' ').binds, DEFAULTS, 'the same key');
});

test('a key taken from a control it would leave with nothing is refused, naming it', () => {
  assert.deepEqual(rebind(DEFAULTS, { id: 'fire', device: 'keys', place: 0 }, 'mouse0'), { refused: 'holdFire' });
  assert.deepEqual(rebind(DEFAULTS, { id: 'inventory', device: 'pad', place: 0 }, 'LT'), { refused: 'guard' });
  const given = rebind(DEFAULTS, { id: 'fire', device: 'keys', place: 0 }, 'mouse2');
  assert.deepEqual(given, { refused: 'aim' });
});

test('only what differs from the defaults is kept, and it reads back as it was', () => {
  assert.deepEqual(overridesOf(DEFAULTS), {});
  const step = rebind(DEFAULTS, { id: 'jump', device: 'pad', place: 0 }, 'LB+RB');
  const binds = rebind(step.binds ?? DEFAULTS, { id: 'heal', device: 'keys', place: 0 }, 'mouse1').binds ?? DEFAULTS;
  const kept = overridesOf(binds);
  assert.deepEqual(kept, { jump: { pad: ['LB+RB'] }, anima: { pad: ['A'] }, heal: { keys: ['mouse1'] } });
  const read = readOverrides(JSON.parse(JSON.stringify(kept)));
  assert.ok(read);
  assert.deepEqual(withOverrides(read), binds);
});

test('binds read from outside are checked strictly: known controls, known keys and buttons, a few each', () => {
  assert.deepEqual(readOverrides({}), {});
  assert.deepEqual(readOverrides({ forward: { pad: ['LS up'], keys: ['arrowup'] } }), {
    forward: { pad: ['LS up'], keys: ['arrowup'] },
  });
  for (const refused of [
    null,
    [],
    'jump',
    { fly: { keys: ['w'] } },
    { jump: { keys: ['escape'] } },
    { jump: { keys: ['f5'] } },
    { jump: { keys: ['shift+a'] } },
    { jump: { keys: [' ', ' '] } },
    { jump: { keys: ['a', 'b', 'c', 'd'] } },
    { jump: { keys: 'a' } },
    { jump: { keys: [1] } },
    { jump: { pad: ['Z'] } },
    { jump: { pad: ['A hold hold'] } },
    { jump: { pad: ['LB+LB'] } },
    { jump: { pad: ['LS up'] } },
    { jump: { mouse: ['mouse0'] } },
    { jump: [] },
    { constructor: { keys: ['a'] } },
  ])
    assert.equal(readOverrides(refused), null, JSON.stringify(refused));
  assert.ok(isPadName('B hold') && isPadName('LB+RB') && !isPadName('LB+RB+A') && !isPadName('LS up'));
  assert.ok(isKeyName('é') && isKeyName(';') && !isKeyName('A') && !isKeyName('tab') && !isKeyName('mouse5'));
});

test('every control acts somewhere, and the menus and the sheet everywhere', () => {
  for (const id of BIND_IDS) assert.ok(CONTROLS[id].where.length > 0, id);
  for (const id of ['menu', 'character', 'controls'] as const) assert.equal(CONTROLS[id].where.length, 5, id);
});
