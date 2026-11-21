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
