import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { dungeonTrips, type TripFoot, type TripGame } from './dungeonTrips.ts';
import type { Happening } from './flow.ts';
import type { Difficulty } from '../heldmap/heldMap.ts';
import type { NodeInfo } from './worldData.ts';
import { BEFORE_DOOR_M } from './entrances.ts';
import { activitiesAt } from './activities.ts';
import { WORLD_CLOCK, roomNow } from '../sky/worldClock.ts';
import type { AccountLink } from '../network/accounts.ts';
import { delveInstance } from '../../../server/roomNames.ts';
import { delveLaid } from './guild/delveRoom.ts';
import { keepGuild } from './guild/guildHeld.ts';
import { weekOf } from './guild/guildLaw.ts';
import { groundOf, outOfGate } from './guild/outpostHere.ts';

const bytes = await readFile(
  new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url),
).catch(() => {
  throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
});
const module = WebAssembly.compile(bytes);
const patrol = { id: 'saltgrass-downs', name: 'The Saltgrass Downs', kind: 'patrol' } as NodeInfo;

/** A game whose trips are written down rather than taken, the player standing where `here` says and their company
 *  playing in `places`; a run's instance and minute pinned unless `pinned` is false. */
function recorded(here: { foot: object | null }, places: readonly (string | null)[] = [], pinned = true) {
  const [happenings, ways, travels] = [[] as Happening[], [] as unknown[][], [] as Promise<void>[]];
  const shown: unknown[] = [];
  const game: TripGame = {
    foot: () => here.foot as TripFoot | null,
    travel: (happening, work) => {
      happenings.push(happening);
      travels.push(work());
    },
    module,
    intoDungeon: async (outside, dungeon, layout, seas) => {
      ways.push(['into', outside.text, dungeon.room, layout.name, seas]);
      here.foot = { ...here.foot, dungeon: { patrol: outside.node, ...dungeon, layout }, seas };
    },
    ontoPatrol: async (onto, facing, seas, arriving, guild) => {
      ways.push(['onto', onto.id, facing, seas, arriving, ...(guild === undefined ? [] : [guild])]);
    },
    ontoSea: async (back) => {
      ways.push(['sea', back]);
    },
    companyPlaces: async () => places,
    drawers: { props: null, show: (_layout, _outside, entrance) => void shown.push(entrance) },
  };
  const settled = async () => {
    await module;
    await new Promise((done) => setImmediate(done));
    await Promise.all(travels);
  };
  const trips = pinned
    ? dungeonTrips(game, { instance: () => 'k3j4h5g6', minute: () => 29_919_420 })
    : dungeonTrips(game);
  return { trips, happenings, ways, shown, settled };
}

const elite = (id: string, name: string) => ({ id, name, kind: 'dungeon' }) as NodeInfo;
const standing = (node: NodeInfo, seas: Difficulty) => ({
  node,
  text: 'the node file',
  dungeon: null,
  seas,
  held: { entrances: { entrances: [] } },
});

test('a trip into a dungeon and out again keeps the seas of the room the player stands in', async () => {
  const onPatrol = { node: patrol, text: 'the node file', dungeon: null, seas: 'abyss' as Difficulty };
  const { trips, happenings, ways, settled } = recorded({
    foot: { ...onPatrol, held: { entrances: { entrances: [] } } },
  });
  trips.enter(1, 'The Halls of the Saltgrass Downs');
  await settled();
  trips.leave();
  await settled();
  assert.deepEqual(ways, [
    [
      'into',
      'the node file',
      'node-saltgrass-downs--abyss--dungeon-1--run-k3j4h5g6',
      'The Halls of the Saltgrass Downs',
      'abyss',
    ],
    ['onto', 'saltgrass-downs', 0, 'abyss', undefined],
  ]);
  assert.deepEqual(
    happenings.map((happening) => happening.kind),
    ['enter', 'leave'],
  );
});

test('the veil stays until the dungeon is shown, its styles’ pieces come', async () => {
  const onPatrol = { node: patrol, text: '', dungeon: null, seas: 'normal' as Difficulty };
  const here = { foot: { ...onPatrol, held: { entrances: { entrances: [] } } } as object | null };
  let shown = () => undefined as void;
  const showing = new Promise<void>((done) => (shown = done));
  const travels: Promise<void>[] = [];
  const game: TripGame = {
    foot: () => here.foot as TripFoot | null,
    travel: (_happening, work) => travels.push(work()),
    module,
    intoDungeon: async () => undefined,
    ontoPatrol: async () => undefined,
    ontoSea: async () => undefined,
    companyPlaces: async () => [],
    drawers: { props: null, show: () => showing },
  };
  dungeonTrips(game).enter(0, 'The Crypt');
  await module;
  let finished = false;
  const travelled = Promise.all(travels).then(() => (finished = true));
  await new Promise((done) => setImmediate(done));
  assert.equal(finished, false, 'still behind the veil');
  shown();
  await travelled;
  assert.equal(finished, true);
});

