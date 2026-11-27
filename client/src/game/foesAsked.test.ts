import assert from 'node:assert/strict';
import { test } from 'node:test';
import { foesAsked } from './foesAsked.ts';

test('the address asks for foes by type, each with its rank or its first', () => {
  assert.deepEqual(foesAsked('?foes=2,4:3,12'), [
    { type: 2, rank: 0 },
    { type: 4, rank: 3 },
    { type: 12, rank: 0 },
  ]);
});

test('an address with no foes, or parts that are not types, asks for none of them', () => {
  assert.deepEqual(foesAsked(''), []);
  assert.deepEqual(foesAsked('?room=playtest'), []);
  assert.deepEqual(foesAsked('?foes=0,x,2:y,300,3:1:1,-4,1.5'), []);
  assert.deepEqual(foesAsked('?foes=,7'), [{ type: 7, rank: 0 }]);
});
