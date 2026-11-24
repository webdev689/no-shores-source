import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SeenShip } from '../network/messages.ts';
import type { PlayerPlate } from '../network/plateMessages.ts';
import { SLOOP_HULL, plateOverM } from '../ships/hulls.ts';
import { SEA_PLATE_RANGE_M, seaPlated, seaPlates } from './seaPlates.ts';

const ship = (player: number, x: number): SeenShip => ({
  player,
  x,
  y: 0,
  heading: 0,
  pace: 0,
  hull: 0,
  dress: [],
  name: [],
  emblem: 0,
});
const plate = (player: number, name: string, level: number): PlayerPlate => ({ player, name, level, menu: false });
const plates = new Map([
  [2, plate(2, 'Wooden_Osprey', 12)],
  [3, plate(3, '', 4)],
]);

test("each other player's ship wears their plate over its masthead, as drawn, and one the room named none wears none", () => {
  const players = seaPlated([ship(2, 500), ship(3, 900), ship(4, 1_300)], plates, 5);
  assert.deepEqual(
    players.map((each) => [each.id, each.plate.name, each.plate.level]),
    [
      [2, 'Wooden_Osprey', 12],
      [3, '', 4],
    ],
  );
  assert.deepEqual(players[0]?.feet, [500, 0, plateOverM(SLOOP_HULL) * 5], 'over the masthead of a ship drawn 5 times');
  assert.equal(players[0]?.vessel, undefined, 'an unnamed ship shows no name');
});

test("another player's ship wears its plate over its own hull's masthead, its name under the player's", () => {
  const frigate = { ...ship(2, 500), hull: 3, name: [0, 1] };
  const [plated] = seaPlated([frigate], plates, 2);
  assert.deepEqual(plated?.feet, [500, 0, plateOverM(3) * 2], "over the Frigate's masthead");
  assert.ok(plateOverM(3) > plateOverM(SLOOP_HULL), 'which stands higher than the Sloop’s');
  assert.match(plated?.vessel ?? '', /^the \w+ \w+$/);
});

test('a ship wears its mark out to the distance ships are seen at, before the eye, and none past it or behind', () => {
  const marks = seaPlates();
  const camera = { eye: [0, 0, 20] as const, forward: [1, 0, 0] as const, focal: 1.7 };
  // A pinhole looking east: a point's place on a 1000 by 600 picture.
  const spot = ([x, y, z]: readonly [number, number, number]) =>
    x > 0 ? { x: 500 + (y / x) * 850, y: 300 - ((z - 20) / x) * 850, depth: x } : null;
  const shipAt = (id: number, x: number) => ({
    id,
    feet: [x, 0, 80] as const,
    plate: plate(id, `S${id}`, 3),
    company: false,
  });
  const players = [shipAt(1, 3_000), shipAt(2, SEA_PLATE_RANGE_M + 500), shipAt(3, -2_000)];
  marks.update(players, { camera, blocked: () => false, spot, own: null }, 1 / 60);
  const ids = marks.nodes().map((node) => node.id);
  assert.deepEqual(ids, ['player-plate-1']);
});
