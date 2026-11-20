import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hash32, type RockShape, rockMesh, rockParts } from './rockMesh.ts';

const ROOF: RockShape = { shape: 'caveroof', seed: 11 };
const OVERHANG: RockShape = { shape: 'overhang', seed: 12 };
const ROCKS: [RockShape, [number, number, number]][] = [
  [ROOF, [14, 12, 2.5]],
  [OVERHANG, [10, 7, 6]],
  [{ shape: 'rockarch', seed: 13 }, [12, 5, 10]],
  [{ shape: 'tunnelmouth', seed: 14 }, [12, 8, 9]],
];

/** The land's `fingerprint`: FNV-1a (64-bit) over each number's bits, little end first. */
function fingerprint(numbers: readonly number[]): bigint {
  const bytes = new DataView(new ArrayBuffer(8));
  let hash = 0xcbf29ce484222325n;
  for (const number of numbers) {
    bytes.setFloat64(0, number, true);
    for (let byte = 0; byte < 8; byte++)
      hash = ((hash ^ BigInt(bytes.getUint8(byte))) * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash;
}

test('the hash is the land crate’s, a negative number by its low 32 bits', () => {
  // Pinned beside the fingerprints in crates/city/src/rock_tests.rs.
  assert.equal(hash32([1, -2, 3]), 171176911);
  assert.equal(hash32([-1]), hash32([0xffffffff]));
});

test('the browser draws every rock vertex the city crate makes', () => {
  // The same fingerprints are pinned in crates/city/src/rock_tests.rs.
  assert.equal(fingerprint(rockMesh(ROOF, [14, 12, 2.5]).positions.flat()), 4058035614080499008n);
  assert.equal(fingerprint(rockMesh(OVERHANG, [10, 7, 6]).positions.flat()), 8031344236466977069n);
  assert.equal(fingerprint(rockMesh(ROCKS[2][0], ROCKS[2][1]).positions.flat()), 7852516787465864803n);
  assert.equal(fingerprint(rockMesh(ROCKS[3][0], ROCKS[3][1]).positions.flat()), 12196208482582463808n);
  assert.equal(rockMesh(ROOF, [0, 4, 4]).positions.length, 0, 'no size, no surface');
  assert.equal(rockMesh(ROOF, [NaN, 4, 4]).positions.length, 0);
});

test('each rock is closed, wound out, and drawn inside its parts', () => {
  for (const [shape, size] of ROCKS) {
    const { positions, triangles } = rockMesh(shape, size);
    const edges = new Map<string, number>();
    for (const [first, second, third] of triangles)
      for (const edge of [`${first}-${second}`, `${second}-${third}`, `${third}-${first}`])
        edges.set(edge, (edges.get(edge) ?? 0) + 1);
    for (const [edge, count] of edges) {
      const [from, to] = edge.split('-');
      assert.equal(count, 1, `${shape.shape}: ${edge} walked ${count} times`);
      assert.equal(edges.get(`${to}-${from}`), 1, `${shape.shape}: ${edge} has no other side`);
    }
    const parts = rockParts(shape, size);
    for (const vertex of positions)
      assert.ok(
        parts.some((part) =>
          [0, 1, 2].every((axis) => vertex[axis] >= part[axis] - 1e-9 && vertex[axis] <= part[axis + 3] + 1e-9),
        ),
        `${shape.shape}: ${vertex.join(', ')} outside its parts`,
      );
  }
});