test("a company member in a patrol's dungeon is joined in that dungeon, at their seas, named on the veil", async () => {
  const { trips, happenings, ways, settled } = recorded({ foot: null });
  trips.join(patrol, 'node-saltgrass-downs--elite--dungeon-2--run-m9n8b7v6');
  await settled();
  const name = 'The Caverns of the Saltgrass Downs';
  assert.deepEqual(happenings, [{ kind: 'join', node: 'saltgrass-downs--dungeon-2', name }]);
  assert.deepEqual(ways, [['into', '', 'node-saltgrass-downs--elite--dungeon-2--run-m9n8b7v6', name, 'elite']]);
});

test('a patrol’s dungeon at Abyss is a run of its own, or the company’s where it is in one', async () => {
  const alone = recorded({ foot: standing(patrol, 'abyss') });
  alone.trips.enter(1, 'The Halls of the Saltgrass Downs');
  await alone.settled();
  assert.deepEqual(alone.ways[0]?.slice(0, 3), [
    'into',
    'the node file',
    'node-saltgrass-downs--abyss--dungeon-1--run-k3j4h5g6',
  ]);
  const company = recorded({ foot: standing(patrol, 'abyss') }, [
    'node-saltgrass-downs--abyss--dungeon-1--run-m9n8b7v6',
  ]);
  company.trips.enter(1, 'The Halls of the Saltgrass Downs');
  await company.settled();
  assert.equal(company.ways[0]?.[2], 'node-saltgrass-downs--abyss--dungeon-1--run-m9n8b7v6');
  const shared = recorded({ foot: standing(patrol, 'normal') });
  shared.trips.enter(1, 'The Halls of the Saltgrass Downs');
  await shared.settled();
  assert.equal(shared.ways[0]?.[2], 'node-saltgrass-downs--dungeon-1', 'Normal stays shared');
});

test('an Elite Dungeon is entered from its node as its run, the week’s where it is, and left to its entrance', async () => {
  const grotto = recorded({ foot: standing(elite('krakens-grotto', 'Kraken’s Grotto'), 'abyss') });
  grotto.trips.enter(0, 'Kraken’s Grotto');
  await grotto.settled();
  assert.deepEqual(grotto.ways[0], [
    'into',
    'the node file',
    'node-krakens-grotto--run-k3j4h5g6',
    'Kraken’s Grotto',
    'normal',
  ]);
  grotto.trips.leave();
  await grotto.settled();
  assert.deepEqual(grotto.ways[1]?.slice(0, 4), ['onto', 'krakens-grotto', 0, 'normal'], 'at its run’s own seas');
  const warrens = recorded({ foot: standing(elite('saltworm-warrens', 'Saltworm Warrens'), 'abyss') });
  warrens.trips.enter(0, 'Saltworm Warrens');
  await warrens.settled();
  assert.deepEqual(warrens.ways[0]?.slice(2), [
    'node-saltworm-warrens--abyss--run-k3j4h5g6',
    'Saltworm Warrens',
    'abyss',
  ]);
  assert.deepEqual(warrens.happenings[0], {
    kind: 'enter',
    node: 'saltworm-warrens--dungeon',
    name: 'Saltworm Warrens, the Abyss Dungeon of the week',
  });
});

test("the week's Elite Dungeon is the week's by the rooms' clock, not a page clock that is wrong", async () => {
  const rules = await module;
  const minute = (moment: number) => Math.floor(moment / 60_000);
  // The rooms say it is a week (or more) later than the page thinks, so the week's Elite Dungeon differs.
  let weeks = 0;
  while (weeks < 20) {
    weeks++;
    WORLD_CLOCK.heard(WORLD_CLOCK.seconds() + 7 * 86_400);
    const [rooms, page] = [activitiesAt(rules, minute(roomNow())), activitiesAt(rules, minute(Date.now()))];
    if (rooms.weekElite.place !== page.weekElite.place) break;
  }
  const place = activitiesAt(rules, minute(roomNow())).weekElite.place;
  assert.notEqual(place, activitiesAt(rules, minute(Date.now())).weekElite.place, 'the two clocks disagree');
  const run = recorded({ foot: standing(elite(place, 'The Week’s'), 'elite') }, [], false);
  run.trips.enter(0, 'The Week’s');
  await run.settled();
  WORLD_CLOCK.heard(WORLD_CLOCK.seconds() - weeks * 7 * 86_400);
  assert.equal(run.ways[0]?.[4], 'elite', "entered as the rooms' week's Elite Dungeon");
});

