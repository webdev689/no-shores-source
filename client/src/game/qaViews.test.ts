import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { type Player } from '../player/player.ts';
import type { SkyReading } from '../sky/skyLaw.ts';
import { SKY_NOW, type ToldSky } from '../sky/skyDriver.ts';
import { shotOfOrbit, withQaEye } from './camera.ts';
import { QA_SHIP } from './qaShip.ts';
import { installQaViews, qaEye, qaLook, type QaView } from './qaViews.ts';
import type { NodeInfo } from './worldData.ts';

const ring = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
] as const;
const node = { id: 'n', ring, spawns: [[5, 5]], centre: [50, 50] } as unknown as NodeInfo;

test('a QA look takes the bearing as yaw and the camera as asked, a high one past the wheel limit', () => {
  const first = qaLook(ring, [40, 60, 90, 'first']);
  assert.equal(first?.yaw, Math.PI / 2);
  assert.equal(first?.view.firstPerson, true);
  const high = qaLook(ring, [40, 60, 0, 'third,200,40']);
  assert.equal(high?.view.distance, 200);
  assert.equal(high?.pitch, (40 * Math.PI) / 180);
  assert.equal(qaLook(ring, [40, 60, 0, 'third,60'])?.pitch, 0.1);
});

test('a QA look outside the node, or with a camera not understood, is refused', () => {
  assert.equal(qaLook(ring, [140, 60, 0, 'first']), null);
  assert.equal(qaLook(ring, [40, 60, 0, 'third,60,x']), null);
  assert.equal(qaLook(ring, [40, 60, 0, 'sideways']), null);
});

/** A host that records the arrivals it is asked for, and a hook installed on it. */
function hooked(search: string, offline: boolean) {
  const arrivals: { node: NodeInfo; facing: number }[] = [];
  const walker = { player: { body: { x: 5, y: 5 }, pitch: 0.1, view: { firstPerson: true } } as unknown as Player };
  const target: { __qaView?: (view: QaView) => Promise<boolean> } = {};
  installQaViews(target, search, offline, {
    node: () => node,
    arrive: async (arrived, facing) => void arrivals.push({ node: arrived, facing }),
    walker,
  });
  return { target, arrivals, walker };
}

test('the hook is installed offline with a spawn in the address, and never online or without one', () => {
  assert.ok(hooked('?at=n&spawn=1,2,3', true).target.__qaView);
  assert.equal(hooked('?at=n&spawn=1,2,3', false).target.__qaView, undefined);
  assert.equal(hooked('?at=n', true).target.__qaView, undefined);
});

test('a view arrives in the node with its point as the only spawn, and sets the camera after', async () => {
  const { target, arrivals, walker } = hooked('?spawn=1,2', true);
  assert.equal(await target.__qaView?.([40, 60, 90, 'third,200,40']), true);
  assert.deepEqual(arrivals[0]?.node.spawns, [[40, 60]]);
  assert.equal(arrivals[0]?.facing, Math.PI / 2);
  assert.equal(walker.player.view.distance, 200);
  assert.equal(walker.player.pitch, (40 * Math.PI) / 180);
  assert.equal(await target.__qaView?.([400, 60, 0, 'first']), false);
  assert.equal(arrivals.length, 1);
});

test('a QA eye stands the camera anywhere, off the node too (on the water), until it is let go', () => {
  const { target } = hooked('?spawn=1,2', true);
  const hook = target as { __qaEye?: (eye: readonly number[] | null) => boolean };
  assert.equal(hook.__qaEye?.([5000, -600, 12, 180, 2]), true);
  const lens = { fov: 1, near: 0.1, far: 9000 };
  const orbit = { targetX: 0, targetY: 0, targetZ: 0, yaw: 0, pitch: 0, distance: 5 };
  const shot = shotOfOrbit(orbit, lens, () => null, 0);
  assert.deepEqual(shot.eye, [5000, -600, 12]);
  assert.ok(Math.abs(shot.yaw - Math.PI) < 1e-12 && Math.abs(shot.pitch - (2 * Math.PI) / 180) < 1e-12);
  hook.__qaEye?.(null);
  assert.deepEqual(shotOfOrbit(orbit, lens, () => null, 0).eye.map(Math.round), [0, 5, 0]);
  assert.equal(hooked('?spawn=1,2', false).target.hasOwnProperty('__qaEye'), false);
});

