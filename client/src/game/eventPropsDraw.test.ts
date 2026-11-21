import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { moduleMouth, moduleNumber } from '../city/modules.ts';
import { EventPropsDraw, MATERIALS, packLips } from './eventPropsDraw.ts';
import type { Gpu } from '../gpu.ts';

test("the fissure's lips pack station by station along its x, the lower lip's y under the higher's", () => {
  const fissure = moduleNumber('lattice-fissure');
  const [north, south] = moduleMouth(fissure) ?? [];
  assert.ok(north && south && north.length === south.length && north.length > 2);
  const packed = packLips(fissure);
  assert.ok(packed);
  assert.equal(packed.length, north.length * 4);
  for (let k = 0; k < north.length; k++) {
    const [x, low, high] = [packed[k * 4] ?? NaN, packed[k * 4 + 1] ?? NaN, packed[k * 4 + 2] ?? NaN];
    assert.ok(low <= high, 'the lower lip first');
    if (k > 0) assert.ok(x > (packed[(k - 1) * 4] ?? NaN), 'along its x');
  }
  const [x, a] = north[0] ?? [];
  const b = south[0]?.[1];
  assert.deepEqual(
    [packed[0], packed[1], packed[2]],
    [Math.fround(x ?? NaN), Math.fround(Math.min(a ?? NaN, b ?? NaN)), Math.fround(Math.max(a ?? NaN, b ?? NaN))],
  );
  assert.equal(packLips(moduleNumber('lattice-growth')), null, 'a module that does not open has none');
});

test("the drawer's materials are the modules' kit's, in its order", () => {
  const kit = readFileSync(new URL('../../../tools/modules/kit.py', import.meta.url), 'utf8');
  const tuple = (name: string) => /^NAME = \(([^)]*)\)/m.source.replace('NAME', name);
  const [listed, cloths] = ['MATERIALS', 'CLOTHS'].map((name) => new RegExp(tuple(name), 'm').exec(kit)?.[1]);
  assert.ok(listed && cloths, 'kit.py names its MATERIALS and its CLOTHS');
  const names = (text: string) => [...text.matchAll(/'([a-z_]+)'|\*CLOTHS/g)].map((found) => found[1] ?? '*');
  assert.deepEqual(
    names(listed).flatMap((name) => (name === '*' ? names(cloths) : [name])),
    [...MATERIALS],
  );
});

test('the drawer makes its pipelines only once it has props to draw, not as the game boots', () => {
  const made: string[] = [];
  // A device whose every call answers another such stand-in, noting each pipeline and shader made.
  const stand: object = new Proxy(function stub() {}, {
    get: (_target, key) => (key === 'then' ? undefined : key === Symbol.toPrimitive ? () => 0 : stand),
    apply: () => stand,
  });
  const device = new Proxy(
    {},
    {
      get: (_target, key) =>
        key === 'createRenderPipeline' || key === 'createShaderModule' ? () => (made.push(String(key)), stand) : stand,
    },
  );
  const fetched = globalThis.fetch;
  globalThis.fetch = () => new Promise(() => undefined);
  try {
    const drawer = new EventPropsDraw({ device, format: 'bgra8unorm' } as unknown as Gpu);
    drawer.set([]);
    assert.deepEqual(made, [], 'none at boot');
  } finally {
    globalThis.fetch = fetched;
  }
});
