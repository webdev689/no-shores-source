import assert from 'node:assert/strict';
import { test } from 'node:test';
import { castOf } from './cast.ts';
import { keptAt, NatureField, type NatureGround } from './field.ts';
import type { GroundAt } from './ground.ts';
import { TILE_M } from './scatter.ts';
import { SLOT_FLOATS } from './slots.ts';

const FLAT: GroundAt = { height: 40, slope: 0.05, water: 'dry', mark: 0 };

/** A ground that counts how often it is asked. */
function counted(biome: string, version = 0) {
  const asked = { count: 0 };
  const ground: NatureGround = {
    biome,
    snowM: 2500,
    version,
    sample: () => {
      asked.count += 1;
      return FLAT;
    },
    cleared: () => false,
  };
  return { ground, asked };
}

// Far out in the world, where a float32 holds only quarter metres: the packing must keep its own precision.
const EYE = [3_870_123.4, 2_450_987.6] as const;

/** The `index`th listed plant's foot in the world, and its foot's height, as the GPU places it. */
function footOf(field: NatureField, index: number): [number, number, number] {
  const { anchor, list, corners } = field.packed;
  const slot = (list[index] ?? 0) * SLOT_FLOATS;
  const data = field.store.data;
  const tile = data[slot + 10] ?? 0;
  return [
    anchor[0] + (corners[tile * 2] ?? 0) + (data[slot] ?? 0),
    anchor[1] + (corners[tile * 2 + 1] ?? 0) + (data[slot + 1] ?? 0),
    data[slot + 2] ?? 0,
  ];
}

test('the eye moving within its tile scatters nothing; crossing one scatters only the tiles it came near', () => {
  const field = new NatureField(Infinity);
  const { ground, asked } = counted('savanna');
  field.update(EYE[0], EYE[1], ground);
  const [first, packed] = [field.scattered, field.packed];
  assert.ok(first > 1000, `${first} tile layers round the eye`);
  const askedFirst = asked.count;
  field.update(EYE[0] + 10, EYE[1] - 10, ground);
  assert.equal(field.scattered, first, 'no tile scattered again');
  assert.equal(asked.count, askedFirst, 'the ground not read again');
  assert.equal(field.packed, packed, 'nothing packed again');
  field.update(EYE[0] + TILE_M, EYE[1], ground);
  const added = field.scattered - first;
  assert.ok(added > 0 && added < first / 10, `${added} tile layers scattered for one step`);
  assert.notEqual(field.packed, packed, 'packed again round the new tile');
});

test('every packed plant stands within its reach of the eye, placed from an anchor near it', () => {
  const field = new NatureField(Infinity);
  field.update(EYE[0], EYE[1], counted('woodland').ground);
  const { anchor, groups } = field.packed;
  assert.ok(Math.abs(anchor[0] - EYE[0]) < TILE_M && Math.abs(anchor[1] - EYE[1]) < TILE_M);
  const cast = castOf('woodland');
  const kindOfForm = cast.kinds.flatMap((kind) => kind.plants.map(() => kind));
  assert.ok(groups.length > 0);
  for (const group of groups) {
    const kind = kindOfForm[group.form];
    assert.ok(kind);
    const count = group.counts.reduce((sum, each) => sum + each, 0);
    for (let index = group.first; index < group.first + count; index++) {
      const [x, y] = footOf(field, index);
      const distance = Math.hypot(x - EYE[0], y - EYE[1]);
      assert.ok(distance < kind.reachM + 3 * TILE_M, `${kind.name} ${distance} m out`);
      if (!group.far) assert.ok(distance < kind.nearM + 3 * TILE_M, `${kind.name}'s near mesh ${distance} m out`);
    }
  }
  assert.ok(groups.some((group) => group.far) && groups.some((group) => !group.far), 'both details are drawn');
});

test('a changed ground is scattered again over several updates, the old plants drawn until their tile is redone', () => {
  const field = new NatureField(100);
  let updates = 1;
  while (field.update(EYE[0], EYE[1], counted('savanna', 1).ground)) updates += 1;
  assert.ok(updates > 1, 'the first fill takes more than one budget');
  const before = field.packed.list.length;
  assert.equal(field.update(EYE[0], EYE[1], counted('savanna', 2).ground), true, 'tiles still waiting');
  assert.equal(field.packed.list.length, before, 'the old plants still drawn');
  while (field.update(EYE[0], EYE[1], counted('savanna', 2).ground));
  assert.equal(field.packed.list.length, before, 'the same ground grows the same plants');
});

test('far plants thin out toward the reach, and none thin within the thinning start', () => {
  const kind = castOf('woodland').kinds[0];
  assert.ok(kind);
  assert.equal(keptAt(kind, 0.3, 500), 1);
  let last = 1;
  for (let distance = 1200; distance <= kind.reachM; distance += 200) {
    const kept = keptAt(kind, 0.3, distance);
    assert.ok(kept <= last && kept >= 0.3);
    last = kept;
  }
  assert.ok(Math.abs(keptAt(kind, 0.3, kind.reachM) - 0.3) < 1e-9);
});

test('another biome replaces the whole cast', () => {
  const field = new NatureField(Infinity);
  field.update(EYE[0], EYE[1], counted('woodland').ground);
  field.update(EYE[0], EYE[1], counted('desert').ground);
  assert.equal(field.drawnCast, castOf('desert'));
  assert.ok(field.packed.groups.every((group) => group.form < castOf('desert').kinds.length * 2));
  field.update(EYE[0], EYE[1], counted('ashland').ground);
  assert.equal(field.packed.list.length, 0, 'an unknown biome grows nothing');
});

test("a tile's bounds hold its plants' feet whichever layer they grow in, so a tile of grass alone is not culled", () => {
  const field = new NatureField(Infinity);
  // Flat steppe away from water grows no trees or rocks: only its grass and sagebrush.
  field.update(EYE[0], EYE[1], { ...counted('steppe').ground, sample: () => ({ ...FLAT, height: 300 }) });
  const { tiles, groups } = field.packed;
  assert.ok(groups.length > 0);
  for (const group of groups) {
    let next = group.first;
    for (const [index, tile] of group.tiles.entries()) {
      const [lowest, highest] = [tiles[tile * 4 + 2] ?? 0, tiles[tile * 4 + 3] ?? 0];
      const foot = footOf(field, next)[2];
      assert.ok(foot >= lowest && foot <= highest, `a foot at ${foot} outside ${lowest}..${highest}`);
      next += group.counts[index] ?? 0;
    }
  }
});

test('a step into another tile moves no plant already kept: their slots stay put and only the list changes', () => {
  const field = new NatureField(Infinity);
  const { ground } = counted('woodland');
  field.update(EYE[0], EYE[1], ground);
  const kept = new Map<number, string>();
  for (let index = 0; index < field.packed.list.length; index++) {
    kept.set(
      field.packed.list[index] ?? 0,
      footOf(field, index)
        .map((value) => value.toFixed(3))
        .join(),
    );
  }
  field.update(EYE[0] + TILE_M, EYE[1], ground);
  let same = 0;
  for (let index = 0; index < field.packed.list.length; index++) {
    const before = kept.get(field.packed.list[index] ?? 0);
    if (before === undefined) continue;
    assert.equal(
      footOf(field, index)
        .map((value) => value.toFixed(3))
        .join(),
      before,
      'a kept plant stays where it stood',
    );
    same += 1;
  }
  assert.ok(same > field.packed.list.length * 0.9, `${same} of ${field.packed.list.length} plants kept their slots`);
});
