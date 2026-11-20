import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { labelPoints } from '../heldmap/watersWash.ts';
import { Compass, SHIP_MARK_COLOURS } from '../plus/compass.ts';
import type { Swell } from '../rules/landRules.ts';
import { startWatersRules, type TrafficShip } from '../rules/watersRules.ts';
import { hullWaterline } from '../ships/hulls.ts';
import { poseOnSwell } from '../ships/swellPose.ts';
import type { DrawnShip } from '../ships/shipModels.ts';
import { ASK_EVERY_S, friendlyFrame, FriendlyShips, friendlyMarks, reckoned } from './friendlyShips.ts';
import { mapWatersOf } from './pageWaters.ts';
import { seaShipMarks } from './seaHud.ts';

const shipAt = (id: number, position: [number, number], direction: [number, number]): TrafficShip => ({
  id,
  route: 0,
  fromPort: 0,
  toPort: 1,
  hull: id % 4,
  position,
  direction,
  progressM: 0,
  lengthM: 1_000_000,
});
const still = { swell: undefined, depthAt: () => 50 };
/** The pace the tests' ships keep, m/s. */
const FRIENDLY_SPEED_M_S = 5;
/** As many of each hull as the ships layer holds. */
const anyNumber = () => 16;

async function opened() {
  const bytes = await readFile(
    new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url),
  );
  const world = new URL('../../../content/world/', import.meta.url);
  const rules = startWatersRules(new WebAssembly.Module(bytes));
  const ports = [];
  for (let n = 1; n <= 9; n += 1) {
    const edits = JSON.parse(await readFile(new URL(`land/continent-${n}.json`, world), 'utf8')) as {
      city: { id: string; name: string; centre: [number, number] };
    };
    ports.push({ ...edits.city, continent: `continent-${n}` });
  }
  return { rules, table: rules.open(await readFile(new URL('layout.json', world), 'utf8'), ports) };
}

test('on the real waters every water has a label point inside it', async () => {
  const { rules, table } = await opened();
  const waters = mapWatersOf(table, rules.grid(4_800));
  const points = labelPoints(waters);
  assert.equal(points.size, 9);
  for (const [continent, [x, y]] of points)
    assert.equal(waters.water[Math.floor(y / 4_800) * waters.columns + Math.floor(x / 4_800)], continent);
});

test('the ships are those the door places at the given world time, and run on at its pace', async () => {
  const { rules, table } = await opened();
  const roadstead = table.ports[0]?.roadstead ?? [0, 0];
  const time = 1_800_000_000;
  const speed = table.friendlySpeedMS;
  const fleet = new FriendlyShips((centre, radiusM, timeS) => rules.shipsNear(centre, radiusM, timeS), speed);
  const seen = fleet.near(roadstead, 15_000, time, 0);
  const door = rules.shipsNear(roadstead, 15_000, time);
  assert.ok(seen.length > 0, 'ships come and go off Overlook');
  assert.deepEqual(seen.map((ship) => ship.id).sort(), door.map((ship) => ship.id).sort());
  for (const ship of seen) {
    const asked = door.find((each) => each.id === ship.id);
    assert.deepEqual([ship.x, ship.y], asked?.position, 'first seen where the door places her');
  }
  // A ship that keeps her leg for the next 10 s is reckoned on along it, where the door has her then.
  const onLeg = door.filter((ship) => {
    const later = rules.ship(ship.id, time + 10);
    return later && Math.abs(later.direction[0] - ship.direction[0]) < 1e-9;
  });
  assert.ok(onLeg.length > 0);
  for (const ship of onLeg) {
    const later = rules.ship(ship.id, time + 10);
    const run = reckoned(ship, time, time + 10, speed);
    assert.ok(later && Math.hypot(run[0] - later.position[0], run[1] - later.position[1]) < 0.01);
  }
});

