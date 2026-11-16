import assert from 'node:assert/strict';
import { test } from 'node:test';
import { castOf } from './cast.ts';
import type { GroundAt, GroundSampler } from './ground.ts';
import type { Cast } from './kinds.ts';
import { formKinds, PLANTED_FLOATS, type ScatterGround, scatterTile, TILE_M } from './scatter.ts';

const FLAT: GroundAt = { height: 40, slope: 0.05, water: 'dry', mark: 0 };

const groundOf = (
  sample: GroundSampler,
  cleared = (_east: number, _south: number) => false,
  snowM = 2000,
): ScatterGround => ({
  sample,
  cleared,
  snowM,
});

/** Every plant of a layer over a square of tiles, with its kind's name and world point. */
function plantsOver(cast: Cast, ground: ScatterGround, tiles = 6, origin = [5000, 7000]) {
  const kinds = formKinds(cast);
  const plants: { name: string; x: number; y: number; layer: 'tall' | 'low' }[] = [];
  for (let down = 0; down < tiles; down++) {
    for (let across = 0; across < tiles; across++) {
      const [tileX, tileY] = [(origin[0] ?? 0) + across, (origin[1] ?? 0) + down];
      const tall = scatterTile(cast, 'tall', tileX, tileY, ground);
      const low = scatterTile(cast, 'low', tileX, tileY, ground, tall);
      for (const [layer, planted] of [
        ['tall', tall],
        ['low', low],
      ] as const) {
        for (let offset = 0; offset < planted.length; offset += PLANTED_FLOATS) {
          plants.push({
            name: cast.kinds[kinds[planted[offset] ?? 0] ?? 0]?.name ?? '',
            x: tileX * TILE_M + (planted[offset + 1] ?? 0),
            y: tileY * TILE_M + (planted[offset + 2] ?? 0),
            layer,
          });
        }
      }
    }
  }
  return plants;
}

test('a tile scatters the same plants every time and on every machine, and its neighbour others', () => {
  const cast = castOf('woodland');
  const ground = groundOf(() => FLAT);
  const first = scatterTile(cast, 'tall', 61_234, 48_765, ground);
  assert.ok(first.length > 0);
  assert.deepEqual(scatterTile(cast, 'tall', 61_234, 48_765, ground), first);
  assert.notDeepEqual(scatterTile(cast, 'tall', 61_235, 48_765, ground), first);
});

test('nothing grows on water, roads, towns, ports or cleared ground', () => {
  const sample: GroundSampler = (x, y) => {
    if (x < 5000 * TILE_M + 100) return { ...FLAT, water: 'sea', height: -3 };
    if (Math.abs(y - (7000 * TILE_M + 150)) < 6) return { ...FLAT, mark: 3 };
    if (x > 5000 * TILE_M + 300) return { ...FLAT, water: x > 5000 * TILE_M + 340 ? 'lake' : 'river' };
    return FLAT;
  };
  const cleared = (x: number, y: number) => Math.hypot(x - (5000 * TILE_M + 200), y - (7000 * TILE_M + 300)) < 40;
  for (const biome of ['rainforest', 'swamp', 'temperate-coast']) {
    const plants = plantsOver(castOf(biome), groundOf(sample, cleared));
    assert.ok(plants.length > 50, `${biome} grows on the dry ground`);
    for (const { x, y, name } of plants) {
      const here = sample(x, y);
      assert.equal(here.water, 'dry', `${biome} ${name} at ${x}, ${y} stands in water`);
      assert.equal(here.mark, 0, `${biome} ${name} stands on a road`);
      assert.ok(!cleared(x, y), `${biome} ${name} stands on cleared ground`);
    }
  }
});

test('rocks stand only on steep ground, and above the snow line nothing else grows', () => {
  const cast = castOf('highland');
  const rocks = (plants: { name: string }[]) => plants.filter(({ name }) => name === 'granite').length;
  const flat = plantsOver(
    cast,
    groundOf(() => FLAT),
  );
  assert.equal(rocks(flat), 0);
  const steep = plantsOver(
    cast,
    groundOf(() => ({ ...FLAT, slope: 0.5 })),
  );
  assert.ok(rocks(steep) > 10, `${rocks(steep)} rocks on steep ground`);
  const high = plantsOver(
    cast,
    groundOf(() => ({ ...FLAT, height: 2400, slope: 0.5 }), undefined, 2000),
  );
  assert.ok(high.length > 0);
  assert.ok(
    high.every(({ name }) => name === 'granite'),
    'only rocks above the snow line',
  );
});

