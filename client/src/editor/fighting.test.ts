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
  boost: [0, 1],
};
const captain: FightCaptain = {
  ...vessel,
  id: 1,
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
const IDLE = { held: new Set<string>(), press: undefined, look: null, fire: false, loadSteps: 0, boost: false };

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

test('a release, a load step, the brace, a burst and the helm go to the rules with the next step, once', async () => {
  const { fights, asked } = source();
  const fighting = await begun(fights);
  const look = { bearing: 90, range: 80 };
  const pressed = { held: new Set(['c', 'd']), press: 'w', look, fire: true, loadSteps: 1, boost: true };
  fighting.advance(0.1, pressed, 1, failed);
  await settle();
  fighting.advance(0.1, { ...IDLE, look }, 1.1, failed);
  await settle();
  assert.deepEqual(asked[0], {
    helm: { steer: 1, climb: 1 },
    aim: look,
    fire: true,
    brace: true,
    load: 'grape',
    boost: true,
  });
  assert.deepEqual([asked[1]?.fire, asked[1]?.load, asked[1]?.helm.climb, asked[1]?.boost], [false, null, 0, false]);
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

test("the fight's messages are given on their own, apart from the captains' lines, the lay and the warning", async () => {
  const refused: FightEvent = { kind: 'refused', why: 'reloading', side: 'starboard', left: 2.25 };
  const fighting = await begun(source({ events: [refused] }).fights);
  fighting.advance(0.1, IDLE, 1, failed);
  await settle();
  assert.deepEqual(fighting.messages(2), [
    'A Pirate Sloop sighted, 1.0 km off.',
    'The starboard guns are reloading (2.3 s).',
  ]);
  assert.deepEqual(fighting.messages(10), [], 'each is shown a while');
});

test('a run-out battery warns the player to brace', async () => {
  const fighting = await begun(source({ captain: { ...captain, run_out: ['port'] } }).fights);
  fighting.advance(0.1, IDLE, 1, failed);
  await settle();
  assert.ok(fighting.lines(1).includes('Broadside from the Pirate Sloop: C to brace.'));
});

const brig = (number: number, lies: readonly [number, number], more: Partial<FightCaptain> = {}): FightCaptain => ({
  ...captain,
  ship: [lies[0], lies[1], 0, 0, 0, 0, 0, 2],
  name: 'Pirate Brig',
  id: number,
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

test('the panel leaves the ship’s own hurts and guns to the plate and the rose: it has no line of them', async () => {
  const fighting = await begun(source({}).fights);
  fighting.advance(0.1, IDLE, 1, failed);
  await settle();
  const lines = fighting.lines(1);
  assert.ok(lines.length > 0 && !lines.some((line) => line.startsWith('Your Sloop')), lines.join(' | '));
});

test('the lay is said on target only while its side can fire', async () => {
  const lay = { side: 'port', launches: [], elevation: 0, reach: 300, ends: [], radius: 2, spread: 1, on_target: true } as const;
  const said = async (left: readonly [number, number]) => {
    const player = { ...vessel, guns: { ...vessel.guns, left } };
    const fighting = await begun(source({ lay, player }).fights);
    fighting.advance(0.1, IDLE, 1, failed);
    await settle();
    return fighting.lines(1).find((line) => line.startsWith('Laying'));
  };
  assert.equal(await said([0, 0]), 'Laying the port guns: on target.');
  assert.equal(await said([4.2, 0]), 'Laying the port guns.', 'reloading');
});

test("every captain's strike and sinking is told by its own name", async () => {
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

test('DFO says a struck captain surrenders and rigging shot away sets no sail', () => {
  const named = () => 'Pirate Sloop';
  assert.equal(wordsFor({ kind: 'state', ship: 1, state: 'struck' }, named), 'The Pirate Sloop surrenders!');
  assert.equal(wordsFor({ kind: 'no-sail' }, named), 'The rigging is shot away. No sail will set.');
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

test('a frame with no look laid, as the view eases round to the other side, lets the last look go', async () => {
  const { fights, asked } = source();
  const fighting = await begun(fights);
  fighting.advance(0.1, { ...IDLE, look: { bearing: 90, range: 70 } }, 1, failed);
  await settle();
  fighting.advance(0.1, IDLE, 1.1, failed);
  await settle();
  fighting.advance(0.1, { ...IDLE, fire: true }, 1.2, failed);
  await settle();
  assert.deepEqual([asked.at(-1)?.fire, asked.at(-1)?.aim], [true, null], 'the starboard lay is not fired');
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

test('a joined fight names its own ship, describes every captain afloat in reach and tells of any one striking', async () => {
  const second: FightCaptain = { ...captain, id: 2, name: 'Pirate Brig', ship: [0, 300, 0, 0, 0, 0, 0, 2] };
  const sunk: FightCaptain = { ...captain, id: 3, name: 'Sunk Sloop', ship: [0, 200, 0, 0, 0, 0, 0, 2], state: 'sunk' };
  const first: FightView = { ...VIEW, others: [second, sunk] };
  const struck: FightEvent = { kind: 'state', ship: 2, state: 'struck' };
  const { fights } = source({ others: [{ ...second, run_out: ['port'] }, sunk], events: [struck] });
  const fighting = Fighting.joined(fights, 'sea', first, 0, 'Brig');
  const lines = fighting.lines(0);
  // Its own ship's hurts are the readout's plate, named by its kind; the lines tell of the captains within reach.
  assert.equal(fighting.own, 'Brig');
  assert.ok(
    lines.some((line) => line.startsWith('Pirate Brig, 300 m off, closing')),
    lines.join(' | '),
  );
  assert.ok(!lines.some((line) => line.startsWith('Sunk Sloop')), 'a sunk captain is no longer described');
  fighting.advance(1 / 60, IDLE, 1, failed);
  await settle();
  const after = fighting.lines(1);
  assert.ok(after.includes('The Pirate Brig surrenders!'), after.join(' | '));
  assert.ok(after.includes('Broadside from the Pirate Brig: C to brace.'), 'any captain running out its guns warns');
});

test('a fight begun with several captains sights them all, by how many and the nearest', () => {
  const near: FightCaptain = { ...captain, ship: [0, 300, 0, 0, 0, 0, 0, 2] };
  const sunk: FightCaptain = { ...captain, ship: [0, 100, 0, 0, 0, 0, 0, 2], state: 'sunk' };
  const fighting = Fighting.joined(source().fights, 'sea', { ...VIEW, others: [near, captain, sunk] }, 0, 'Brig');
  const lines = fighting.lines(0);
  assert.ok(lines.includes('3 ships are sighted, the nearest 300 m off.'), lines.join(' | '));
});
