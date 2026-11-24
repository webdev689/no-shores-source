import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { QuestState } from '../../network/questMessages.ts';
import type { NodeInfo } from '../worldData.ts';
import { QUESTS } from './questBook.ts';
import { type Chart, LEGS, type Standing, guideOf } from './waypoint.ts';

/** The room's word on a character at the task `task` of the quest `quest`, its goals' counts `counts`. */
function onTask(quest: string, task: string, counts: readonly number[] = []): QuestState {
  const number = QUESTS.findIndex((line) => line.id === quest);
  const index = QUESTS[number]?.tasks.findIndex((each) => each.id === task) ?? -1;
  assert.ok(number >= 0 && index >= 0, `${quest} ${task} in the file`);
  return { quest: number + 1, task: index, counts, done: [], choices: [], at: null };
}

const node = (parts: Partial<NodeInfo> & Pick<NodeInfo, 'id' | 'kind' | 'name'>): NodeInfo => ({
  continent: 'continent-1',
  ring: [],
  spawns: [[0, 0]],
  centre: [0, 0],
  ...parts,
});

const OVERLOOK = node({
  id: 'overlook-social',
  kind: 'social',
  name: 'Overlook',
  spawns: [[1000, 0]],
  stations: [
    { kind: 'weaponsmith', keeper: [1010, 5], counter: [1010, 4] },
    { kind: 'stormcallers', keeper: [1040, 5], counter: [1040, 4] },
  ],
});
const SALTGRASS = node({
  id: 'saltgrass-downs',
  kind: 'patrol',
  name: 'Saltgrass Downs',
  spawns: [[5000, 0]],
  places: [{ name: 'Saltgrass', at: [5200, 300], radius: 40 }],
  resources: [{ at: [5100, 100] }, { at: [5900, 900] }],
});
const GULLWING = node({ id: 'gullwing-vale', kind: 'patrol', name: 'Gullwing Vale', spawns: [[-8000, 0]] });
const MAW = node({ id: 'maw-shallows', kind: 'boss', name: 'The Maw of the Shallows', spawns: [[-8100, 50]] });
const MILL = node({ id: 'burned-mill', kind: 'mission', name: 'The Burned Mill', spawns: [[5600, 900]] });
const CHART: Chart = {
  nodes: [OVERLOOK, SALTGRASS, GULLWING, MAW, MILL],
  layouts: [
    {
      id: 'gullwing-vale',
      areas: [{ kind: 'gate', name: '', at: [-8300, 400], radius: 40, leads_to: 'maw-shallows' }],
    },
    {
      id: 'burned-mill',
      areas: [{ kind: 'gate', name: '', at: [5550, 880], radius: 40, leads_to: 'saltgrass-downs' }],
    },
  ],
};

/** The guide's point and its steps' words, as the compass and the tracker show them. */
const guide = (...args: Parameters<typeof guideOf>) => {
  const { at, notes } = guideOf(...args);
  return { at, notes };
};

const land = (zone: NodeInfo, feet: readonly [number, number], more: Partial<Extract<Standing, { on: 'land' }>> = {}) =>
  ({ on: 'land', node: zone, at: feet, marked: null, foes: [], ...more }) as const;
const sea = (ship: readonly [number, number], more: Partial<Extract<Standing, { on: 'sea' }>> = {}) =>
  ({ on: 'sea', at: ship, isles: [], hostiles: [], ...more }) as const;

test('a tail points at its start in its zone, the room’s mark once it walks, its landing from the sea and from Overlook', () => {
  const tail = onTask('veiled', 'tail-collector');
  assert.deepEqual(guide(tail, land(SALTGRASS, [5000, 0]), CHART), { at: [5200, 300], notes: [null] });
  assert.deepEqual(guide(tail, land(SALTGRASS, [5000, 0], { marked: [5300, 320] }), CHART).at, [5300, 320]);
  assert.deepEqual(guide(tail, sea([0, -2000]), CHART), { at: [5000, 0], notes: [LEGS.sail('Saltgrass Downs')] });
  assert.deepEqual(guide(tail, land(OVERLOOK, [1000, 0]), CHART), { at: [5000, 0], notes: [LEGS.ship] });
});

test('a keeper is pointed at at their counter in the social space, and the space’s landing from away', () => {
  const smiths = onTask('house', 'find-your-way');
  assert.deepEqual(guide(smiths, land(OVERLOOK, [1000, 0]), CHART).at, [1010, 4]);
  assert.deepEqual(guide(smiths, sea([0, 0]), CHART).at, [1000, 0]);
  const pledge = onTask('house', 'choose-house');
  assert.deepEqual(guide(pledge, land(OVERLOOK, [1000, 0]), CHART).at, [1040, 4], 'any chapel');
  const stranger = onTask('house', 'hear-the-stranger');
  assert.deepEqual(guide(stranger, land(OVERLOOK, [1000, 0]), CHART), { at: null, notes: [LEGS.here] });
});

test('a goal in a zone through a gate points at the gate in its patrol, and the patrol’s landing from the sea', () => {
  const maw = onTask('stormcallers', 'face-high-assessor');
  assert.deepEqual(guide(maw, land(GULLWING, [-8000, 0]), CHART), {
    at: [-8300, 400],
    notes: [LEGS.gate('The Maw of the Shallows'), LEGS.anywhere],
  });
  assert.deepEqual(guide(maw, sea([-6000, 0]), CHART).at, [-8000, 0]);
  const inside = { foes: [{ name: 'High Assessor Corvane', rank: 5, at: [-8150, 60] as const }] };
  assert.deepEqual(guide(onTask('stormcallers', 'face-high-assessor', [1]), land(MAW, [-8100, 0], inside), CHART), {
    at: [-8150, 60],
    notes: [null, LEGS.anywhere, null],
  });
});

