import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { GROWTH, MOTION, STORE } from '../city/eventProps.ts';
import { EVENT } from '../combat/cues.ts';
import { CHEST_LIES_S } from './publicLaw.ts';
import { MARK } from '../network/publicMessages.ts';

/** The room's public events' numbers, written by `cargo test -p room` (public/page_numbers_tests.rs), so the page's
 *  copies cannot drift from them. */
const room = JSON.parse(
  readFileSync(new URL('../../../target/protocol/room-numbers.json', import.meta.url), 'utf8'),
) as {
  events: [string, number][];
  marks: typeof MARK;
  growth: typeof GROWTH;
  store: typeof STORE;
  growthRiseTicks: number;
  growthSinkTicks: number;
  dropTicks: number;
};
const camel = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);

test("the page's public event numbers are the room's: each event told, from PublicBegun to ChestOpened", () => {
  assert.equal(room.events.length, 10);
  for (const [name, number] of room.events) {
    assert.equal(EVENT[camel(name) as keyof typeof EVENT], number, name);
  }
});

test("a mark's kind and state, the growth's rise and sink and a chest's life are the room's", () => {
  assert.deepEqual(MARK, room.marks);
  assert.deepEqual(GROWTH, room.growth);
  assert.deepEqual(STORE, room.store);
  assert.equal(MOTION.growthRiseS * 60, room.growthRiseTicks);
  assert.equal(MOTION.growthSinkS * 60, room.growthSinkTicks);
  assert.equal(CHEST_LIES_S * 60, room.dropTicks);
});
