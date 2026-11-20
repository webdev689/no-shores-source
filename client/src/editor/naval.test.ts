import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FightCaptain, FightLay, FightVessel, FightView } from '../rules/fightRules.ts';
import type { LandView } from '../rules/landRules.ts';
import type { FightSource } from './fighting.ts';
import type { Sailed } from '../terrain/landClient.ts';
import { Naval } from './naval.ts';
import type { Orbit } from './orbit.ts';
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
};
const captain: FightCaptain = {
  ...vessel,
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
const IDLE = { held: new Set<string>(), press: undefined, look: null, fire: false, loadSteps: 0 };
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
  // The call reaches the door once her helm is still: let the queue settle first.
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

test('F calls a captain once her helm is still, and F again sends her off', async () => {
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

test('a captain sent off before she comes is never taken up, nor one called before her', async () => {
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

test("she takes each answer's numbers for the Sloop, and none from a fight since ended", async () => {
  const { source, letGo } = door();
  const naval = new Naval(drawer);
  const sailing = await sloop();
  naval.toggle(source, 'land', sailing, 0, failed);
  await letGo();
  naval.step(0.1, IDLE, 1, sailing, WINDOW, failed);
  assert.deepEqual([...sailing.floats()], vessel.ship, 'the begun fight is hers');
  naval.end();
  await letGo();
  naval.step(0.1, IDLE, 1.1, sailing, WINDOW, failed);
  assert.deepEqual([...sailing.floats()], vessel.ship);
});

test('a fight that is over hands her the last answer, ends, and keeps its lines a while', async () => {
  const { source, asked, letGo } = door({ over: 'sunk', player: { ...vessel, ship: [9, 9, 0, 0, 0, 0, 0, 1] } });
  const naval = new Naval(drawer);
  const sailing = await sloop();
  naval.toggle(source, 'land', sailing, 0, failed);
  await letGo();
  naval.step(0.1, IDLE, 1, sailing, WINDOW, failed);
  await letGo();
  naval.step(0.1, IDLE, 1.1, sailing, WINDOW, failed);
  assert.deepEqual([naval.fighting, asked.ends], [false, 1]);
  assert.deepEqual([...sailing.floats()], [9, 9, 0, 0, 0, 0, 0, 1]);
  assert.ok(naval.lines(2).length > 0 && naval.lines(10).length === 0);
});

test("the look's ray runs from the aim eye along the camera's look", async () => {
  const naval = new Naval(drawer);
  const sailing = await sloop();
  const orbit = { yaw: Math.PI / 2, pitch: 0.2 } as Orbit;
  const look = naval.look(orbit, sailing, WINDOW);
  const [x = 0, y = 0, z = 0, east = 0, south = 0, up = 0] = look.ray ?? [];
  assert.ok(look.bearing > 89 && look.bearing < 91, 'over her starboard side');
  assert.ok(x > 5 && Math.abs(y - 3) < 1e-9 && z > 5, 'the starboard aim eye');
  assert.ok(Math.abs(east - Math.cos(0.2)) < 1e-9 && Math.abs(south) < 1e-9 && Math.abs(up + Math.sin(0.2)) < 1e-9);
});

test('each arc ends where its gun stops: a strike mark on her, a zone where it splashes', () => {
  const lay: FightLay = {
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
    radius: 2,
    on_target: true,
  };
  const marks = Naval.arcs({ ...VIEW, lay }, WINDOW, 1);
  const dots = marks.filter((mark) => mark.radius < 0.1 && mark.z !== 0.1);
  assert.ok(
    dots.filter((dot) => dot.y === 0).every((dot) => dot.x <= 5 + 1e-9),
    'the first arc stops on her side',
  );
  assert.ok(
    dots.filter((dot) => dot.y === 2).every((dot) => dot.x <= 20 + 1e-9),
    'the second at its splash',
  );
  const strikes = marks.filter((mark) => mark.radius >= 0.1 && mark.x === 5 && mark.z === 3.77);
  assert.equal(strikes.length, 1, 'a strike mark where it meets her');
  const zone = marks.filter((mark) => Math.abs(Math.hypot(mark.x - 20, mark.y - 2) - 2) < 1e-9 && mark.z === 0.1);
  assert.ok(zone.length >= 12, 'a ring of the zone radius round the splash');
  assert.ok(!marks.some((mark) => mark.z === 3.77 && mark.radius < 0.1), 'no zone on her side');
});
