import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FightCaptain, FightEvent, FightOrders, FightVessel, FightView } from '../rules/fightRules.ts';
import { type FightSource, Fighting, wordsFor } from './fighting.ts';

const vessel: FightVessel = {
  ship: [0, 0, 0, 0, 0, 0, 0, 2],
  pose: [0, 0, 0, 0],
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
  hull: 264,
  max_hull: 264,
  crew: 10,
  max_crew: 10,
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

/** A fight that answers each step at once, with whatever `next` holds. */
function source(next: Partial<FightView> = {}) {
  const asked: FightOrders[] = [];
  const fights: FightSource = {
    fightBegin: async () => VIEW,
    fightStep: async (_id, orders) => {
      asked.push(orders);
      return { ...VIEW, ...next };
    },
    fightEnd: async () => {},
  };
  return { fights, asked };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const failed = (error: unknown) => {
  throw error;
};
const IDLE = { held: new Set<string>(), press: undefined, look: null, fire: false, loadSteps: 0 };

async function begun(fights: FightSource): Promise<Fighting> {
  const fighting = await Fighting.begin(fights, 'land', new Float64Array(8), 7, 0);
  if (typeof fighting === 'string') throw new Error(fighting);
  return fighting;
}

test('a captain called is sighted on the panel', async () => {
  const fighting = await begun(source().fights);
  assert.ok(fighting.lines(1).some((line) => line === 'A Pirate Sloop sighted, 1.0 km off.'));
  const closed: FightSource = { ...source().fights, fightBegin: async () => null };
  assert.equal(await Fighting.begin(closed, 'land', new Float64Array(8), 7, 0), 'Open this landmass to fight on it.');
});

test('a release, a load step, the brace and the helm go to the rules with the next step, once', async () => {
  const { fights, asked } = source();
  const fighting = await begun(fights);
  const look = { bearing: 90, range: 80 };
  fighting.advance(0.1, { held: new Set(['c', 'd']), press: 'w', look, fire: true, loadSteps: 1 }, 1, failed);
  await settle();
  fighting.advance(0.1, { ...IDLE, look }, 1.1, failed);
  await settle();
  assert.deepEqual(asked[0], {
    helm: { steer: 1, crab: false, climb: 1 },
    aim: look,
    fire: true,
    brace: true,
    load: 'grape',
  });
  assert.deepEqual([asked[1]?.fire, asked[1]?.load, asked[1]?.helm.climb], [false, null, 0]);
});

test('one step is with the rules at a time', async () => {
  const { fights, asked } = source();
  const fighting = await begun(fights);
  fighting.advance(0.1, IDLE, 1, failed);
  fighting.advance(0.1, IDLE, 1.1, failed);
  assert.equal(asked.length, 1);
  await settle();
  fighting.advance(0, IDLE, 1.2, failed);
  assert.equal(asked.length, 2, 'the time waited is caught up');
});

test("the rules' events are the panel's words and the effects' to take", async () => {
  const refused: FightEvent = { kind: 'refused', why: 'reloading', side: 'starboard', left: 2.25 };
  const fighting = await begun(source({ events: [refused] }).fights);
  fighting.advance(0.1, IDLE, 1, failed);
  await settle();
  assert.ok(fighting.lines(2).includes('The starboard guns are reloading (2.3 s).'));
  assert.deepEqual(fighting.takeEvents(), [refused]);
  assert.deepEqual(fighting.takeEvents(), []);
  assert.ok(!fighting.lines(10).includes('The starboard guns are reloading (2.3 s).'), 'a message is shown a while');
});

test('her run-out battery warns the player to brace', async () => {
  const fighting = await begun(source({ captain: { ...captain, run_out: ['port'] } }).fights);
  fighting.advance(0.1, IDLE, 1, failed);
  await settle();
  assert.ok(fighting.lines(1).includes('Broadside from the Pirate Sloop: C to brace.'));
});

const brig = (number: number, at: readonly [number, number], more: Partial<FightCaptain> = {}): FightCaptain => ({
  ...captain,
  ship: [at[0], at[1], 0, 0, 0, 0, 0, 2],
  name: 'Pirate Brig',
  number,
  ...more,
});

test('any captain running out warns, the nearest named', async () => {
  const far = { ...captain, ship: [200, 0, 0, 0, 0, 0, 0, 2] };
  const others = [
    brig(2, [40, 0], { run_out: ['port'] }),
    brig(3, [90, 0], { name: 'Tithe Frigate', run_out: ['starboard'] }),
  ];
  const fighting = await begun(source({ captain: far, others }).fights);
  fighting.advance(0.1, IDLE, 1, failed);
  await settle();
  const lines = fighting.lines(1);
  assert.ok(lines.includes('Broadside from the Pirate Brig: C to brace.'), lines.join(' | '));
  assert.equal(lines.filter((line) => line.startsWith('Broadside')).length, 1);
});

test('a line for each captain within a few hundred metres, nearest first, in plain mode words', async () => {
  const others = [
    brig(2, [40, 0], { mode: 'flee' }),
    brig(3, [90, 0], { name: 'Tithe Frigate', mode: 'cruise' }),
    brig(4, [3000, 0], { name: 'Far Sloop' }),
  ];
  const fighting = await begun(source({ captain: { ...captain, ship: [200, 0, 0, 0, 0, 0, 0, 2] }, others }).fights);
  fighting.advance(0.1, IDLE, 1, failed);
  await settle();
  const lines = fighting.lines(1);
  const captains = lines.filter((line) => / m off, /.test(line));
  assert.deepEqual(
    captains.map((line) => line.split(':')[0]),
    ['Pirate Brig, 40 m off, running', 'Tithe Frigate, 90 m off, cruising', 'Pirate Sloop, 200 m off, closing'],
  );
  assert.ok(!lines.some((line) => line.includes('Far Sloop')));
});

test("every captain's strike and sinking is told by her own name", async () => {
  const others = [brig(2, [40, 0]), brig(3, [90, 0], { name: 'Tithe Frigate' })];
  const events: FightEvent[] = [
    { kind: 'state', ship: 2, state: 'struck' },
    { kind: 'state', ship: 3, state: 'sinking' },
  ];
  const fighting = await begun(source({ others, events }).fights);
  fighting.advance(0.1, IDLE, 1, failed);
  await settle();
  const lines = fighting.lines(1);
  assert.ok(lines.includes('The Pirate Brig surrenders!'), lines.join(' | '));
  assert.ok(lines.includes('The Tithe Frigate is going down!'));
});

test('DFO says a struck captain surrenders and a wrecked Sloop is crippled', () => {
  const named = () => 'Pirate Sloop';
  assert.equal(wordsFor({ kind: 'state', ship: 1, state: 'struck' }, named), 'The Pirate Sloop surrenders!');
  assert.equal(
    wordsFor({ kind: 'state', ship: 0, state: 'wrecked' }, named),
    'Your ship is crippled! The sails hang in rags.',
  );
  assert.equal(wordsFor({ kind: 'run-out', side: 'port' }, named), null);
});

test('a release fires the lay the look last held, as the aim lets go', async () => {
  const { fights, asked } = source();
  const fighting = await begun(fights);
  const look = { bearing: -90, range: 70 };
  fighting.advance(0.1, { ...IDLE, look }, 1, failed);
  await settle();
  fighting.advance(0.1, { ...IDLE, fire: true }, 1.1, failed);
  await settle();
  assert.deepEqual([asked[1]?.fire, asked[1]?.aim], [true, look]);
  fighting.advance(0.1, IDLE, 1.2, failed);
  await settle();
  assert.equal(asked[2]?.aim, null, 'no look held, none laid');
});

test('two releases queued behind one step both fire the lay the look held', async () => {
  const asked: FightOrders[] = [];
  const held: (() => void)[] = [];
  const fights: FightSource = {
    fightBegin: async () => VIEW,
    fightStep: (_id, orders) => {
      asked.push(orders);
      return new Promise((resolve) => held.push(() => resolve(VIEW)));
    },
    fightEnd: async () => {},
  };
  const fighting = await begun(fights);
  const look = { bearing: 90, range: 80 };
  const letGo = async () => {
    held.splice(0).forEach((resolve) => resolve());
    await settle();
  };
  fighting.advance(0.1, { ...IDLE, look }, 1, failed);
  fighting.advance(0.1, { ...IDLE, fire: true }, 1.1, failed);
  fighting.advance(0.1, { ...IDLE, fire: true }, 1.2, failed);
  await letGo();
  fighting.advance(0.1, IDLE, 1.3, failed);
  await letGo();
  fighting.advance(0.1, IDLE, 1.4, failed);
  assert.deepEqual(
    asked.slice(1).map((orders) => [orders.fire, orders.aim]),
    [
      [true, look],
      [true, look],
    ],
  );
});
