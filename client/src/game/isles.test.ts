import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { type IsleBuilt, islePlanner } from '../network/islePlans.ts';
import type { SeenIsle } from '../network/seaHarbour.ts';
import { Isles } from './isles.ts';

/** The room's module as `npm run wasm` copies it for the page. */
const ROOM = 'client/public/room.wasm';

const seen = (id: number, seed: string, middle: [number, number] = [5000, 6000]): SeenIsle => ({
  id,
  seed,
  at: middle,
  kind: 'cove',
  continent: 0,
  found: false,
});

test(
  'islands are built one at a time off the frame, by number and seed, and let go of',
  { skip: !existsSync(ROOM) },
  async () => {
    const build = islePlanner(new WebAssembly.Module(readFileSync(ROOM)));
    // Each build waits until the test lets it come, as a worker's answer does.
    const asked: { seed: string; come: () => void }[] = [];
    const planner = (seed: string, climate: string, middle: readonly [number, number]) =>
      new Promise<IsleBuilt | null>((resolve) =>
        asked.push({ seed, come: () => resolve(build(seed, climate, middle)) }),
      );
    const isles = new Isles(planner, ['desert']);
    const settled = () => new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(isles.update([seen(1, '41'), seen(2, '43', [9000, 9000])]), true, 'new islands are news');
    assert.equal(isles.update([seen(1, '41'), seen(2, '43', [9000, 9000])]), false);
    assert.deepEqual(
      asked.map((each) => each.seed),
      ['41'],
      'one at a time',
    );
    assert.equal(isles.byId(1), null, 'not built till its answer comes');
    asked[0]?.come();
    await settled();
    assert.equal(isles.byId(1)?.seen.seed, '41');
    assert.equal(isles.byId(1)?.own[0], (isles.byId(1)?.heights[0] ?? 0) - 5000, 'its ground in its own frame too');
    // A click meets its ground where it has one, and nothing far off it.
    const [west = 0, north = 0, cell = 0, columns = 0] = isles.byId(1)?.heights ?? [];
    const first = (isles.byId(1)?.heights.subarray(5) ?? new Float64Array()).findIndex(Number.isFinite);
    const onIt: [number, number] = [
      west + ((first % columns) + 0.5) * cell,
      north + (Math.floor(first / columns) + 0.5) * cell,
    ];
    assert.ok(Number.isFinite(isles.groundAt(...onIt)), `ground at ${onIt.join(', ')}`);
    assert.equal(isles.groundAt(60_000, 60_000), null);
    isles.update([seen(1, '41'), seen(2, '43', [9000, 9000])]);
    assert.deepEqual(
      asked.map((each) => each.seed),
      ['41', '43'],
    );
    // A sea that opened again numbers its own island 1: a new island, not the old one's plan.
    assert.equal(isles.update([seen(1, '77')]), true);
    assert.equal(isles.byId(1), null, 'the old island 1 is let go of');
    asked[1]?.come();
    await settled();
    assert.equal(isles.built().length, 0, 'an island no longer told of is not kept when its build comes');
    isles.update([seen(1, '77')]);
    assert.deepEqual(asked.at(-1)?.seed, '77');
  },
);
