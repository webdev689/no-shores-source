import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ASKS } from '../../network/gearMessages.ts';
import { rowsOf } from './npcWares.ts';
import { item, state } from '../../network/gearForTests.ts';

test('Shape’s pieces made at level 20 rest dim “From level 20” below it, and are asked for from it', () => {
  const wares = [item({ id: 0, rarity: 3, price: 7, level: 20 })];
  const [low] = rowsOf('shape', state({ level: 19, shapes: 10, shape: { place: 2, wares } }));
  assert.deepEqual(
    [low?.wares[0]?.note, low?.wares[0]?.dim, low?.wares[0]?.ask, low?.wares[0]?.short],
    ['From level 20', true, null, false],
  );
  const [ready] = rowsOf('shape', state({ level: 20, shapes: 10, shape: { place: 2, wares } }));
  assert.deepEqual(
    [ready?.wares[0]?.dim, ready?.wares[0]?.ask],
    [undefined, { kind: ASKS.buyFromShape, node: 0, item: -1 }],
  );
});
