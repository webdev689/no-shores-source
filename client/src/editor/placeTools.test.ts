import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { startLand } from '../rules/landRules.ts';
import type { Places } from './marks.ts';
import { PlaceTools } from './placeTools.ts';

/** A host that keeps the edits as text, one undo step a change, as the Land session does. */
function host(start: string, write: (edits: string) => string = (edits) => edits) {
  const history = [start];
  const said: string[] = [];
  const places = () => JSON.parse(history[history.length - 1] ?? '{}') as Places;
  const tools = new PlaceTools({
    places,
    change: (mutate) => {
      const edits = JSON.parse(history[history.length - 1] ?? '{}') as Record<string, unknown[]>;
      mutate(edits);
      history.push(write(JSON.stringify(edits)));
    },
    say: (text) => said.push(text),
  });
  return { tools, history, said, places };
}

const SECTION = [
  [0, 0],
  [600, 0],
  [600, 600],
  [0, 600],
] as const;

test('a node is drawn point by point and closed, with its kind, its name and a spawn at its middle', () => {
  const { tools, places } = host(
    '{"strokes":[],"nodes":[{"id":"node-4","kind":"boss","name":"Maw","ring":[[5000,0],[5600,0],[5600,600]],"spawns":[[5400,100]]}]}',
  );
  tools.setNode({ kind: 'dungeon', name: 'The Pearl Tomb' });
  for (const point of SECTION) tools.press('node', point, 10);
  tools.press('node', [0, 600], 10);
  tools.press('node', [0, 0], 10);
  assert.equal(tools.draft?.points.length, 6, 'a double-click and a click back on the first point land too');
  tools.finish();
  const node = places().nodes?.[1];
  assert.deepEqual(node, {
    id: 'node-5',
    kind: 'dungeon',
    name: 'The Pearl Tomb',
    ring: [
      [0, 0],
      [600, 0],
      [600, 600],
      [0, 600],
    ],
    spawns: [[300, 300]],
  });
  assert.equal(tools.chosen, 'node-5', 'the node just drawn is the one the fields change');
});

test('a ring of two points is no node, and Backspace takes back the last point', () => {
  const { tools, history } = host('{}');
  tools.press('node', [0, 0], 10);
  tools.press('node', [100, 0], 10);
  tools.press('node', [100, 100], 10);
  tools.back('node', null);
  tools.finish();
  assert.equal(history.length, 1, 'nothing changed');
});

test('the fields change the chosen node, and a new drawing starts with a blank name', () => {
  const { tools, places } = host('{}');
  for (const point of SECTION) tools.press('node', point, 10);
  tools.finish();
  assert.equal(places().nodes?.[0]?.name, 'node-1', 'a blank name is the id');
  tools.setNode({ kind: 'boss', name: 'The Maw' });
  assert.deepEqual([places().nodes?.[0]?.kind, places().nodes?.[0]?.name], ['boss', 'The Maw']);
  tools.press('node', [2000, 0], 10);
  assert.deepEqual(tools.nodeFields(), { kind: 'boss', name: '', chosen: null });
});

test('spawns go inside a node, Backspace takes the last at the cursor, Remove takes the one clicked', () => {
  const { tools, places, said } = host('{}');
  for (const point of SECTION) tools.press('node', point, 10);
  tools.finish();
  tools.press('spawn', [100, 100], 10);
  tools.press('spawn', [5000, 5000], 10);
  assert.deepEqual(places().nodes?.[0]?.spawns, [
    [300, 300],
    [100, 100],
  ]);
  assert.equal(said.length, 1, 'a click outside every node says so');
  tools.back('spawn', [500, 500]);
  assert.deepEqual(places().nodes?.[0]?.spawns, [[300, 300]]);
  tools.press('remove', [305, 300], 10);
  assert.deepEqual(places().nodes?.[0]?.spawns, [], 'the spawn within reach goes before its node');
  tools.press('remove', [305, 300], 10);
  assert.deepEqual(places().nodes, [], 'then the node under the click');
});

test('the City tool moves the city, and its fields rename it and change its motif', () => {
  const { tools, places } = host('{"city":{"id":"overlook","name":"Overlook","centre":[0,0],"motif":"beacon"}}');
  tools.press('city', [1200.4, 800.6], 10);
  tools.setCity({ name: '  ' });
  tools.setCity({ motif: 'span' });
  assert.deepEqual(places().city, { id: 'overlook', name: 'Overlook', centre: [1200, 801], motif: 'span' });
  const none = host('{}');
  none.tools.press('city', [5, 5], 10);
  assert.deepEqual([none.history.length, none.said.length], [1, 1], 'no city is made up: the status says why');
});

const WASM = new URL('../../../target/wasm32-unknown-unknown/release/land_wasm.wasm', import.meta.url);
const CONTENT = new URL('../../../content/world/', import.meta.url);

test('a landmass with a city and nodes opens, edits, undoes, saves and reopens unchanged through the land door', async () => {
  const rules = await startLand(await readFile(WASM));
  const layout = await readFile(new URL('layout.json', CONTENT), 'utf8');
  const file = await readFile(new URL('land/continent-1.json', CONTENT), 'utf8');
  rules.open(layout, 'continent-1', file);
  assert.equal(rules.write().text, file, 'opened and written back, the file is as it was');
  const written = (edits: string) => {
    rules.setEdits(edits);
    return rules.write().text;
  };
  const { tools, history, places } = host(file, written);
  const [east, south] = places().city?.centre ?? [0, 0];
  const ring = [
    [east - 300, south - 300],
    [east + 300, south - 300],
    [east + 300, south + 300],
    [east - 300, south + 300],
  ] as const;
  for (const point of ring) tools.press('node', point, 10);
  tools.finish();
  tools.press('spawn', [east + 100, south + 100], 10);
  tools.press('city', [east + 50, south], 10);
  const placed = places().nodes ?? [];
  assert.equal(placed.length, 18, 'Saltmere’s seventeen and the new one');
  assert.deepEqual(placed[placed.length - 1]?.spawns, [
    [east, south],
    [east + 100, south + 100],
  ]);
  const problems = rules.setEdits(history[history.length - 1] ?? '').problems.map(({ subject }) => subject);
  assert.ok(!problems.includes('node-1'), `the new node keeps the rules: ${problems.join(', ')}`);
  tools.press('city', [10, 10], 10);
  const wrong = rules.setEdits(history[history.length - 1] ?? '').problems.map(({ subject }) => subject);
  assert.ok(wrong.includes('overlook'), 'a city in the sea is a problem the panel lists');
  history.pop();
  const saved = history[history.length - 1] ?? '';
  rules.open(layout, 'continent-1', saved);
  assert.equal(rules.write().text, saved, 'saved and reopened, it is unchanged');
  assert.equal(written(history[0] ?? ''), file, 'undone to the start, it is the file again');
});
