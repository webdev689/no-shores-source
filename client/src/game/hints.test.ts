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
  followHint,
  footHints,
  footStrip,
  hintsFor,
  keysShown,
  seaStrip,
  stripOf,
  withMapKey,
  withFollow,
  withoutLeave,
} from './hints.ts';
import { standingOf } from './hudLaw.ts';

const AT_REST: OnFoot = {
  worn: 0,
  drawn: false,
  ranged: false,
  aiming: false,
  daggers: false,
  mounted: false,
  mode: 'ground',
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

test('at rest on foot the strip shows the weapon, the body, the leave held and the key to every control', () => {
  assert.deepEqual(shown({}), ['Z Draw', 'Shift Run', 'Space Jump', 'C Crouch', 'M Hold to leave', 'K All controls']);
});

test("the strip's head names the moment: the stance on foot, what the player does at sea", () => {
  const title = (foot: Partial<OnFoot>) => footStrip({ ...AT_REST, ...foot }).title;
  assert.equal(title({}), 'On foot');
  assert.equal(title({ drawn: true }), 'Melee');
  assert.equal(title({ drawn: true, ranged: true }), 'Ranged');
  assert.equal(title({ drawn: true, ranged: true, aiming: true }), 'Aiming');
  assert.equal(title({ worn: 3, daggers: true }), 'Dusk Daggers');
  assert.equal(title({ mounted: true, drawn: true }), 'Riding');
  assert.equal(title({ mode: 'hang' }), 'Ledge');
  assert.equal(title({ mode: 'climb', drawn: true }), 'Climbing');
  assert.equal(seaStrip(SAILING).title, 'Sailing');
  assert.equal(seaStrip({ ...SAILING, fighting: true, aiming: true }).title, 'Guns laid');
  for (const name of Object.keys(HINTS) as (keyof typeof HINTS)[]) assert.notEqual(stripOf(name).title, '', name);
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

test("Shadow worn offers holding Q to aim Dusk Daggers until they are aimed; no other Art's Q does", () => {
  const shadow = 3;
  for (const foot of [{}, { drawn: true }, { drawn: true, ranged: true }]) {
    const strip = shown({ worn: shadow, ...foot });
    assert.ok(
      strip.some((entry) => entry.startsWith('Q ') && /hold/i.test(entry)),
      strip.join(', '),
    );
    assert.ok(!strip.some((entry) => /R \/ Q \/ G/.test(entry)), 'Q is said once');
    assert.ok(
      strip.some((entry) => entry.startsWith('R / G ')),
      'the other Arts still show',
    );
  }
  const holdsQ = (entry: string) => entry.startsWith('Q ') && /hold/i.test(entry);
  assert.ok(!shown({ worn: shadow, daggers: true }).some(holdsQ), 'aimed, only the release');
  for (const art of [1, 2]) assert.ok(!shown({ worn: art }).some(holdsQ), `Art ${art}`);
});

test('hanging or climbing shows only the climb’s keys, the weapon drawn or not', () => {
  for (const drawn of [false, true]) {
    const hanging = shown({ worn: 1, drawn, mode: 'hang' });
    const climbing = shown({ worn: 1, drawn, mode: 'climb' });
    for (const strip of [hanging, climbing]) {
      assert.ok(strip.includes('C Let go'), strip.join(', '));
      for (const fight of ['Swing', 'Guard', 'Dodge', 'Heal', 'Ranged', 'Arts', 'Draw'])
        assert.ok(!strip.some((entry) => entry.endsWith(` ${fight}`)), `${fight} on a wall`);
    }
    assert.ok(!hanging.some((entry) => entry.startsWith('Space')), 'a jump does nothing from a ledge');
    assert.ok(
      climbing.some((entry) => entry.startsWith('Space')),
      'a jump kicks off a wall',
    );
  }
});

test('the map’s N shows in every stance on foot, before the leave’s M, and K stays last', () => {
  const stances: Partial<OnFoot>[] = [
    {},
    { drawn: true },
    { drawn: true, ranged: true },
    { drawn: true, ranged: true, aiming: true },
    { worn: 3, daggers: true },
    { mounted: true },
    { mode: 'climb' },
  ];
  for (const foot of stances) {
    const strip = words(withMapKey(footStrip({ ...AT_REST, ...foot })).hints);
    assert.ok(strip.includes('N Map'), strip.join(', '));
    assert.equal(strip.at(-1), 'K All controls');
    const leave = strip.indexOf('M Hold to leave');
    if (leave >= 0) assert.equal(strip.indexOf('N Map'), leave - 1);
  }
});

test('riding shows how to get down and gallop', () => {
  assert.deepEqual(shown({ mounted: true, drawn: true }), [
    ', Get down',
    'Shift Gallop',
    'M Hold to leave',
    'K All controls',
  ]);
});

test('while a fall plays no key is listed; once death is told, Respawn; standing, what the player is doing', () => {
  assert.deepEqual(keysShown(standingOf('dead', 30, true, false), AT_REST).hints, []);
  assert.deepEqual(keysShown(standingOf('dead', 30, true, true), AT_REST), stripOf('dead'));
  assert.deepEqual(words(HINTS.dead), ['Enter Respawn', 'K All controls']);
  assert.deepEqual(keysShown(standingOf('inside', 0), AT_REST), footStrip(AT_REST));
  // Fallen in the fight: nothing until Respawn may be pressed, then Respawn.
  assert.deepEqual(keysShown(standingOf('inside', 0), AT_REST, { canRespawn: false }).hints, []);
  assert.deepEqual(keysShown(standingOf('inside', 0), AT_REST, { canRespawn: true }), stripOf('dead'));
  const waits = standingOf('dead', 30, true, true, null);
  assert.deepEqual(keysShown(waits, AT_REST).hints, [ALL_CONTROLS], 'no Respawn where the place stands them itself');
});

test("bearing the Lodestone the strip lists each key once: the swing its Strike, the guard Hold True, an Art's Ground", () => {
  const bearer = { charged: true };
  assert.deepEqual(shown({ drawn: true, worn: 1, bearer }), [
    'Right button Strike',
    'Left button Hold True',
    'V Dodge',
    '3 Heal',
    'R / Q / G Ground',
    'K All controls',
  ]);
  assert.deepEqual(shown({ worn: 3, bearer: { charged: false } }), [
    'Z Draw',
    'Shift Run',
    'Space Jump',
    'Left button Hold True',
    'R / Q / G Ground (charging)',
    'M Hold to leave',
    'K All controls',
  ]);
  assert.deepEqual(shown({ mounted: true, bearer }), shown({ mounted: true }), 'riding, as ever');
});

test('fallen in a Breach the follow key names whom the camera follows, first under the fallen strip', () => {
  assert.deepEqual(words([followHint('Ada')]), ['F Following Ada · Next']);
  assert.deepEqual(words([followHint('')]), ['F Follow']);
  const none = keysShown(standingOf('inside', 0), AT_REST, { canRespawn: false });
  assert.deepEqual(withFollow(none, 'Ada'), { title: 'Fallen', hints: [followHint('Ada')] });
});

test('at sea the keys shown follow what the player is doing, a fight first and its aim within it', () => {
  const seaHints = (state: AtSea) => seaStrip(state).hints;
  assert.equal(seaHints(SAILING), HINTS.sea);
  assert.equal(seaHints({ ...SAILING, managing: true }), HINTS.manage);
  assert.equal(seaHints({ ...SAILING, walking: true }), HINTS.deck);
  assert.equal(words(seaHints({ ...SAILING, walking: true, free: true }))[0], 'Left button Look round');
  assert.equal(seaHints({ ...SAILING, atHelm: true }), HINTS.map);
  assert.equal(seaHints({ ...SAILING, landing: true }), HINTS.landing);
  assert.equal(seaHints({ ...SAILING, walking: true, fighting: true }), HINTS.fight);
  assert.equal(seaHints({ ...SAILING, fighting: true, aiming: true }), HINTS.aim);
  assert.ok(!words(HINTS.sea).some((entry) => entry.startsWith('M ')), 'nothing to leave at sea');
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
    { mode: 'hang' },
    { mode: 'climb' },
    { free: true, worn: 1, bearer: { charged: false } },
    { free: true, worn: 3, drawn: true, bearer: { charged: true } },
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
    'pad:View hold Leave',
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

test('where there is nothing to leave (the story, a struck deck at sea) the strip lists no leave, and the rest as it was', () => {
  const strip = footStrip(AT_REST);
  const without = withoutLeave(strip);
  assert.ok(strip.hints.some(([names]) => names === 'leave'));
  assert.deepEqual(
    without.hints,
    strip.hints.filter(([names]) => names !== 'leave'),
  );
  assert.equal(without.title, strip.title);
});

test("the land's held map names its way to close on the keys and on the pad, which has no button for the map", () => {
  assert.deepEqual(words(HINTS.landMap).at(-2), 'N / Esc Close');
  assert.deepEqual(words(HINTS.landMap, 'pad').at(-2), 'pad:B Close');
});
