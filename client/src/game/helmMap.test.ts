import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LandSheet } from '../heldmap/landSheet.ts';
import { HelmMap, type HelmMapContext } from './helmMap.ts';
import type { Sea } from './sea.ts';

/** A helm's map whose map is never made: only its wanting and its keys are asked of it. */
const helm = () => {
  const sea = { toHelm: () => true, view: { helmView: true, fromHelm: () => undefined } } as unknown as Sea;
  const context = { sea: () => sea } as unknown as HelmMapContext;
  return { map: new HelmMap(context), sea };
};
const SHEET = { origin: [0, 0] } as unknown as LandSheet;

test('raising the land map lets go of a way down to a helm left behind at sea, so lowering it frees the player', () => {
  const { map, sea } = helm();
  map.open(sea);
  map.openLand(SHEET);
  assert.ok(map.looking);
  assert.ok(map.key('escape'));
  assert.ok(!map.looking && !map.busy, 'nothing is left wanted');
});

test('while the land map is wanted, N or Escape turns back and every other key waits', () => {
  const { map } = helm();
  map.openLand(SHEET);
  assert.ok(map.key('e'), 'E does not reach a gate or a use');
  assert.ok(map.looking);
  assert.ok(map.key('n'));
  assert.ok(!map.looking);
  assert.ok(!map.key('e'), "once it is let go, keys are the player's own again");
});

test("the land's map up as a room's gate shuts on the player is put away at sea, not drawn over it", () => {
  const { map, sea } = helm();
  map.openLand(SHEET);
  const raised = { shown: true, drop: () => (raised.shown = false), frame: () => assert.fail('drawn at sea') };
  Object.assign(map, { map: raised });
  const at = { free: true, viewport: { width: 1, height: 1 }, dpr: 1, hands: null };
  const here = { ...sea, view: { atHelm: false }, position: [0, 0] } as unknown as Sea;
  map.frame(here, 1 / 60, at as unknown as Parameters<HelmMap['frame']>[2], {} as Parameters<HelmMap['frame']>[3]);
  assert.ok(!raised.shown && !map.busy, 'and the player is free');
});