test('the casts grow thickest in the rainforest and thinnest in the desert', () => {
  const ground = groundOf(() => FLAT);
  const tall = (biome: string) => plantsOver(castOf(biome), ground, 8).filter(({ layer }) => layer === 'tall').length;
  const counts = Object.fromEntries(
    ['rainforest', 'woodland', 'temperate-coast', 'savanna', 'desert'].map((biome) => [biome, tall(biome)]),
  );
  assert.ok((counts.rainforest ?? 0) > (counts.woodland ?? 0), JSON.stringify(counts));
  assert.ok((counts.woodland ?? 0) > (counts['temperate-coast'] ?? 0), JSON.stringify(counts));
  assert.ok((counts['temperate-coast'] ?? 0) > (counts.savanna ?? 0), JSON.stringify(counts));
  assert.ok((counts.savanna ?? 0) > (counts.desert ?? 0), JSON.stringify(counts));
});

test('a dry biome grows its palms only by water, and grows thicker there', () => {
  const cast = castOf('desert');
  const far = plantsOver(
    cast,
    groundOf(() => FLAT),
    8,
  );
  const near = plantsOver(
    cast,
    groundOf(() => ({ ...FLAT, freshM: 20 })),
    8,
  );
  const palms = (plants: { name: string }[]) => plants.filter(({ name }) => name === 'date palm').length;
  assert.equal(palms(far), 0);
  assert.ok(palms(near) > 20, `${palms(near)} palms by the water`);
  const others = (plants: { name: string }[]) => plants.length - palms(plants);
  assert.ok(others(near) > others(far) * 2, `${others(near)} by water, ${others(far)} away from it`);
});

test('low plants keep off the feet of the tall ones in their tile', () => {
  const cast = castOf('rainforest');
  const ground = groundOf(() => FLAT);
  for (let tile = 0; tile < 6; tile++) {
    const tall = scatterTile(cast, 'tall', 900 + tile, 400, ground);
    const low = scatterTile(cast, 'low', 900 + tile, 400, ground, tall);
    const kinds = formKinds(cast);
    for (let offset = 0; offset < low.length; offset += PLANTED_FLOATS) {
      for (let other = 0; other < tall.length; other += PLANTED_FLOATS) {
        const foot = (cast.kinds[kinds[tall[other] ?? 0] ?? 0]?.footM ?? 0) * (tall[other + 5] ?? 1);
        const apart = Math.hypot(
          (low[offset + 1] ?? 0) - (tall[other + 1] ?? 0),
          (low[offset + 2] ?? 0) - (tall[other + 2] ?? 0),
        );
        assert.ok(apart >= foot, `a low plant ${apart} m from a trunk ${foot} m round`);
      }
    }
  }
});

test('each plant stands on the ground it was given, sunk a little on a slope', () => {
  const cast = castOf('temperate-coast');
  const ground = groundOf((x) => ({ ...FLAT, height: 30 + x * 0.001, slope: 0.3 }));
  const tall = scatterTile(cast, 'tall', 1000, 1000, ground);
  assert.ok(tall.length > 0);
  for (let offset = 0; offset < tall.length; offset += PLANTED_FLOATS) {
    const x = 1000 * TILE_M + (tall[offset + 1] ?? 0);
    const foot = tall[offset + 3] ?? 0;
    const height = 30 + x * 0.001;
    assert.ok(foot < height && foot > height - 2, `foot ${foot} under ground ${height}`);
  }
});

test("a tile's plants run form by form, each form's in rank order, so the thinned-out far ones end each run", () => {
  // The densest of a row of tiles: a single tile may fall in a clearing.
  const tall = [0, 1, 2, 3, 4]
    .map((step) =>
      scatterTile(
        castOf('woodland'),
        'tall',
        4321 + step,
        8765,
        groundOf(() => FLAT),
      ),
    )
    .reduce((most, each) => (each.length > most.length ? each : most));
  assert.ok(tall.length > PLANTED_FLOATS * 10);
  for (let offset = PLANTED_FLOATS; offset < tall.length; offset += PLANTED_FLOATS) {
    const [form, before] = [tall[offset] ?? 0, tall[offset - PLANTED_FLOATS] ?? 0];
    assert.ok(form >= before);
    if (form === before) assert.ok((tall[offset + 8] ?? 0) >= (tall[offset - PLANTED_FLOATS + 8] ?? 0));
  }
});
