import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { MARK_FLOATS } from '../combat/marks.ts';
import { ASKS, type GearAsk, type GearState } from '../network/gearMessages.ts';
import type { QuestState } from '../network/questMessages.ts';
import {
  GATHER_S,
  GATHER_STIR_M,
  LORE_REACH_M,
  NODE_REACH_M,
  POINT_REACH_M,
  STOCK_MOST,
  STORY_BEHIND_ON_FOOT,
  questRings,
  tellsPrologue,
  useAt,
} from './footGear.ts';
import { markedHere } from './overheadMarks.ts';
import { LORE_PICTURE } from './compendium/loreArt.ts';
import { QUESTS } from './quests/questBook.ts';
import { OPEN_AT } from './gearScreen.ts';
import { SERVED_M, countersOf } from './plazaLife.ts';
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

test('a counter whose keeper is away still opens, which calls her back to it, and her mark goes with her', () => {
  const LAMPLIGHTERS: StationInfo = { kind: 'lamplighters', keeper: [0, -2], counter: [0, 0] };
  const here = { stations: [LAMPLIGHTERS] };
  awayFromCounters.add('lamplighters');
  try {
    assert.equal(useAt(0, 0, here, null, () => undefined)?.words, 'Lamplighters', 'offered while she walks the plaza');
    assert.deepEqual(
      markedHere(null, here, () => 0),
      [],
      'no mark over her empty post',
    );
  } finally {
    awayFromCounters.delete('lamplighters');
  }
  assert.equal(markedHere(null, here, () => 0).length, 1, 'marked again once she is back');
});

test('a node is not offered on horseback, nor while its resource is full', () => {
  const ask = () => undefined;
  const near = 10 + NODE_REACH_M - 0.1;
  const gear = { ...lying, resources: [STOCK_MOST - 1] } as GearState;
  assert.ok(useAt(near, 0, {}, gear, ask)?.gather === 3);
  assert.equal(useAt(near, 0, {}, gear, ask, undefined, true), null, 'mounted');
  assert.equal(useAt(near, 0, {}, { ...gear, resources: [STOCK_MOST] }, ask), null, 'full');
});

test('the room is told the prologue was played once for each word on the gear that says it is not kept', () => {
  const unkept = { prologueDone: false } as unknown as GearState;
  const restored = { prologueDone: false } as unknown as GearState;
  assert.equal(tellsPrologue(unkept, true, null), true);
  assert.equal(tellsPrologue(unkept, true, unkept), false, 'told once for that word');
  assert.equal(tellsPrologue(restored, true, unkept), true, 'told again once the kept character comes');
  assert.equal(tellsPrologue({ prologueDone: true } as unknown as GearState, true, null), false);
  assert.equal(tellsPrologue(unkept, false, null), false, 'not played in this browser');
  assert.equal(tellsPrologue(null, true, null), false);
});

test('on foot the room is always told, so no character is kept out by a prologue that did not run', () => {
  // Every way onto foot comes after the story: played through, Begin at the title, a `?at=` link, or a story that
  // could not start or go on.
  const unkept = { prologueDone: false } as unknown as GearState;
  assert.equal(tellsPrologue(unkept, STORY_BEHIND_ON_FOOT, null), true);
});

