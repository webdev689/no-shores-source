import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Body } from '../rules/movementRules.ts';
import { BOOST_S, RECHARGE_S, rideAbilities } from './rideBoost.ts';
import { ShipAbilityBar } from './shipAbilityBar.ts';

const body = (boosting: number, recharging: number) => ({ boosting, recharging }) as unknown as Body;

test("a rider's boost rings lit while ready, draining while it runs and swept while it recharges", () => {
  const [ready] = rideAbilities(body(0, 0), 'Space');
  assert.deepEqual([ready?.state, ready?.charge, ready?.said, ready?.icon], ['ready', 1, 'ready', 'horseshoe']);
  const [running] = rideAbilities(body(BOOST_S / 2, RECHARGE_S), 'Space');
  assert.deepEqual([running?.state, running?.running, running?.said], ['active', 0.5, 'boosting']);
  const [charging] = rideAbilities(body(0, RECHARGE_S / 4), 'Space');
  assert.deepEqual([charging?.state, charging?.charge, charging?.said], ['charging', 0.75, '3 s to recharge']);
  const bar = new ShipAbilityBar(null, 'Your Horse');
  bar.update(rideAbilities(body(0, 0), 'Space'));
  assert.deepEqual(bar.words(), ['Boost (Space), ready']);
  assert.equal(bar.node(false)?.label, 'Your Horse');
});