test('a development page lends the picture driver the way to sea and the game it plays; a production one never', () => {
  const lend = (dev: boolean) => {
    const target: { __qaSea?: () => boolean; __qaGame?: object } = {};
    const game = { flow: { mode: 'foot' } };
    let sailed = 0;
    const host = { node: () => node, arrive: async () => undefined, walker: { player: {} as Player } };
    const sea = () => void ((sailed += 1), (game.flow = { mode: 'loading' }));
    const answer = (installQaViews(target, '?at=n&spawn=', true, { ...host, sea, game }, dev), target.__qaSea?.());
    return { target, sailed, game, answer };
  };
  const dev = lend(true);
  assert.equal(dev.sailed, 1);
  assert.equal(dev.answer, true);
  assert.equal(dev.target.__qaGame, dev.game);
  const production = lend(false);
  assert.equal(production.target.__qaSea, undefined);
  assert.equal(production.target.__qaGame, undefined);
});

test('the way to sea answers false, saying why, where the player is not on foot or the trip is not taken', () => {
  const said: string[] = [];
  const error = console.error;
  console.error = (words: string) => void said.push(words);
  try {
    const target: { __qaSea?: () => boolean } = {};
    const game = { flow: { mode: 'loading' } };
    let sailed = 0;
    const host = { node: () => node, arrive: async () => undefined, walker: { player: {} as Player } };
    installQaViews(target, '?spawn=', true, { ...host, sea: () => void (sailed += 1), game }, true);
    assert.equal(target.__qaSea?.(), false);
    assert.equal(sailed, 0, 'no trip asked under the veil');
    game.flow = { mode: 'foot' };
    assert.equal(target.__qaSea?.(), false, 'a trip the travel did not take');
    assert.deepEqual(said, [
      '__qaSea: the player is loading, not on foot',
      '__qaSea: the trip to the ship was not taken',
    ]);
  } finally {
    console.error = error;
  }
});

test('a QA eye stands the sea and the story cameras too, their lens kept', () => {
  const shot = { eye: [1, 2, 3] as const, yaw: 0, pitch: 0, fov: 0.9, near: 2, far: 60_000 };
  assert.equal(withQaEye(shot), shot);
  qaEye([10, 20, 30, 90, 10]);
  const stood = withQaEye(shot);
  assert.deepEqual([stood.eye, stood.fov, stood.near, stood.far], [[10, 20, 30], 0.9, 2, 60_000]);
  assert.ok(Math.abs(stood.yaw - Math.PI / 2) < 1e-12);
  qaEye(null);
  assert.equal(withQaEye(shot), shot);
});

test('a development page dresses the own ship as asked, and tells the sky, until let go', () => {
  const target: { __qaShip?: (look: object | null) => boolean; __qaSky?: (weather: object | null) => boolean } = {};
  const sky: { told: ToldSky | null } = { told: null };
  const host = { node: () => node, arrive: async () => undefined, walker: { player: {} as Player }, sky };
  installQaViews(target, '?spawn=', true, host, true);
  assert.equal(target.__qaShip?.({ hull: 2, dress: [2, 17] }), true);
  assert.deepEqual(QA_SHIP.look, { hull: 2, dress: [2, 17] });
  target.__qaShip?.(null);
  assert.equal(QA_SHIP.look, null);
  const reading = SKY_NOW.current.reading;
  SKY_NOW.current = { ...SKY_NOW.current, reading: { cloud: 0, falling: 0 } as unknown as SkyReading, worldS: 50 };
  try {
    assert.equal(target.__qaSky?.({ falling: 1 }), true);
    assert.deepEqual([sky.told?.weather.cloud, sky.told?.weather.falling, sky.told?.hourS], [0, 1, 50]);
    target.__qaSky?.(null);
    assert.equal(sky.told, null);
  } finally {
    SKY_NOW.current = { ...SKY_NOW.current, reading };
  }
});

test('a development page lends the picture driver the game it plays online too, as a live room plays it', () => {
  const lend = (dev: boolean) => {
    const target: { __qaGame?: object; __qaView?: unknown } = {};
    const game = { flow: { mode: 'foot' } };
    const host = { node: () => node, arrive: async () => undefined, walker: { player: {} as Player } };
    installQaViews(target, '?room=ws://127.0.0.1:8787', false, { ...host, sea: () => undefined, game }, dev);
    return { target, game };
  };
  const dev = lend(true);
  assert.equal(dev.target.__qaGame, dev.game);
  assert.equal(dev.target.__qaView, undefined, 'no arriving anywhere in a live room');
  assert.equal(lend(false).target.__qaGame, undefined);
});
