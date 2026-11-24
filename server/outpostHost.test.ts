import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Box } from '../client/src/game/guild/outpostPlaces.ts';
import { placeOf, plotBoxes, socketOf } from '../client/src/game/guild/outpostPlaces.ts';
import { AGAIN_WAITS_MS, type OutpostAccounts, OutpostHost, gateDoor, outpostGround } from './outpostHost.ts';
import { bannerOfName } from '../client/src/game/guild/bannerLaw.ts';
import type { Errand } from './roomDoor.ts';

const STAFF = bannerOfName('Salt').staff;
const ROOM = 'node-oakfast-landing--guild-0a1b2c3d4e5f60718293a4b5c6d7e8f9';
const GROUND = { plot: [100, 200], level: 12 } as const;
const hall = (tier: number, building = 0) => ({ id: 1, kind: 'hall', tier, building, x: 6, y: 6, turn: 0 });
const plotOf = (tier: number) => ({ structures: [{ ...hall(tier), spent: 0, delivered: {} }], decor: [] });

/** A room's door that keeps its blocks, the errands it holds, the answers it was given and the plots it stood. */
function doorOf() {
  const door = {
    blocks: [] as Box[],
    waiting: [] as Errand[],
    answered: [] as [number, number | null][],
    stood: 0,
    gates: [] as (readonly number[] | null)[],
    outpostGate: (gate: readonly [number, number, number] | null) => door.gates.push(gate) > 0,
    outpostErrands: () => door.waiting.splice(0),
    outpostAnswered: (id: number, answer: number | null) => door.answered.push([id, answer]) > 0,
    outpostStood: () => ++door.stood > 0,
    standBlock: (box: Box) => door.blocks.push(box) > 0,
    takeBlock: (box: Box) => {
      const found = door.blocks.findIndex((each) => JSON.stringify(each) === JSON.stringify(box));
      return found >= 0 && door.blocks.splice(found, 1).length === 1;
    },
  };
  return door;
}

/** The accounts as an outpost's host asks them, each answer from `answers`, a throw for an Error. */
function accountsOf(answers: { plot?: () => ReturnType<typeof plotOf>; banner?: string; [ask: string]: unknown }) {
  const asked: [string, ...unknown[]][] = [];
  const answering = (ask: string) => {
    const answer = answers[ask];
    const next = Array.isArray(answer) ? (answer.shift() as unknown) : answer;
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  };
  const accounts = {
    outpost: () => {
      asked.push(['outpost']);
      const plot = answers.plot?.();
      const banner = answers.banner ?? '{}';
      return Promise.resolve(plot ? { guild: 'g', name: 'Salt', banner, site: 'oakfast-landing', plot } : null);
    },
    deposit: (...args: unknown[]) => (asked.push(['deposit', ...args]), answering('deposit')),
    deliver: (...args: unknown[]) => (asked.push(['deliver', ...args]), answering('deliver')),
    takeStores: (...args: unknown[]) => (asked.push(['takeStores', ...args]), answering('takeStores')),
    soundHorn: (...args: unknown[]) => (asked.push(['soundHorn', ...args]), answering('soundHorn')),
  } as unknown as OutpostAccounts;
  return { accounts, asked };
}

const guarded = <T>(call: () => T) => call();
/** Every save holds. */
const saves = () => Promise.resolve(true);
const settle = () => new Promise((done) => setTimeout(done, 0));
const errand = (id: number, kind: Errand['kind'], more: Partial<Errand> = {}): Errand => ({
  id,
  player: 3,
  account: 'salt',
  kind,
  ...more,
});

test('the outpost’s ground is its node file’s outpost part, and a node without one has none', () => {
  const part = { plot: [1, 2], level: 3, muster: [4, 5], landing: [6, 7] };
  assert.deepEqual(outpostGround(JSON.stringify({ id: 'x', outpost: part })), {
    plot: [1, 2],
    level: 3,
    muster: [4, 5],
  });
  assert.equal(outpostGround(JSON.stringify({ id: 'x' })), null);
});

test('the plot stands as its boxes, and read again stands the new plot in place of the old', async () => {
  let tier = 1;
  const door = doorOf();
  const { accounts } = accountsOf({ plot: () => plotOf(tier) });
  const host = new OutpostHost(door, accounts, ROOM, GROUND, guarded, saves);
  await host.read();
  const first = plotBoxes(plotOf(1), GROUND, STAFF);
  assert.ok(first.length > 0);
  assert.deepEqual(door.blocks, first);
  tier = 2;
  await host.read();
  assert.deepEqual(door.blocks, plotBoxes(plotOf(2), GROUND, STAFF), 'the old taken, the new stood');
  assert.equal(door.stood, 2, 'each plot stood counted, for the snapshot');
});

