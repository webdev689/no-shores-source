import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SLOOP_HULL } from './hulls.ts';
import { RETRY_MS, ShipModels } from './shipModels.ts';
import type { ShipView } from './shipView.ts';

/** A model that records the slot each ship is drawn in. */
const viewOf = (slots: number[]) =>
  ({ drawInto: (...args: unknown[]) => slots.push(args[3] as number) }) as unknown as ShipView;
const settled = () => new Promise((done) => setTimeout(done, 0));
const PLACE = { x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0 };
const CAMERA = { fromEye: new Float32Array(16), eye: [0, 0, 0] as const };

test("each hull's model is fetched once, and a hull still coming is shown as the Sloop", async () => {
  const opened: number[] = [];
  const models = new ShipModels(async (hull) => {
    opened.push(hull);
    return viewOf([]);
  });
  assert.equal(models.shown(3), SLOOP_HULL, 'the Frigate is the Sloop until hers comes');
  models.model(3);
  await models.load(3);
  models.model(3);
  assert.equal(models.shown(3), 3, 'and her own once it has');
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
