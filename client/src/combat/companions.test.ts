import assert from 'node:assert/strict';
import { test } from 'node:test';
import crew from '../../../content/gear/crew.json' with { type: 'json' };
import { officerName } from './companions.ts';

test('a companion is named by their names places in the crew list, and plainly past its end', () => {
  assert.equal(officerName({ given: 0, family: 1 }), `${crew.given[0]} ${crew.family[1]}`);
  assert.equal(officerName({ given: 250, family: 0 }), 'Officer');
});
