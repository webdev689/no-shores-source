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

/** A game whose trips are written down rather than taken, the player standing where `here` says. */
function recorded(here: { foot: object | null }) {
  const [happenings, ways, travels] = [[] as Happening[], [] as unknown[][], [] as Promise<void>[]];
  const game: TripGame = {
    foot: () => here.foot as TripFoot | null,
    travel: (happening, work) => {
      happenings.push(happening);
      travels.push(work());
    },
    module,
    intoDungeon: async (into, number, layout, seas) => {
      ways.push(['into', into.text, number, layout.name, seas]);
      here.foot = { dungeon: { patrol: into.node, number, layout }, seas };
    },
    ontoPatrol: async (onto, facing, seas, arriving) => {
      ways.push(['onto', onto.id, facing, seas, arriving]);
    },
    drawers: { props: null, show: () => undefined },
  };
  const settled = async () => {
    await module;
    await new Promise((done) => setImmediate(done));
    await Promise.all(travels);
  };
  return { trips: dungeonTrips(game), happenings, ways, settled };
}

test('a trip into a dungeon and out again keeps the seas of the room the player stands in', async () => {
  const onPatrol = { node: patrol, text: 'the node file', dungeon: null, seas: 'storm' as Difficulty };
  const { trips, happenings, ways, settled } = recorded({
    foot: { ...onPatrol, held: { entrances: { entrances: [] } } },
  });
  trips.enter(1, 'The Halls of the Saltgrass Downs');
  await settled();
  trips.leave();
  await settled();
  assert.deepEqual(ways, [
    ['into', 'the node file', 1, 'The Halls of the Saltgrass Downs', 'storm'],
    ['onto', 'saltgrass-downs', 0, 'storm', undefined],
  ]);
  assert.deepEqual(
    happenings.map((happening) => happening.kind),
    ['enter', 'leave'],
  );
});

test("a company member in a patrol's dungeon is joined in that dungeon, at their seas, named on the veil", async () => {
  const { trips, happenings, ways, settled } = recorded({ foot: null });
  trips.join(patrol, 2, 'rough');
  await settled();
  const name = 'The Caverns of the Saltgrass Downs';
  assert.deepEqual(happenings, [{ kind: 'join', node: 'saltgrass-downs--dungeon-2', name }]);
  assert.deepEqual(ways, [['into', '', 2, name, 'rough']]);
});
