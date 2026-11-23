import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Gpu } from '../gpu.ts';
import type { BuildingTable, PropTable } from '../models/tables.ts';
import { CITY_LAMPS } from '../sky/lamps.ts';
import { CityView } from './cityView.ts';
import { CELL_M, type CityPlan } from './plan.ts';

/** What the stand-in device made that can be let go, and whether it was. */
type Made = { destroyed: boolean; destroy(): void };

/** A device whose every call answers another such stand-in, but whose buffers and textures are its own, each noted
 *  as made and as let go; and a stand-in for the painters' workers, which never answer. */
function standInGpu(): { gpu: Gpu; made: Made[] } {
  const stand: object = new Proxy(function stub() {}, {
    get: (_target, key) => (key === 'then' ? undefined : key === Symbol.toPrimitive ? () => 0 : stand),
    apply: () => stand,
  });
  const made: Made[] = [];
  const owned = () => {
    const thing = {
      destroyed: false,
      size: 0,
      createView: () => stand,
      destroy: () => void (thing.destroyed = true),
    };
    made.push(thing);
    return thing;
  };
  const device = new Proxy(
    {},
    { get: (_target, key) => (key === 'createBuffer' || key === 'createTexture' ? owned : stand) },
  );
  Object.assign(globalThis, {
    Worker: class {
      addEventListener(): void {}
      postMessage(): void {}
      terminate(): void {}
    },
  });
  return { gpu: { device, format: 'bgra8unorm' } as unknown as Gpu, made };
}

/** A city of four plain cells round `centre`, its pads, and a lamp in its middle. */
function cityAt(centre: readonly [number, number]): CityPlan {
  const [west, north] = [centre[0] - CELL_M, centre[1] - CELL_M];
  const cells = [0, 1, 2, 3].map((index) => ({
    column: index % 2,
    row: Math.floor(index / 2),
    ground: 'level' as const,
    level: 10,
    use: 'avenue' as const,
  }));
  return {
    id: 'plain',
    name: 'Plain',
    motif: 'beacon',
    centre,
    grid: { west, north },
    cells,
    gates: [],
    harbour: null,
    landmark: [
      {
        shape: 'block',
        at: [centre[0], centre[1], 10],
        size: [2, 2, 2],
        turn: 0,
        lean: 0,
        roll: 0,
        material: 'glow',
      },
    ],
    works: [],
    social: { bounds: [centre[0], centre[1], centre[0], centre[1]], level: 10, ring: [], spawns: [], solids: [] },
    pads: [{ bounds: [west, north, west + 2 * CELL_M, north + 2 * CELL_M], level: 10 }],
  };
}

const TEMPERATE = { climate: 'temperate', season: 'summer' } as const;
const TABLES = { buildings: {} as BuildingTable, props: {} as PropTable };
const [HERE, THERE] = [[10_000, 20_000] as const, [30_000, 20_000] as const];

test('the city drawn stands until the next is whole, then the next in its place', () => {
  const { gpu, made } = standInGpu();
  const view = new CityView(gpu);
  // The sky's terms are the device's, kept for every view.
  const before = made.length;
  view.setCity(cityAt(HERE), TEMPERATE, new Map(), TABLES);
  const first = made.slice(before);
  let wholes = 0;
  view.beginCity(cityAt(THERE), TEMPERATE, new Map(), TABLES, () => (wholes += 1));
  let frames = 0;
  for (; view.underWay; frames++) {
    assert.ok(view.cleared(...HERE) && !view.cleared(...THERE), 'the first city, until the next is whole');
    assert.deepEqual(
      CITY_LAMPS.current.map((lamp) => lamp.at[0]),
      [HERE[0]],
      "the first city's lamp",
    );
    assert.equal(wholes, 0);
    view.keepBuilding(0);
  }
  assert.ok(frames > 10, `built over ${frames} frames, a step each`);
  assert.equal(wholes, 1, 'told once it stands');
  assert.ok(view.cleared(...THERE) && !view.cleared(...HERE), 'the next city, once whole');
  assert.deepEqual(
    CITY_LAMPS.current.map((lamp) => lamp.at[0]),
    [THERE[0]],
  );
  assert.ok(first.length > 0 && first.every((each) => each.destroyed), "the first city's buffers let go");
  view.clear();
});

test('a city begun again before it is whole is let go with what it made, and never drawn', () => {
  const { gpu, made } = standInGpu();
  const view = new CityView(gpu);
  const before = made.length;
  let wholes = 0;
  view.beginCity(cityAt(HERE), TEMPERATE, new Map(), TABLES, () => (wholes += 1));
  while (made.length === before) view.keepBuilding(0);
  const begun = made.slice(before);
  view.beginCity(cityAt(THERE), TEMPERATE, new Map(), TABLES);
  assert.ok(
    begun.every((each) => each.destroyed),
    'what the first build made is let go',
  );
  assert.ok(!view.cleared(...HERE) && !view.cleared(...THERE), 'nothing stands yet');
  while (view.underWay) view.keepBuilding(0);
  assert.equal(wholes, 0, 'the first is never told it stands');
  assert.ok(view.cleared(...THERE) && !view.cleared(...HERE));
  view.beginCity(cityAt(HERE), TEMPERATE, new Map(), TABLES);
  view.keepBuilding(0);
  view.clear();
  assert.ok(!view.underWay && !view.cleared(...THERE), 'cleared, nothing is built or drawn');
  assert.ok(
    made.slice(before).every((each) => each.destroyed),
    'everything made let go',
  );
});
