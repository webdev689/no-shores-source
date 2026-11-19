import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FightEvent } from '../network/messages.ts';
import { EVENT, HOW } from './cues.ts';
import { blowLook } from './fightEffects.ts';
import { CRIT, HIT, Impacts, contactOf, hitScale, strokeTravel } from './impacts.ts';
import { GOLD, STEEL } from './impactPixels.ts';

const FRAME = 1 / 60;
const STRIKER = 40;
const DEFENDER = 1;
const event = (kind: number, over: Partial<FightEvent> = {}): FightEvent => ({
  tick: 0n,
  kind,
  how: 1,
  striker: STRIKER,
  defender: DEFENDER,
  amount: 10,
  stroke: 3,
  ...over,
});
// The striker stands 2 m south of its defender, the eye 3 m further back and up.
const where = (id: number) => (id === STRIKER ? ([0, 2, 0] as const) : id === DEFENDER ? ([0, 0, 0] as const) : null);
const EYE = [0.8, 5, 1.8] as const;
const told = (look = 0 as 0 | 1 | 2 | 3) => ({ where, lookOf: () => look, healthOf: () => 100 });

/** The vertices the pictures alone lay now (the bits put by). */
function pictures(impacts: Impacts): number[] {
  const kept = impacts.bits.flying.splice(0);
  const out: number[] = [];
  impacts.lay(out, EYE);
  impacts.bits.flying.push(...kept);
  return out;
}
const colours = (out: readonly number[]) => {
  const found = new Set<string>();
  for (let start = 0; start < out.length; start += 7) found.add(out.slice(start + 3, start + 6).join(','));
  return found;
};

test('a stroke travels across its striker as its arc does; a thrust and no stroke draw no slash', () => {
  // Facing north, the striker's right is east: a left sweep runs west and a little down, a chop down.
  const left = strokeTravel(3, [0, 2, 0], [0, 0, 0]);
  assert.deepEqual(
    left?.map((part) => Math.round(part * 10) / 10 + 0),
    [-1, 0, -0.2],
  );
  assert.equal(strokeTravel(1, [0, 2, 0], [0, 0, 0])?.[2], -1);
  assert.equal(strokeTravel(6, [0, 2, 0], [0, 0, 0]), null);
  assert.equal(strokeTravel(0, [0, 2, 0], [0, 0, 0]), null);
});

test("a blow's pictures size by the share of health it took, a kill's largest", () => {
  assert.equal(hitScale(5, 100, false), HIT.small);
  assert.equal(hitScale(20, 100, false), 1);
  assert.equal(hitScale(40, 100, false), HIT.large);
  assert.equal(hitScale(5, 100, true), HIT.kill);
  const contact = contactOf([0, 0, 0], [0, 2, 0]);
  assert.ok(contact[1] > 0.3 && contact[2] > 1, "at the chest's front, toward the striker");
});

test('a plain blow that lands throws steel sparks and shows a star, a ring and a broken ring, then is gone', () => {
  const impacts = new Impacts(() => 0.5);
  impacts.update([event(EVENT.hit)], 0, told());
  assert.equal(impacts.bits.flying.length, 6, 'blows throw sparks');
  assert.ok(impacts.bits.flying.every((bit) => bit.ramp === STEEL));
  const shown = [0, 1, 2, 3].map((frame) => {
    if (frame > 0) impacts.update([], FRAME, told());
    return pictures(impacts).length;
  });
  assert.ok(
    shown.slice(0, 3).every((count) => count > 0),
    'three frames',
  );
  assert.equal(shown[3], 0, 'then out of the way');
});

test('every picture is whole cells of one stop, fully opaque', () => {
  const impacts = new Impacts(() => 0.5);
  impacts.update([event(EVENT.hit, { crit: true }), event(EVENT.parried, { amount: 0 })], 0, told(2));
  const out: number[] = [];
  impacts.lay(out, EYE);
  for (let start = 6; start < out.length; start += 7) assert.equal(out[start], 1);
});

