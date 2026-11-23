import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Box } from '../client/src/game/guild/outpostPlaces.ts';
import { plotBoxes } from '../client/src/game/guild/outpostPlaces.ts';
import { type OutpostAccounts, OutpostHost, outpostGround } from './outpostHost.ts';
import type { Errand } from './roomDoor.ts';

const ROOM = 'node-oakfast-landing--guild-0a1b2c3d';
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
function accountsOf(answers: { plot?: () => ReturnType<typeof plotOf>; [ask: string]: unknown }) {
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
      return Promise.resolve(plot ? { guild: 'g', name: 'Salt', banner: '{}', site: 'oakfast-landing', plot } : null);
    },
    deposit: (...args: unknown[]) => (asked.push(['deposit', ...args]), answering('deposit')),
    deliver: (...args: unknown[]) => (asked.push(['deliver', ...args]), answering('deliver')),
    takeStores: (...args: unknown[]) => (asked.push(['takeStores', ...args]), answering('takeStores')),
    soundHorn: (...args: unknown[]) => (asked.push(['soundHorn', ...args]), answering('soundHorn')),
  } as unknown as OutpostAccounts;
  return { accounts, asked };
}

const guarded = <T>(call: () => T) => call();
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
  const host = new OutpostHost(door, accounts, ROOM, GROUND, guarded);
  await host.read();
  const first = plotBoxes(plotOf(1), GROUND, 'driftwood');
  assert.ok(first.length > 0);
  assert.deepEqual(door.blocks, first);
  tier = 2;
  await host.read();
  assert.deepEqual(door.blocks, plotBoxes(plotOf(2), GROUND, 'driftwood'), 'the old taken, the new stood');
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
  const host = new OutpostHost(door, accounts, ROOM, GROUND, guarded);
  await host.read();
  const standing = [...door.blocks];
  broken = true;
  await host.read();
  assert.deepEqual(door.blocks, standing);
  assert.equal(door.stood, 1);
});

test('a deposit is asked again under its one id while the accounts throw, and given back whole only if they never answer', async () => {
  const door = doorOf();
  const { accounts, asked } = accountsOf({
    deposit: [new Error('blip'), 'already', 'refused', ...Array(3).fill(new Error('down'))],
  });
  const host = new OutpostHost(door, accounts, ROOM, GROUND, guarded, 77);
  door.waiting.push(errand(1, 'deposit', { amount: 40 }));
  host.tick();
  await settle();
  door.waiting.push(errand(2, 'deposit', { amount: 30 }), errand(3, 'deposit', { amount: 20 }));
  host.tick();
  await settle();
  await settle();
  assert.deepEqual(door.answered, [
    [1, 40],
    [2, 0],
    [3, null],
  ]);
  const ids = asked.filter(([ask]) => ask === 'deposit').map((each) => each[3]);
  assert.deepEqual(ids.slice(0, 2), [`${ROOM}:77:3:1`, `${ROOM}:77:3:1`], 'the same id, asked again');
});

test('a delivery the accounts used reads the plot again; a take and the horn answer what the accounts say', async () => {
  const door = doorOf();
  const { accounts, asked } = accountsOf({
    plot: () => plotOf(1),
    deliver: [5, new Error('down')],
    takeStores: 2,
    soundHorn: 0,
  });
  const host = new OutpostHost(door, accounts, ROOM, GROUND, guarded);
  door.waiting.push(
    errand(1, 'deliver', { structure: 4, stuff: 'canvas', amount: 9 }),
    errand(2, 'take', { stuff: 'island', amount: 3 }),
    errand(3, 'horn'),
    errand(4, 'deliver', { structure: 4, stuff: 'iron', amount: 1 }),
  );
  host.tick();
  await settle();
  await settle();
  assert.deepEqual(door.answered, [
    [1, 5],
    [2, 2],
    [3, 0],
    [4, null],
  ]);
  assert.deepEqual(asked[0], ['deliver', 'salt', ROOM, { id: 4, stuff: 'canvas', amount: 9 }]);
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
  const host = new OutpostHost(door, accounts, ROOM, GROUND, guarded);
  door.waiting.push(errand(1, 'changed'), errand(2, 'deposit', { amount: 10 }));
  let parted = false;
  const leaving = host.settled(3, () => new Promise(() => undefined)).then(() => (parted = true));
  await settle();
  assert.equal(door.stood, 1, 'the plot read again');
  assert.equal(parted, false, 'the deposit is still with the accounts');
  answer('moved');
  await leaving;
  assert.deepEqual(door.answered, [[2, 10]], 'answered before the last save');
  let gave = false;
  await host.settled(9, () => new Promise(() => undefined)).then(() => (gave = true));
  assert.ok(gave, 'a player with none in flight leaves at once');
});
