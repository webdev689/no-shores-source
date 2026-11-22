import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FightCaptain, FightLay, FightVessel, FightView } from '../rules/fightRules.ts';
import type { LandView } from '../rules/landRules.ts';
import { aimStation } from './aimStation.ts';
import { type FightSource, Fighting } from './fighting.ts';
import type { Sailed } from '../terrain/landClient.ts';
import { aimOf, Naval } from './naval.ts';
import { countingGpu } from '../gpuForTests.ts';
import { cameraOf, type Orbit } from './orbit.ts';
import { Sailing, type SailSource } from './sailing.ts';

const vessel: FightVessel = {
  ship: [5, 6, 0, 0, 0, 0, 0, 2],
  pose: [0.2, 0, 0, 0],
  hull: 240,
  max_hull: 240,
  sail: 96,
  max_sail: 96,
  crew: 0,
  max_crew: 0,
  state: 'afloat',
  fires: 0,
  guns: { left: [0, 0], progress: [1, 1], load: 'round', braced: false },
  boost: [0, 1],
};
const captain: FightCaptain = {
  ...vessel,
  id: 1,
  ship: [600, 800, 0, 0, 0, 0, 0, 2],
  name: 'Pirate Sloop',
  faction: 2,
  rank: 2,
  mode: 'engage',
  hostile: true,
  run_out: [],
};
const VIEW: FightView = {
  clock: 0,
  player: vessel,
  captain,
  balls: [],
  lay: null,
  events: [],
  over: null,
  fingerprint: '',
};
const WINDOW = { leftM: 0, topM: 0 } as LandView;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const failed = (error: unknown) => {
  throw error;
};
const IDLE = { held: new Set<string>(), press: undefined, look: null, fire: false, loadSteps: 0, boost: false };
const drawer = { drawInto: () => undefined };

/** A fight whose begins and steps wait until let go, keeping what it was asked. */
function door(steps: Partial<FightView> = {}) {
  const held: (() => void)[] = [];
  const asked = { begins: 0, steps: 0, ends: 0 };
  const source: FightSource = {
    // Each call's captain lies a kilometre further off than the last's, so the panel tells them apart.
    fightBegin: () => {
      asked.begins++;
      const far: FightCaptain = { ...captain, ship: [5 + asked.begins * 1000, 6, 0, 0, 0, 0, 0, 2] };
      return new Promise((resolve) => held.push(() => resolve({ ...VIEW, captain: far })));
    },
    fightStep: () => {
      asked.steps++;
      return new Promise((resolve) => held.push(() => resolve({ ...VIEW, ...steps })));
    },
    fightEnd: async () => {
      asked.ends++;
    },
  };
  // The call reaches the door once its helm is still: let the queue settle first.
  const letGo = async () => {
    await settle();
    held.splice(0).forEach((resolve) => resolve());
    await settle();
    await settle();
  };
  return { source, asked, letGo };
}

async function sloop(): Promise<Sailing> {
  const sails: SailSource = {
    sail: async (_id, ship): Promise<Sailed> => ({ ship, pose: { heave: 0, pitch: 0, roll: 0, aground: false } }),
  };
  const sailing = await Sailing.putToSea(sails, 'land', 0, 0, 0, 0);
  if (typeof sailing === 'string') throw new Error(sailing);
  return sailing;
}

test('F calls a captain once its helm is still, and F again sends it off', async () => {
  const { source, asked, letGo } = door();
  const naval = new Naval(drawer);
  const sailing = await sloop();
  naval.toggle(source, 'land', sailing, 0, failed);
  assert.equal(naval.busy, true);
  await letGo();
  assert.equal(naval.fighting, true);
  naval.toggle(source, 'land', sailing, 1, failed);
  assert.deepEqual([naval.fighting, naval.busy, asked.begins, asked.ends], [false, false, 1, 1]);
});

test('a captain sent off before it comes is never taken up, nor one called before it', async () => {
  const { source, asked, letGo } = door();
  const naval = new Naval(drawer);
  const sailing = await sloop();
  naval.toggle(source, 'land', sailing, 0, failed);
  naval.end();
  await letGo();
  assert.equal(naval.fighting, false, 'sent off while called');
  naval.toggle(source, 'land', sailing, 0, failed);
  naval.end();
  naval.toggle(source, 'land', sailing, 0, failed);
  await letGo();
  assert.equal(naval.fighting, true, 'the second call stands');
  assert.equal(asked.begins, 1, 'only the call that stands reaches the door');
  assert.ok(naval.lines(0).includes('A Pirate Sloop sighted, 1.0 km off.'), naval.lines(0).join(' | '));
});

test("it takes each answer's numbers for the Sloop, and none from a fight since ended", async () => {
  const { source, letGo } = door();
  const naval = new Naval(drawer);
  const sailing = await sloop();
  naval.toggle(source, 'land', sailing, 0, failed);
  await letGo();
  naval.step(0.1, IDLE, 1, sailing, WINDOW, failed);
  assert.deepEqual([...sailing.floats()], vessel.ship, 'the begun fight is its own');
  naval.end();
  await letGo();
  naval.step(0.1, IDLE, 1.1, sailing, WINDOW, failed);
  assert.deepEqual([...sailing.floats()], vessel.ship);
});