test('between answers a ship moves on smoothly along her way, and eases onto a new leg', () => {
  // As the door does: she sails east from the origin from time 100, then south from (10.5, 0) once answered so.
  let answer = (timeS: number) => [shipAt(7, [FRIENDLY_SPEED_M_S * (timeS - 100), 0], [1, 0])];
  let asked = 0;
  const fleet = new FriendlyShips((_centre, _radius, timeS) => {
    asked++;
    return answer(timeS);
  }, FRIENDLY_SPEED_M_S);
  fleet.near([0, 0], 10_000, 100, 0);
  let [last] = fleet.near([0, 0], 10_000, 100.1, 0.1);
  assert.equal(asked, 1, 'not asked again within a quarter second');
  assert.ok(last && Math.abs(last.x - FRIENDLY_SPEED_M_S * 0.1) < 1e-9, 'reckoned on along her way between answers');
  for (let step = 1; step <= 40; step++) [last] = fleet.near([0, 0], 10_000, 100.1 + step * 0.05, 0.05);
  assert.ok(asked >= 8, `asked a few times a second: ${asked}`);
  assert.ok(last && Math.abs(last.x - FRIENDLY_SPEED_M_S * 2.1) < 1, `she keeps her pace: ${last?.x}`);
  assert.ok(Math.abs(last.heading - Math.PI / 2) < 1e-9, 'heading east');
  // She turns onto a leg south: the drawn ship swings round over the next frames, not at once.
  answer = (timeS) => [shipAt(7, [10.5, FRIENDLY_SPEED_M_S * (timeS - 102.1)], [0, 1])];
  const [turning] = fleet.near([0, 0], 10_000, 102.1 + ASK_EVERY_S, ASK_EVERY_S);
  assert.ok(turning && turning.heading > Math.PI / 2 + 0.1 && turning.heading < Math.PI - 0.1, `${turning?.heading}`);
  assert.ok(turning && turning.y < FRIENDLY_SPEED_M_S * ASK_EVERY_S, 'and eases onto her new leg');
  let settled = turning;
  for (let step = 1; step <= 40; step++) [settled] = fleet.near([0, 0], 10_000, 102.35 + step * 0.05, 0.05);
  assert.ok(settled && Math.abs(settled.heading - Math.PI) < 0.01 && Math.abs(settled.x - 10.5) < 0.1, 'then on it');
  answer = () => [];
  fleet.near([0, 0], 10_000, 103, 1);
  assert.deepEqual(fleet.near([0, 0], 10_000, 103.1, 0.1), [], 'gone once the door no longer has her');
});

test('at sea they are drawn as their hulls in friendly colours, sails set, at the size every ship is drawn', () => {
  const fleet = new FriendlyShips(() => [shipAt(2, [100, 0], [0, -1]), shipAt(5, [40, 0], [1, 0])], 5);
  const own = { x: 0, y: 0, heading: 0, halfLength: 5, halfBeam: 2, way: 0 };
  const view = { centre: [0, 0] as const, radiusM: 60_000, scale: 6 };
  const frame = friendlyFrame(fleet, view, still, [own], { seconds: 0.1, time: 3, slots: anyNumber });
  assert.deepEqual(
    frame.ships.map((ship) => [ship.hull, ship.place.scale, ship.look.side]),
    [
      [1, 6, 'friendly'],
      [2, 6, 'friendly'],
    ],
    'nearest first, each in her own hull',
  );
  for (const ship of frame.ships) assert.ok(ship.rig && ship.rig.sails.length > 0);
  assert.deepEqual(frame.hulls[0], own, 'her own footprint stays first');
  assert.equal(frame.hulls.length, 3);
  assert.ok((frame.hulls[1]?.halfLength ?? 0) > 6 * 5, 'a footprint as large as she is drawn');
});

test('on foot they are drawn at their true size, posed on the swell', () => {
  const fleet = new FriendlyShips(() => [shipAt(0, [3_000, 0], [1, 0])], 5);
  const view = { centre: [0, 0] as const, radiusM: 15_000, scale: 1 };
  const swell: Swell = {
    waves: [{ direction: [0, -1], number: (2 * Math.PI) / 60, frequency: 0.8, amplitude: 1, shift: 0, phase: 0 }],
    fullDepthM: 20,
    goneDepthM: 2,
    bearing: 0,
  };
  const deep = () => 50;
  const frame = friendlyFrame(fleet, view, { swell, depthAt: deep }, [], { seconds: 0.1, time: 3, slots: anyNumber });
  const place = frame.ships[0]?.place;
  assert.equal(place?.scale, 1);
  const { lengthM, beamM } = hullWaterline(0);
  const lies = { x: 3_000, y: 0, heading: Math.PI / 2, underWay: true };
  const pose = poseOnSwell(swell, deep, lies, lengthM / 2, beamM / 2, 3);
  assert.ok(Math.abs(pose.heave) + Math.abs(pose.pitch) + Math.abs(pose.roll) > 0, 'the swell moves her');
  assert.deepEqual([place?.z, place?.pitch, place?.roll], [pose.heave, pose.pitch, pose.roll]);
  assert.equal(frame.hulls.length, 1);
});