test('the bounty board is used where a player stands before it, though no keeper stands there, and marked', () => {
  const ask = () => undefined;
  const here = countersOf({ stations: [WEAPONSMITH], board: [5, 0] });
  assert.equal(useAt(5.5, 0, here, null, ask)?.words, 'The Bounty Board: bounties for XP and Aurem');
  assert.equal(useAt(9, 0, here, null, ask), null, 'past its reach');
  const keepers = markedHere(null, { stations: [WEAPONSMITH] }, () => 0).length;
  assert.equal(markedHere(null, here, () => 0).length, keepers + 1, 'its mark beside the keepers');
  assert.deepEqual(countersOf({ stations: [WEAPONSMITH] }).stations, [WEAPONSMITH], 'no board in any other plaza');
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

test("Shape's offer is within a counter's reach of his week's spot, marked there, and gone with him", () => {
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
  assert.equal(
    markedHere(shape, here, () => 0).length,
    markedHere(null, here, () => 0).length + 1,
    'a mark of his own',
  );
});

/** The Stormcallers' road at its first task holding a goal of `kind`, with the varied fields `more`. */
function storm(kind: string, more: Partial<QuestState> = {}): QuestState {
  const quest = QUESTS.findIndex((each) => each.id === 'stormcallers');
  const task = QUESTS[quest]?.tasks.findIndex((each) => each.goals.some((goal) => goal.kind === kind)) ?? -1;
  assert.ok(task >= 0, `a ${kind} step on the Stormcallers' road`);
  return { quest: quest + 1, task, counts: [], done: [0, 0, 0, 0], choices: [0, 0, 0], at: null, ...more };
}

/** The name the offer to use the first point of the Stormcallers' first puzzle gives it. */
const firstPoint = (): string => {
  const quest = storm('puzzle');
  const goal = QUESTS[quest.quest - 1]?.tasks[quest.task]?.goals.find((each) => each.kind === 'puzzle');
  return (goal?.points?.[0]?.name ?? '').replace(/^The /, 'the ');
};

/** The colours of each vertex of `marks`, as `r g b` to two places. */
const coloursOf = (marks: readonly number[]) =>
  new Set(
    Array.from({ length: marks.length / MARK_FLOATS }, (_unused, vertex) =>
      marks
        .slice(vertex * MARK_FLOATS + 3, vertex * MARK_FLOATS + 6)
        .map((value) => value.toFixed(2))
        .join(' '),
    ),
  );

test("a puzzle's points stand ringed under beams, gold once lit; E uses an unlit one within reach, asking 66", () => {
  const points = [
    { x: 50, y: 0, lit: false },
    { x: 60, y: 0, lit: true },
  ];
  const rods = { ...lying, nodes: [], quest: storm('puzzle', { points }) } as GearState;
  const used: GearAsk[] = [];
  const near = useAt(50 + POINT_REACH_M - 0.1, 0, {}, rods, (each) => used.push(each));
  assert.equal(near?.words, `Use ${firstPoint()}`);
  near?.run();
  assert.deepEqual(used, [{ kind: ASKS.usePoint, column: 0 }]);
  assert.equal(
    useAt(60, 0.5, {}, rods, () => undefined),
    null,
    'lit, it is used no more',
  );
  const theirs = { ...rods, quest: { ...rods.quest!, claimed: false } } as GearState;
  assert.equal(
    useAt(50, 0, {}, theirs, () => undefined),
    null,
    "a room's starting character's rods",
  );
  assert.deepEqual(
    questRings(theirs, () => 0, 0),
    [],
    'nor ringed',
  );
  assert.equal(
    useAt(50 + POINT_REACH_M + 0.1, 0, {}, rods, () => undefined),
    null,
    'out of reach',
  );
  const one = questRings({ ...rods, quest: storm('puzzle', { points: [points[0]!] }) }, () => 0, 0);
  const both = questRings(rods, () => 0, 0);
  assert.ok(one.length > 0 && both.length === one.length * 2, 'each point its rings and beam');
  const lit = questRings({ ...rods, quest: storm('puzzle', { points: [points[1]!] }) }, () => 0, 0);
  assert.notDeepEqual(coloursOf(lit), coloursOf(one), 'lit, it glows another colour');
  assert.deepEqual(
    questRings({ ...rods, quest: storm('puzzle') }, () => 0, 0),
    [],
    'none here',
  );
});

test('a ward a quest defends by name is ringed under a beam where it stands', () => {
  const glass = {
    ...lying,
    nodes: [],
    quest: storm('defend', { ward: { x: 5, y: 5, health: 1 } }),
  } as GearState;
  const marks = questRings(glass, () => 2, 0);
  assert.ok(marks.length > 0);
  assert.ok(Math.abs((marks[2] ?? 0) - 2) < 0.1, 'on the floor');
  assert.deepEqual(
    questRings({ ...glass, quest: storm('defend') }, () => 2, 0),
    [],
    'not in this room',
  );
});

test('within reach of a chapter of the lore lying in the world, E asks the room to find it; it wears a book over it', () => {
  const asked: GearAsk[] = [];
  const gear = { ...lying, loreHere: [{ chapter: 7, at: [40, 0] as const }] } as unknown as GearState;
  const ask = (each: GearAsk) => asked.push(each);
  assert.equal(useAt(40 + LORE_REACH_M + 0.2, 0, { stations: [] }, gear, ask), null, 'out of reach');
  const read = useAt(40 + LORE_REACH_M - 0.1, 0, { stations: [] }, gear, ask);
  assert.match(read?.words ?? '', /^Read /);
  read?.run();
  assert.deepEqual(asked, [{ kind: ASKS.findLore, item: 7 }]);
  const mark = markedHere(gear, { stations: [] }, () => 2).find((each) => each.picture === LORE_PICTURE);
  assert.deepEqual(mark?.at.slice(0, 2), [40, 0], 'over where it lies');
  assert.ok((mark?.at[2] ?? 0) > 2.5 && (mark?.at[2] ?? 0) < 2 + 2, 'floating a little over the ground');
});
