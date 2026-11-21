import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FightEvent } from '../network/messages.ts';
import { FLASH } from '../player/cardLooks.ts';
import { PX_PER_M } from '../player/figures.ts';
import { glanceView, GLANCE_FLOATS } from '../rules/fighters.ts';
import { EVENT, HOW } from './cues.ts';
import { DISSOLVE_FRAMES, Flashes, KNOCK, dissolveShare, flashAt, knockAt } from './flashes.ts';
import { GOLD } from './markSprites.ts';

const FRAME = 1 / 60;
const blow = (kind: number, defender: number, amount: number, over: Partial<FightEvent> = {}): FightEvent => ({
  tick: 0n,
  kind,
  striker: 40,
  defender,
  how: 1,
  amount,
  stroke: 0,
  ...over,
});
const frames = (flashes: Flashes, id: number, count: number) =>
  Array.from({ length: count }, (_unused, frame) => {
    if (frame > 0) flashes.update([], FRAME);
    const flash = flashes.flashOf(id);
    return flash ? `${flash.stage}:${flash.colour.join(',')}` : 'off';
  });

test('a struck foe flashes whole for two frames, its outline white for two, then in the blow’s element for one', () => {
  const flashes = new Flashes();
  flashes.update([blow(EVENT.hit, 1, 14)], 0, { player: 40, look: 2 });
  const shown = frames(flashes, 1, 7);
  assert.deepEqual(shown.slice(0, 4), [
    `${FLASH.whole}:1,1,1`,
    `${FLASH.whole}:1,1,1`,
    `${FLASH.outline}:1,1,1`,
    `${FLASH.outline}:1,1,1`,
  ]);
  assert.ok(shown[4]?.startsWith(`${FLASH.outline}:`) && shown[4] !== `${FLASH.outline}:1,1,1`, 'Volt’s light');
  assert.deepEqual(shown.slice(5), ['off', 'off'], 'then off: never a fading ghost');
});

test('a crit’s struck foe keeps the whole white frames, then its outline in gold for four frames', () => {
  const flashes = new Flashes();
  flashes.update([blow(EVENT.hit, 1, 14, { crit: true })], 0, { player: 40, look: 0 });
  const shown = frames(flashes, 1, 8);
  assert.deepEqual(shown.slice(0, 2), [`${FLASH.whole}:1,1,1`, `${FLASH.whole}:1,1,1`]);
  assert.deepEqual(new Set(shown.slice(2, 6)), new Set([`${FLASH.outline}:${GOLD[2].join(',')}`]), 'gold, four frames');
  assert.ok(shown[6]?.startsWith(`${FLASH.outline}:`), 'then steel');
  assert.equal(shown[7], 'off');
});

test('the player’s own flash is their outline in red, whole first only for a blow over a quarter of their health', () => {
  const light = flashAt(0, { own: true, whole: false, look: 0 });
  assert.equal(light?.stage, FLASH.outline);
  assert.equal(flashAt(4 * FRAME, { own: true, whole: false, look: 0 }), null);
  assert.equal(flashAt(0, { own: true, whole: true, look: 0 })?.stage, FLASH.whole);
  const flashes = new Flashes();
  flashes.update([blow(EVENT.hit, 9, 30)], 0, { player: 9, look: 0, healthMax: 100 });
  assert.equal(flashes.flashOf(9)?.stage, FLASH.whole, '30 of 100 fills them');
  flashes.update([blow(EVENT.hit, 9, 10)], FRAME, { player: 9, look: 0, healthMax: 100 });
  assert.equal(flashes.flashOf(9)?.stage, FLASH.outline, '10 does not');
});

test('a blow that does no harm, or harms another, flashes no one', () => {
  const flashes = new Flashes();
  flashes.update([blow(EVENT.parried, 1, 0), blow(EVENT.hit, 2, 9)], 0);
  assert.equal(flashes.flashOf(1), undefined);
  assert.equal(flashes.flashOf(2)?.stage, FLASH.whole);
});

test('a drink’s heal flashes no one, the drinker least of all', () => {
  const flashes = new Flashes();
  flashes.update([blow(EVENT.healed, 9, 40, { striker: 9, how: 0 })], 0, { player: 9, look: 0, healthMax: 100 });
  assert.equal(flashes.flashOf(9), undefined);
  assert.deepEqual(flashes.knockOf(9, true), [0, 0], 'nor knocks them');
});

