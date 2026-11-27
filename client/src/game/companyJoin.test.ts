import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Happening } from './flow.ts';
import { type JoinGame, type Opened, companyJoin } from './companyJoin.ts';
import type { NodeInfo } from './worldData.ts';

/** A node of `continent`, as the world lists it or, `laid`, as its landmass lays it with its spawns. */
const node = (id: string, continent: string, laid = false): NodeInfo => ({
  id,
  kind: 'patrol',
  name: id,
  continent,
  ring: [],
  spawns: laid ? [[1, 2]] : [],
  centre: [0, 0],
});

interface Land {
  readonly id: string;
  readonly nodes: readonly NodeInfo[];
}

/** A join from Saltmere, the world holding a patrol there and one on Cairnwatch, and a city there; what it does
 *  said in order, its travel's work run as the veil would run it. */
function joining(failing: string | null = null) {
  const said: string[] = [];
  const lands: Record<string, Land> = {
    saltmere: { id: 'saltmere', nodes: [node('saltgrass-downs', 'saltmere', true)] },
    cairnwatch: {
      id: 'cairnwatch',
      nodes: [node('frost-reach', 'cairnwatch', true), node('overlook-social', 'x', true)],
    },
  };
  let landmass = lands['saltmere'] as Land;
  let works: (() => Promise<void>)[] = [];
  const game: JoinGame<Land> = {
    landmass: () => landmass,
    world: {
      nodes: [node('saltgrass-downs', 'saltmere'), node('frost-reach', 'cairnwatch')],
      cities: [{ id: 'overlook', name: 'Overlook', continent: 'cairnwatch', centre: [0, 0], motif: '' }],
    },
    now: () => ({ free: true, fighting: false, fallen: false }),
    open: async (continent) => {
      if (continent !== landmass.id) said.push(`open ${continent}`);
      landmass = lands[continent] ?? landmass;
    },
    put: (land) => {
      said.push(`put ${land.id}`);
      landmass = land;
    },
    travel: (happening: Happening, work: () => Promise<void>) => {
      said.push(`${happening.kind} ${'name' in happening ? happening.name : ''}`);
      works.push(work);
    },
    goFoot: async (laid, seas) => {
      if (laid.id === failing) throw new Error('refused');
      said.push(`foot ${laid.id} ${laid.continent} ${laid.spawns.length} ${seas}`);
    },
    intoDungeon: (shown: NodeInfo, place: string, opened: Opened) => {
      said.push(`dungeon ${shown.id}`);
      works.push(opened(async (laid) => void said.push(`into ${laid.id} ${laid.spawns.length}`)));
    },
  };
  const run = async () => {
    const now = works;
    works = [];
    for (const work of now) await work().catch((error: unknown) => said.push(`failed ${String(error)}`));
  };
  return { join: companyJoin(game), said, run, landmass: () => landmass };
}

test('a member on foot on this landmass is joined there, at their seas, nothing opened', async () => {
  const { join, said, run } = joining();
  assert.equal(join('node-saltgrass-downs--elite'), null);
  await run();
  assert.deepEqual(said, ['join saltgrass-downs', 'foot saltgrass-downs saltmere 1 elite']);
});

test('a member on another landmass is joined there, opened behind the veil, on its node as laid', async () => {
  const { join, said, run, landmass } = joining();
  assert.equal(join('node-frost-reach'), null);
  await run();
  assert.deepEqual(said, ['join frost-reach', 'open cairnwatch', 'foot frost-reach cairnwatch 1 normal']);
  assert.equal(landmass().id, 'cairnwatch');
  const city = joining();
  assert.equal(city.join('node-overlook-social'), null, "in another landmass's social space too");
  await city.run();
  assert.deepEqual(city.said, ['join Overlook', 'open cairnwatch', 'foot overlook-social x 1 normal']);
});

test("a member in another landmass's dungeon is joined in it, out of it onto its landmass as laid", async () => {
  const { join, said, run } = joining();
  assert.equal(join('node-frost-reach--elite--dungeon-1--run-m9n8b7v6'), null);
  await run();
  assert.deepEqual(said, ['dungeon frost-reach', 'open cairnwatch', 'into frost-reach 1']);
});

test('a join failing on another landmass puts back the one left; at sea or no landmass, it is said', async () => {
  const { join, said, run, landmass } = joining('frost-reach');
  join('node-frost-reach');
  await run();
  assert.deepEqual(said, ['join frost-reach', 'open cairnwatch', 'put saltmere', 'failed Error: refused']);
  assert.equal(landmass().id, 'saltmere');
  assert.equal(join('sea'), 'They are at sea: meet them where they land.');
  assert.equal(join('sea-dungeon-cairnwatch-caverns-12'), 'They are across the sea.');
});