test('a goal done at sea points at the nearest of its kind in sight, and says to search where none is', () => {
  const ship = onTask('stormcallers', 'catch-tithe-sea');
  const hostiles = [
    { faction: 1, at: [300, 0] as const },
    { faction: 1, at: [900, 0] as const },
  ];
  assert.deepEqual(guide(ship, sea([0, 0], { hostiles }), CHART).at, [300, 0]);
  assert.deepEqual(guide(ship, sea([0, 0]), CHART), { at: null, notes: [LEGS.search] });
  assert.deepEqual(guide(ship, land(OVERLOOK, [1000, 0]), CHART), { at: null, notes: [LEGS.ship] });
  const isle = onTask('stormcallers', 'search-hoard-isle');
  const isles = [
    { kind: 'cove', at: [100, 0] as const },
    { kind: 'ruin', at: [400, 0] as const },
  ];
  assert.deepEqual(guide(isle, sea([0, 0], { isles }), CHART).at, [400, 0], 'an isle, not a cove');
});

test('a goal done anywhere says so and leaves the compass to the next, and gathering points at the nearest materials', () => {
  const storm = onTask('stormcallers', 'take-back-storm', [1, 5]);
  const gathered = guide(storm, land(SALTGRASS, [5000, 0]), CHART);
  assert.deepEqual(gathered.at, [5100, 100], 'the nearest Brineglass');
  const cast = QUESTS.flatMap((quest) => quest.tasks.map((task) => ({ quest, task }))).find(({ task }) =>
    task.goals.some((goal) => goal.kind === 'cast'),
  );
  assert.ok(cast);
  const casting = guide(onTask(cast.quest.id, cast.task.id), land(SALTGRASS, [5000, 0]), CHART);
  const index = cast.task.goals.findIndex((goal) => goal.kind === 'cast');
  assert.equal(casting.notes[index], LEGS.anywhere);
});

test('in an instance reached through a gate, the way back is that gate to the zone the goal is in', () => {
  const tail = onTask('veiled', 'tail-collector');
  assert.deepEqual(guide(tail, land(MILL, [5600, 900]), CHART), {
    at: [5550, 880],
    notes: [LEGS.gate('Saltgrass Downs')],
  });
});

test('inside a dungeon only what stands in it is pointed at, the rest waiting until the player is out', () => {
  const tail = onTask('veiled', 'tail-collector');
  assert.deepEqual(guide(tail, land(SALTGRASS, [100, 100], { inside: true }), CHART), { at: null, notes: [null] });
  const inside = { inside: true, foes: [{ name: 'High Assessor Corvane', rank: 5, at: [12, 30] as const }] };
  const boss = onTask('stormcallers', 'face-high-assessor', [1]);
  assert.deepEqual(guide(boss, land(MAW, [10, 10], inside), CHART).at, [12, 30]);
});

test('gathering points at the materials of the zone the player stands in before another patrol’s', () => {
  const storm = onTask('stormcallers', 'take-back-storm', [1, 5]);
  assert.deepEqual(guide(storm, land(SALTGRASS, [5900, 1000]), CHART).at, [5900, 900]);
});

test('on a sea’s island: its wrecks not yet searched, its leader if it is of the goal’s kind, else back to the ship', () => {
  const wrecks = [
    [100, 0],
    [300, 0],
  ] as const;
  const isle = (kind: string) =>
    node({ id: 'isle-1-00000000000000ff', kind: 'patrol', name: 'An isle', isle: kind, wrecks });
  const search = onTask('stormcallers', 'search-hoard-isle', [1]);
  assert.deepEqual(guide(search, land(isle('ruin'), [0, 0]), CHART).at, [100, 0]);
  assert.deepEqual(guide(search, land(isle('ruin'), [0, 0], { spent: [0] }), CHART).at, [300, 0], 'one searched');
  assert.deepEqual(guide(search, land(isle('ruin'), [0, 0], { spent: [0, 1] }), CHART), {
    at: null,
    notes: [null, LEGS.ship],
  });
  const leader = onTask('veiled', 'reckoner-isle', [1]);
  const reeve = { foes: [{ name: 'Reeve', rank: 3, at: [50, 50] as const }] };
  assert.deepEqual(guide(leader, land(isle('ruin'), [0, 0], reeve), CHART).at, [50, 50]);
  assert.deepEqual(guide(leader, land(isle('cove'), [0, 0], reeve), CHART), { at: null, notes: [null, LEGS.ship] });
  const ship = onTask('stormcallers', 'catch-tithe-sea');
  assert.deepEqual(guide(ship, land(isle('ruin'), [0, 0]), CHART), { at: null, notes: [LEGS.ship] });
});

test('a keeper or materials are never sought in a zone locked to the player', () => {
  const locked = node({ id: 'sunspire-social', kind: 'social', name: 'Sunspire', spawns: [[0, 50]], locked: true });
  const chart = { ...CHART, nodes: [...CHART.nodes, locked] };
  assert.deepEqual(guide(onTask('house', 'find-your-way'), sea([0, 0]), chart).at, [1000, 0], 'Overlook, not Sunspire');
});
