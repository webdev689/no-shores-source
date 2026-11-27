import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SLOOP_HULL } from './hulls.ts';
import { CITY_LAMPS } from '../sky/lamps.ts';
import { lanternAt, RETRY_MS, ShipModels, shipSeed } from './shipModels.ts';
import { standIns } from '../standIns.ts';
import type { ShipPlace, ShipView } from './shipView.ts';

/** A model that records the slot each ship is drawn in; its bounds a metre round its place, measured from the eye. */
const viewOf = (slots: number[]) =>
  ({
    drawInto: (...args: unknown[]) => slots.push(args[3] as number),
    lanterns: [],
    lamps: [],
    boundsAt: (place: ShipPlace, eye: readonly number[]) => [
      place.x - (eye[0] ?? 0),
      place.y - (eye[1] ?? 0),
      place.z - (eye[2] ?? 0),
      1,
    ],
  }) as unknown as ShipView;
const settled = () => new Promise((done) => setTimeout(done, 0));
/** At the eye, looking level to the north (-y), its depth reversed as the game's: 1 at 0.1 m, 0 at 1 km. Column by
 *  column, what east, south and up add to the clip point's across, up, depth and distance ahead. */
const CAMERA = {
  fromEye: Float32Array.from([1, 0, 0, 0, 0, 0, 0.1 / 999.9, -1, 0, 1, 0, 0, 0, 0, 100 / 999.9, 0]),
  eye: [0, 0, 0] as const,
};
const PLACE = { x: 0, y: -50, z: 0, heading: 0, pitch: 0, roll: 0 };

test("each hull's model is fetched once, and a hull still coming is shown as the Sloop", async () => {
  const opened: number[] = [];
  const models = new ShipModels(async (hull) => {
    opened.push(hull);
    return viewOf([]);
  });
  standIns();
  assert.equal(models.shown(3), SLOOP_HULL, 'the Frigate is the Sloop until its own comes');
  assert.deepEqual(standIns(), ['hulls'], 'standing in for it');
  models.model(3);
  await models.load(3);
  models.model(3);
  assert.equal(models.shown(3), 3, 'and its own once it has');
  assert.deepEqual(standIns(), [], 'nothing in its place');
  assert.deepEqual(opened, [3]);
});

test('a failed fetch is said once and tried again from a later frame, waiting longer each time', async () => {
  let clock = 0;
  const [opened, said] = [[] as number[], [] as unknown[]];
  let failing = true;
  const models = new ShipModels(
    async (hull) => {
      opened.push(clock);
      if (failing) throw new Error(`hull ${hull} did not come`);
      return viewOf([]);
    },
    (error) => said.push(error),
    () => clock,
  );
  models.model(2);
  await settled();
  standIns();
  assert.equal(models.shown(2), SLOOP_HULL);
  assert.deepEqual(standIns(), [], 'a hull that failed holds up no veil while it waits to be tried again');
  clock = RETRY_MS.first - 1;
  models.model(2);
  await settled();
  assert.deepEqual(opened, [0], 'not again before its wait');
  clock = RETRY_MS.first;
  models.model(2);
  await settled();
  clock += RETRY_MS.first * 2 - 1;
  models.model(2);
  await settled();
  assert.deepEqual(opened, [0, RETRY_MS.first], 'then again, the next wait twice as long');
  assert.equal(said.length, 1, 'said once');
  failing = false;
  clock += 1;
  models.model(2);
  await settled();
  assert.equal(models.shown(2), 2, 'and drawn once it comes');
});

test("the ships of one hull take that model's slots in turn", async () => {
  const [sloop, brig] = [[] as number[], [] as number[]];
  const models = new ShipModels(async (hull) => viewOf(hull === 2 ? brig : sloop));
  await Promise.all([models.load(0), models.load(2)]);
  const ship = (hull: number) => ({ hull, place: PLACE, rig: null, look: { side: 'friendly' as const } });
  models.draw({} as GPURenderPassEncoder, [ship(2), ship(0), ship(2), ship(2), ship(0)], CAMERA);
  assert.deepEqual(
    [brig, sloop],
    [
      [0, 1, 2],
      [0, 1],
    ],
  );
});

test("a failure a caller of load waited on is the caller's to say, never said again by a frame", async () => {
  let clock = 0;
  const said: unknown[] = [];
  const models = new ShipModels(
    () => Promise.reject(new Error('no mesh')),
    (error) => said.push(error),
    () => clock,
  );
  models.model(1);
  await assert.rejects(models.load(1));
  await settled();
  clock = RETRY_MS.first;
  models.model(1);
  await settled();
  await assert.rejects(models.load(1));
  await settled();
  assert.equal(said.length, 0);
});

test('a ship out of view is not drawn, and the next of its hull still takes the slot after it', async () => {
  const slots: number[] = [];
  const models = new ShipModels(async () => viewOf(slots));
  await models.load(0);
  // A ship this far north of the eye, ahead of it; a negative distance puts it behind.
  const ahead = (metres: number) => ({
    hull: 0,
    place: { ...PLACE, y: -metres },
    rig: null,
    look: { side: 'tithe' as const },
  });
  models.draw({} as GPURenderPassEncoder, [ahead(50), ahead(-50), ahead(80)], CAMERA);
  assert.deepEqual(slots, [0, 2], 'the one behind the eye is left out, its slot kept');
});

