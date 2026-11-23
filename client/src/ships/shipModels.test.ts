import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SLOOP_HULL } from './hulls.ts';
import { RETRY_MS, ShipModels } from './shipModels.ts';
import type { ShipPlace, ShipView } from './shipView.ts';

/** A model that records the slot each ship is drawn in; its bounds a metre round its place, measured from the eye. */
const viewOf = (slots: number[]) =>
  ({
    drawInto: (...args: unknown[]) => slots.push(args[3] as number),
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
  assert.equal(models.shown(3), SLOOP_HULL, 'the Frigate is the Sloop until its own comes');
  models.model(3);
  await models.load(3);
  models.model(3);
  assert.equal(models.shown(3), 3, 'and its own once it has');
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
  const ship = (hull: number) => ({ hull, place: PLACE, rig: null, look: { side: 'pirate' as const } });
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
    look: { side: 'pirate' as const },
  });
  models.draw({} as GPURenderPassEncoder, [ahead(50), ahead(-50), ahead(80)], CAMERA);
  assert.deepEqual(slots, [0, 2], 'the one behind the eye is left out, its slot kept');
});
