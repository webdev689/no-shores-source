import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BIND_IDS, DEFAULTS, rebind } from '../player/binds.ts';
import { CONTROL_GROUPS } from './controls.ts';
import {
  ALL_CONTROLS,
  type AtSea,
  HINTS,
  type OnFoot,
  type StripHint,
  footHints,
  hintsFor,
  keysShown,
  seaHints,
} from './hints.ts';
import { standingOf } from './hudLaw.ts';

const AT_REST: OnFoot = {
  worn: 0,
  drawn: false,
  ranged: false,
  aiming: false,
  daggers: false,
  mounted: false,
  free: false,
};
const SAILING: AtSea = {
  fighting: false,
  aiming: false,
  landing: false,
  atHelm: false,
  walking: false,
  managing: false,
  free: false,
};
/** A strip as it shows for the keys (or the pad), each entry its keys and its words. */
const words = (hints: readonly StripHint[], device: 'keys' | 'pad' = 'keys', binds = DEFAULTS) =>
  hintsFor(hints, device, binds).map(([key, said]) => `${key} ${said}`);
const shown = (foot: Partial<OnFoot>) => words(footHints({ ...AT_REST, ...foot }));

test('at rest on foot the strip shows the weapon, the body, the menu and the key to every control', () => {
  assert.deepEqual(shown({}), ['Z Draw', 'Shift Run', 'Space Jump', 'C Crouch', 'M Menu', 'K All controls']);
});

test('the click to look round shows only while the mouse is free', () => {
  assert.equal(shown({ free: true })[0], 'Left button Look round');
  assert.ok(!shown({}).includes('Left button Look round'));
});

test("a melee weapon drawn shows the fight's keys, and a ranged one how to aim and fire", () => {
  assert.deepEqual(shown({ drawn: true }), [
    'Right button Swing',
    'Left button Guard or parry',
    'V Dodge',
    '3 Heal',
    '2 Ranged',
    'K All controls',
  ]);
  assert.deepEqual(shown({ drawn: true, ranged: true }).slice(0, 2), ['Right button Aim', 'Left button Fire']);
  assert.ok(shown({ drawn: true, ranged: true }).includes('1 Melee'));
});

test('aiming shows the shot and the way out of the aim, and Dusk Daggers aimed only their release', () => {
  assert.deepEqual(shown({ drawn: true, ranged: true, aiming: true }), [
    'Left button Fire',
    'Right button Release to stop',
    'V Dodge',
    'K All controls',
  ]);
  assert.deepEqual(shown({ worn: 3, daggers: true }), ['Q Release to cast', 'K All controls']);
});

test("the Arts' keys show only while an Art is worn and the hands are free to cast", () => {
  const cast = 'R / Q / G Arts';
  assert.ok(!shown({}).includes(cast), 'none worn, as in the prologue');
  assert.ok(shown({ worn: 1 }).includes(cast));
  assert.ok(shown({ worn: 1, drawn: true }).includes(cast));
  assert.ok(!shown({ worn: 1, drawn: true, ranged: true, aiming: true }).includes(cast));
  assert.ok(!shown({ worn: 1, mounted: true }).includes(cast), 'no cast on horseback');
});

test('riding shows how to get down and gallop', () => {
  assert.deepEqual(shown({ mounted: true, drawn: true }), [', Get down', 'Shift Gallop', 'M Menu', 'K All controls']);
});

test('while a fall plays no key is listed; once death is told, Respawn; standing, what the player is doing', () => {
  assert.deepEqual(keysShown(standingOf('dead', 30, true, false), AT_REST), []);
  assert.deepEqual(keysShown(standingOf('dead', 30, true, true), AT_REST), HINTS.dead);
  assert.deepEqual(words(HINTS.dead), ['Enter Respawn', 'K All controls']);
  assert.deepEqual(keysShown(standingOf('inside', 0), AT_REST), footHints(AT_REST));
});

