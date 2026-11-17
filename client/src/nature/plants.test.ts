import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BIOMES, castOf } from './cast.ts';
import { type Mesh, VERTEX_FLOATS } from './shapes.ts';

const LAYOUT_BIOMES = [
  'temperate-coast',
  'highland',
  'woodland',
  'desert',
  'savanna',
  'rainforest',
  'steppe',
  'swamp',
  'tundra',
];

const triangles = (mesh: Mesh) => mesh.vertices.length / (3 * VERTEX_FLOATS);

const corner = (mesh: Mesh, vertex: number) => {
  const offset = vertex * VERTEX_FLOATS;
  return [mesh.vertices[offset] ?? 0, mesh.vertices[offset + 1] ?? 0, mesh.vertices[offset + 2] ?? 0] as const;
};

/** Each directed edge of a closed mesh, keyed by its ends' positions, must meet its reverse exactly as often. */
function openEdges(mesh: Mesh): number {
  const key = (vertex: number) =>
    corner(mesh, vertex)
      .map((value) => value.toFixed(4))
      .join(',');
  const edges = new Map<string, number>();
  for (let first = 0; first < mesh.vertices.length / VERTEX_FLOATS; first += 3) {
    const keys = [key(first), key(first + 1), key(first + 2)];
    for (let side = 0; side < 3; side++) {
      const edge = `${keys[side]}>${keys[(side + 1) % 3]}`;
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }
  let unmatched = 0;
  for (const [edge, count] of edges) {
    const [from, to] = edge.split('>');
    if ((edges.get(`${to}>${from}`) ?? 0) !== count) unmatched += 1;
  }
  return unmatched;
}

/** The volume a closed mesh holds: positive when every face is wound outward. */
function volume(mesh: Mesh): number {
  let sum = 0;
  for (let first = 0; first < mesh.vertices.length / VERTEX_FLOATS; first += 3) {
    const [a, b, third] = [corner(mesh, first), corner(mesh, first + 1), corner(mesh, first + 2)];
    sum +=
      (a[0] * (b[1] * third[2] - b[2] * third[1]) -
        a[1] * (b[0] * third[2] - b[2] * third[0]) +
        a[2] * (b[0] * third[1] - b[1] * third[0])) /
      6;
  }
  return sum;
}

const bounds = (mesh: Mesh) => {
  let [width, height] = [0, 0];
  for (let vertex = 0; vertex < mesh.vertices.length / VERTEX_FLOATS; vertex++) {
    const [x, y, z] = corner(mesh, vertex);
    width = Math.max(width, Math.abs(x), Math.abs(y));
    height = Math.max(height, z);
  }
  return { width: width * 2, height };
};

const everyMesh = () =>
  BIOMES.flatMap((biome) =>
    castOf(biome).kinds.flatMap((kind) =>
      kind.plants.flatMap((plant, form) => [
        { label: `${biome} ${kind.name} ${form} near`, mesh: plant.near, kind },
        ...(plant.far ? [{ label: `${biome} ${kind.name} ${form} far`, mesh: plant.far, kind }] : []),
      ]),
    ),
  );

test('every biome of the layout has a cast of three to six kinds, each named once', () => {
  assert.deepEqual([...BIOMES].sort(), [...LAYOUT_BIOMES].sort());
  for (const biome of BIOMES) {
    const names = castOf(biome).kinds.map((kind) => kind.name);
    assert.ok(names.length >= 3 && names.length <= 6, `${biome}: ${names.length} kinds`);
    assert.equal(new Set(names).size, names.length, biome);
  }
  assert.equal(castOf('ashland').kinds.length, 0, 'an unknown biome grows nothing');
});

test('every mesh is whole triangles with unit normals and colours, leaf and sway in range', () => {
  for (const { label, mesh } of everyMesh()) {
    assert.ok(mesh.vertices.length > 0 && mesh.vertices.length % (3 * VERTEX_FLOATS) === 0, label);
    for (let offset = 0; offset < mesh.vertices.length; offset += VERTEX_FLOATS) {
      const normal = Math.hypot(
        mesh.vertices[offset + 3] ?? 0,
        mesh.vertices[offset + 4] ?? 0,
        mesh.vertices[offset + 5] ?? 0,
      );
      assert.ok(Math.abs(normal - 1) < 1e-3, `${label}: a normal ${normal} long`);
      for (let channel = 6; channel < VERTEX_FLOATS; channel++) {
        const value = mesh.vertices[offset + channel] ?? -1;
        assert.ok(value >= 0 && value <= 1, `${label}: channel ${channel} is ${value}`);
      }
    }
  }
});

test('closed meshes are watertight and wound outward, so their back faces can be culled', () => {
  let closed = 0;
  for (const { label, mesh } of everyMesh()) {
    if (!mesh.closed) continue;
    closed += 1;
    assert.equal(openEdges(mesh), 0, `${label} has open edges`);
    assert.ok(volume(mesh) > 0, `${label} is wound inward`);
  }
  assert.ok(closed > 40, `most meshes are closed: ${closed}`);
});

test('near trees keep to 80 to 300 triangles, low plants fewer, and every far mesh is at most half its near one', () => {
  for (const { label, mesh, kind } of everyMesh()) {
    const count = triangles(mesh);
    if (label.endsWith('far')) {
      assert.ok(count <= 60, `${label}: ${count} triangles`);
      continue;
    }
    if (kind.layer === 'tall' && kind.swayM > 0) assert.ok(count >= 80 && count <= 300, `${label}: ${count}`);
    else assert.ok(count <= 200, `${label}: ${count}`);
  }
  for (const biome of BIOMES) {
    for (const kind of castOf(biome).kinds) {
      for (const plant of kind.plants) {
        if (plant.far) assert.ok(triangles(plant.far) * 2 <= triangles(plant.near), `${biome} ${kind.name}`);
        else assert.ok(kind.nearM >= kind.reachM, `${biome} ${kind.name} without a far mesh fades out before it`);
      }
    }
  }
});

test("each cast's kinds stand in outlines of their own, so they read apart at a distance", () => {
  for (const biome of BIOMES) {
    const outlines = castOf(biome).kinds.map((kind) => ({
      name: kind.name,
      ...bounds(kind.plants[0]?.near ?? { vertices: new Float32Array(), closed: true }),
    }));
    for (const [index, one] of outlines.entries()) {
      for (const other of outlines.slice(index + 1)) {
        const apart =
          Math.abs(Math.log(one.height / other.height)) > 0.15 ||
          Math.abs(Math.log(one.width / one.height / (other.width / other.height))) > 0.15;
        assert.ok(apart, `${biome}: ${one.name} and ${other.name} share an outline`);
      }
    }
  }
});

test('a far mesh stands about as tall and wide as its near one, so the change between them reads as one plant', () => {
  for (const biome of BIOMES) {
    for (const kind of castOf(biome).kinds) {
      for (const plant of kind.plants) {
        if (!plant.far) continue;
        const [near, far] = [bounds(plant.near), bounds(plant.far)];
        assert.ok(
          Math.abs(far.height / near.height - 1) < 0.25,
          `${biome} ${kind.name}: ${far.height} vs ${near.height}`,
        );
        assert.ok(Math.abs(far.width / near.width - 1) < 0.35, `${biome} ${kind.name}: ${far.width} vs ${near.width}`);
      }
    }
  }
});