test('a fight that is over hands it the last answer, ends, and keeps its lines a while', async () => {
  const { source, asked, letGo } = door({ over: 'sunk', player: { ...vessel, ship: [9, 9, 0, 0, 0, 0, 0, 1] } });
  const naval = new Naval(drawer);
  const sailing = await sloop();
  naval.toggle(source, 'land', sailing, 0, failed);
  await letGo();
  naval.step(0.1, IDLE, 1, sailing, WINDOW, failed);
  await letGo();
  naval.step(0.1, IDLE, 1.1, sailing, WINDOW, failed);
  assert.deepEqual([naval.fighting, asked.ends], [false, 1]);
  assert.equal(naval.view?.over, 'sunk', 'the answer it ended on is kept');
  assert.deepEqual([...sailing.floats()], [9, 9, 0, 0, 0, 0, 0, 1]);
  assert.ok(naval.lines(2).length > 0 && naval.lines(10).length === 0);
});

const LAID: FightLay = {
  side: 'starboard',
  launches: [
    [0, 0, 5, 10, 0, 0],
    [0, 2, 5, 20, 0, 0],
  ],
  elevation: 0,
  reach: 300,
  ends: [
    { time: 0.5, point: [5, 0, 3.77], water: false, strike: [5, 0, 3.77] },
    { time: 1, point: [20, 2, 0.1], water: true, strike: null },
  ],
  radius: 1,
  on_target: true,
};

test("the aim shows each gun's flight to where it stops, a strike where it meets the ship, a ring and post where it falls", () => {
  const aim = aimOf(LAID, vessel, WINDOW, 1);
  assert.ok(aim);
  assert.equal(aim.arcs.length, 2);
  const [struck = [], fell = []] = aim.arcs;
  assert.deepEqual(struck[0], [0, 0, 5], 'from its gun');
  assert.deepEqual(struck.at(-1), [5, 0, 5 - 9.81 * 0.125], 'to its side');
  assert.deepEqual(fell.at(-1)?.slice(0, 2), [20, 2]);
  assert.ok(struck.length >= 8, 'a smooth curve');
  assert.deepEqual(aim.strikes, [[5, 0, 3.77]]);
  assert.deepEqual(aim.zone, [[20, 2, 0.1]], 'the struck gun lays no ring');
  assert.equal(aim.radius, 1.6, "DFO's least ring");
});

test("the aim's tone: hot on target while the side can fire, laid off it, not ready while it loads or braces", () => {
  assert.equal(aimOf(LAID, vessel, WINDOW, 1)?.tone, 'hot');
  assert.equal(aimOf({ ...LAID, on_target: false }, vessel, WINDOW, 1)?.tone, 'laid');
  const loading = { ...vessel, guns: { ...vessel.guns, left: [0, 3.2] as const } };
  assert.equal(aimOf(LAID, loading, WINDOW, 1)?.tone, 'idle', 'its starboard side still loads');
  const portLoading = { ...vessel, guns: { ...vessel.guns, left: [3.2, 0] as const } };
  assert.equal(aimOf(LAID, portLoading, WINDOW, 1)?.tone, 'hot', 'its port side is not the one laid');
  const braced = { ...vessel, guns: { ...vessel.guns, braced: true } };
  assert.equal(aimOf(LAID, braced, WINDOW, 1)?.tone, 'idle');
  assert.equal(aimOf(LAID, { ...vessel, state: 'sinking' }, WINDOW, 1)?.tone, 'idle');
  assert.equal(aimOf(null, vessel, WINDOW, 1), null);
});

test("the World Editor's aim eases the eye out to its battery and home again, laying the look its view looks along", async () => {
  const naval = new Naval(drawer);
  const answering: FightSource = {
    fightBegin: async () => VIEW,
    fightStep: async () => VIEW,
    fightEnd: async () => {},
  };
  naval.join(Fighting.joined(answering, 'land', VIEW, 0));
  const sailing = await sloop();
  const orbit: Orbit = { targetX: 0, targetY: 0, targetZ: 6, distance: 40, yaw: Math.PI / 2, pitch: 0.2 };
  const place = sailing.place(WINDOW, 1);
  const { eye } = aimStation(0);
  // Heading north: its starboard battery's station stands east of it and north of its middle.
  const battery = [place.x + eye[1], place.y - eye[0], place.z + eye[2]];
  const off = (seen: Orbit) => {
    const [x, y, z] = cameraOf(seen).eye;
    return Math.hypot(x - (battery[0] ?? 0), y - (battery[1] ?? 0), z - (battery[2] ?? 0));
  };
  const home = off(orbit);
  const first = off(naval.aimCamera(orbit, sailing, WINDOW, 1, true, 1 / 60));
  assert.ok(first > home * 0.8, `a frame in it has barely left the orbit (${first} of ${home} m)`);
  let seen = orbit;
  for (let frame = 0; frame < 120; frame++) seen = naval.aimCamera(orbit, sailing, WINDOW, 1, true, 1 / 60);
  assert.ok(off(seen) < 0.05, 'two seconds on it stands at the battery');
  const look = naval.look();
  assert.ok(look && look.bearing === 90, 'square off its starboard side');
  const ray = look.ray ?? [];
  assert.ok(Math.abs((ray[3] ?? 0) - Math.sin(seen.yaw) * Math.cos(seen.pitch)) < 1e-9, 'along the view');
  for (let frame = 0; frame < 240; frame++) seen = naval.aimCamera(orbit, sailing, WINDOW, 1, false, 1 / 60);
  assert.equal(seen, orbit, 'let go, it is home');
  assert.equal(naval.look(), null);
});

test('fight after fight on one GPU draws the aim with the one set of its buffers, never another left live', () => {
  const { gpu, live } = countingGpu();
  const marks = { gpu, drawInto: () => undefined };
  new Naval(marks);
  const once = live();
  assert.ok(once > 0, 'the aim holds its buffers');
  for (let fight = 0; fight < 3; fight++) new Naval(marks);
  assert.equal(live(), once);
});
