import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { state } from '../network/gearForTests.ts';
import { ASKS, type GearAsk } from '../network/gearMessages.ts';
import {
  CHEST_REACH_M,
  ChestsSeen,
  FIND_HEIGHT_M,
  FootFinds,
  OPEN_S,
  OPENED_KEPT_S,
  SEARCH_REACH_M,
  SEARCH_S,
  findUse,
  holderName,
  offBox,
} from './finds.ts';
import { useAt } from './footGear.ts';

const CHEST = { number: 7, at: [10, 0, 2] as const, facing: Math.PI / 2 };
/** A wardrobe (41003) a metre across, its foot on the ground. */
const WARDROBE = { number: 9, box: [0, 20, 1, 21] as const, foot: 0, top: 1.8, model: 41003 };
const gear = state({ chests: [CHEST], searchables: [WARDROBE] });

test("the page's reach and holds are the room's", async () => {
  const read = (path: string) => readFile(new URL(`../../../${path}`, import.meta.url), 'utf8');
  const holds = await read('crates/room/src/find_holds.rs');
  const number = (name: string) => Number(new RegExp(`pub const ${name}: \\w+ = ([\\d.]+);`).exec(holds)?.[1]);
  assert.equal(number('CHEST_REACH'), CHEST_REACH_M);
  assert.equal(number('SEARCH_REACH'), SEARCH_REACH_M);
  assert.equal(number('FIND_HEIGHT'), FIND_HEIGHT_M);
  assert.equal(number('OPEN_TICKS') / 60, OPEN_S);
  assert.equal(number('SEARCH_TICKS') / 60, SEARCH_S);
});

test('E held by a chest within reach opens it by its number, a second', () => {
  const asked: GearAsk[] = [];
  const use = findUse([10 + CHEST_REACH_M - 0.1, 0, 2], gear, (each) => asked.push(each), false);
  assert.equal(use?.words, 'Hold to open the chest');
  assert.deepEqual(use?.held, { kind: 'find', index: 7, seconds: OPEN_S });
  use?.run();
  assert.deepEqual(asked, [{ kind: ASKS.openFind, item: 7 }]);
  assert.equal(
    findUse([10 + CHEST_REACH_M + 0.1, 0, 2], gear, () => undefined, false),
    null,
    'past its reach',
  );
  assert.equal(
    findUse([10, 0, 2 + FIND_HEIGHT_M + 0.5], gear, () => undefined, false),
    null,
    'a floor above',
  );
  assert.equal(
    findUse([10, 0, 2], gear, () => undefined, true),
    null,
    'none on horseback',
  );
  assert.equal(
    findUse([10, 0, 2], null, () => undefined, false),
    null,
    'no gear, no chest',
  );
});

test('E held beside a container searches it a second and a half, naming it by its kind', () => {
  const use = findUse([0.5, 20 - SEARCH_REACH_M + 0.1, 0], gear, () => undefined, false);
  assert.equal(use?.words, 'Hold to search the wardrobe');
  assert.deepEqual(use?.held, { kind: 'find', index: 9, seconds: SEARCH_S });
  assert.equal(
    findUse([0.5, 20 - SEARCH_REACH_M - 0.1, 0], gear, () => undefined, false),
    null,
    'past its side',
  );
  assert.equal(offBox([0, 0, 1, 1], 0.5, 0.5), 0, 'inside its box');
  assert.equal(offBox([0, 0, 1, 1], 4, 5), 5, 'from its nearest corner');
});

test('each container is named by its family, a container where the page knows none', () => {
  assert.deepEqual([41816, 41007, 41032, 41033, 41005, 41035, 41003, 43075, 43055, 1].map(holderName), [
    'crate',
    'cabinet',
    'cupboard',
    'dresser',
    'shelves',
    'shelves',
    'wardrobe',
    'sarcophagus',
    'tomb',
    'container',
  ]);
});

test('a chest within reach comes before a node, and a counter before a chest', () => {
  const both = state({ ...gear, nodes: [{ index: 2, x: 11, y: 0, resource: 0 }], resources: [0] });
  assert.equal(useAt(10.5, 0, {}, both, () => undefined, undefined, false, 2)?.words, 'Hold to open the chest');
  const counter = { kind: 'weaponsmith', keeper: [10, -2] as const, counter: [10, 0] as const };
  assert.match(useAt(10, 0, { stations: [counter] }, both, () => undefined)?.words ?? '', /^The Weaponsmith/);
});

test('a chest the player opened stays drawn open a while; one that moved on goes at once', () => {
  const seen = new ChestsSeen();
  const other = { number: 8, at: [50, 0, 0] as const, facing: 0 };
  const standing = state({ chests: [CHEST, other] });
  assert.deepEqual(
    seen.frame(standing, 0).drawn.map((each) => [each.number, each.opened]),
    [
      [7, null],
      [8, null],
    ],
  );
  seen.ask(7, 0.5);
  const opened = seen.frame(state({ chests: [] }), 1.5);
  assert.deepEqual(opened.justOpened, [7], 'the one asked of, opened');
  assert.deepEqual(
    opened.drawn.map((each) => [each.number, each.opened]),
    [[7, 0]],
    'the other moved on and is gone; the opened one stands open',
  );
  const later = seen.frame(state({ chests: [] }), 1.5 + OPENED_KEPT_S / 2);
  assert.deepEqual(later.justOpened, [], 'told once');
  assert.equal(later.drawn[0]?.opened, OPENED_KEPT_S / 2);
  assert.deepEqual(seen.frame(state({ chests: [] }), 2 + OPENED_KEPT_S).drawn, [], 'then gone');
});

test("a patrol's chests stand as the event chest and its lid, which swings back as one opens; a dungeon draws its own", () => {
  const finds = new FootFinds();
  const shut = finds.frame(gear, 0, false, true);
  assert.deepEqual(
    shut.props.map((prop) => prop.module),
    ['event-chest', 'event-chest-lid'],
  );
  assert.equal(shut.props[0]?.turn, CHEST.facing, 'turned the way its place faces');
  assert.equal(shut.props[1]?.lid, 0, 'shut');
  finds.asked({ kind: 'find', index: 7, seconds: OPEN_S });
  const opening = finds.frame(state({ chests: [] }), 0.2, false, true);
  assert.equal(opening.sounds.length, 0, 'quiet while paused');
  const swung = finds.frame(state({ chests: [] }), 0.8, false, false);
  assert.ok((swung.props[1]?.lid ?? 0) > 1, 'its lid thrown back');
  const below = new FootFinds();
  assert.deepEqual(below.frame(gear, 0, true, false).props, [], 'in a dungeon its view draws them');
  assert.equal(below.drawn.length, 1);
});

test('the lid of a chest just opened clunks where it stands', () => {
  const finds = new FootFinds();
  finds.frame(gear, 0, false, false);
  finds.asked({ kind: 'find', index: 7, seconds: OPEN_S });
  const opened = finds.frame(state({ chests: [] }), 0.1, false, false);
  assert.deepEqual(opened.sounds, [{ cue: 'ship.ready', at: CHEST.at }]);
  assert.deepEqual(finds.frame(state({ chests: [] }), 0.2, false, false).sounds, [], 'once');
});
