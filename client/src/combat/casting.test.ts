import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ArtState } from '../network/artMessages.ts';
import { SPELLS } from '../network/artMessages.ts';
import { type Action, BINDINGS } from '../player/input.ts';
import type { FighterView } from '../rules/fighters.ts';
import { ABILITY_ACTIONS, CAST_LOCKOUT_S, CastKeys, DAGGERS, abilitiesAt, aimRingMesh, daggersAim } from './casting.ts';
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

const framed = (casting: CastKeys, arts: ArtState, controls = keys(), mark: [number, number, number] | null = null) =>
  casting.frame(controls, 1 / 60, {
    hands: true,
    state: arts,
    abilities: abilitiesAt(arts, 0, 0),
    own: own(),
    yaw: 0,
    markOf: () => mark,
  });

test('no key casts two things, F is no longer the guard, and the abilities sit on F, Q and C', () => {
  const bound = Object.values(BINDINGS).flat();
  assert.equal(new Set(bound).size, bound.length, 'each key one action');
  assert.deepEqual(
    ABILITY_ACTIONS.map((action) => BINDINGS[action]),
    [['f'], ['q'], ['c']],
  );
  assert.ok(!(BINDINGS.guard as readonly string[]).includes('f'));
});

test('the bar runs each share on by its recharge from the room’s word, and holds it at full', () => {
  const taken = state(1, 0, [0.2, 0.9]);
  const after = abilitiesAt(taken, 100, 100 + 60 * 50);
  assert.ok(after);
  assert.ok(Math.abs(after.animaShare - 50 / 500) < 1e-9, 'Tempest recharges over 500 s');
  assert.ok(Math.abs(after.tenets[0] - (0.2 + 50 / 91)) < 1e-9);
  assert.equal(after.tenets[1], 1, 'Arc Lash full, and held there');
  assert.equal(abilitiesAt(null, 0, 0), null);
});

test('a press casts its ability only when it is ready, then waits for the room’s word before another', () => {
  const casting = new CastKeys();
  assert.deepEqual(framed(casting, state(1, 0.5), keys(['anima'])).cast, null, 'the Anima is not full');
  assert.deepEqual(framed(casting, state(1), keys(['anima'])).cast, { spell: SPELLS.tempest, aim: null });
  assert.equal(framed(casting, state(1), keys(['tenetTwo'])).cast, null, 'locked out a moment');
  for (let frame = 0; frame < CAST_LOCKOUT_S * 60 + 1; frame++) framed(casting, state(1));
  assert.deepEqual(framed(casting, state(2), keys(['tenetTwo'])).cast, { spell: SPELLS.dawnflare, aim: null });
  const staggered = new CastKeys().frame(keys(['anima']), 0, {
    hands: true,
    state: state(1),
    abilities: abilitiesAt(state(1), 0, 0),
    own: own('staggered'),
    yaw: 0,
    markOf: () => null,
  });
  assert.equal(staggered.cast, null, 'staggered, nothing is cast');
});

test('Dusk Daggers aim a ring while held, drawn in to their reach, and cast there as the key is let go', () => {
  const casting = new CastKeys();
  const shadow = state(3);
  const aimed = framed(casting, shadow, keys([ABILITY_ACTIONS[DAGGERS]]), [0, -30, 0]);
  assert.deepEqual(aimed.cast, { spell: 0, aim: [0, -16, 0] }, 'only the aim, while held');
  assert.deepEqual(aimed.ring, { at: [0, -16, 0], radius: 4, element: 3 });
  const held = framed(casting, shadow, keys([], [ABILITY_ACTIONS[DAGGERS]]), [2, -5, 0.5]);
  assert.deepEqual(held.ring?.at, [2, -5, 0.5]);
  const loosed = framed(casting, shadow, keys(), [2, -5, 0.5]);
  assert.deepEqual(loosed, { cast: { spell: SPELLS.duskDaggers, aim: [2, -5, 0.5] }, ring: null });
  const blades = framed(new CastKeys(), state(3, 1, [1, 1], [2]), keys([ABILITY_ACTIONS[DAGGERS]]), [0, -5, 0]);
  assert.equal(blades.ring?.radius, 5.5, 'Blades reach 1.5 m further');
});

test('with no mark the ring stands straight along the look at its reach, and its mesh is whole vertices', () => {
  const spot = daggersAim([1, 1, 0], Math.PI / 2, null, 16);
  assert.ok(Math.abs(spot[0] - 17) < 1e-9 && Math.abs(spot[1] - 1) < 1e-9);
  const mesh = aimRingMesh({ at: [0, 0, 0], radius: 4, element: 3 });
  assert.ok(mesh.length > 0 && mesh.length % MARK_FLOATS === 0);
});