test('a plot the accounts cannot read leaves the plot standing as it was', async () => {
  const door = doorOf();
  let broken = false;
  const { accounts } = accountsOf({
    plot: () => {
      if (broken) throw new Error('down');
      return plotOf(1);
    },
  });
  const host = new OutpostHost(door, accounts, ROOM, GROUND, guarded, saves);
  await host.read();
  const standing = [...door.blocks];
  broken = true;
  await host.read();
  assert.deepEqual(door.blocks, standing);
  assert.equal(door.stood, 1);
});

test('an errand is asked again under its one id while the accounts throw, and given back whole only if they never answer', async () => {
  const door = doorOf();
  const { accounts, asked } = accountsOf({
    deposit: [new Error('blip'), 'already', 'refused', ...Array(4).fill(new Error('down'))],
    deliver: [new Error('blip'), 6],
  });
  const host = new OutpostHost(door, accounts, ROOM, GROUND, guarded, saves, 77, [1, 1, 1]);
  door.waiting.push(errand(1, 'deposit', { amount: 40 }));
  await host.settled(3);
  door.waiting.push(errand(2, 'deposit', { amount: 30 }), errand(3, 'deposit', { amount: 20 }));
  await host.settled(3);
  door.waiting.push(errand(4, 'deliver', { structure: 2, stuff: 'iron', amount: 9 }));
  await host.settled(3);
  assert.deepEqual(door.answered, [
    [1, 40],
    [2, 0],
    [3, null],
    [4, 6],
  ]);
  const ids = asked.filter(([ask]) => ask === 'deposit').map((each) => each[3]);
  assert.deepEqual(ids.slice(0, 2), [`${ROOM}:77:3:1`, `${ROOM}:77:3:1`], 'the same id, asked again');
  const delivered = asked.filter(([ask]) => ask === 'deliver').map((each) => each[4]);
  assert.deepEqual(delivered, [`${ROOM}:77:3:4`, `${ROOM}:77:3:4`], 'a delivery too: the accounts keep its answer');
});

test('a delivery the accounts used reads the plot again; a take and the horn answer what the accounts say', async () => {
  const door = doorOf();
  const { accounts, asked } = accountsOf({
    plot: () => plotOf(1),
    deliver: [5, 0],
    takeStores: 2,
    soundHorn: 0,
  });
  const host = new OutpostHost(door, accounts, ROOM, GROUND, guarded, saves);
  door.waiting.push(
    errand(1, 'deliver', { structure: 4, stuff: 'canvas', amount: 9 }),
    errand(2, 'take', { stuff: 'island', amount: 3 }),
    errand(3, 'horn'),
    errand(4, 'deliver', { structure: 4, stuff: 'iron', amount: 1 }),
  );
  host.tick();
  for (let times = 0; times < 5; times++) await settle();
  door.answered.sort(([one], [two]) => one - two);
  assert.deepEqual(door.answered, [
    [1, 5],
    [2, 2],
    [3, 0],
    [4, 0],
  ]);
  const delivered = asked.find(([ask]) => ask === 'deliver');
  assert.deepEqual(delivered?.slice(0, 4), ['deliver', 'salt', ROOM, { id: 4, stuff: 'canvas', amount: 9 }]);
  assert.ok(
    asked.some(([ask]) => ask === 'outpost'),
    'read again after the delivery',
  );
  assert.equal(door.stood, 1);
});

test('a plot changed is read again, and a leaving player’s last save waits for their errands in flight', async () => {
  const door = doorOf();
  let answer: (moved: string) => void = () => undefined;
  const { accounts } = accountsOf({ plot: () => plotOf(1) });
  (accounts as { deposit: unknown }).deposit = () => new Promise((done) => (answer = done));
  const host = new OutpostHost(door, accounts, ROOM, GROUND, guarded, saves);
  door.waiting.push(errand(1, 'changed'), errand(2, 'deposit', { amount: 10 }));
  let parted = false;
  const leaving = host.settled(3, 60_000).then(() => (parted = true));
  await settle();
  assert.equal(door.stood, 1, 'the plot read again');
  assert.equal(parted, false, 'the deposit is still with the accounts');
  answer('moved');
  await leaving;
  assert.deepEqual(door.answered, [[2, 10]], 'answered before the last save');
  let gave = false;
  await host.settled(9, 60_000).then(() => (gave = true));
  assert.ok(gave, 'a player with none in flight leaves at once');
});

