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
  fits,
  hearsMouse,
  type Binds,
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
  assert.deepEqual(after.swapped, ['crouch']);
  assert.deepEqual([after.binds?.jump.keys, after.binds?.crouch.keys], [['c'], [' ']]);
  const padded = rebind(DEFAULTS, { id: 'dodge', device: 'pad', place: 0 }, 'A');
  assert.ok(padded.binds);
  assert.deepEqual([padded.binds.dodge.pad, padded.binds.jump.pad, padded.swapped], [['A'], ['B'], ['jump']]);
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
  assert.deepEqual([helm.binds.voyage.keys, helm.binds.use.keys, helm.swapped], [['e'], ['e'], []]);
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
  for (const refused of [null, [], 'jump']) assert.equal(readOverrides(refused), null, JSON.stringify(refused));
  for (const dropped of [
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
    assert.deepEqual(readOverrides(dropped), {}, JSON.stringify(dropped));
  assert.ok(isPadName('B hold') && isPadName('LB+RB') && !isPadName('LB+RB+A') && !isPadName('LS up'));
  assert.ok(isKeyName('é') && isKeyName(';') && !isKeyName('A') && !isKeyName('tab') && !isKeyName('mouse5'));
});

test('every control acts somewhere, and the menus and the sheet everywhere', () => {
  for (const id of BIND_IDS) assert.ok(CONTROLS[id].where.length > 0, id);
  for (const id of ['menu', 'character', 'controls'] as const) assert.equal(CONTROLS[id].where.length, 5, id);
});

/** Every two controls that act somewhere alike and share a key or button: none may. */
const clashesIn = (binds: Binds): string[] =>
  BIND_IDS.flatMap((one) =>
    BIND_IDS.flatMap((other) =>
      one < other && meet(one, other)
        ? (['keys', 'pad'] as const).flatMap((device) =>
            binds[one][device]
              .filter((name) => binds[other][device].includes(name))
              .map((name) => `${one} and ${other} share ${name}`),
          )
        : [],
    ),
  );

test('every rebind from the defaults leaves no two controls that act alike on one key or button', () => {
  const names = (device: 'keys' | 'pad') => [
    ...new Set([
      ...BIND_IDS.flatMap((id) => DEFAULTS[id][device]),
      ...(device === 'keys' ? ['x', 'mouse1'] : ['Y hold']),
    ]),
  ];
  for (const id of BIND_IDS)
    for (const device of ['keys', 'pad'] as const)
      for (let place = 0; place <= DEFAULTS[id][device].length; place++)
        for (const name of names(device)) {
          const after = rebind(DEFAULTS, { id, device, place }, name);
          if (after.binds) assert.deepEqual(clashesIn(after.binds), [], `${id} ${device} ${place} to ${name}`);
        }
  // Rebinds one after another, each from the binds the last left, a fixed walk through them.
  let binds: Binds = DEFAULTS;
  for (let step = 0, seed = 7; step < 400; step++) {
    seed = (seed * 48271) % 2147483647;
    const id = BIND_IDS[seed % BIND_IDS.length] ?? 'jump';
    const device = seed % 2 === 0 ? 'keys' : 'pad';
    const name = names(device)[seed % names(device).length] ?? 'x';
    binds = rebind(binds, { id, device, place: seed % 3 }, name).binds ?? binds;
    assert.deepEqual(clashesIn(binds), [], `step ${step}: ${id} ${device} to ${name}`);
  }
  const used = rebind(DEFAULTS, { id: 'use', device: 'keys', place: 0 }, 'c');
  assert.deepEqual([used.binds?.use.keys, used.binds?.crouch.keys, used.binds?.brace.keys], [['c'], ['e'], ['e']]);
  assert.deepEqual(used.binds && used.swapped, ['crouch', 'brace'], 'each control that gave it up is named');
  const sheet = rebind(DEFAULTS, { id: 'controls', device: 'pad', place: 0 }, 'A');
  assert.deepEqual(
    (['jump', 'respawn', 'confirm'] as const).map((id) => sheet.binds?.[id].pad),
    [['View'], ['View'], ['View']],
  );
  assert.deepEqual(rebind(DEFAULTS, { id: 'crouch', device: 'keys', place: 0 }, 'e'), { refused: 'use' });
});

test("a stick's ways are never bound, nor swapped into another control", () => {
  for (const name of ['LS up', 'RS left'])
    assert.deepEqual(rebind(DEFAULTS, { id: 'voyage', device: 'pad', place: 0 }, name).binds, DEFAULTS, name);
  assert.deepEqual(rebind(DEFAULTS, { id: 'sailOn', device: 'pad', place: 0 }, 'X').binds, DEFAULTS);
});

test('a control that hears no mouse button takes none, bound or given in a swap', () => {
  for (const id of ['use', 'menu', 'confirm', 'repair', 'controls', 'sailOn'] as const) assert.ok(!hearsMouse(id), id);
  for (const id of ['swing', 'guard', 'dodge', 'perspective', 'aim', 'jump'] as const) assert.ok(hearsMouse(id), id);
  assert.ok(!fits('use', 'keys', 'mouse0') && fits('jump', 'keys', 'mouse0') && !fits('jump', 'keys', 'mouse5'));
  // Swing gives up the right button where it takes E from Use, which cannot hear it, so Use keeps E.
  assert.deepEqual(rebind(DEFAULTS, { id: 'swing', device: 'keys', place: 0 }, 'e'), { refused: 'use' });
  assert.deepEqual(readOverrides({ use: { keys: ['mouse0'] }, jump: { keys: ['mouse1'] } }), {
    jump: { keys: ['mouse1'] },
  });
});

test('binds kept by another build keep what still reads; a kept key a default now holds leaves no clash', () => {
  assert.deepEqual(
    readOverrides({
      fly: { keys: ['w'] },
      jump: { keys: ['c'], pad: ['Z'], mouse: ['mouse0'] },
      voyage: { pad: ['LS up'] },
      crouch: 'c',
    }),
    { jump: { keys: ['c'] } },
  );
  // Kept from a build where Jump was on X and Dodge on E, with Details on X now and Use on E: Jump and Details never
  // act alike, so both stand; Dodge goes back to its own, as Use holds E.
  const kept = withOverrides({ jump: { keys: ['x'] }, dodge: { keys: ['e'] } });
  assert.deepEqual(clashesIn(kept), []);
  assert.deepEqual(
    [kept.jump.keys, kept.details.keys, kept.dodge.keys, kept.use.keys],
    [['x'], ['x'], ['v', 'mouse4'], ['e']],
  );
  assert.deepEqual(withOverrides({ crouch: { keys: [' '] } }).crouch.keys, ['c'], "Space is Jump's, on its default");
});