test('a sea island’s dungeon is entered by its name and left back onto the island at its door', async () => {
  const back = { x: 1_250.5, y: -340.25, facing: Math.PI / 2 };
  const { trips, happenings, ways, settled } = recorded({ foot: null });
  trips.enterSeaDungeon({
    room: 'sea-dungeon-continent-4-caverns-0a1b2c3d--abyss',
    at: [back.x, back.y],
    facing: back.facing,
  });
  await settled();
  assert.deepEqual(ways[0]?.slice(2), [
    'sea-dungeon-continent-4-caverns-0a1b2c3d--abyss--run-k3j4h5g6',
    'The Caverns of the Sea',
    'abyss',
  ]);
  trips.leave();
  await settled();
  assert.deepEqual(ways[1], ['sea', { ...back, x: 1_252 }], 'out before the door, facing the way out');
  assert.deepEqual(
    happenings.map((happening) => happening.kind),
    ['enter', 'surface'],
  );
  const shared = recorded({ foot: null });
  shared.trips.enterSeaDungeon({
    room: 'sea-dungeon-continent-1-crypt-00000000',
    at: [back.x, back.y],
    facing: back.facing,
  });
  await shared.settled();
  assert.deepEqual(shared.ways[0]?.slice(2), [
    'sea-dungeon-continent-1-crypt-00000000',
    'The Crypt of the Sea',
    'normal',
  ]);
  const nowhere = recorded({ foot: null });
  nowhere.trips.enterSeaDungeon({
    room: 'sea-dungeon-continent-4-grotto-0a1b2c3d',
    at: [back.x, back.y],
    facing: back.facing,
  });
  await nowhere.settled();
  assert.deepEqual([nowhere.ways, nowhere.happenings], [[], []], 'no such style: no trip');
});

test('a company member is joined in the very room they are in', async () => {
  const { trips, happenings, ways, settled } = recorded({ foot: null });
  trips.join(patrol, 'node-saltgrass-downs--abyss--dungeon-2--run-m9n8b7v6');
  trips.join(elite('krakens-grotto', 'Kraken’s Grotto'), 'node-krakens-grotto--run-m9n8b7v6');
  await settled();
  assert.deepEqual(
    ways.map((way) => way.slice(2)),
    [
      ['node-saltgrass-downs--abyss--dungeon-2--run-m9n8b7v6', 'The Caverns of the Saltgrass Downs', 'abyss'],
      ['node-krakens-grotto--run-m9n8b7v6', 'Kraken’s Grotto', 'normal'],
    ],
  );
  assert.equal(happenings[0]?.kind, 'join');
});

test('a company that falls is taken out by the way it came in, the veil saying it fell', async () => {
  const { trips, happenings, ways, settled } = recorded({ foot: standing(patrol, 'abyss') });
  trips.enter(1, 'The Halls of the Saltgrass Downs');
  await settled();
  trips.fell();
  await settled();
  assert.deepEqual(
    happenings.map((happening) => happening.kind),
    ['enter', 'wiped'],
  );
  assert.deepEqual(ways[1]?.slice(0, 2), ['onto', 'saltgrass-downs']);
  const sea = recorded({ foot: null });
  const back = { x: 1, y: 2, facing: 0 };
  sea.trips.enterSeaDungeon({
    room: 'sea-dungeon-continent-4-caverns-0a1b2c3d--abyss',
    at: [back.x, back.y],
    facing: back.facing,
  });
  await sea.settled();
  sea.trips.fell();
  await sea.settled();
  assert.deepEqual(sea.happenings[1], { kind: 'surface', name: 'The Caverns of the Sea', fell: true });
  assert.deepEqual(sea.ways[1], ['sea', { x: 1, y: 0.5, facing: 0 }]);
});

