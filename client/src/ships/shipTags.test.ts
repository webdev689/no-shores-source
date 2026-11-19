import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import ships from '../../../content/ships/ships.json' with { type: 'json' };
import { SHIP_PARTS } from '../textures/shipPictures.ts';
import { HULL_NAMES, hullSails, hullWaterline } from './hulls.ts';
import { SAIL_COLUMNS, SAIL_ROWS, SailRig } from './sails.ts';
import { readShipMesh, type ShipMesh, VERTEX_BYTES } from './shipMesh.ts';
import { braced, tagShip } from './shipTags.ts';

/** A published hull's mesh, fetched from R2 once and kept by its content's name in the machine's temporary folder. */
async function published(hull: number): Promise<ShipMesh> {
  const key = (ships.ships as Record<string, { mesh: string }>)[HULL_NAMES[hull] ?? 'sloop']?.mesh ?? '';
  const kept = join(tmpdir(), 'overlook-ships', key.replaceAll('/', '-'));
  const bytes = await readFile(kept).catch(async () => {
    const answer = await fetch(ships.base + key);
    assert.ok(answer.ok, `the mesh ${key} came (${answer.status})`);
    const fetched = Buffer.from(await answer.arrayBuffer());
    await mkdir(join(tmpdir(), 'overlook-ships'), { recursive: true });
    await writeFile(kept, fetched);
    return fetched;
  });
  return readShipMesh(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
}

type Point = [number, number, number];
/** Each vertex of a tagged mesh: where it is, which way its normal points across her, its part, shell and yard. */
function verticesOf(vertices: ArrayBuffer, count: number) {
  const view = new DataView(vertices);
  return Array.from({ length: count }, (unused, vertex) => {
    const byte = vertex * VERTEX_BYTES;
    const point = [0, 4, 8].map((offset) => view.getFloat32(byte + offset, true)) as Point;
    return {
      point,
      outward: view.getInt8(byte + 13) * Math.sign(point[1]) > 0,
      part: view.getUint8(byte + 24),
      shell: view.getUint8(byte + 25) === 1,
      yard: view.getUint8(byte + 26),
    };
  });
}
const HULL = SHIP_PARTS.indexOf('hull');

test("the Sloop's after cabin keeps its timber, and every hull's sides amidships are her shell", async () => {
  for (const [hull] of HULL_NAMES.entries()) {
    const mesh = await published(hull);
    const tagged = verticesOf(tagShip(mesh, hullSails(hull)).vertices, mesh.vertexCount).filter(
      (vertex) => vertex.part === HULL,
    );
    if (hull === 0) {
      const cabin = tagged.filter(({ point: [x, y, z] }) => x > -8.9 && x < -5.4 && Math.abs(y) <= 1.35 && z > 1.8);
      assert.ok(cabin.length > 100, 'the cabin is found');
      assert.equal(cabin.filter((vertex) => vertex.shell).length, 0, "the Sloop's cabin is not her shell");
    }
    // Amidships just over her waterline: the outward faces at her full breadth there.
    const strip = tagged.filter(({ point: [x, , z] }) => Math.abs(x) < 3 && z > 0.3 && z < 0.6);
    const broadest = Math.max(...strip.map(({ point }) => Math.abs(point[1])));
    const sides = strip.filter((vertex) => vertex.outward && Math.abs(vertex.point[1]) > broadest - 0.1);
    assert.ok(sides.length > 0, `${HULL_NAMES[hull]}: her sides amidships`);
    assert.ok(
      sides.every((vertex) => vertex.shell),
      `${HULL_NAMES[hull]}: painted amidships`,
    );
    // Nothing on her deck: no shell over her waterline stands near her centreline, between her stem and stern.
    const middle = hullWaterline(hull).lengthM * 0.35;
    const inboard = tagged.filter(
      ({ point: [x, y, z], shell }) => shell && z > 1 && Math.abs(y) < 0.5 && Math.abs(x) < middle,
    );
    assert.equal(inboard.length, 0, `${HULL_NAMES[hull]}: no fitting on her deck is painted`);
  }
});

test("braced 45 degrees, a square sail's head stays on its turned yard", async () => {
  for (const hull of [2, 3]) {
    const sails = hullSails(hull);
    const mesh = await published(hull);
    const tags = tagShip(mesh, sails);
    const yards = verticesOf(tags.vertices, mesh.vertexCount).filter((vertex) => vertex.yard > 0);
    const rig = new SailRig(sails);
    for (let tick = 0; tick < 600; tick++) rig.step(1 / 60, { offDeg: 90, set: true }, tick / 60);
    const canvas = rig.canvas(tags.pivots);
    tags.yards.forEach((yard, index) => {
      if (sails[yard.sail]?.kind !== 'square') return;
      assert.equal(rig.sails[yard.sail]?.trimDeg, 45);
      const own = yards.filter((vertex) => vertex.yard === index + 1);
      const sailed = sails[yard.sail];
      if (!sailed || sailed.kind !== 'square' || tags.pivots[yard.sail] !== yard.pivot) return;
      for (const [corner, column] of [
        [sailed.head_port, 0],
        [sailed.head_starboard, SAIL_COLUMNS - 1],
      ] as const) {
        const head = (SAIL_ROWS - 1) * SAIL_COLUMNS + column;
        const turnedCorner = [0, 1, 2].map((axis) => canvas[yard.sail]?.[head * 3 + axis] ?? 0);
        const nearest = (points: readonly (readonly number[])[], from: readonly number[]) =>
          Math.min(
            ...points.map((point) => Math.hypot(...[0, 1, 2].map((axis) => (point[axis] ?? 0) - (from[axis] ?? 0)))),
          );
        const square = nearest(
          own.map((vertex) => vertex.point),
          corner,
        );
        const turned = nearest(
          own.map((vertex) => braced(vertex.point, yard.pivot, 45)),
          turnedCorner,
        );
        assert.ok(square < 0.6, `${HULL_NAMES[hull]} sail ${yard.sail}: its head on its yard (${square} m)`);
        assert.ok(Math.abs(turned - square) < 0.1, `${HULL_NAMES[hull]} sail ${yard.sail}: ${turned} m braced`);
      }
    });
    // The Frigate's crossjack, bare, turns with her mizzen's lowest sail.
    if (hull === 3) assert.equal(tags.yards.length, 9, 'eight yards with sails and one bare');
  }
});