test('a crit lays a gold star over the blow for three frames and throws gold sparks', () => {
  const plain = new Impacts(() => 0.5);
  const crit = new Impacts(() => 0.5);
  plain.update([event(EVENT.hit)], 0, told());
  crit.update([event(EVENT.hit, { crit: true })], 0, told());
  assert.equal(crit.bits.flying.length - plain.bits.flying.length, CRIT.sparks);
  const gold = GOLD[3].join(',');
  assert.ok(colours(pictures(crit)).has(gold) && !colours(pictures(plain)).has(gold));
  for (let frame = 0; frame < CRIT.frames; frame++) crit.update([], FRAME, told());
  assert.ok(!colours(pictures(crit)).has(gold), 'gone after three frames');
});

test('an elemental blow bursts half again as many motes in its element and shows its own shape', () => {
  for (const look of [1, 2, 3] as const) {
    const impacts = new Impacts(() => 0.5);
    impacts.update([event(EVENT.hit)], 0, told(look));
    assert.ok(impacts.bits.flying.length >= 15, `element ${look}`);
    impacts.update([], 2 * FRAME, told(look));
    assert.ok(pictures(impacts).length > 0, 'its burst shows after the star');
  }
});

test('steel on steel: a parry in gold with the most sparks, a block, a guard broken; a dodge shows nothing', () => {
  const thrown = (kind: number) => {
    const impacts = new Impacts(() => 0.5);
    impacts.update([event(kind, { amount: 0 })], 0, told());
    return impacts;
  };
  assert.equal(thrown(EVENT.parried).bits.flying.length, 14);
  assert.ok(thrown(EVENT.parried).bits.flying.every((bit) => bit.ramp === GOLD));
  assert.equal(thrown(EVENT.blocked).bits.flying.length, 8);
  assert.equal(thrown(EVENT.guardBroken).bits.flying.length, 10);
  assert.equal(pictures(thrown(EVENT.dodged)).length, 0);
  const broken = thrown(EVENT.guardBroken);
  broken.update([], 20 * FRAME, told());
  assert.ok(pictures(broken).length > 0, 'its cracked shield still stands');
});

test("a shot's and a spell's landing throw only their element's motes: their own looks are drawn elsewhere", () => {
  const impacts = new Impacts(() => 0.5);
  impacts.update([event(EVENT.hit, { how: HOW.shot }), event(EVENT.hit, { how: HOW.spell })], 0, told(1));
  assert.equal(pictures(impacts).length, 0);
  assert.equal(impacts.bits.flying.length, 36);
});

test('a blow burns in its caster’s Art for a spell, the page’s glow for the player’s own, else what it carried', () => {
  const own = { player: STRIKER, own: 2 as const, spellLook: () => 1 as const };
  assert.equal(blowLook(event(EVENT.hit, { how: HOW.spell, element: 3 }), own), 3);
  assert.equal(blowLook(event(EVENT.hit, { how: HOW.spell }), own), 1);
  assert.equal(blowLook(event(EVENT.hit, { element: 3 }), own), 2);
  assert.equal(blowLook(event(EVENT.hit, { element: 3 }), { ...own, own: 0 }), 3);
  assert.equal(blowLook(event(EVENT.hit, { striker: 7, element: 9 }), own), 0, 'no element by that number');
});

test('through the striker’s own eyes a blow’s pictures are smaller; one landing on the eyes’ own body is not drawn', () => {
  const across = (eye: readonly [number, number, number]) => {
    const impacts = new Impacts(() => 0.5);
    impacts.update([event(EVENT.hit)], 0, told());
    impacts.bits.flying.length = 0;
    const out: number[] = [];
    impacts.lay(out, eye);
    const easts = out.filter((unused, index) => index % 7 === 0);
    return easts.length ? Math.max(...easts) - Math.min(...easts) : 0;
  };
  const behind = across([0, 4, 1.6]);
  const ownEyes = across([0, 2, 1.6]);
  assert.ok(ownEyes > 0 && ownEyes < behind * 0.6, `${ownEyes} against ${behind}`);
  assert.equal(across([0, 0.2, 1.6]), 0, 'the struck one’s own eyes');
});
