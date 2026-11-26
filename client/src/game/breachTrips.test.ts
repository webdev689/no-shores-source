import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { inOpenWorld, moduleNumber, ofRun } from '../city/modules.ts';
import { ASKS, type GearAsk, type GearState } from '../network/gearMessages.ts';
import type { Happening } from './flow.ts';
import { arrivalQuery } from './footPlace.ts';
import { breachPlanOf } from './breachPlan.ts';
import { GATE_SHUT, INTO_BREACH, OUT_OF_REACH, breachTrips, gateArrival, runOf } from './breachTrips.ts';
import type { InBreach } from './breachView.ts';
import type { NodeInfo } from './worldData.ts';

const bytes = await readFile(
  new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url),
).catch(() => {
  throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
});
const module = new WebAssembly.Module(bytes);
const plan = breachPlanOf(module);
const zone = {
  ...{ id: 'gullwing-vale', kind: 'patrol', name: 'Gullwing Vale', continent: 'continent-1' },
  ...{ ring: [], spawns: [[5, 6]], centre: [0, 0] },
} as NodeInfo;
const RUN = 'node-gullwing-vale--breach-hard--run-k3j4h5g6';

/** The trips with the player on foot as `foot` says, every trip and ask kept, and the gate's answer as `answer` (none
 *  ever, for null). */
function tripsOn(foot: { node: NodeInfo; run: InBreach | null }, answer: number | null) {
  const [went, asked, told] = [[] as string[], [] as GearAsk[], [] as string[]];
  let gear = { answered: 3, answer: 0 } as GearState;
  const gearOf = (state: () => GearState) => ({
    get gear() {
      return state();
    },
    ask: (ask: GearAsk) => {
      asked.push(ask);
      if (answer !== null) gear = { ...gear, answered: gear.answered + 1, answer };
    },
  });
  let standing = { ...foot, gear: gearOf(() => gear) };
  /** The player moved on to another room, whose word on their gear has answered something else. */
  const movedOn = () => (standing = { ...foot, gear: gearOf(() => ({ ...gear, answered: 99, answer: 0 })) });
  const trips = breachTrips({
    foot: () => standing,
    travel: (happening: Happening, work: () => Promise<void>) => {
      went.push(`${happening.kind} ${'name' in happening ? happening.name : ''}`);
      void work();
    },
    module: Promise.resolve(module),
    nodes: [zone],
    ontoPatrol: async (patrol, _facing, _seas, arriving) =>
      void went.push(`onto ${patrol.id}${arrivalQuery(arriving!)}`),
    intoBreach: async (into) => void went.push(`into ${into.run}`),
    tell: (words) => void told.push(words),
    wait: () => Promise.resolve(),
  });
  return { trips, went, asked, told, movedOn };
}
const settle = () => new Promise((done) => setTimeout(done, 5));

test("a Breach's run reads by its plan as its tier and its gate's zone; any other name is none", () => {
  assert.deepEqual(runOf(plan, [zone], RUN), { run: RUN, tier: 1, plan, zone });
  assert.equal(runOf(plan, [zone], 'node-krakens-grotto--run-k3j4h5g6'), null);
  assert.equal(runOf(plan, [], RUN), null, 'no zone, no run');
});

test('a run launched from the Playlist goes to its gate, joined with the run; its gate opens the way in', async () => {
  const { trips, went, asked } = tripsOn({ node: zone, run: null }, INTO_BREACH);
  trips.toGate(RUN);
  await settle();
  assert.deepEqual(went, ["enter the Drowned Vale's gate", `onto gullwing-vale?breach=${encodeURIComponent(RUN)}`]);
  trips.enterBreach();
  await settle();
  assert.deepEqual(asked, [{ kind: ASKS.enterBreach }]);
  assert.deepEqual(went.slice(2), ['enter the Drowned Vale', `into ${RUN}`]);
});

test('a gate shut to the player, too far from it or silent says so, as the server words it, and goes nowhere', async () => {
  const tried = async (answer: number | null) => {
    const { trips, went, told } = tripsOn({ node: zone, run: null }, answer);
    trips.toGate(RUN);
    await settle();
    trips.enterBreach();
    await settle();
    assert.equal(went.length, 2, 'to the gate, and no further');
    return told;
  };
  assert.deepEqual(await tried(GATE_SHUT), ['The Sunken Gate has not opened to your company.']);
  assert.deepEqual(await tried(OUT_OF_REACH), ['Too far from the gate.']);
  assert.deepEqual(await tried(null), ['The gate did not answer. Try again.']);
});

test("a gate's answer is read only where it was asked: moved on meanwhile, another room's word goes unheard", async () => {
  const { trips, went, told, movedOn } = tripsOn({ node: zone, run: null }, null);
  trips.toGate(RUN);
  await settle();
  trips.enterBreach();
  movedOn();
  await settle();
  assert.deepEqual([went.length, told], [2, []]);
});

test('out of the run the player goes back to its gate in its company; a member in a run is joined there', async () => {
  const into = { run: RUN, tier: 1, plan, zone };
  const { trips, went } = tripsOn({ node: zone, run: into }, 0);
  trips.leaveBreach();
  await settle();
  assert.deepEqual(went, ['leave the Drowned Vale', `onto gullwing-vale?breach=${encodeURIComponent(RUN)}`]);
  assert.equal(trips.joinRun('node-gullwing-vale'), false, 'the zone itself is no run');
  assert.equal(trips.joinRun(RUN), true);
  await settle();
  assert.deepEqual(went.slice(2), ['join the Drowned Vale', `into ${RUN}`]);
});

test("launched, the player stands at the gate's own arrival as the zone's layout stands it", async () => {
  const solid = { shape: 'module', module: moduleNumber('breach-gate'), group: 0, at: [100, 200, 5], turn: 0 };
  const layout = { id: 'gullwing-vale', solids: [solid], areas: [] };
  const land = { layoutsNamed: async () => JSON.stringify([layout]) };
  const arriving = await gateArrival(land, zone, RUN);
  assert.deepEqual([arriving.x, arriving.y, arriving.breach], [100, 228, RUN], 'its arrival socket 28 m south');
  assert.equal(arriving.facing, 0, 'facing north, into the gate');
  const none = await gateArrival({ layoutsNamed: async () => '[]' }, zone, RUN);
  assert.deepEqual([none.x, none.y], [5, 6], 'the zone spawn, the room standing them');
});

test("only a Breach's run's own modules wait for the run; its seal is fetched apart, at its gate and in the run", () => {
  const modules = ['breach-gate', 'breach-seal', 'breach-choir', 'breach-bell', 'lattice-shard'];
  assert.deepEqual(modules.map(ofRun), [false, false, true, true, false]);
  assert.deepEqual(modules.map(inOpenWorld), [true, false, false, false, true], 'the open world fetches no seal');
});
