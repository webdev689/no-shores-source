import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PAGE_SLOTS, SLOT_FLOATS, slotOf, SlotStore } from './slots.ts';

const instances = (count: number, mark: number) => Float32Array.from({ length: count * SLOT_FLOATS }, () => mark);

test('a layer takes whole pages, and each of its instances is found in its slot', () => {
  const store = new SlotStore();
  const pages = store.store(instances(PAGE_SLOTS + 3, 7));
  assert.equal(pages.length, 2);
  for (const index of [0, PAGE_SLOTS - 1, PAGE_SLOTS, PAGE_SLOTS + 2]) {
    assert.equal(store.data[slotOf(pages, index) * SLOT_FLOATS], 7);
  }
  assert.equal(store.data[slotOf(pages, PAGE_SLOTS + 3) * SLOT_FLOATS], 0, 'the rest of the last page is empty');
});

test('pages let go are handed out again only after a recycle, so a list still drawn never names new plants', () => {
  const store = new SlotStore();
  const first = store.store(instances(4, 1));
  store.release(first);
  const second = store.store(instances(4, 2));
  assert.notDeepEqual(second, first, 'not reused before the recycle');
  assert.equal(store.data[slotOf(first, 0) * SLOT_FLOATS], 1, 'the old plants are still there');
  store.recycle();
  assert.deepEqual(store.store(instances(4, 3)), first);
  assert.equal(store.pagesInUse, 2);
});

test('only the pages changed since the GPU last took them are sent, joined into runs', () => {
  const store = new SlotStore();
  store.store(instances(PAGE_SLOTS * 2, 1));
  store.takeChanges();
  assert.deepEqual(store.takeChanges(), [], 'nothing new');
  store.store(instances(PAGE_SLOTS * 3, 2));
  const floats = PAGE_SLOTS * SLOT_FLOATS;
  assert.deepEqual(store.takeChanges(), [2 * floats, 3 * floats]);
});

test('a full store grows, keeping what it holds, and says it must be sent again whole', () => {
  const store = new SlotStore();
  const kept = store.store(instances(5, 9));
  store.replaced = false;
  const before = store.data.length;
  store.store(instances(before / SLOT_FLOATS, 4));
  assert.ok(store.data.length > before);
  assert.equal(store.replaced, true);
  assert.equal(store.data[slotOf(kept, 4) * SLOT_FLOATS], 9);
});
