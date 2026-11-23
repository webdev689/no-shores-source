// The forge's drawn weapon and armour layers, as the room reads them (`content/forge/drawn.json`), held to the fitted
// bodies the page dresses: a new render that the table does not name would be refused by the room without a word.
// `UPDATE_DRAWN=1` writes the table afresh from the fitted bodies.

import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { test } from 'node:test';
import drawn from '../../../content/forge/drawn.json' with { type: 'json' };
import female from '../../../tools/forge/tools/sprite-forge/fitted/female.json' with { type: 'json' };
import male from '../../../tools/forge/tools/sprite-forge/fitted/male.json' with { type: 'json' };
import { wardrobeOf } from './dressing.ts';

/** Every layer of a fitted body, as the page loads a body's layers. */
function layersOfBody(fitted: object): Record<string, string[]> {
  const found: Record<string, string[]> = {};
  for (const [move, heads] of Object.entries(fitted))
    for (const names of Object.values(heads as Record<string, string[]>))
      for (const name of names) (found[name] ??= []).includes(move) || found[name].push(move);
  return found;
}

/** A body's armour sets by piece and the layers each hand may hold, in the wardrobe's order. */
function tableOf(body: string, fitted: object) {
  const { sets, right, left } = wardrobeOf(body, layersOfBody(fitted));
  return { sets, right, left };
}

test("the room's table of drawn layers is the forge's, for each body", () => {
  const table = { male: tableOf('male', male), female: tableOf('female', female) };
  if (process.env['UPDATE_DRAWN'])
    writeFileSync(new URL('../../../content/forge/drawn.json', import.meta.url), `${JSON.stringify(table)}\n`);
  assert.deepEqual(
    JSON.parse(JSON.stringify(table)),
    drawn,
    'content/forge/drawn.json is stale: rerun this test with UPDATE_DRAWN=1',
  );
});
