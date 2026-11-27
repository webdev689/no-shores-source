import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { state } from '../network/gearForTests.ts';
import { ASKS, type GearAsk, type GearState } from '../network/gearMessages.ts';
import {
  CHEST_REACH_M,
  ChestsSeen,
  chestsCounted,
  FIND_HEIGHT_M,
  FootFinds,
  OPEN_S,
  OPENED_KEPT_S,
  SEARCH_REACH_M,
  SEARCH_S,
  findMarks,
  findUse,
  holderName,
  offBox,
} from './finds.ts';
import { CHEST_PICTURE, SEARCH_PICTURE } from './overheadMarks.ts';

const CHEST = { number: 7, at: [10, 0, 2] as const, facing: Math.PI / 2, vault: false };
/** A wardrobe (41003) a metre across, its foot on the ground. */
const WARDROBE = { number: 9, box: [0, 20, 1, 21] as const, foot: 0, top: 1.8, model: 41003 };
const gear = state({ chests: [CHEST], searchables: [WARDROBE] });

test("the page's reach and holds are the room's", async () => {
  // Written by `cargo test -p room` (public/page_numbers_tests.rs).
  const written = await readFile(new URL('../../../target/protocol/room-numbers.json', import.meta.url), 'utf8');
  type Holds = 'chestReach' | 'searchReach' | 'findHeight' | 'openTicks' | 'searchTicks';
  const room = JSON.parse(written) as Record<Holds, number>;
  assert.equal(room.chestReach, CHEST_REACH_M);
  assert.equal(room.searchReach, SEARCH_REACH_M);
  assert.equal(room.findHeight, FIND_HEIGHT_M);
  assert.equal(room.openTicks / 60, OPEN_S);
  assert.equal(room.searchTicks / 60, SEARCH_S);
});