test('only as many of each hull as the ships layer can still draw are stepped, posed and footprinted: the nearest', () => {
  // Twenty Sloops (hull 0) and two Brigs (hull 2) round her; the room's own ships already take three Sloops' places.
  const sloops = Array.from({ length: 20 }, (_unused, n) => shipAt(4 * n, [1_000 * (20 - n), 0], [1, 0]));
  const brigs = [shipAt(2, [500, 0], [1, 0]), shipAt(6, [30_000, 0], [1, 0])];
  const fleet = new FriendlyShips(() => [...sloops, ...brigs], 5);
  const view = { centre: [0, 0] as const, radiusM: 60_000, scale: 1 };
  const slots = (hull: number) => (hull === 0 ? 16 - 3 : 16);
  const frame = friendlyFrame(fleet, view, still, [], { seconds: 0.1, time: 3, slots });
  const drawn = (hull: number) => frame.ships.filter((ship) => ship.hull === hull);
  assert.equal(drawn(0).length, 13);
  assert.equal(drawn(2).length, 2);
  const farthest = Math.max(...drawn(0).map((ship) => ship.place.x));
  assert.equal(farthest, 13_000, 'the nearest thirteen Sloops');
  assert.equal(frame.hulls.length, 15, 'a footprint for each ship drawn, none for the rest');
  assert.equal(frame.marks.length, 22, 'the compass still hears of every one');
});

test('a ship arrived lies at anchor where she is: reckoned nowhere, no way on her', () => {
  const arrived = { ...shipAt(0, [3_000, 0], [1, 0]), progressM: 1_000_000 };
  const fleet = new FriendlyShips(() => [arrived], 5);
  const view = { centre: [0, 0] as const, radiusM: 15_000, scale: 1 };
  assert.deepEqual(reckoned(arrived, 100, 160, 5), [3_000, 0]);
  fleet.near([0, 0], 15_000, 100, 0);
  const [lying] = fleet.near([0, 0], 15_000, 100.2, 0.2);
  assert.ok(lying && lying.x === 3_000 && lying.lying);
  const frame = friendlyFrame(fleet, view, still, [], { seconds: 0.1, time: 3, slots: anyNumber });
  assert.equal(frame.hulls[0]?.way, 0, 'no foam round a ship at anchor');
});

test('the compass marks friendly ships within 900 m in Overlook’s blue', () => {
  assert.equal(SHIP_MARK_COLOURS.friendly, '#2f5d9a');
  const marks = [
    ...seaShipMarks(null, { others: [], pirates: [] }),
    ...friendlyMarks([
      { id: 1, hull: 0, x: 0, y: -500, heading: 0 },
      { id: 2, hull: 0, x: 0, y: -2_000, heading: 0 },
    ]),
  ];
  const nodes: { style: Record<string, string>; hidden: boolean }[] = [];
  const element = () => {
    const node = { className: '', textContent: '', hidden: false, style: {} as Record<string, string>, append() {} };
    nodes.push(node);
    return node;
  };
  (globalThis as { document?: unknown }).document = { createElement: element };
  const compass = new Compass(element() as unknown as HTMLElement);
  compass.update(0, [0, 0], marks);
  const shown = nodes.filter((node) => node.style['borderBottomColor'] !== undefined && !node.hidden);
  assert.deepEqual(
    shown.map((node) => node.style['borderBottomColor']),
    ['#2f5d9a'],
    'only the one within 900 m',
  );
});

test('a ship at anchor at her roadstead lies with her sails furled; one under way has them set', () => {
  const arrived = { ...shipAt(0, [3_000, 0], [1, 0]), progressM: 1_000_000 };
  const sailing = shipAt(1, [-3_000, 0], [1, 0]);
  const fleet = new FriendlyShips(() => [arrived, sailing], 5);
  fleet.near([0, 0], 15_000, 100, 0);
  const near = fleet.near([0, 0], 15_000, 100.2, 0.2);
  const drawn = fleet.drawn(near, 1, still, 0, 0.1, 3);
  const furled = (ship: DrawnShip | undefined) =>
    ship?.rig
      .canvas()
      .every((points, index) =>
        points.every((point, place) => Math.abs(point - (ship.rig.sails[index]?.stowed[place] ?? 0)) < 1e-3),
      );
  const [lying, under] = [1, -1].map((side) => drawn.find((ship) => Math.sign(ship.place.x) === side));
  assert.ok(lying && under, 'both drawn');
  assert.equal(furled(lying), true, 'at anchor: furled');
  assert.equal(furled(under), false, 'under way: set');
});
