import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blockReach } from '../../player/boom.ts';
import type { Block } from '../../rules/movementRules.ts';
import { type Shot, frameOf, onScreen } from '../camera.ts';
import type { StationInfo } from '../nodes.ts';
import { HEAD_M, counterShot, facesShot, hallShot } from './framing.ts';
import { HALL_STATIONS, STATIONS } from './plazaForTests.ts';

const VIEW = { width: 1600, height: 900 };
const GROUND = 30;
const ground = () => GROUND;
const OWN: Shot = { eye: [1000, 2030, GROUND + 3], yaw: 0, pitch: 0.2, fov: 1, near: 0.1, far: 3000 };

/** A solid box: its middle across and along, its half sizes, and its height from the ground (or `from` up). */
const box = (x: number, y: number, halfX: number, halfY: number, high: number, from = 0): Block => ({
  minX: x - halfX,
  maxX: x + halfX,
  minY: y - halfY,
  maxY: y + halfY,
  bottom: GROUND + from,
  top: GROUND + from + high,
});

const HALL_BLOCKS: Block[] = [
  ...[1886, 1870, 1854].flatMap((y) => [box(984, y, 1.4, 1.4, 14), box(1016, y, 1.4, 1.4, 14)]),
  box(965, 1870, 1, 31, 16),
  box(1035, 1870, 1, 31, 16),
  box(1000, 1839, 36, 1, 16),
  box(980, 1900.5, 16, 0.5, 16),
  box(1020, 1900.5, 16, 0.5, 16),
  box(1000, 1870, 36, 31, 2, 14),
];
/** The plaza's counters but the houses', which stand in the Hall, and a court wall 6 m before the Tack's. */
const PLAZA: StationInfo[] = [
  ...STATIONS.filter((station) => !['stormcallers', 'lamplighters', 'veiled'].includes(station.kind)),
  { kind: 'mail', keeper: [960, 2012], counter: [961.8, 2012] },
  ...HALL_STATIONS,
];
const TACK = STATIONS.find((station) => station.kind === 'tack') as StationInfo;
const COURT_WALL = box(TACK.counter[0], TACK.counter[1] + 6, 6, 0.5, 9);
const BLOCKS = [...HALL_BLOCKS, COURT_WALL];

const head = (station: StationInfo): readonly [number, number, number] => [...station.keeper, GROUND + HEAD_M];
const clear = (shot: Shot, point: readonly [number, number, number]) =>
  blockReach(shot.eye, point, BLOCKS, 0.05) >=
  Math.hypot(...point.map((each, axis) => each - (shot.eye[axis] ?? 0))) - 1e-6;
const seen = (shot: Shot, point: readonly [number, number, number]) => {
  const spot = onScreen(shot, VIEW, point);
  return spot !== null && spot[0] > 0 && spot[0] < VIEW.width && spot[1] > 0 && spot[1] < VIEW.height;
};
const inside = (shot: Shot) =>
  BLOCKS.some(
    (block) =>
      shot.eye[0] > block.minX &&
      shot.eye[0] < block.maxX &&
      shot.eye[1] > block.minY &&
      shot.eye[1] < block.maxY &&
      shot.eye[2] > block.bottom &&
      shot.eye[2] < block.top,
  );

test("every stop's eye has a clear line to each keeper's head and stall front, both in the view", () => {
  const stops = [['armorsmith', 'weaponsmith'], ['mage'], ['vault'], ['tailor'], ['tack'], ['mail'], ['harbourmaster']];
  for (const kinds of stops) {
    const shot = counterShot({ stations: PLAZA, groundAt: ground, blocks: BLOCKS }, kinds, OWN);
    assert.ok(shot && !inside(shot), `${kinds}: an eye in the open`);
    for (const kind of kinds) {
      const station = PLAZA.filter((each) => each.kind === kind).sort(
        (one, two) =>
          Math.hypot(one.counter[0] - shot.eye[0], one.counter[1] - shot.eye[1]) -
          Math.hypot(two.counter[0] - shot.eye[0], two.counter[1] - shot.eye[1]),
      )[0] as StationInfo;
      assert.ok(clear(shot, head(station)) && seen(shot, head(station)), `${kind}'s keeper seen`);
      const front: readonly [number, number, number] = [...station.counter, GROUND + 1];
      assert.ok(clear(shot, front) && seen(shot, front), `${kind}'s stall front seen`);
    }
  }
  const tack = counterShot({ stations: PLAZA, groundAt: ground, blocks: BLOCKS }, ['tack'], OWN);
  const plain = counterShot({ stations: PLAZA, groundAt: ground, blocks: [] }, ['tack'], OWN);
  assert.notDeepEqual(tack?.eye, plain?.eye, 'the court wall moves the eye off its first place');
  assert.equal(counterShot({ stations: PLAZA, groundAt: ground, blocks: [] }, ['nobody'], OWN), null);
});