test('a lantern burns where its ship carries it: turned with its heading and heel, and as large as it is drawn', () => {
  const [east, south, up] = lanternAt({ ...PLACE, heading: Math.PI / 2, scale: 2 }, [-10, 0, 4]);
  // Heading east, ten metres aft is ten to the west, doubled.
  assert.ok(Math.abs(east + 20) < 1e-9 && Math.abs(south + 50) < 1e-9 && Math.abs(up - 8) < 1e-9);
});

test("each ship's lanterns light the sky's lamps, in view or not, with the fight's lights, told only when they change", async () => {
  // A device that answers every call with itself, enough for the halos' puffs to be laid.
  const device: unknown = new Proxy(() => device, { get: () => device, apply: () => device });
  const lit = {
    ...viewOf([]),
    lanterns: [[-10, 0, 4]],
    lamps: [[-10, 0, 4]],
    gpu: { device, format: 'bgra8unorm' },
  } as unknown as ShipView;
  const models = new ShipModels(async () => lit);
  await models.load(0);
  const ship = (y: number) => ({ hull: 0, place: { ...PLACE, y }, rig: null, look: { side: 'friendly' as const } });
  models.draw({} as GPURenderPassEncoder, [ship(-50), ship(50)], CAMERA, undefined, 3);
  const flash = { at: [1, 2, 3] as const, reachM: 26, light: [1, 1, 1] as const, seed: 9 };
  models.shine([flash]);
  const shown = () => CITY_LAMPS.current.filter((lamp) => lamp.reachM === 13 || lamp === flash);
  assert.deepEqual(
    shown().map((lamp) => lamp.at),
    [
      [0, -40, 4],
      [0, 60, 4],
      [1, 2, 3],
    ],
    'both ships (heading north, so ten metres aft is ten south), the one behind the eye too, then the flash',
  );
  const first = CITY_LAMPS.current;
  models.draw({} as GPURenderPassEncoder, [ship(-40), ship(50)], CAMERA, undefined, 4);
  models.shine([flash]);
  assert.equal(CITY_LAMPS.current, first, 'the same lamps, moved in place');
  assert.deepEqual(shown()[0]?.at, [0, -30, 4]);
  models.draw({} as GPURenderPassEncoder, [{ ...ship(-40), place: { ...PLACE, z: -4 } }], CAMERA, undefined, 5);
  models.shine();
  assert.equal(shown().length, 0, 'out on a ship sinking');
  models.draw({} as GPURenderPassEncoder, [], CAMERA, undefined, 5);
  models.shine();
  assert.equal(shown().length, 0, 'gone with the ships');
});

test("a ship's lantern flickers as a lantern, by a seed of its own ship: no two ships, of one hull or two, in step", async () => {
  const device: unknown = new Proxy(() => device, { get: () => device, apply: () => device });
  const lit = {
    ...viewOf([]),
    lanterns: [[-10, 0, 4]],
    lamps: [[-10, 0, 4]],
    gpu: { device, format: 'bgra8unorm' },
  } as unknown as ShipView;
  const models = new ShipModels(async () => lit);
  await Promise.all([models.load(0), models.load(1)]);
  const ship = (hull: number) => ({ hull, place: PLACE, rig: null, look: { side: 'friendly' as const } });
  models.draw({} as GPURenderPassEncoder, [ship(0), ship(0), ship(1)], CAMERA, undefined, 3);
  models.shine();
  const lanterns = CITY_LAMPS.current.filter((lamp) => lamp.reachM === 13);
  assert.deepEqual(
    lanterns.map((lamp) => lamp.motion),
    ['lantern', 'lantern', 'lantern'],
  );
  assert.deepEqual(
    lanterns.map((lamp) => lamp.seed),
    [shipSeed(0, 0), shipSeed(0, 1), shipSeed(1, 0)],
  );
  assert.equal(new Set(lanterns.map((lamp) => lamp.seed)).size, 3);
  models.draw({} as GPURenderPassEncoder, [], CAMERA, undefined, 3);
  models.shine();
});

test("the Grey Tithe's ships and a ship running dark light no lamp and burn no glass, a lit one beside them does", async () => {
  const device: unknown = new Proxy(() => device, { get: () => device, apply: () => device });
  const burning: unknown[] = [];
  const lit = {
    ...viewOf([]),
    drawInto: (...args: unknown[]) => burning.push(args[7]),
    lanterns: [[-10, 0, 4]],
    lamps: [
      [-10, 0, 4],
      [-8, 2, 4],
    ],
    gpu: { device, format: 'bgra8unorm' },
  } as unknown as ShipView;
  const models = new ShipModels(async () => lit);
  await models.load(0);
  const ship = (look: { side: 'friendly' | 'tithe'; dark?: boolean }) => ({ hull: 0, place: PLACE, rig: null, look });
  const ships = [ship({ side: 'tithe' }), ship({ side: 'friendly', dark: true }), ship({ side: 'friendly' })];
  models.draw({} as GPURenderPassEncoder, ships, CAMERA, undefined, 3);
  models.shine();
  assert.equal(CITY_LAMPS.current.filter((lamp) => lamp.reachM === 13).length, 2, "only the lit ship's two lanterns");
  assert.deepEqual(burning, [null, null, 3], 'the dark ships draw their glass unlit');
  models.draw({} as GPURenderPassEncoder, [], CAMERA, undefined, 3);
  models.shine();
});
