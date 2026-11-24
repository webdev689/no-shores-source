import assert from 'node:assert/strict';
import { test } from 'node:test';
import manifest from '../../../content/modules/modules.json' with { type: 'json' };
import {
  inOpenWorld,
  loadModules,
  loadRunModules,
  moduleMesh,
  ofRun,
  readModuleMesh,
  releaseRunModules,
} from './modules.ts';
import { pictureBook } from './pictures.ts';

test('a module mesh reads its vertices, normals and triangles', () => {
  const bytes = new ArrayBuffer(8 + 3 * 16 + 12);
  const view = new DataView(bytes);
  view.setUint32(0, 3, true);
  view.setUint32(4, 1, true);
  [
    [0, 0, 0],
    [1, 0, 0],
    [0, 2, 0.5],
  ].forEach((point, vertex) => {
    point.forEach((value, axis) => view.setFloat32(8 + vertex * 16 + axis * 4, value, true));
    view.setInt8(8 + vertex * 16 + 14, 127);
    view.setInt8(8 + vertex * 16 + 15, vertex * 60);
  });
  [0, 2, 1].forEach((index, corner) => view.setUint32(8 + 48 + corner * 4, index, true));
  const mesh = readModuleMesh(bytes);
  assert.deepEqual([...mesh.positions], [0, 0, 0, 1, 0, 0, 0, 2, 0.5]);
  assert.deepEqual([...mesh.normals], [0, 0, 127, 0, 0, 127, 0, 0, 127]);
  assert.deepEqual([...mesh.glows], [0, 60, 120]);
  assert.deepEqual([...mesh.triangles], [0, 2, 1]);
  assert.throws(() => readModuleMesh(bytes.slice(0, 20)), /wrong length/);
});

test("every material a module's surfaces wear is one the page draws, and the first group is never paving", () => {
  const book = pictureBook({ climate: 'temperate', season: 'summer' }, [], [2], () => []);
  for (const module of manifest.modules) {
    assert.notEqual(module.groups[0]?.material, 'paving', module.name);
    for (const group of module.groups) assert.ok(group.material in book.materials, `${module.name}: ${group.material}`);
  }
});

test('the open world’s meshes are fetched a few at a time, in order, a group that failed again later, and a Breach’s run’s only as it is entered', async (context) => {
  const numbered = manifest.modules.map((module, number) => ({ module, number }));
  const world = numbered.filter(({ module }) => inOpenWorld(module.name));
  const [before, lastOne] = world.slice(-2);
  const last = lastOne?.number ?? -1;
  const lastMesh = lastOne?.module.groups.at(-1)?.mesh ?? '';
  let [inFlight, most, failing] = [0, 0, true];
  const asked: string[] = [];
  context.mock.method(console, 'error', () => undefined);
  context.mock.method(globalThis, 'fetch', async (url: string) => {
    asked.push(url.slice(manifest.base.length));
    most = Math.max(most, ++inFlight);
    await new Promise((done) => setImmediate(done));
    inFlight--;
    // An empty mesh: no vertices and no triangles.
    return failing && url.endsWith(lastMesh) ? new Response(null, { status: 404 }) : new Response(new ArrayBuffer(8));
  });
  const meshesOf = (chosen: typeof numbered) =>
    chosen.flatMap(({ module }) => module.groups.map((group) => group.mesh));
  const groups = meshesOf(world);
  await loadModules(0);
  assert.ok(most <= 8, `${most} in flight at once`);
  assert.deepEqual(asked, groups, 'each once, in the manifest’s order');
  const lastGroup = (lastOne?.module.groups.length ?? 0) - 1;
  assert.equal(moduleMesh(last, lastGroup), undefined, 'the one that failed is not drawn');
  assert.ok(moduleMesh(before?.number ?? -1, 0), 'the rest are');
  failing = false;
  await loadModules(1000);
  assert.equal(asked.length, groups.length, 'asked again only a while after');
  await loadModules(60_000);
  assert.deepEqual(asked.slice(groups.length), [lastMesh], 'only the group that failed');
  assert.ok(moduleMesh(last, lastGroup), 'and now drawn');
  await loadModules(120_000);
  assert.equal(asked.length, groups.length + 1, 'once every group is read, none is asked for again');
  const run = meshesOf(numbered.filter(({ module }) => ofRun(module.name)));
  asked.length = 0;
  await loadRunModules(130_000);
  assert.ok(run.length > 0 && most <= 8);
  assert.deepEqual(asked, run, 'a Breach’s run’s, only as it is entered, in the manifest’s order');
});

test('a Breach’s run’s meshes let go while still being fetched are neither kept as they come nor fetched further', async (context) => {
  const run = manifest.modules.map((module, number) => ({ module, number })).filter(({ module }) => ofRun(module.name));
  const groups = run.flatMap(({ module }) => module.groups).length;
  releaseRunModules();
  let answer = () => undefined as void;
  const answered = new Promise<void>((done) => (answer = done));
  let asked = 0;
  context.mock.method(globalThis, 'fetch', async () => {
    asked++;
    await answered;
    return new Response(new ArrayBuffer(8));
  });
  const loading = loadRunModules(200_000);
  releaseRunModules();
  answer();
  await loading;
  const kept = run.filter(({ module, number }) => module.groups.some((_group, index) => moduleMesh(number, index)));
  assert.deepEqual(kept, [], 'none kept after they were let go');
  assert.ok(asked < groups, `${asked} of ${groups} fetched`);
});
