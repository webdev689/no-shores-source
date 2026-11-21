import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FightEvent } from '../network/messages.ts';
import type { Action, FighterView } from '../rules/fighters.ts';
import { EVENT, HOW } from './cues.ts';
import { allOf } from './nodes.test.ts';
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
  assert.equal(crosshairOf('melee', false, standing(0, { kind: 'dead', elapsed: 3 }), 2.4), null, 'none when dead');
  assert.equal(crosshairOf(null, false, standing(0), 2), null, 'nothing drawn');
  const held = crosshairOf(null, true, standing(0), 2);
  assert.equal(held?.reticle, 'pistolet', "the Test Ground's held aiming view with no weapon drawn: the plain cross");
});

test("a shot's mark is the strongest way the player's shots landed: a kill, a crit, then a hit that harmed", () => {
  assert.equal(landedBy([], PLAYER), null);
  assert.equal(landedBy([shot(EVENT.hit)], PLAYER), 'hit');
  assert.equal(landedBy([shot(EVENT.shielded)], PLAYER), 'hit', 'on a shield');
  assert.equal(landedBy([shot(EVENT.guardBroken)], PLAYER), 'hit', 'a guard broken, harming');
  assert.equal(landedBy([shot(EVENT.hit, { crit: true }), shot(EVENT.hit)], PLAYER), 'crit');
  assert.equal(landedBy([shot(EVENT.hit), shot(EVENT.killed, { amount: 0 })], PLAYER), 'kill');
  assert.equal(landedBy([shot(EVENT.hit, { amount: 0 })], PLAYER), null, 'harming nothing');
  assert.equal(landedBy([shot(EVENT.blocked)], PLAYER), null, 'blocked');
  assert.equal(landedBy([shot(EVENT.hit, { how: 0 })], PLAYER), null, 'a melee blow');
  assert.equal(landedBy([shot(EVENT.hit, { striker: 9 })], PLAYER), null, "another's shot");
});

test('the crosshair goes red on a foe, rings a reload as it runs and shows a fading mark as a shot lands', () => {
  const crosshair = new Crosshair();
  crosshair.update(null, standing(0), null, [], PLAYER, 1 / 60);
  assert.equal(crosshair.look === null, true);
  assert.equal(crosshair.node(), null, 'hidden, nothing drawn');
  crosshair.update(PISTOLET, standing(0), standing(10), [], PLAYER, 1 / 60);
  assert.deepEqual([crosshair.look?.reticle, crosshair.look?.ink], ['pistolet', 'foe']);
  crosshair.update(PISTOLET, standing(0, { kind: 'reload', left: 60 }), null, [shot(EVENT.hit)], PLAYER, 1 / 60);
  assert.deepEqual(crosshair.look?.ink, 'reloading');
  assert.deepEqual(
    [crosshair.look?.ring, crosshair.look?.mark],
    [
      { fill: 0, ink: 'reload' },
      { kind: 'hit', opacity: 1 },
    ],
  );
  crosshair.update(PISTOLET, standing(0, { kind: 'reload', left: 30 }), null, [], PLAYER, MARK_SECONDS);
  assert.deepEqual([crosshair.look?.ring?.fill, crosshair.look?.mark], [0.5, null], 'half reloaded; the mark gone');
  crosshair.update(PISTOLET, standing(0), null, [], PLAYER, 1 / 60);
  assert.deepEqual([crosshair.look?.ink, crosshair.look?.ring], ['plain', null]);
});

test("a shot's mark fades over its quarter second, drawn over the crosshair in its own picture", () => {
  const crosshair = new Crosshair();
  crosshair.update(PISTOLET, standing(0), null, [shot(EVENT.hit, { crit: true })], PLAYER, 1 / 60);
  crosshair.update(PISTOLET, standing(0), null, [], PLAYER, MARK_SECONDS / 2);
  const drawn = allOf(crosshair.node());
  const mark = drawn.find((node) => node.picture?.key === 'reticle mark crit');
  assert.ok(mark, 'a crit marked in gold');
  assert.ok(Math.abs((mark.opacity ?? 1) - 0.5) < 0.1, `half faded (${mark.opacity})`);
  assert.equal(drawn[0]?.float?.to, 'screen', 'the crosshair stands on the view');
  assert.deepEqual(
    [drawn[0]?.float?.at, drawn[0]?.float?.anchor],
    [
      [0.5, 0.5],
      [0.5, 0.5],
    ],
    'at its middle',
  );
});

test('a draw or a reload is drawn in two-degree steps, so it makes few pictures, and a full draw glows', () => {
  const crosshair = new Crosshair();
  const keyAt = (charge: number) => {
    crosshair.update({ reticle: 'bow', charge, reach: null }, standing(0), null, [], PLAYER, 1 / 60);
    return allOf(crosshair.node())[0]?.picture?.key;
  };
  assert.equal(keyAt(0.5), keyAt(0.501), 'a step held');
  assert.notEqual(keyAt(0.5), keyAt(0.52));
  assert.match(keyAt(1) ?? '', /charge 180 full/);
  assert.equal(crosshair.look?.full, true);
});

test('the melee reticle closes into brackets over a foe within its reach, and is never turned red out of it', () => {
  const crosshair = new Crosshair();
  crosshair.update(MELEE, standing(0), standing(2.2), [], PLAYER, 1 / 60);
  assert.deepEqual([crosshair.look?.reticle, crosshair.look?.reach], ['melee', true]);
  crosshair.update(MELEE, standing(0), standing(4), [shot(EVENT.hit)], PLAYER, 1 / 60);
  assert.deepEqual([crosshair.look?.reach, crosshair.look?.ink], [false, 'plain']);
  assert.equal(crosshair.look?.mark, null, 'no shot mark on the melee reticle');
});

test("a double pistolet's wait between barrels is no reload, a new reload is read from its start, and a shot landing unseen marks nothing", () => {
  const crosshair = new Crosshair();
  const reloading = (left: number) => standing(0, { kind: 'reload', left });
  crosshair.update(PISTOLET, reloading(30), null, [], PLAYER, 1 / 60);
  assert.equal(crosshair.look?.ring === null, true, 'the brace gap');
  crosshair.update(PISTOLET, reloading(171), null, [], PLAYER, 1 / 60);
  crosshair.update(PISTOLET, reloading(1), null, [], PLAYER, 1 / 60);
  crosshair.update(PISTOLET, reloading(100), null, [], PLAYER, 1 / 60);
  assert.equal(crosshair.look?.ring?.fill, 0, 'the next reload, its idle tick unseen, starts empty');
  crosshair.update(null, standing(0), null, [shot(EVENT.hit)], PLAYER, 1 / 60);
  crosshair.update(PISTOLET, standing(0), null, [], PLAYER, 1 / 60);
  assert.equal(crosshair.look?.mark, null, 'fired with no crosshair: no mark when it shows');
});

test('the melee reticle closes on no foe above or below a stroke’s height, as no blow reaches it', () => {
  const crosshair = new Crosshair();
  crosshair.update(MELEE, standing(0), { ...standing(2.2), z: 2 }, [], PLAYER, 1 / 60);
  assert.equal(crosshair.look?.reach, false, 'on a ledge 2 m up');
});