test('a dungeon is shown with the entrance gone in by, so its exit door wears that door', async () => {
  const entrance = { x: 10, y: 20, ground: 3, yaw: 0.5, model: 4 };
  for (const node of [patrol, elite('krakens-grotto', 'Kraken’s Grotto')]) {
    const foot = { ...standing(node, 'normal'), held: { entrances: { entrances: [entrance, entrance] } } };
    const { trips, shown, settled } = recorded({ foot });
    trips.enter(1, node.name);
    await settled();
    assert.deepEqual(shown, [entrance], node.id);
  }
});

test('a company leaves an Elite Dungeon’s run together, at the run’s own seas, however each came in', async () => {
  const grotto = elite('krakens-grotto', 'Kraken’s Grotto');
  const entered = recorded({ foot: standing(grotto, 'elite') });
  entered.trips.enter(0, 'Kraken’s Grotto');
  await entered.settled();
  entered.trips.leave();
  const joined = recorded({ foot: null });
  joined.trips.join(grotto, 'node-krakens-grotto--run-k3j4h5g6');
  await joined.settled();
  joined.trips.leave();
  await Promise.all([entered.settled(), joined.settled()]);
  const outTo = (ways: unknown[][]) => ways.find((way) => way[0] === 'onto')?.slice(1, 4);
  assert.deepEqual(outTo(entered.ways), ['krakens-grotto', 0, 'normal']);
  assert.deepEqual(outTo(joined.ways), outTo(entered.ways));
});

test('out of a sea island’s dungeon a player stands before its door, facing the way out of it', async () => {
  const { trips, ways, settled } = recorded({ foot: null });
  trips.enterSeaDungeon({ room: 'sea-dungeon-continent-4-caverns-0a1b2c3d', at: [10, 20], facing: Math.PI / 2 });
  await settled();
  trips.leave();
  await settled();
  assert.deepEqual(ways[1], ['sea', { x: 10 + BEFORE_DOOR_M, y: 20, facing: Math.PI / 2 }], 'a door facing east');
});

test('a run Find a Company found is entered by its own name, and one of another dungeon is not', async () => {
  const grotto = recorded({ foot: standing(elite('krakens-grotto', 'Kraken’s Grotto'), 'normal') });
  grotto.trips.enter(0, 'Kraken’s Grotto', 'node-krakens-grotto--run-m9n8b7v6');
  await grotto.settled();
  assert.equal(grotto.ways[0]?.[2], 'node-krakens-grotto--run-m9n8b7v6');
  for (const run of ['node-pearl-tomb--run-m9n8b7v6', 'node-krakens-grotto--run-m9n8', 'node-krakens-grotto']) {
    const wrong = recorded({ foot: standing(elite('krakens-grotto', 'Kraken’s Grotto'), 'normal') });
    wrong.trips.enter(0, 'Kraken’s Grotto', run);
    await wrong.settled();
    assert.deepEqual(wrong.happenings, [], `not this entrance’s run: ${run}`);
  }
});

test('a run the Playlist starts is entered from the sea by its name and left back onto the sea, as a member joins it', async () => {
  const { trips, happenings, ways, settled } = recorded({ foot: null });
  const coral = elite('coral-halls', 'Coral Halls');
  trips.intoRun(coral, 'node-coral-halls--abyss--playlist-28--run-m9n8b7v6');
  trips.intoRun(coral, 'node-pearl-tomb--abyss--playlist-28--run-m9n8b7v6');
  await settled();
  assert.deepEqual(ways[0]?.slice(2), ['node-coral-halls--abyss--playlist-28--run-m9n8b7v6', 'Coral Halls', 'abyss']);
  assert.equal(ways.length, 1, 'a run of another dungeon goes nowhere');
  trips.fell();
  await settled();
  assert.deepEqual(ways[1], ['sea', undefined], 'back onto the sea where the ship lies');
  const joined = recorded({ foot: null });
  joined.trips.join(coral, 'node-coral-halls--elite--playlist-17--run-m9n8b7v6');
  await joined.settled();
  joined.trips.leave();
  await joined.settled();
  assert.deepEqual(joined.ways[1], ['sea', undefined]);
  assert.deepEqual(
    [...happenings, ...joined.happenings].map((happening) => happening.kind),
    ['enter', 'surface', 'join', 'surface'],
  );
});