test('E held by a chest within reach opens it by its number, a second', () => {
  const asked: GearAsk[] = [];
  const use = findUse([10 + CHEST_REACH_M - 0.1, 0, 2], gear, (each) => asked.push(each), false);
  assert.equal(use?.words, 'Hold to open the chest');
  assert.deepEqual(use?.hold, { kind: 'find', index: 7, seconds: OPEN_S });
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
  assert.deepEqual(use?.hold, { kind: 'find', index: 9, seconds: SEARCH_S });
  assert.equal(
    findUse([0.5, 20 - SEARCH_REACH_M - 0.1, 0], gear, () => undefined, false),
    null,
    'past its side',
  );
  const above = { ...WARDROBE, number: 10, box: [0, 19.6, 1, 19.9] as const, foot: 3, top: 4.8 };
  const twoFloors = state({ chests: [], searchables: [above, WARDROBE] });
  assert.equal(
    findUse([0.5, 20 - SEARCH_REACH_M + 0.1, 0], twoFloors, () => undefined, false)?.hold?.index,
    9,
    'one on the floor above, nearer across, never hides one beside them',
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

test('a chest the room paid the player for stays drawn open a while; one that moved on goes at once', () => {
  const seen = new ChestsSeen();
  const other = { number: 8, at: [50, 0, 0] as const, facing: 0, vault: false };
  const standing = state({ chests: [CHEST, other] });
  assert.deepEqual(
    seen.frame(standing, 0).drawn.map((each) => [each.number, each.opened]),
    [
      [7, null],
      [8, null],
    ],
  );
  const opened = seen.frame(state({ chests: [], opened: 7 }), 1.5);
  assert.deepEqual(opened.justOpened, [7], 'the one the room names');
  assert.deepEqual(
    opened.drawn.map((each) => [each.number, each.opened]),
    [[7, 0]],
    'the other moved on and is gone; the opened one stands open',
  );
  const later = seen.frame(state({ chests: [], opened: 7 }), 1.5 + OPENED_KEPT_S / 2);
  assert.deepEqual(later.justOpened, [], 'told once');
  assert.equal(later.drawn[0]?.opened, OPENED_KEPT_S / 2);
  assert.deepEqual(seen.frame(state({ chests: [], opened: 7 }), 2 + OPENED_KEPT_S).drawn, [], 'then gone');
});

test('a chest that moves on just after an ask the room refused is not drawn opened', () => {
  const seen = new ChestsSeen();
  seen.frame(gear, 0);
  const moved = seen.frame(state({ chests: [{ ...CHEST, number: 11 }] }), 0.5);
  assert.deepEqual(moved.justOpened, []);
  assert.deepEqual(
    moved.drawn.map((each) => [each.number, each.opened]),
    [[11, null]],
  );
});

test("a patrol's chests stand as the event chest and its lid, which swings back as one opens; a dungeon draws its own", () => {
  const finds = new FootFinds();
  const shut = finds.frame(gear, 0, false, true);
  assert.deepEqual(
    shut.props.map((prop) => prop.module),
    ['chest', 'chest-lid'],
  );
  assert.equal(
    shut.props[0]?.turn,
    CHEST.facing + Math.PI,
    "its front, the module's +y, turned the way its place faces",
  );
  assert.equal(shut.props[1]?.lid, 0, 'shut');
  const opening = finds.frame(state({ chests: [], opened: 7 }), 0.2, false, true);
  assert.equal(opening.sounds.length, 0, 'quiet while paused');
  const swung = finds.frame(state({ chests: [], opened: 7 }), 0.8, false, false);
  assert.ok((swung.props[1]?.lid ?? 0) > 1, 'its lid thrown back');
  const below = new FootFinds();
  assert.deepEqual(below.frame(gear, 0, true, false).props, [], 'in a dungeon its view draws them');
  assert.equal(below.drawn.length, 1);
});

test('the lid of a chest just opened clunks where it stands', () => {
  const finds = new FootFinds();
  finds.frame(gear, 0, false, false);
  const opened = finds.frame(state({ chests: [], opened: 7 }), 0.1, false, false);
  assert.deepEqual(opened.sounds, [{ cue: 'ship.ready', at: CHEST.at }]);
  assert.deepEqual(finds.frame(state({ chests: [], opened: 7 }), 0.2, false, false).sounds, [], 'once');
});

test('each chest standing for the player wears a chest over its lid, and each container to search a glass over its top', () => {
  const gear = {
    chests: [{ number: 7, at: [10, 0, 2], facing: 0 }],
    searchables: [{ number: 9, box: [0, 20, 1, 22], foot: 0, top: 1.8, model: 41003 }],
  } as unknown as GearState;
  const marked = findMarks(gear);
  assert.equal(marked.length, 2);
  assert.equal(marked[0]?.picture, CHEST_PICTURE);
  assert.ok((marked[0]?.at[2] ?? 0) > 2.6 && marked[0]?.at[0] === 10, 'over the chest, standing on its own ground');
  assert.equal(marked[1]?.picture, SEARCH_PICTURE);
  assert.deepEqual(marked[1]?.at.slice(0, 2), [0.5, 21], "over its box's middle");
  assert.ok((marked[1]?.at[2] ?? 0) > 1.8, 'over its top');
  for (const picture of [CHEST_PICTURE, SEARCH_PICTURE]) {
    assert.ok(picture.rows.length === 12 && picture.rows.every((row) => row.length === 12), 'twelve by twelve');
    const letters = new Set(picture.rows.join('').replaceAll('.', ''));
    assert.ok(
      [...letters].every((letter) => 'abcde'.indexOf(letter) < picture.colours.length),
      'every cell coloured',
    );
  }
});

test("a dungeon's chests are counted as the player's opened of all it stands, and none elsewhere", () => {
  assert.equal(chestsCounted(state({ chestsOpened: 2, chestsTotal: 5 })), 'Chests 2 of 5');
  assert.equal(chestsCounted(state({ chestsOpened: 0, chestsTotal: 0 })), null, 'a patrol counts none');
  assert.equal(chestsCounted(null), null);
});
