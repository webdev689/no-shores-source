import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FightEvent } from '../network/messages.ts';
import { EVENT } from './cues.ts';
import type { FighterView } from '../rules/fighters.ts';
import { HitStops, heldBack } from './hitStop.ts';

const event = (kind: number, amount = 10): FightEvent => ({
  tick: 0n,
  kind,
  how: 0,
  striker: 1,
  defender: 2,
  amount,
  stroke: 3,
});
const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

test('a blow that harms holds its striker and the one struck still, then their drawing catches up', () => {
  const stops = new HitStops();
  stops.struck([event(EVENT.hit)]);
  stops.update(0.05);
  near(stops.lagOf(1), 0.05);
  near(stops.lagOf(2), 0.05);
  assert.equal(stops.shownSeconds(1, 0.05), 0, 'held still');
  stops.update(0.05);
  near(stops.lagOf(1), 0.075 - 0.025 * 0.6);
  stops.update(0.05);
  assert.ok(stops.shownSeconds(1, 0.05) > 0.05, 'catching up, faster than the rules');
  for (let frame = 0; frame < 20; frame += 1) stops.update(0.05);
  assert.equal(stops.lagOf(1), 0, 'caught up');
  assert.equal(stops.shownSeconds(1, 0.05), 0.05);
});

test('a kill holds longest, a block least; a blow that harms nothing and a dodge hold nothing', () => {
  const held = (kind: number, amount = 10) => {
    const stops = new HitStops();
    stops.struck([event(kind, amount)]);
    stops.update(1);
    stops.update(0);
    return stops;
  };
  const after = (kind: number) => {
    const stops = new HitStops();
    stops.struck([event(kind)]);
    stops.update(0.12);
    return stops.lagOf(2);
  };
  assert.ok(after(EVENT.killed) > after(EVENT.hit) && after(EVENT.hit) > after(EVENT.blocked));
  assert.equal(held(EVENT.hit, 0).lagOf(2), 0);
  const dodged = new HitStops();
  dodged.struck([event(EVENT.dodged)]);
  dodged.update(0.05);
  assert.equal(dodged.lagOf(2), 0);
  const none = new HitStops();
  none.struck([event(EVENT.killed)], 0);
  none.update(0.05);
  assert.equal(none.lagOf(2), 0, 'switched off');
});

test('the one struck shudders while held, its striker does not', () => {
  const stops = new HitStops();
  stops.struck([event(EVENT.killed)]);
  let shook = 0;
  for (let frame = 0; frame < 8; frame += 1) {
    stops.update(1 / 120);
    shook = Math.max(shook, Math.abs(stops.shudderOf(2)));
    assert.equal(stops.shudderOf(1), 0);
  }
  assert.ok(shook > 0.01 && shook <= 0.035, `${shook}`);
  stops.update(1);
  assert.equal(stops.shudderOf(2), 0, 'still once the hold is over');
});

test("a fighter held back shows its action's clock that much earlier, never before it began", () => {
  const view = {
    aim: 0,
    action: { kind: 'attack', stroke: 3, elapsed: 30, strike: 24, end: 60, swing: 'plain', leftHand: false },
  } as unknown as FighterView;
  const held = heldBack(view, 6);
  assert.equal(held.action.kind === 'attack' && held.action.elapsed, 24);
  assert.equal(heldBack(view, 40).action.kind === 'attack' && heldBack(view, 40).action.elapsed === 0, true);
  const flinch = { action: { kind: 'flinch', left: 5 } } as unknown as FighterView;
  assert.equal(heldBack(flinch, 3).action.kind === 'flinch' && heldBack(flinch, 3).action.left, 8);
  assert.equal(heldBack(view, 0), view);
});
