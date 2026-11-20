import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { dungeonTrips, type TripFoot, type TripGame } from './dungeonTrips.ts';
import type { Happening } from './flow.ts';
import type { Difficulty } from '../heldmap/heldMap.ts';
import type { NodeInfo } from './worldData.ts';

const bytes = await readFile(
  new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url),
).catch(() => {
  throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
});
const module = WebAssembly.compile(bytes);
const patrol = { id: 'saltgrass-downs', name: 'The Saltgrass Downs', kind: 'patrol' } as NodeInfo;

/** A game whose trips are written down rather than taken, the player standing where `here` says and their company
 *  playing in `places`; a run's instance and minute pinned. */
function recorded(here: { foot: object | null }, places: readonly (string | null)[] = []) {
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
    ontoPatrol: async (onto, facing, seas, arriving) => {
      ways.push(['onto', onto.id, facing, seas, arriving]);
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
  const trips = dungeonTrips(game, { instance: () => 'k3j4h5g6', minute: () => 29_919_420 });
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
  assert.deepEqual(grotto.ways[1]?.slice(0, 4), ['onto', 'krakens-grotto', 0, 'abyss']);
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

test('a sea island’s dungeon is entered by its name and left back onto the island at its door', async () => {
  const back = { x: 1_250.5, y: -340.25, facing: Math.PI / 2 };
  const { trips, happenings, ways, settled } = recorded({ foot: null });
  trips.enterSeaDungeon('sea-dungeon-continent-4-caverns-0a1b2c3d--abyss', back);
  await settled();
  assert.deepEqual(ways[0]?.slice(2), [
    'sea-dungeon-continent-4-caverns-0a1b2c3d--abyss--run-k3j4h5g6',
    'The Caverns of the Sea',
    'abyss',
  ]);
  trips.leave();
  await settled();
  assert.deepEqual(ways[1], ['sea', back]);
  assert.deepEqual(
    happenings.map((happening) => happening.kind),
    ['enter', 'surface'],
  );
  const shared = recorded({ foot: null });
  shared.trips.enterSeaDungeon('sea-dungeon-continent-1-crypt-00000000', back);
  await shared.settled();
  assert.deepEqual(shared.ways[0]?.slice(2), [
    'sea-dungeon-continent-1-crypt-00000000',
    'The Crypt of the Sea',
    'normal',
  ]);
  const nowhere = recorded({ foot: null });
  nowhere.trips.enterSeaDungeon('sea-dungeon-continent-4-grotto-0a1b2c3d', back);
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
  sea.trips.enterSeaDungeon('sea-dungeon-continent-4-caverns-0a1b2c3d--abyss', back);
  await sea.settled();
  sea.trips.fell();
  await sea.settled();
  assert.deepEqual(sea.happenings[1], { kind: 'surface', name: 'The Caverns of the Sea', fell: true });
  assert.deepEqual(sea.ways[1], ['sea', back]);
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
