import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shipMesh, VERTEX_FLOATS } from './meshes.ts';

/** Every vertex of a mesh: its place, its normal and its paint. */
function vertices(mesh: Float32Array) {
  const found = [];
  for (let start = 0; start < mesh.length; start += VERTEX_FLOATS) {
    const value = (offset: number) => mesh[start + offset] ?? Number.NaN;
    found.push({
      place: [value(0), value(1), value(2)],
      normal: [value(3), value(4), value(5)],
      paint: value(9),
    });
  }
  return found;
}

test('the ship is whole triangles about 30 m long and 7 m in the beam, its keel under the water', () => {
  const ship = vertices(shipMesh());
  assert.equal(ship.length % 3, 0);
  const span = (axis: number) => {
    const values = ship.map((vertex) => vertex.place[axis] ?? 0);
    return [Math.min(...values), Math.max(...values)];
  };
  const [stern, bow] = span(1);
  const [port, starboard] = span(0);
  const [keel, masthead] = span(2);
  assert.ok(bow - stern > 28 && bow - stern < 40, `${stern} to ${bow}`);
  assert.ok(starboard - port > 6 && starboard - port < 12, `${port} to ${starboard}`);
  assert.ok(keel < -1 && masthead > 17, `${keel} to ${masthead}`);
});

test("every face has a unit normal, and only the band and pennant take the owner's paint", () => {
  const ship = vertices(shipMesh());
  for (const { normal } of ship) assert.ok(Math.abs(Math.hypot(...normal) - 1) < 1e-5);
  const painted = ship.filter((vertex) => vertex.paint === 1).length;
  assert.ok(painted > 0 && painted < ship.length / 3, `${painted} of ${ship.length}`);
});
