import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ArtState } from '../network/artMessages.ts';
import { SPELLS } from '../network/artMessages.ts';
import { type Action, BINDINGS } from '../player/input.ts';
import type { FighterView } from '../rules/fighters.ts';
import {
  ABILITY_ACTIONS,
  CAST_LOCKOUT_MOST_S,
  CastKeys,
  DAGGERS,
  abilitiesAt,
  aimRingMesh,
  daggersAim,
  daggersAsked,
} from './casting.ts';
import { MARK_FLOATS } from './marks.ts';

const own = (kind = 'idle') => ({ x: 0, y: 0, z: 0, action: { kind } }) as unknown as FighterView;
const state = (art: number, anima = 1, tenets: [number, number] = [1, 1], core: (number | null)[] = []): ArtState => ({
  art,
  cores: [1, 2, 3].map((each) => (each === art ? [...core, null, null, null].slice(0, 3) : [null, null, null])),
  anima,
  tenets,
});

/** A frame of the keys: `pressed` pressed (and held), `held` held only. */
const keys = (pressed: readonly Action[] = [], held: readonly Action[] = []) => ({
  held: (action: Action) => pressed.includes(action) || held.includes(action),
  pressed: (action: Action) => pressed.includes(action),
  released: () => false,
  lookX: 0,
  lookY: 0,
  wheel: 0,
  locked: true,
});

/** The ground the tests stand on: 0.5 m up east of x = 10, at 0 elsewhere. */
const floorAt = (x: number) => (x > 10 ? 0.5 : 0);
const framed = (casting: CastKeys, arts: ArtState, controls = keys(), mark: [number, number, number] | null = null) =>
  casting.frame(controls, 1 / 60, {
    hands: true,
    state: arts,
    abilities: abilitiesAt(arts, 0, 0),
    own: own(),
    yaw: 0,
    markOf: () => mark,
    floorAt,
  });

test('no key casts two things, the DFO keys stay where they were, and the abilities sit on R, Q and G', () => {
  const bound = Object.values(BINDINGS).flat();
  assert.equal(new Set(bound).size, bound.length, 'each key one action');
  assert.deepEqual(
    ABILITY_ACTIONS.map((action) => BINDINGS[action]),
    [['r'], ['q'], ['g']],
  );
  assert.ok((BINDINGS.guard as readonly string[]).includes('f'), 'F still guards');
  assert.deepEqual(BINDINGS.crouch, ['c'], 'C still crouches');
  assert.deepEqual(
    [BINDINGS.melee, BINDINGS.ranged, BINDINGS.heal],
    [['1'], ['2'], ['3']],
    'a drink beside the loadouts',
  );
});

test('the bar runs each share on by its recharge from the room’s word, and holds it at full', () => {
  const taken = state(1, 0, [0.2, 0.9]);
  const after = abilitiesAt(taken, 100, 100 + 60 * 50);
  assert.ok(after);
  assert.ok(Math.abs(after.animaShare - 50 / 500) < 1e-9, 'Tempest recharges over 500 s');
  assert.ok(Math.abs(after.tenets[0] - (0.2 + 50 / 91)) < 1e-9);
  assert.equal(after.tenets[1], 1, 'Arc Lash full, and held there');
  assert.equal(abilitiesAt(null, 0, 0), null);
  assert.equal(abilitiesAt(state(0), 0, 0), null, 'no Art worn, as in the prologue: no bar');
});

test('a press casts its ability only when it is ready, then waits for the room’s word before another', () => {
  const casting = new CastKeys();
  assert.deepEqual(framed(casting, state(1, 0.5), keys(['anima'])).cast, null, 'the Anima is not full');
  assert.deepEqual(framed(casting, state(1), keys(['anima'])).cast, { spell: SPELLS.tempest, aim: null });
  assert.equal(framed(casting, state(1), keys(['tenetTwo'])).cast, null, 'locked out a moment');
  assert.deepEqual(
    framed(casting, state(2), keys(['tenetTwo'])).cast,
    { spell: SPELLS.dawnflare, aim: null },
    'Art changed',
  );
  for (const kind of ['staggered', 'drink']) {
    const unable = new CastKeys().frame(keys(['anima']), 0, {
      hands: true,
      state: state(1),
      abilities: abilitiesAt(state(1), 0, 0),
      own: own(kind),
      yaw: 0,
      markOf: () => null,
      floorAt,
    });
    assert.equal(unable.cast, null, `${kind}: nothing is cast`);
  }
});