test('one out of the guild dungeon stands at the foot of the Delve Gate’s steps, where a gate stands at a tier', async () => {
  const gate = (tier: number, turn: number, building = 0) => ({
    id: 2,
    kind: 'gate',
    tier,
    building,
    x: 2,
    y: 2,
    turn,
  });
  const withGate = (standing: ReturnType<typeof gate>) => ({ structures: [hall(1), standing], decor: [] });
  const south = gateDoor(withGate(gate(1, 0)), GROUND, STAFF);
  const middle = placeOf(gate(1, 0), GROUND, STAFF).at;
  assert.deepEqual(south?.slice(0, 2), socketOf(gate(1, 0), GROUND, STAFF, 'door'));
  assert.ok(south && south[1] < middle[1], 'the steps’ foot lies north of its middle');
  assert.ok(south && Math.abs(south[2] - Math.PI) < 1e-9, 'unturned, up the steps out to the south');
  const west = gateDoor(withGate(gate(2, 1)), GROUND, STAFF);
  assert.ok(west && Math.abs(west[2] - (3 * Math.PI) / 2) < 1e-9, 'a quarter turned clockwise, out to the west');
  assert.equal(gateDoor(withGate(gate(0, 0, 1)), GROUND, STAFF), null, 'first being built');
  assert.equal(gateDoor(plotOf(1), GROUND, STAFF), null, 'none placed');
  const door = doorOf();
  const { accounts } = accountsOf({
    plot: () => ({ ...withGate(gate(3, 0)), structures: [{ ...gate(3, 0), spent: 0, delivered: {} }] }),
  });
  await new OutpostHost(door, accounts, ROOM, GROUND, guarded, saves).read();
  assert.deepEqual(door.gates, [south], 'the host tells the room');
});

test('a deposit or delivery goes only once the character it was taken from is saved, and a take’s gift is saved at once', async () => {
  const door = doorOf();
  const { accounts, asked } = accountsOf({ deposit: 'moved', deliver: 3, takeStores: 2 });
  let holds = false;
  const saving = (player: number) => {
    asked.push(['save', player]);
    return Promise.resolve(holds);
  };
  const host = new OutpostHost(door, accounts, ROOM, GROUND, guarded, saving, 1, [1]);
  door.waiting.push(errand(1, 'deposit', { amount: 40 }));
  await host.settled(3);
  assert.deepEqual(door.answered, [[1, null]], 'unsaved, given back whole');
  assert.deepEqual(asked, [['save', 3]], 'and never asked');
  holds = true;
  door.waiting.push(errand(2, 'deliver', { structure: 1, stuff: 'iron', amount: 5 }));
  await host.settled(3);
  door.waiting.push(errand(3, 'take', { stuff: 'iron', amount: 2 }));
  await host.settled(3);
  assert.deepEqual(door.answered.slice(1), [
    [2, 3],
    [3, 2],
  ]);
  const order = asked.map(([ask]) => ask).filter((ask) => ask !== 'outpost');
  assert.deepEqual(order, ['save', 'save', 'deliver', 'takeStores', 'save'], 'saved before a delivery, after a take');
});

test('an errand the accounts throw on is asked again under its id for minutes before it is given back', async () => {
  const waited = AGAIN_WAITS_MS.reduce((total, millis) => total + millis, 0);
  assert.ok(waited >= 4 * 60_000 && waited <= 10 * 60_000, `${waited} ms`);
  const door = doorOf();
  const { accounts, asked } = accountsOf({ deposit: [...Array(8).fill(new Error('down')), 'moved'] });
  const host = new OutpostHost(door, accounts, ROOM, GROUND, guarded, saves, 1, Array(8).fill(1));
  door.waiting.push(errand(1, 'deposit', { amount: 40 }));
  await host.settled(3);
  assert.deepEqual(door.answered, [[1, 40]], 'answered as the first try went through');
  assert.equal(new Set(asked.map((each) => each[3])).size, 1, 'under one id');
});

test('a guild whose banner is empty or no banner stands its plot under the banner its name draws', async () => {
  for (const banner of ['', '[]', '{"staff":1}']) {
    const door = doorOf();
    const { accounts } = accountsOf({ plot: () => plotOf(1), banner });
    await new OutpostHost(door, accounts, ROOM, GROUND, guarded, saves).read();
    assert.deepEqual(door.blocks, plotBoxes(plotOf(1), GROUND, STAFF), JSON.stringify(banner));
  }
});

test('a leaving player’s wait arms its timer only while an errand is in flight, and clears it once settled', async () => {
  const timers = () => process.getActiveResourcesInfo().filter((kind) => kind === 'Timeout').length;
  const door = doorOf();
  const { accounts } = accountsOf({ deposit: 'moved' });
  const host = new OutpostHost(door, accounts, ROOM, GROUND, guarded, saves);
  const before = timers();
  await host.settled(9);
  assert.equal(timers(), before, 'none in flight, none armed');
  door.waiting.push(errand(1, 'deposit', { amount: 5 }));
  await host.settled(3);
  assert.equal(timers(), before, 'cleared once answered');
});
