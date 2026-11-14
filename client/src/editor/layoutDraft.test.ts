import assert from 'node:assert/strict';
import { test } from 'node:test';
import { draftLayout, slotIdsFor } from './layoutDraft.ts';
import { LandMask } from './landMask.ts';

const empty = { continents: [], isles: [] };
const always = () => true;

test('each painted slot becomes a continent with its traced coast', () => {
  const mask = new LandMask(100_000, 100_000);
  mask.paintDisc(30_000, 30_000, 8_000, 1);
  mask.paintDisc(70_000, 70_000, 8_000, 2);
  const { layout, issues } = draftLayout(mask, slotIdsFor(empty, 9), empty, always);
  assert.deepEqual(issues, []);
  assert.deepEqual(
    layout.continents.map((continent) => continent.id),
    ['continent-1', 'continent-2'],
  );
  assert.ok((layout.continents[0]?.outline.length ?? 0) >= 3);
});

test('a continent in two pieces is held back with the reason', () => {
  const mask = new LandMask(100_000, 100_000);
  mask.paintDisc(20_000, 50_000, 5_000, 3);
  mask.paintDisc(80_000, 50_000, 5_000, 3);
  const { layout, issues } = draftLayout(mask, slotIdsFor(empty, 9), empty, always);
  assert.deepEqual(layout.continents, []);
  assert.deepEqual(issues, ['continent-3 is in 2 pieces: one continent is one landmass']);
});

test('the coarsest simplification the rules accept is kept', () => {
  const mask = new LandMask(100_000, 100_000);
  mask.paintDisc(50_000, 50_000, 20_000, 1);
  const tried: number[] = [];
  const isSimple = (outline: readonly unknown[]) => {
    tried.push(outline.length);
    return tried.length >= 2;
  };
  const { layout } = draftLayout(mask, slotIdsFor(empty, 9), empty, isSimple);
  assert.equal(tried.length, 2, 'stops at the first accepted tolerance');
  assert.equal(layout.continents[0]?.outline.length, tried[1]);
});

test('climates and isles carry over, and existing ids keep their slots', () => {
  const previous = {
    continents: [{ id: 'northlands', outline: [], climate: 'cold' }],
    isles: [{ id: 'rock' }],
  };
  const ids = slotIdsFor(previous, 9);
  assert.deepEqual(ids.slice(0, 3), ['', 'northlands', 'continent-1']);
  assert.equal(ids.length, 10);
  const mask = new LandMask(100_000, 100_000);
  mask.paintDisc(50_000, 50_000, 10_000, 1);
  const { layout } = draftLayout(mask, ids, previous, always);
  assert.equal(layout.continents[0]?.climate, 'cold');
  assert.deepEqual(layout.isles, [{ id: 'rock' }]);
});
