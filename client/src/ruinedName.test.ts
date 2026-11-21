import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ruinedName } from './ruinedName.ts';

test('a ruined city is named as the city crate names it', () => {
  assert.equal(ruinedName('Mistfall'), 'Ruins of Mistfall');
});