test('at sea the keys shown follow what the player is doing, a fight first and its aim within it', () => {
  assert.equal(seaHints(SAILING), HINTS.sea);
  assert.equal(seaHints({ ...SAILING, managing: true }), HINTS.manage);
  assert.equal(seaHints({ ...SAILING, walking: true }), HINTS.deck);
  assert.equal(words(seaHints({ ...SAILING, walking: true, free: true }))[0], 'Left button Look round');
  assert.equal(seaHints({ ...SAILING, atHelm: true }), HINTS.map);
  assert.equal(seaHints({ ...SAILING, landing: true }), HINTS.landing);
  assert.equal(seaHints({ ...SAILING, walking: true, fighting: true }), HINTS.fight);
  assert.equal(seaHints({ ...SAILING, fighting: true, aiming: true }), HINTS.aim);
  assert.ok(words(HINTS.aim).includes('Right button Release to fire'));
  assert.ok(words(HINTS.fight).includes('Shift Burst'));
});

test('every strip is a handful of keys, ends with the key to every control, and names only what the sheet explains', () => {
  const written = new Set(
    CONTROL_GROUPS.flatMap((group) => group.controls.flatMap(({ keys }) => keys?.split(' / ') ?? [])),
  );
  const stances: Partial<OnFoot>[] = [
    { free: true, worn: 1 },
    { free: true, worn: 1, drawn: true },
    { free: true, worn: 1, drawn: true, ranged: true },
    { drawn: true, ranged: true, aiming: true },
    { daggers: true },
    { mounted: true },
  ];
  const strips = [...Object.values(HINTS), ...stances.map((foot) => footHints({ ...AT_REST, ...foot }))];
  const known: ReadonlySet<string> = new Set(BIND_IDS);
  for (const strip of strips) {
    assert.ok(strip.length <= 8, words(strip).join(', '));
    assert.deepEqual(strip.at(-1), ALL_CONTROLS);
    for (const [names, said] of strip) {
      for (const name of names.split(/ \/ |\|/))
        assert.ok(known.has(name) || written.has(name) || name === 'Drag', `${name} in the sheet`);
      assert.ok(!said.includes(':'), said);
    }
  }
});

test("the strip shows the pad's buttons while the pad was played last, a stick for its ways, and the keys as bound", () => {
  assert.deepEqual(words(footHints(AT_REST), 'pad'), [
    'pad:Y Draw',
    'pad:LS Run',
    'pad:A Jump',
    'pad:B hold Crouch',
    'pad:View hold Menu',
    'pad:View All controls',
  ]);
  assert.deepEqual(words(footHints({ ...AT_REST, drawn: true, ranged: true }), 'pad').slice(0, 2), [
    'pad:LT Aim',
    'pad:RT Fire',
  ]);
  assert.deepEqual(words(footHints({ ...AT_REST, worn: 1 }), 'pad').at(-3), 'pad:LB+RB / pad:LB / pad:RB Arts');
  assert.deepEqual(words(HINTS.sea, 'pad'), [
    'pad:LS across Steer',
    'pad:LS up Sail on',
    'pad:LS down Heave to',
    'pad:View hold Menu',
    'pad:View All controls',
  ]);
  assert.deepEqual(words(HINTS.aim, 'pad'), [
    'pad:Right stick Aim',
    'pad:RT Fire',
    'pad:LT Release to hold fire',
    'pad:Left / pad:Right Change shot',
    'pad:View All controls',
  ]);
  assert.equal(words(HINTS.landing, 'pad').at(-2), 'pad:B Back');
  assert.ok(words(HINTS.fight).includes('A / D Steer'), 'the first key of each control');
  const swapped = rebind(DEFAULTS, { id: 'jump', device: 'keys', place: 0 }, 'c').binds;
  assert.deepEqual(words(footHints(AT_REST), 'keys', swapped).slice(2, 4), ['C Jump', 'Space Crouch']);
});

test("the land's held map names its way to close on the keys and on the pad, which has no button for the map", () => {
  assert.deepEqual(words(HINTS.landMap).at(-2), 'N / Esc Close');
  assert.deepEqual(words(HINTS.landMap, 'pad').at(-2), 'pad:B Close');
});
