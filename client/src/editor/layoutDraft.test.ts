import assert from 'node:assert/strict';
import { test } from 'node:test';
import { draftLayout, slotIdsFor } from './layoutDraft.ts';
import { LandMask } from './landMask.ts';

const empty = { continents: [], isles: [] };
const always = () => true;
const none = new Set<number>();

test('each painted slot becomes a continent with its traced coast', () => {
  const mask = new LandMask(100_000, 100_000);
  mask.paintDisc(30_000, 30_000, 8_000, 1);
  mask.paintDisc(70_000, 70_000, 8_000, 2);
  const { layout, issues } = draftLayout(mask, slotIdsFor(empty, 9), empty, always, none);
  assert.deepEqual(issues, []);
  assert.deepEqual(
    layout.continents.map((continent) => continent.id),
    ['continent-1', 'continent-2'],
  );
  assert.ok((layout.continents[0]?.outline.length ?? 0) >= 3);
});

test('a continent in pieces is held back, with each stray piece listed where it lies', () => {
  const mask = new LandMask(100_000, 100_000);
  mask.paintDisc(20_000, 50_000, 5_000, 3);
  mask.paintDisc(80_000, 50_000, 5_000, 3);
  mask.paintDisc(50_000, 20_000, 2_000, 3);
  const { layout, issues, heldBack } = draftLayout(mask, slotIdsFor(empty, 9), empty, always, none);
  assert.deepEqual(layout.continents, []);
  assert.deepEqual(heldBack, ['continent-3']);
  assert.equal(issues[0]?.text, 'continent-3 is in 3 pieces, so Save leaves it out: join or erase the strays');
  const strays = issues.slice(1);
  assert.deepEqual(
    strays.map((issue) => issue.text),
    ['continent-3: a stray piece of 80 km² (show it)', 'continent-3: a stray piece of 12 km² (show it)'],
  );
  for (const { at } of strays)
    assert.equal(mask.labelAt(Math.floor((at?.x ?? 0) / 1_000), Math.floor((at?.y ?? 0) / 1_000)), 3);
});

test('the coarsest simplification the rules accept is kept', () => {
  const mask = new LandMask(100_000, 100_000);
  mask.paintDisc(50_000, 50_000, 20_000, 1);
  const tried: number[] = [];
  const isSimple = (outline: readonly unknown[]) => {
    tried.push(outline.length);
    return tried.length >= 2;
  };
  const { layout } = draftLayout(mask, slotIdsFor(empty, 9), empty, isSimple, none);
  assert.equal(tried.length, 2, 'stops at the first accepted tolerance');
  assert.equal(layout.continents[0]?.outline.length, tried[1]);
});

test('climates and isles carry over, and existing ids keep their slots', () => {
  const previous = {
    continents: [{ id: 'northlands', outline: [], climate: 'cold' }],
    isles: [{ id: 'rock' }],
  };
  const ids = slotIdsFor(previous, 9);
  assert.deepEqual(ids.slice(0, 3), ['', 'northlands', 'continent-2']);
  assert.equal(ids.length, 10);
  const mask = new LandMask(100_000, 100_000);
  mask.paintDisc(50_000, 50_000, 10_000, 1);
  const { layout } = draftLayout(mask, ids, previous, always, new Set([1]));
  assert.equal(layout.continents[0]?.climate, 'cold');
  assert.deepEqual(layout.isles, [{ id: 'rock' }]);
});

test('a reopened layout keeps each numbered continent in its own slot', () => {
  const previous = {
    continents: ['continent-2', 'continent-6', 'albion'].map((id) => ({ id, outline: [] })),
    isles: [],
  };
  const expected = ['', 'albion', 'continent-2', 'continent-3', 'continent-4', 'continent-5', 'continent-6'];
  assert.deepEqual(slotIdsFor(previous, 9), [...expected, 'continent-7', 'continent-8', 'continent-9']);
});

test('a continent left untouched keeps its loaded outline exactly; a changed one is traced again', () => {
  const outline: [number, number][] = [
    [10_000, 10_000],
    [60_000, 12_000],
    [30_000, 70_000],
  ];
  const previous = { continents: [{ id: 'continent-1', outline, climate: 'cold' }], isles: [] };
  const mask = new LandMask(100_000, 100_000);
  mask.fillOutline(outline, 1);
  const ids = slotIdsFor(previous, 9);
  assert.equal(draftLayout(mask, ids, previous, always, none).layout.continents[0], previous.continents[0]);
  const traced = draftLayout(mask, ids, previous, always, new Set([1])).layout.continents[0];
  assert.notDeepEqual(traced?.outline, outline);
  assert.equal(traced?.climate, 'cold');
});
