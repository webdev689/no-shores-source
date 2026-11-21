import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { MARK_FLOATS } from '../combat/marks.ts';
import { ASKS, type GearAsk, type GearState } from '../network/gearMessages.ts';
import { GATHER_S, GATHER_STIR_M, NODE_REACH_M, STOCK_MOST, groundRings, useAt } from './footGear.ts';
import { OPEN_AT } from './gearScreen.ts';
import { SERVED_M } from './plazaLife.ts';
import { awayFromCounters } from './townsfolk.ts';
import type { StationInfo } from './nodes.ts';

const WEAPONSMITH: StationInfo = { kind: 'weaponsmith', keeper: [0, -2], counter: [0, 0] };
const CHANDLER: StationInfo = { kind: 'chandler', keeper: [20, -2], counter: [20, 0] };
const lying = {
  nodes: [{ index: 3, x: 10, y: 0, resource: 0 }],
  resources: [0],
  drops: [{ id: 1, rarity: 3, slot: 0, at: [5, 5, 1] }],
} as unknown as GearState;

test('E at a counter opens its tab, and near a node asks the room to gather it', () => {
  const asked: GearAsk[] = [];
  const ask = (each: GearAsk) => asked.push(each);
  assert.match(useAt(0.5, 0.5, { stations: [WEAPONSMITH] }, lying, ask)?.words ?? '', /^The Weaponsmith/);
  const gather = useAt(10 + NODE_REACH_M - 0.1, 0, { stations: [WEAPONSMITH] }, lying, ask);
  assert.match(gather?.words ?? '', /^Hold to gather /);
  assert.equal(gather?.gather, 3, 'held there, it gathers that node');
  gather?.run();
  assert.deepEqual(asked, [{ kind: ASKS.gather, node: 3 }]);
  assert.equal(
    useAt(10 + NODE_REACH_M + 0.1, 0, { stations: [WEAPONSMITH] }, lying, ask),
    null,
    "out of the room's reach",
  );
  assert.equal(
    useAt(20, 0, { stations: [CHANDLER] }, null, ask),
    null,
    'a station that deals with no one offers nothing',
  );
});

test('a counter whose keeper is away still opens, which calls her back to it', () => {
  const LAMPLIGHTERS: StationInfo = { kind: 'lamplighters', keeper: [0, -2], counter: [0, 0] };
  const here = { stations: [LAMPLIGHTERS] };
  awayFromCounters.add('lamplighters');
  try {
    assert.equal(useAt(0, 0, here, null, () => undefined)?.words, 'Lamplighters', 'offered while she walks the plaza');
    assert.equal(groundRings(null, here, () => 0).length > 0, true, 'and ringed');
  } finally {
    awayFromCounters.delete('lamplighters');
  }
});

test('the ground rings each dealing counter on the floor; a node or a drop is no ring', () => {
  const one = groundRings(null, { stations: [WEAPONSMITH] }, () => 0).length;
  assert.equal(one % MARK_FLOATS, 0);
  assert.equal(
    groundRings(null, { stations: [WEAPONSMITH, CHANDLER] }, () => 0).length,
    one,
    'the chandler deals with no one',
  );
  assert.equal(groundRings(lying, { stations: [WEAPONSMITH] }, () => 2).length, one, 'the forge draws the nodes');
});

test('a node is not offered on horseback, nor while its resource is full', () => {
  const ask = () => undefined;
  const near = 10 + NODE_REACH_M - 0.1;
  const gear = { ...lying, resources: [STOCK_MOST - 1] } as GearState;
  assert.ok(useAt(near, 0, {}, gear, ask)?.gather === 3);
  assert.equal(useAt(near, 0, {}, gear, ask, true), null, 'mounted');
  assert.equal(useAt(near, 0, {}, { ...gear, resources: [STOCK_MOST] }, ask), null, 'full');
});

test("the page's reach, hold and stock are the room's", async () => {
  const read = (path: string) => readFile(new URL(`../../../${path}`, import.meta.url), 'utf8');
  const [asks, character] = await Promise.all([read('crates/room/src/asks.rs'), read('crates/gear/src/character.rs')]);
  const number = (text: string, name: string) =>
    Number(new RegExp(`pub const ${name}: \\w+ = ([\\d.]+);`).exec(text)?.[1]);
  assert.equal(number(asks, 'NODE_REACH'), NODE_REACH_M);
  assert.equal(number(asks, 'GATHER_TICKS') / 60, GATHER_S);
  assert.equal(number(asks, 'GATHER_STIR_M'), GATHER_STIR_M);
  assert.equal(number(character, 'STOCK_MOST'), STOCK_MOST);
});

test("Shape's offer is within a counter's reach of his week's spot, ringed there, and gone with him", () => {
  const visitorSpots = [
    [40, 40],
    [60, 0],
  ] as const;
  const here = { stations: [WEAPONSMITH], visitorSpots };
  const shape = { ...lying, nodes: [], shape: { place: 1, wares: [] } } as GearState;
  const opened: { type: string; detail: unknown }[] = [];
  // The page's event, as the menu hears it, without a page.
  Object.assign(globalThis, {
    CustomEvent: function (this: { type: string; detail: unknown }, type: string, told: { detail: unknown }) {
      Object.assign(this, { type, detail: told.detail });
    },
    dispatchEvent: (event: { type: string; detail: unknown }) => opened.push({ ...event }),
  });
  const offer = useAt(60 + SERVED_M - 0.1, 0, here, shape, () => undefined);
  assert.equal(offer?.words, 'Shape', 'his title, as a counter shows its keeper’s');
  offer?.run();
  assert.deepEqual(opened, [{ type: OPEN_AT, detail: { view: 'shape' } }]);
  assert.equal(
    useAt(60 + SERVED_M + 0.1, 0, here, shape, () => undefined),
    null,
    'out of his reach',
  );
  assert.equal(
    useAt(60, 0, here, { ...shape, shape: null }, () => undefined),
    null,
    'he has left',
  );
  const counter = groundRings(null, here, () => 0).length;
  assert.equal(groundRings(shape, here, () => 0).length, counter * 2, 'a ring of his own');
});
