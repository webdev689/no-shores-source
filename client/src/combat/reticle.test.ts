import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FightEvent } from '../network/messages.ts';
import type { Action, FighterView } from '../rules/fighters.ts';
import { EVENT, HOW } from './cues.ts';
import { findAll, onFakePage } from './page.test.ts';
import { Crosshair, crosshairOf, type CrosshairFrame, landedBy, MARK_SECONDS, reticleOf } from './reticle.ts';

const PLAYER = 1;
const standing = (x: number, action: Action = { kind: 'idle' }): FighterView => ({
  x,
  y: 0,
  z: 0,
  facing: 0,
  mode: 'ground',
  crouched: false,
  aim: 0,
  side: 'players',
  arms: 0,
  health: 100,
  healthMax: 100,
  stamina: 100,
  poise: 0,
  poiseMax: 30,
  target: null,
  action,
});
const shot = (kind: number, changes: Partial<FightEvent> = {}): FightEvent => ({
  tick: 0n,
  kind,
  how: HOW.shot,
  striker: PLAYER,
  defender: 5,
  amount: 12,
  stroke: 0,
  ...changes,
});
const PISTOLET: CrosshairFrame = { reticle: 'pistolet', charge: null, reach: null };
const MELEE: CrosshairFrame = { reticle: 'melee', charge: null, reach: 2.4 };

test('each weapon has its own reticle, a ranged one only while its sights are up, the melee one while drawn', () => {
  const kinds = ['bow', 'crossbow', 'pistolet', 'thunderlock', 'sword', null].map(reticleOf);
  assert.deepEqual(kinds, ['bow', 'crossbow', 'pistolet', 'thunderlock', 'melee', 'melee'], 'fists too are melee');
  assert.equal(crosshairOf('pistolet', false, standing(0), 2), null, 'out in third person, not aiming: none');
  assert.deepEqual(crosshairOf('pistolet', true, standing(0), 2), PISTOLET);
  const drawing = standing(0, { kind: 'draw', elapsed: 30 });
  assert.deepEqual(crosshairOf('bow', true, drawing, 2), { reticle: 'bow', charge: 0.5, reach: null }, 'its draw');
  assert.deepEqual(crosshairOf('melee', false, null, 2.4), MELEE, 'in either view');
  assert.equal(crosshairOf(null, true, standing(0), 2), null, 'nothing drawn');
});

test("a shot's mark is the strongest way the player's shots landed: a kill, a crit, then a hit that harmed", () => {
  assert.equal(landedBy([], PLAYER), null);
  assert.equal(landedBy([shot(EVENT.hit)], PLAYER), 'hit');
  assert.equal(landedBy([shot(EVENT.shielded)], PLAYER), 'hit', 'on a shield');
  assert.equal(landedBy([shot(EVENT.hit, { crit: true }), shot(EVENT.hit)], PLAYER), 'crit');
  assert.equal(landedBy([shot(EVENT.hit), shot(EVENT.killed, { amount: 0 })], PLAYER), 'kill');
  assert.equal(landedBy([shot(EVENT.hit, { amount: 0 })], PLAYER), null, 'harming nothing');
  assert.equal(landedBy([shot(EVENT.blocked)], PLAYER), null, 'blocked');
  assert.equal(landedBy([shot(EVENT.hit, { how: 0 })], PLAYER), null, 'a melee blow');
  assert.equal(landedBy([shot(EVENT.hit, { striker: 9 })], PLAYER), null, "another's shot");
});

test('the crosshair goes red on a foe, rings a reload as it runs and shows a fading mark as a shot lands', () => {
  onFakePage((root) => {
    const crosshair = new Crosshair(root);
    const [node] = findAll(root, 'crosshair');
    const [mark] = findAll(root, 'landed');
    crosshair.update(null, standing(0), null, [], PLAYER, 1 / 60);
    assert.equal(node?.hidden, true);
    crosshair.update(PISTOLET, standing(0), standing(10), [], PLAYER, 1 / 60);
    assert.deepEqual(
      [node?.hidden, node?.dataset['reticle'], node?.classList.contains('foe')],
      [false, 'pistolet', true],
    );
    crosshair.update(PISTOLET, standing(0, { kind: 'reload', left: 60 }), null, [shot(EVENT.hit)], PLAYER, 1 / 60);
    assert.deepEqual([node?.classList.contains('foe'), node?.classList.contains('reloading')], [false, true]);
    assert.deepEqual([node?.style['--fill'], mark?.hidden, mark?.dataset['landed']], ['0deg', false, 'hit']);
    crosshair.update(PISTOLET, standing(0, { kind: 'reload', left: 30 }), null, [], PLAYER, MARK_SECONDS);
    assert.deepEqual([node?.style['--fill'], mark?.hidden], ['180deg', true], 'half reloaded; the mark gone');
    crosshair.update(PISTOLET, standing(0), null, [], PLAYER, 1 / 60);
    assert.equal(node?.classList.contains('reloading'), false);
  });
});

test('the melee reticle closes into brackets over a foe within its reach, and is never turned red out of it', () => {
  onFakePage((root) => {
    const crosshair = new Crosshair(root);
    const [node] = findAll(root, 'crosshair');
    crosshair.update(MELEE, standing(0), standing(2.2), [], PLAYER, 1 / 60);
    assert.deepEqual([node?.dataset['reticle'], node?.classList.contains('reach')], ['melee', true]);
    crosshair.update(MELEE, standing(0), standing(4), [shot(EVENT.hit)], PLAYER, 1 / 60);
    assert.deepEqual([node?.classList.contains('reach'), node?.classList.contains('foe')], [false, false]);
    assert.equal(findAll(root, 'landed')[0]?.hidden, true, 'no shot mark on the melee reticle');
  });
});