test('a struck figure slides out along the blow in whole pixels and settles back exactly; a kill stays out', () => {
  for (const kind of ['hit', 'staggered', 'killed'] as const) {
    assert.equal(knockAt(kind, 0), 0);
    assert.ok(Math.abs(knockAt(kind, KNOCK.out * FRAME) - KNOCK[kind]) < 1 / PX_PER_M, `${kind} out`);
    for (let frame = 0; frame < 30; frame++) {
      const pixels = knockAt(kind, frame * FRAME) * PX_PER_M;
      assert.ok(Math.abs(pixels - Math.round(pixels)) < 1e-9, 'whole pixels');
    }
  }
  assert.equal(knockAt('hit', (KNOCK.out + KNOCK.back) * FRAME), 0);
  assert.equal(knockAt('staggered', (KNOCK.out + KNOCK.back + 5) * FRAME), 0);
  assert.equal(knockAt('killed', 2), Math.round(KNOCK.killed * PX_PER_M) / PX_PER_M);
  const flashes = new Flashes();
  const where = (id: number) => (id === 40 ? ([0, 0, 0] as const) : ([2, 0, 0] as const));
  flashes.update([blow(EVENT.hit, 1, 5), blow(EVENT.killed, 1, 0)], 0, { player: 0, look: 0, where });
  flashes.update([], KNOCK.out * FRAME);
  const [east, south] = flashes.knockOf(1, false);
  assert.ok(Math.abs(east - KNOCK.killed) < 1 / PX_PER_M && south === 0, 'the kill’s, away from its striker');
  assert.deepEqual(flashes.knockOf(1, true), [0, 0], 'let go once it stands again');
});

test('a stagger shakes its figure a pixel either way for six frames', () => {
  const flashes = new Flashes();
  flashes.update([blow(EVENT.staggered, 3, 0)], 0);
  const shakes = Array.from({ length: 8 }, (_unused, frame) => {
    if (frame > 0) flashes.update([], FRAME);
    return flashes.shakeOf(3);
  });
  assert.deepEqual(shakes, [1, -1, 1, -1, 1, -1, 0, 0]);
});

test('a death dissolves in held steps, each element at its own pace, whole at its start and gone at its end', () => {
  for (const look of [0, 1, 2, 3] as const) {
    assert.equal(dissolveShare(look, 0), 0);
    assert.equal(dissolveShare(look, DISSOLVE_FRAMES[look] * FRAME), 1);
    assert.equal(dissolveShare(look, 99), 1);
    assert.equal(dissolveShare(look, FRAME), 0, 'held for two frames');
    assert.ok(dissolveShare(look, 2 * FRAME) > 0);
  }
  assert.ok(dissolveShare(2, 10 * FRAME) > dissolveShare(1, 10 * FRAME), 'Volt quicker than Blaze');
});

test('the player’s own blows: a landed blow surges the glow and is a contact, a block another; shots are not', () => {
  const flashes = new Flashes();
  const told = { player: 40, look: 1 as const };
  flashes.update([blow(EVENT.hit, 2, 12)], 0, told);
  assert.deepEqual(flashes.ownOf(null), { surge: 2, contact: 'landed' });
  flashes.update([], FRAME);
  assert.equal(flashes.ownOf(null).contact, null, 'one frame');
  flashes.update([blow(EVENT.blocked, 2, 2)], FRAME, told);
  assert.equal(flashes.ownOf(null).contact, 'blocked');
  flashes.update([blow(EVENT.blocked, 40, 0, { striker: 2 })], FRAME, told);
  assert.equal(flashes.ownOf(null).contact, 'blocked', 'blocking a blow too');
  flashes.update([blow(EVENT.hit, 2, 12, { how: HOW.shot })], 1, told);
  assert.deepEqual(flashes.ownOf(null), { surge: 1, contact: null });
  flashes.update([blow(EVENT.hit, 2, 12), blow(EVENT.killed, 2, 0)], 0, told);
  flashes.update([], 8 * FRAME);
  assert.equal(flashes.ownOf(null).surge, 2.5, 'a kill surges longer');
  const swinging = glanceView(new Float64Array(GLANCE_FLOATS));
  const action = {
    kind: 'attack',
    stroke: 3,
    elapsed: 20,
    strike: 24,
    end: 60,
    swing: 'plain',
    leftHand: false,
  } as const;
  flashes.update([], 1);
  assert.equal(flashes.ownOf({ ...swinging, action }).surge, 1.5, 'through a swing’s fast part');
});