test('the guild dungeon is entered from an outpost as its company’s run at a tier and left before the Delve Gate', async () => {
  const key = '0a1b2c3d4e5f60718293a4b5c6d7e8f9';
  const outpost = { id: 'tern-strand-outpost', name: 'Tern Strand', kind: 'outpost' } as NodeInfo;
  const gate = { x: 410.5, y: -220.25, facing: Math.PI };
  const { trips, happenings, ways, settled } = recorded({ foot: standing(outpost, 'normal') });
  trips.enterDelve(key, 1, gate);
  await settled();
  // The pinned minute's week, 2ag in base 36, before the rest of the instance.
  assert.deepEqual(ways[0]?.slice(2, 3), [`node-tern-strand-outpost--guild-${key}--elite--run-2ag4h5g6`]);
  assert.equal(ways[0]?.[4], 'elite');
  trips.leave();
  await settled();
  assert.deepEqual(
    ways[1],
    ['onto', outpost.id, Math.PI, 'normal', { number: 0, ...gate }, key],
    'out before the gate',
  );
  assert.deepEqual(
    happenings.map((happening) => happening.kind),
    ['enter', 'leave'],
  );
  const member = recorded({ foot: null }, [`node-tern-strand-outpost--guild-${key}--abyss--run-a1b2c3d4`]);
  member.trips.enterDelve(key, 2, gate);
  await member.settled();
  assert.deepEqual(member.ways, [], 'from nowhere on foot, no trip');
  const company = recorded({ foot: standing(outpost, 'normal') }, [
    `node-tern-strand-outpost--guild-${key}--abyss--run-a1b2c3d4`,
  ]);
  company.trips.enterDelve(key, 2, gate);
  await company.settled();
  assert.equal(
    company.ways[0]?.[2],
    `node-tern-strand-outpost--guild-${key}--abyss--run-a1b2c3d4`,
    'the company’s run',
  );
  const patrolled = recorded({ foot: standing(patrol, 'normal') });
  patrolled.trips.enterDelve(key, 0, gate);
  await patrolled.settled();
  assert.deepEqual(patrolled.ways, [], 'only from an outpost');
});

test("a companion joining a guild dungeon's run lays the run's own week and comes out before its gate", async () => {
  Object.assign(globalThis, { addEventListener: () => undefined });
  const key = '0a1b2c3d4e5f60718293a4b5c6d7e8f9';
  const outpost = { id: 'tern-strand-outpost', name: 'Tern Strand', kind: 'outpost', centre: [100, 200] };
  const node = { ...outpost, spawns: [[5, 5]] } as unknown as NodeInfo;
  const gate = { id: 2, kind: 'gate', tier: 1, building: 0, x: 6, y: 12, turn: 0, spent: 0, delivered: {} };
  const seen = { guild: key, name: 'Salt Kings', banner: '{}', site: node.id, plot: { structures: [gate], decor: [] } };
  const read: string[] = [];
  keepGuild({
    guild: () => Promise.resolve({ guild: null }),
    outpost: (room: string) => {
      read.push(room);
      return Promise.resolve({ outpost: seen });
    },
  } as unknown as AccountLink);
  const [asks, ways, travels] = [[] as unknown[], [] as unknown[][], [] as Promise<void>[]];
  const here = { foot: null as object | null };
  const game: TripGame = {
    foot: () => here.foot as TripFoot | null,
    travel: (_happening, work) => void travels.push(work()),
    module,
    intoDungeon: async (outside, dungeon, layout) => {
      asks.push(dungeon.ask);
      here.foot = { node: outside.node, dungeon: { patrol: outside.node, ...dungeon, layout } };
    },
    ontoPatrol: async (onto, facing, seas, arriving, guild) => void ways.push([onto.id, seas, arriving, guild]),
    ontoSea: async () => undefined,
    companyPlaces: async () => [],
    drawers: { props: null, show: () => undefined },
  };
  const trips = dungeonTrips(game);
  const lastWeek = weekOf(roomNow()) - 1;
  trips.join(node, `node-${node.id}--guild-${key}--elite--run-${delveInstance(lastWeek, 'abcdefgh')}`);
  await new Promise((done) => setImmediate(done));
  await Promise.all(travels);
  const { seed, style } = delveLaid(key, lastWeek);
  assert.deepEqual(asks, [{ seed, style, name: 'Tern Strand' }], 'laid as the room lays it, not this week');
  trips.leave();
  await new Promise((done) => setImmediate(done));
  await Promise.all(travels);
  const out = outOfGate(
    seen,
    groundOf(node, () => 0),
  );
  assert.ok(out);
  assert.deepEqual(ways, [[node.id, 'normal', { number: 0, ...out }, key]], "before the gate, in the guild's room");
  assert.deepEqual(read, [`node-${node.id}--guild-${key}`]);
});