test('after a cast the keys wait for the room’s word that it was spent, however long it takes, up to a limit', () => {
  const casting = new CastKeys();
  const word = state(1);
  assert.ok(framed(casting, word, keys(['tenetOne'])).cast, 'Quicken sent');
  for (let frame = 0; frame < 60; frame++) framed(casting, state(1));
  assert.equal(framed(casting, state(1), keys(['tenetTwo'])).cast, null, 'other words, Quicken still full: kept shut');
  assert.ok(framed(casting, state(1, 1, [0, 1]), keys(['tenetTwo'])).cast, 'the room spent Quicken: Arc Lash goes');
  for (let frame = 0; frame < CAST_LOCKOUT_MOST_S * 60 + 1; frame++) framed(casting, word);
  assert.ok(framed(casting, word, keys(['anima'])).cast, 'a cast the room let fall sends no word: they open again');
  casting.reset();
  assert.ok(framed(casting, word, keys(['tenetOne'])).cast, 'a room joined afresh starts them afresh');
});

test('a key whose ability its road has not earned sends nothing, so the earned ones are never held shut by it', () => {
  // Storm worn, only the Art earned: the Stormcallers' road before its fourth task's end. Every share full.
  const storm = { ...state(1), earned: [0b001, 0, 0] };
  assert.equal(abilitiesAt(storm, 0, 0)?.earned, 0b001);
  const casting = new CastKeys();
  assert.equal(framed(casting, storm, keys(['tenetOne'])).cast, null, 'Quicken, not earned, is not sent');
  assert.equal(framed(casting, storm, keys(['tenetTwo'])).cast, null, 'nor Arc Lash');
  assert.deepEqual(framed(casting, storm, keys(['anima'])).cast, { spell: SPELLS.tempest, aim: null }, 'the Anima');
  // Shadow worn, Dusk Daggers not earned: its key draws no ring.
  const shadow = { ...state(3), earned: [0, 0, 0b001] };
  const held = framed(new CastKeys(), shadow, keys([ABILITY_ACTIONS[DAGGERS]]), [3, 4, 0]);
  assert.deepEqual(held, { cast: null, ring: null }, 'Dusk Daggers neither aimed nor cast');
  assert.ok(framed(new CastKeys(), { ...shadow, earned: [0, 0, 0b011] }, keys([ABILITY_ACTIONS[DAGGERS]])).ring);
});

test('Dusk Daggers ask for the mark as it is, draw their ring where the room lays it, and cast as the key is let go', () => {
  const casting = new CastKeys();
  const shadow = state(3);
  const aimed = framed(casting, shadow, keys([ABILITY_ACTIONS[DAGGERS]]), [0, -30, 3]);
  assert.deepEqual(aimed.cast, { spell: 0, aim: [0, -30, 3] }, 'only the aim, while held, the room drawing it in');
  assert.deepEqual(aimed.ring, { at: [0, -16, 0], radius: 4, element: 3 }, 'drawn in, on the ground');
  const held = framed(casting, shadow, keys([], [ABILITY_ACTIONS[DAGGERS]]), [12, -5, 2]);
  assert.deepEqual(held.ring?.at, [12, -5, 0.5], 'on the ground there, not at the mark');
  const loosed = framed(casting, shadow, keys(), [12, -5, 2]);
  assert.deepEqual(loosed, { cast: { spell: SPELLS.duskDaggers, aim: [12, -5, 2] }, ring: null });
  const blades = framed(new CastKeys(), state(3, 1, [1, 1], [2]), keys([ABILITY_ACTIONS[DAGGERS]]), [0, -5, 0]);
  assert.equal(blades.ring?.radius, 5.5, 'Blades reach 1.5 m further');
});

test('with no mark the ring stands straight along the look at its reach, and its mesh is whole vertices', () => {
  const asked = daggersAsked([1, 1, 0], Math.PI / 2, null, 16);
  assert.ok(Math.abs(asked[0] - 17) < 1e-9 && Math.abs(asked[1] - 1) < 1e-9);
  const spot = daggersAim([1, 1, 0], asked, 16, floorAt);
  assert.deepEqual([spot[0], spot[2]], [asked[0], 0.5], 'on the ground there');
  const mesh = aimRingMesh({ at: [0, 0, 0], radius: 4, element: 3 });
  assert.ok(mesh.length > 0 && mesh.length % MARK_FLOATS === 0);
});