test('the Hall is seen from inside, up under its roof by its door, down the nave to all three chapels', () => {
  const place = { stations: PLAZA, groundAt: ground, blocks: BLOCKS };
  const nave = hallShot(place, ['stormcallers', 'veiled', 'lamplighters'], OWN);
  assert.ok(nave && !inside(nave));
  const [x, y, z] = nave.eye;
  assert.ok(x > 966 && x < 1034 && y > 1885 && y < 1900, `in from its door: ${x}, ${y}`);
  assert.ok(z > GROUND + 6 && z < GROUND + 14, `up under its roof: ${z - GROUND}`);
  assert.ok(frameOf(nave).forward[1] < 0, 'looking down the nave, away from the door');
  for (const station of HALL_STATIONS) {
    assert.ok(clear(nave, head(station)), `${station.kind}'s keeper clear of the columns`);
    assert.ok(seen(nave, head(station)), `${station.kind}'s chapel in the view`);
    assert.ok(seen(nave, [station.keeper[0], station.keeper[1], GROUND + 5]), `${station.kind}'s banner in the view`);
  }
  for (const station of HALL_STATIONS) {
    const turned = hallShot(place, [station.kind], OWN);
    assert.ok(turned && clear(turned, head(station)), `turned to ${station.kind}, clear of the columns`);
    const spot = onScreen(turned, VIEW, head(station));
    assert.ok(spot && Math.abs(spot[0] - VIEW.width / 2) < VIEW.width * 0.2, `${station.kind}'s chapel in the middle`);
  }
});

test('her farewell is seen from the side, both faces in the view', () => {
  const stranger: [number, number, number] = [1000, 2027.8, GROUND];
  const player: [number, number, number] = [1000, 2030, GROUND];
  const shot = facesShot(OWN, stranger, player, []);
  for (const [east, south, up] of [stranger, player])
    assert.ok(seen(shot, [east, south, up + HEAD_M]), 'a face in the view');
  const away = Math.hypot(shot.eye[0] - 1000, shot.eye[1] - 2028.9);
  assert.ok(away > 2 && away < 6 && Math.abs(shot.eye[2] - (GROUND + HEAD_M)) < 1, `close and level: ${away}`);
  const walled = facesShot(OWN, stranger, player, [box(1003.5, 2029, 0.5, 4, 4)]);
  assert.ok(walled.eye[0] < 1000, 'from the side a wall leaves clear');
});

test("each place stands in the view's upper part, clear of the dialogue box over its lower middle", () => {
  const place = { stations: PLAZA, groundAt: ground, blocks: BLOCKS };
  const shots: [string, Shot | null, readonly [number, number, number]][] = [
    ['tack', counterShot(place, ['tack'], OWN), head(TACK)],
    ['storm', hallShot(place, ['stormcallers'], OWN), head(HALL_STATIONS[0] as StationInfo)],
  ];
  for (const [name, shot, point] of shots) {
    const spot = shot && onScreen(shot, VIEW, point);
    assert.ok(spot && spot[1] < VIEW.height * 0.42, `${name}'s keeper above the box: ${spot?.[1]}`);
  }
});

test('a place no eye sees clearly gives no shot, so the view stays where it is', () => {
  const walled = { stations: PLAZA, groundAt: ground, blocks: [box(1000, 2000, 400, 400, 60)] };
  assert.equal(counterShot(walled, ['tack'], OWN), null);
  assert.equal(hallShot(walled, ['stormcallers'], OWN), null);
});

test("a single counter is seen from about a keeper's height first, under a stall's awning", () => {
  // A stall's awning is drawn, not one of the solids the lines are tested against, so the order alone keeps it clear.
  const place = { stations: PLAZA, groundAt: ground, blocks: [] };
  const shot = counterShot(place, ['tack'], OWN);
  assert.ok(shot && shot.eye[2] < GROUND + 3.5, `low enough to see under it: ${shot && shot.eye[2] - GROUND}`);
  const pair = counterShot(place, ['armorsmith', 'weaponsmith'], OWN);
  assert.ok(pair && pair.eye[2] > GROUND + 6, 'a group from over them');
});
