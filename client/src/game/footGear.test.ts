import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MARK_FLOATS } from '../combat/marks.ts';
import { ASKS, type GearAsk, type GearState } from '../network/gearMessages.ts';
import type { QuestState } from '../network/questMessages.ts';
import { NODE_REACH_M, POINT_REACH_M, groundRings, useAt } from './footGear.ts';
import { QUESTS } from './quests/questBook.ts';
import { OPEN_AT } from './gearScreen.ts';
import { SERVED_M } from './plazaLife.ts';
import { awayFromCounters } from './townsfolk.ts';
import type { StationInfo } from './nodes.ts';

const WEAPONSMITH: StationInfo = { kind: 'weaponsmith', keeper: [0, -2], counter: [0, 0] };
const CHANDLER: StationInfo = { kind: 'chandler', keeper: [20, -2], counter: [20, 0] };
const lying = {
  nodes: [{ index: 3, x: 10, y: 0, resource: 0 }],
  drops: [{ id: 1, rarity: 3, slot: 0, at: [5, 5, 1] }],
} as unknown as GearState;

test('E at a counter opens its tab, and near a node asks the room to gather it', () => {
  const asked: GearAsk[] = [];
  const ask = (each: GearAsk) => asked.push(each);
  assert.match(useAt(0.5, 0.5, { stations: [WEAPONSMITH] }, lying, ask)?.words ?? '', /^The Weaponsmith/);
  const gather = useAt(10 + NODE_REACH_M - 0.1, 0, { stations: [WEAPONSMITH] }, lying, ask);
  assert.match(gather?.words ?? '', /^Gather /);
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
    assert.equal(groundRings(null, here, () => 0, 0).length > 0, true, 'and ringed');
  } finally {
    awayFromCounters.delete('lamplighters');
  }
});

test('the ground rings each dealing counter, and each node twice under a beam, on the floor; a drop is no ring', () => {
  const one = groundRings(null, { stations: [WEAPONSMITH] }, () => 0, 0).length;
  assert.equal(one % MARK_FLOATS, 0);
  assert.equal(
    groundRings(null, { stations: [WEAPONSMITH, CHANDLER] }, () => 0, 0).length,
    one,
    'the chandler deals with no one',
  );
  const all = groundRings(lying, { stations: [WEAPONSMITH] }, () => 2, 0);
  // A beam is two crossed planes of two triangles each.
  assert.equal(all.length, one * 3 + 12 * MARK_FLOATS);
  assert.ok(Math.abs((all[one + 2] ?? 0) - 2) < 0.1, "a node's ring stands on the floor's height, just over it");
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
  const counter = groundRings(null, here, () => 0, 0).length;
  assert.equal(groundRings(shape, here, () => 0, 0).length, counter * 2, 'a ring of his own');
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
    groundRings(theirs, {}, () => 0, 0),
    [],
    'nor ringed',
  );
  assert.equal(
    useAt(50 + POINT_REACH_M + 0.1, 0, {}, rods, () => undefined),
    null,
    'out of reach',
  );
  const one = groundRings({ ...rods, quest: storm('puzzle', { points: [points[0]!] }) }, {}, () => 0, 0);
  const both = groundRings(rods, {}, () => 0, 0);
  assert.ok(one.length > 0 && both.length === one.length * 2, 'each point its rings and beam');
  const lit = groundRings({ ...rods, quest: storm('puzzle', { points: [points[1]!] }) }, {}, () => 0, 0);
  assert.notDeepEqual(coloursOf(lit), coloursOf(one), 'lit, it glows another colour');
  assert.deepEqual(
    groundRings({ ...rods, quest: storm('puzzle') }, {}, () => 0, 0),
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
  const marks = groundRings(glass, {}, () => 2, 0);
  assert.ok(marks.length > 0);
  assert.ok(Math.abs((marks[2] ?? 0) - 2) < 0.1, 'on the floor');
  assert.deepEqual(
    groundRings({ ...glass, quest: storm('defend') }, {}, () => 2, 0),
    [],
    'not in this room',
  );
});
