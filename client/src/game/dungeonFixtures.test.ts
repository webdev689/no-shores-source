import assert from 'node:assert/strict';
import { test } from 'node:test';
import { meshBuilder } from '../models/model.ts';
import { fixtureMesh } from './dungeonFixtures.ts';
import { FIXTURE } from './dungeonLayout.ts';
import { COLOUR, IRON } from './dungeonMesh.ts';

/** The pictures a fixture is drawn in, and its height from its lowest point to its highest. */
function drawnOf(kind: number, where: readonly [number, number, number] = [4, 6, 1.1]) {
  const mesh = meshBuilder();
  fixtureMesh(mesh, [...where, kind]);
  const model = mesh.model();
  const heights = Array.from(
    { length: model.positions.length / 3 },
    (empty, vertex) => model.positions[vertex * 3 + 2] ?? 0,
  );
  return {
    pictures: new Set(model.parts.map((part) => `${part.archive}.${part.record}`)),
    low: Math.min(...heights),
    high: Math.max(...heights),
  };
}

test('each fixture is drawn in its own colours: iron and fire, wax, crystal, lantern glass, embers', () => {
  const has = (kind: number, picture: readonly [number, number]) => drawnOf(kind).pictures.has(picture.join('.'));
  assert.ok(
    has(FIXTURE.brazier, IRON) && has(FIXTURE.brazier, [COLOUR.ember, 0]) && has(FIXTURE.brazier, [COLOUR.glow, 0]),
  );
  assert.ok(has(FIXTURE.candles, [COLOUR.wax, 0]) && has(FIXTURE.candles, [COLOUR.glow, 0]));
  assert.ok(has(FIXTURE.crystals, [COLOUR.crystal, 0]));
  assert.ok(has(FIXTURE.lantern, IRON) && has(FIXTURE.lantern, [COLOUR.lanternGlass, 0]));
  assert.ok(has(FIXTURE.hearth, [COLOUR.ember, 0]) && has(FIXTURE.hearth, [COLOUR.glow, 0]));
});

test('a brazier and crystals stand on the floor; a lantern hangs round where its light is', () => {
  assert.ok(Math.abs(drawnOf(FIXTURE.brazier).low) < 1e-6);
  assert.ok(Math.abs(drawnOf(FIXTURE.crystals, [4, 6, 0.6]).low) < 1e-6);
  const lantern = drawnOf(FIXTURE.lantern, [4, 6, 2.4]);
  assert.ok(lantern.low > 2 && lantern.high < 3.1);
});

test('two fixtures of a kind standing apart are shaped apart, and one place always the same', () => {
  const shape = (where: readonly [number, number, number]) => {
    const mesh = meshBuilder();
    fixtureMesh(mesh, [...where, FIXTURE.crystals]);
    return Array.from(
      mesh.model().positions,
      (value, index) => value - (index % 3 === 0 ? where[0] : index % 3 === 1 ? where[1] : 0),
    );
  };
  assert.deepEqual(shape([4, 6, 0.6]), shape([4, 6, 0.6]));
  assert.notDeepEqual(shape([4, 6, 0.6]), shape([11, 2, 0.6]));
});
