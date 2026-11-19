import assert from 'node:assert/strict';
import { test } from 'node:test';
import { meshBuilder } from '../models/model.ts';
import { bedOf, fixtureMesh } from './dungeonFixtures.ts';
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

test('each fixture is drawn in its own colours: iron and fire, wax, crystal, lantern glass, embers, fungus', () => {
  const has = (kind: number, picture: readonly [number, number]) => drawnOf(kind).pictures.has(picture.join('.'));
  assert.ok(
    has(FIXTURE.brazier, IRON) && has(FIXTURE.brazier, [COLOUR.ember, 0]) && has(FIXTURE.brazier, [COLOUR.glow, 0]),
  );
  assert.ok(has(FIXTURE.candles, [COLOUR.wax, 0]) && has(FIXTURE.candles, [COLOUR.glow, 0]));
  assert.ok(has(FIXTURE.crystals, [COLOUR.crystal, 0]));
  assert.ok(has(FIXTURE.lantern, IRON) && has(FIXTURE.lantern, [COLOUR.lanternGlass, 0]));
  assert.ok(has(FIXTURE.hearth, [COLOUR.ember, 0]) && has(FIXTURE.hearth, [COLOUR.glow, 0]));
  assert.ok(has(FIXTURE.fungus, [COLOUR.fungus, 0]) && has(FIXTURE.fungus, [COLOUR.wax, 0]));
});

test('crystals and fungus grow wholly inside their solid, from the floor to under its top, leaning out from the wall', () => {
  const layout = { cell: 3.2, boxes: [[0.1, 1.3, 0.5, 1.9, 0.9] as const] };
  const bed = bedOf(layout, [0.3, 1.6, 0.45]);
  assert.deepEqual(bed?.out, [1, 0], 'its wall is to the west, so out is east');
  for (const kind of [FIXTURE.crystals, FIXTURE.fungus]) {
    const mesh = meshBuilder();
    fixtureMesh(mesh, [0.3, 1.6, 0.45, kind], bed);
    const { positions } = mesh.model();
    let east = 0;
    for (let vertex = 0; vertex < positions.length / 3; vertex++) {
      const [x, y, z] = [positions[vertex * 3] ?? 0, positions[vertex * 3 + 1] ?? 0, positions[vertex * 3 + 2] ?? 0];
      // A model keeps its points in single precision.
      assert.ok(x >= 0.1 - 1e-5 && x <= 0.5 + 1e-5 && y >= 1.3 - 1e-5 && y <= 1.9 + 1e-5, `${x}, ${y} in its box`);
      assert.ok(z >= -1e-5 && z <= 0.9 + 1e-5, `${z} m up`);
      east += x - 0.3;
    }
    if (kind === FIXTURE.crystals) assert.ok(east > 0, 'the crystals lean out from the wall');
  }
  assert.equal(bedOf(layout, [2, 2]), null, 'a light with no solid has no bed');
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
