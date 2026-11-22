import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MarkDrawer } from '../editor/naval.ts';
import { sweptBoxes } from '../editor/shipClear.ts';
import { SLOOP_HULL } from '../ships/hulls.ts';
import { eyeFor, FIELD_OF_VIEW, HEIGHT } from '../overworld/overworldCamera.ts';
import type { FightCaptain, FightOrders, FightVessel, FightView } from '../rules/fightRules.ts';
import { BAR_OVER_M } from '../ships/shipBars.ts';
import { panShot, type Shot } from './camera.ts';
import { IDLE, type InputFrame } from '../player/input.ts';
import { SeaCombat } from './seaCombat.ts';
import { pictureAt, shownScale } from './seaLaw.ts';
import type { SeaRoom } from './seaRoom.ts';

const vessel: FightVessel = {
  ship: [5000, 6000, 0.4, 0, 0, 0, 0, 2],
  pose: [0.2, 0, 0, 0],
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
  ship: [5400, 5500, 2, 0, 0, 0, 0, 2],
  name: 'Pirate Sloop',
  faction: 2,
  rank: 2,
  mode: 'engage',
  hostile: true,
  run_out: [],
};
const FIRST: FightView = {
  clock: 0,
  player: vessel,
  captain,
  balls: [],
  lay: null,
  events: [],
  over: null,
  fingerprint: '',
};
const ROOM = { orders: () => undefined, takeFight: () => null } as unknown as SeaRoom;
const MARKS = { drawInto: () => undefined } as unknown as MarkDrawer;
const WATERLINE = { lengthM: 18.6775, beamM: 5.5684, draughtM: 1.8 };
/** The Sloop drawn 75 m long on the sea's view. */
const SEA_SCALE = 75 / WATERLINE.lengthM;

test('a fight draws every ship, its footprint, everyone aboard and each bar at the size the view shows it', () => {
  const fight = new SeaCombat(ROOM, FIRST, MARKS, 0);
  const ships = fight.ships(0.1, 0, 0, 3);
  assert.deepEqual(
    ships.map(({ place }) => [place.x, place.y, place.scale]),
    [
      [5000, 6000, 3],
      [5400, 5500, 3],
    ],
  );
  assert.deepEqual(
    fight.hulls(3).map((hull) => [hull.halfLength, hull.halfBeam]),
    Array.from({ length: 2 }, () => [(WATERLINE.lengthM / 2) * 3, (WATERLINE.beamM / 2) * 3]),
  );
  assert.deepEqual(
    ships.map(({ hull, look }) => [hull, look.side]),
    [
      [0, 'player'],
      [0, 'pirate'],
    ],
    "the player's Sloop as it is, the pirate's in the pirates' colours",
  );
  assert.equal(fight.ownAt(3)?.scale, 3);
  assert.deepEqual(fight.bars(3)[0]?.over, [5400, 5500, (0.2 + BAR_OVER_M) * 3]);
});

test('each captain keeps a plate of its own, keyed by its number in the fight, so a hit lowers its bar alone', () => {
  const struck = { ...captain, id: 2, hull: captain.max_hull / 2 };
  const third = { ...captain, id: 3, ship: [5600, 5500, 0, 0, 0, 0, 0, 0] };
  const view: FightView = { ...FIRST, captain, others: [struck, third] };
  const fight = new SeaCombat(ROOM, view, MARKS, 0);
  const bars = fight.bars(1);
  assert.deepEqual(
    bars.map((bar) => bar.key),
    [1, 2, 3],
  );
  assert.deepEqual(
    bars.map((bar) => bar.share),
    [1, 0.5, 1],
  );
  // The second gone from the fight, as the wire leaves it out: the third keeps its own plate.
  const after: FightView = { ...view, others: [third] };
  const later = new SeaCombat(ROOM, after, MARKS, 0).bars(1);
  assert.deepEqual(
    later.map((bar) => bar.key),
    [1, 3],
  );
});

test("a fight begun at the sea's view keeps the size it is drawn at, and eases to its true size as it comes down", () => {
  const fight = new SeaCombat(ROOM, FIRST, MARKS, 0);
  const place = [5000, 6000, 0] as const;
  const { eye } = eyeFor(place, 2.6, (30 * Math.PI) / 180, HEIGHT.lowest);
  const sea: Shot = { eye, yaw: 2.6, pitch: (30 * Math.PI) / 180, fov: FIELD_OF_VIEW, near: 2, far: 60_000 };
  const scaleAt = (near: Shot, share: number) => {
    const shown = panShot(sea, near, share);
    const picture = {
      seaM: pictureAt(sea, place),
      shownM: pictureAt(shown, place),
      nearM: pictureAt(near, place),
      share,
    };
    return shownScale(SEA_SCALE, picture);
  };
  const failed = (error: unknown) => {
    throw error;
  };
  let near = fight.frame(0, 0, sea.far, failed);
  assert.equal(fight.share, 0);
  assert.equal(scaleAt(near, fight.share), SEA_SCALE, 'as the sea drew it the frame before');
  let last = SEA_SCALE;
  for (let frame = 1; frame <= 20; frame++) {
    near = fight.frame(0.1, frame * 0.1, sea.far, failed);
    const scale = scaleAt(near, fight.share);
    assert.ok(scale <= last && scale >= 1, `${scale} times its size, after ${last}`);
    last = scale;
  }
  assert.equal(fight.share, 1, 'down at the fight');
  assert.equal(last, 1, 'its true size');
});

test("in a fight the player's footprint comes first, then the captains nearest it, and a sunk ship's goes", () => {
  const far = { ...captain, ship: [9000, 6000, 0, 3, 0, 0, 0, 2] as typeof captain.ship };
  const near = { ...captain, ship: [5100, 6000, 0, 0, 0, 0, 0, 2] as typeof captain.ship };
  const sunk = { ...captain, ship: [5050, 6000, 0, 0, 0, 0, 0, 2] as typeof captain.ship, state: 'sunk' as const };
  const fight = new SeaCombat(ROOM, { ...FIRST, captain: far, others: [sunk, near] }, MARKS, 0);
  const hulls = fight.hulls(4);
  assert.deepEqual(
    hulls.map((hull) => [hull.x, hull.way > 0, hull.scale]),
    [
      [5000, false, 4],
      [5100, false, 4],
      [9000, true, 4],
    ],
  );
});

test('a captain keeps its own harm when another leaves the fight and the view moves it up its list', async () => {
  const [north, south] = [
    { ...captain, ship: [5100, 5800, 0, 0, 0, 0, 0, 2], id: 5 },
    { ...captain, ship: [5300, 6200, 0, 0, 0, 0, 0, 2], id: 7 },
  ];
  const views: FightView[] = [
    // A ball through the hull of the captain the events name 7, the second of the others.
    {
      ...FIRST,
      others: [north, south],
      events: [{ kind: 'hit', ship: 7, by: 0, zone: 'hull', point: [5300, 6203, 1] }],
    },
    { ...FIRST, others: [south] },
  ];
  const room = { orders: () => undefined, takeFight: () => views.shift() ?? null } as unknown as SeaRoom;
  const fight = new SeaCombat(room, { ...FIRST, others: [north, south] }, MARKS, 0);
  const scarsOf = (x: number) =>
    fight.ships(0.1, 0, 0, 1).find(({ place }) => place.x === x)?.rig?.harm.scars.length ?? -1;
  for (let frame = 1; frame <= 6; frame++) {
    fight.frame(1 / 30, frame / 30, 1000, (error) => assert.fail(String(error)));
    await new Promise((settled) => setImmediate(settled));
  }
  assert.equal(views.length, 0, 'both views were taken');
  assert.equal(scarsOf(5300), 1, 'the one struck keeps its hole');
  assert.equal(scarsOf(5000), 0);
});

/** A fight whose room keeps every order sent, stepped `frames` frames of a thirtieth of a second from `from`. */
function ordered(view: FightView = FIRST) {
  const orders: FightOrders[] = [];
  const room = { orders: (sent: FightOrders) => orders.push(sent), takeFight: () => null } as unknown as SeaRoom;
  const fight = new SeaCombat(room, view, MARKS, 0);
  let clock = 0;
  const frames = async (count: number) => {
    const shots: Shot[] = [];
    for (let frame = 0; frame < count; frame++) {
      clock += 1 / 30;
      shots.push(fight.frame(1 / 30, clock, 1000, (error) => assert.fail(String(error))));
      await new Promise((settled) => setImmediate(settled));
    }
    return shots;
  };
  return { fight, orders, frames, clock: () => clock };
}
const away = (shot: Shot, from: readonly number[]) =>
  Math.hypot(...shot.eye.map((value, axis) => value - (from[axis] ?? 0)));

test('a tap of Shift asks the room for one burst of speed, however long it is held', async () => {
  const { fight, orders, frames } = ordered();
  assert.equal(fight.key('shift', true), true, 'the fight takes Shift');
  fight.key('shift', true);
  await frames(4);
  assert.deepEqual(
    orders.map((sent) => sent.boost),
    [true, false, false, false],
    'held down and repeating, still one burst',
  );
  fight.key('shift', false);
  fight.key('shift', true);
  await frames(1);
  assert.equal(orders.at(-1)?.boost, true, 'let go and tapped again, another');
});

test('pressing aim eases the eye out to its battery, not a cut from the orbit in one frame', async () => {
  const { fight, frames } = ordered();
  const [orbit] = await frames(1);
  fight.aim(true);
  const [first] = await frames(1);
  assert.ok(
    orbit && first && away(first, orbit.eye) < 10,
    `the first aimed frame moved ${orbit && first && away(first, orbit.eye)} m`,
  );
  const shots = await frames(30);
  const last = shots.at(-1);
  const [x = 0, y = 0] = vessel.ship;
  assert.ok(last && Math.hypot(last.eye[0] - x, last.eye[1] - y) < 8, "a second on it stands by the ship's side");
});

test("a sinking ship's guns are silent: aiming never moves its eye", async () => {
  const { fight, frames } = ordered({ ...FIRST, player: { ...vessel, state: 'sinking' } });
  const [orbit] = await frames(1);
  fight.aim(true);
  const shots = await frames(30);
  assert.ok(orbit && shots.every((shot) => away(shot, orbit.eye) < 1e-6));
});

test('while aiming the look may rise over the horizon to the longest throw; the orbit keeps its own clamp', async () => {
  const { fight, orders, frames } = ordered();
  fight.aim(true);
  // Turned to look over its starboard side, and up past the horizon.
  fight.drag(Math.PI / 2 / 0.005, -1000);
  await frames(30);
  const range = orders.at(-1)?.aim?.range ?? 0;
  assert.ok(range >= 153.6, `the look reaches ${range} m`);
  fight.aim(false);
  fight.drag(0, -1000);
  const [shot] = await frames(1);
  assert.ok(shot && shot.pitch >= 0.05 - 1e-9, `the orbit looks ${shot?.pitch} down`);
});

test('a held aim looks square off the side it was taken on: a drag across lays nothing new, up and down lays range', async () => {
  const { fight, orders, frames } = ordered();
  const turn = (degrees: number) => fight.drag((degrees * Math.PI) / 180 / 0.005, 0);
  const heading = vessel.ship[2] ?? 0;
  // Aimed while looking a little off the starboard bow: the view swings square off the starboard side.
  turn(20);
  fight.aim(true);
  const shots = await frames(60);
  const last = shots.at(-1);
  assert.equal(orders.at(-1)?.aim?.bearing, 90);
  assert.ok(last && Math.abs(last.yaw - (heading + Math.PI / 2)) < 0.02, `it looks along ${last?.yaw}`);
  const range = orders.at(-1)?.aim?.range ?? 0;
  turn(-200);
  await frames(5);
  assert.equal(orders.at(-1)?.aim?.bearing, 90, 'dragged across the bow, it holds its side');
  assert.ok(Math.abs((orders.at(-1)?.aim?.range ?? 0) - range) < 1e-9, 'and its range');
  fight.drag(0, -40);
  await frames(2);
  assert.ok((orders.at(-1)?.aim?.range ?? 0) > range + 5, 'a drag up lays it farther');
  // Let go, the camera goes on round the ship from where the aim looked, and turns as it likes again.
  fight.aim(false);
  const [after] = await frames(1);
  assert.ok(after && Math.abs(after.yaw - (heading + Math.PI / 2)) < 0.05, 'no swing as it eases home');
  turn(-120);
  fight.aim(true);
  await frames(30);
  assert.equal(orders.at(-1)?.aim?.bearing, -90, 'aimed again looking to port, port lays');
});

test("the fight's camera, zoomed all the way in, stands back past its own ship's rig, easing there", async () => {
  const { fight, frames } = ordered();
  for (let notch = 0; notch < 10; notch++) fight.wheel(-100, notch);
  const [x = 0, y = 0] = vessel.ship;
  const [heave = 0] = vessel.pose;
  const deck = [x, y, heave + 6];
  const astern = (await frames(120)).at(-1);
  fight.drag(Math.PI / 0.005, 0);
  const [first] = await frames(1);
  const ahead = (await frames(60)).at(-1);
  assert.ok(astern && first && ahead);
  // Its jib's stay runs out 16 m forward of its middle: looking aft from ahead, the eye stands past its foot.
  assert.ok(away(ahead, deck) > 17, `from ahead ${away(ahead, deck)} m back`);
  assert.ok(away(astern, deck) < away(ahead, deck), 'from astern, nearer');
  assert.ok(away(first, deck) > away(astern, deck) + 1, 'out quickly as the look comes round');
});

test('a trackpad burst steps the load once; a notch after a quiet of 0.18 s steps it again', async () => {
  const { fight, orders, frames } = ordered();
  fight.aim(true);
  for (let event = 0; event < 12; event++) fight.wheel(4, 1 + event * 0.01);
  await frames(20);
  assert.equal(orders.filter((sent) => sent.load).length, 1);
  fight.wheel(4, 1.11 + 0.181);
  await frames(20);
  assert.equal(orders.filter((sent) => sent.load).length, 2);
});

test("out of the aim the wheel zooms the fight's camera by half again a notch, and never steps the load", async () => {
  const { fight, orders, frames } = ordered();
  const settled = async () => (await frames(120)).at(-1);
  const far = await settled();
  fight.wheel(-100, 1);
  const nearer = await settled();
  const [x = 0, y = 0] = vessel.ship;
  const [heave = 0] = vessel.pose;
  const deck = [x, y, heave + 6];
  assert.ok(far && nearer);
  assert.ok(Math.abs(away(far, deck) - 75) < 0.1 && Math.abs(away(nearer, deck) - 50) < 0.1, `${away(nearer, deck)} m`);
  fight.wheel(100, 2);
  fight.wheel(100, 2.01);
  const out = await settled();
  assert.ok(out && Math.abs(away(out, deck) - 75) < 0.1, 'no farther than the fight camera stands');
  for (let notch = 0; notch < 20; notch++) fight.wheel(-100, 3 + notch);
  const closest = await settled();
  // DFO's nearest is 11.4 m; looking forward from astern, the Sloop's boom swinging over its quarter keeps it farther.
  assert.ok(closest && away(closest, deck) >= 11.4 && away(closest, deck) < 15, `${closest && away(closest, deck)} m`);
  assert.equal(orders.filter((sent) => sent.load).length, 0);
});

test("swung fast round the ship at its nearest, the fight's camera never stands inside its hull or its sails' swing", async () => {
  const { fight, frames } = ordered();
  for (let notch = 0; notch < 20; notch++) fight.wheel(-100, 1 + notch);
  await frames(120);
  const [x = 0, y = 0, heading = 0] = vessel.ship;
  const [heave = 0] = vessel.pose;
  for (let frame = 0; frame < 90; frame++) {
    fight.drag(40, 0);
    const [shot] = await frames(1);
    const [east, south, up] = [(shot?.eye[0] ?? 0) - x, (shot?.eye[1] ?? 0) - y, (shot?.eye[2] ?? 0) - heave];
    const [along, out] = [
      east * Math.sin(heading) - south * Math.cos(heading),
      east * Math.cos(heading) + south * Math.sin(heading),
    ];
    const inside = sweptBoxes(SLOOP_HULL).some(
      ([low, high]) =>
        along > low[0] && along < high[0] && out > low[1] && out < high[1] && up > low[2] && up < high[2],
    );
    assert.ok(!inside, `frame ${frame}: ${along.toFixed(1)} ${out.toFixed(1)} ${up.toFixed(1)}`);
  }
});

test("each captain's plate is keyed by its own fight number, so plates in a fight of three never share a lift", () => {
  const second = { ...captain, ship: [5420, 5500, 2, 0, 0, 0, 0, 2], id: 5 };
  const third = { ...captain, ship: [5440, 5500, 2, 0, 0, 0, 0, 2], id: 3 };
  const fight = new SeaCombat(ROOM, { ...FIRST, others: [second, third] }, MARKS, 0);
  assert.deepEqual(
    fight.bars(1).map((bar) => bar.key),
    [1, 5, 3],
  );
});

test("its own gun's kick shakes the fight's eye, and it stands still again within a second", async () => {
  const fight = new SeaCombat(ROOM, FIRST, MARKS, 0);
  const still = fight.frame(0.1, 1, 1000, () => undefined);
  const muzzle = { kind: 'muzzle', ship: 0, point: [5000, 6002, 2], launch: [0, 300, 0] } as const;
  const room = { orders: () => undefined, takeFight: () => ({ ...FIRST, events: [muzzle] }) } as unknown as SeaRoom;
  const kicked = new SeaCombat(room, FIRST, MARKS, 0);
  kicked.frame(0.1, 1, 1000, () => undefined);
  await new Promise((resolve) => setTimeout(resolve, 0));
  kicked.frame(0.05, 1.05, 1000, () => undefined);
  kicked.draw({} as GPURenderPassEncoder, { fromEye: new Float32Array(16), eye: [5000, 6000, 10] }, 1.05);
  const shaken = kicked.frame(0.1, 1.2, 1000, () => undefined);
  const moved = (shot: Shot) => Math.hypot(...shot.eye.map((value, axis) => value - (still.eye[axis] ?? 0)));
  assert.ok(moved(shaken) > 0.005, `${moved(shaken)}`);
  assert.ok(moved(kicked.frame(0.1, 2.5, 1000, () => undefined)) < 1e-9);
});

test("the fight's readout: its plate and its abilities' bar, the card on the nearest captain, E to board one the room would take", () => {
  const display = (view: FightView, mayBoard = false) =>
    new SeaCombat({ ...ROOM, mayBoard } as SeaRoom, view, MARKS, 0).display(1);
  const model = display(FIRST);
  assert.ok(model, 'a fight on shows it');
  assert.equal(model.ship?.name, 'Your Sloop');
  assert.equal(model.ship?.abilities.find((ability) => ability.id === 'port')?.state, 'ready');
  assert.equal(model.card?.name, 'Pirate Sloop');
  assert.match(model.card?.sub ?? '', / - 640 m$/);
  const struck = { ...captain, ship: [5010, 6000, 2, 0, 0, 0, 0, 0], state: 'struck' } as const;
  assert.equal(display({ ...FIRST, captain: struck }, true)?.card?.boardKey, 'E', 'the room would take it');
  assert.equal(display({ ...FIRST, captain: struck })?.card?.boardKey, null, 'the room would not');
});

test("the pad's brace tapped braces for that tap alone, and held braces until it is let go", async () => {
  const { fight, orders, frames } = ordered();
  const pad = (pressed: boolean, released: boolean): InputFrame => ({
    ...IDLE,
    pressed: (id) => pressed && id === 'brace',
    released: (id) => released && id === 'brace',
  });
  fight.padFrame(pad(true, true), 1 / 30);
  await frames(1);
  assert.equal(orders.at(-1)?.brace, false, 'a tap comes up in the frame it went down');
  fight.padFrame(pad(true, false), 1 / 30);
  await frames(2);
  assert.equal(orders.at(-1)?.brace, true);
  fight.padFrame(pad(false, true), 1 / 30);
  await frames(1);
  assert.equal(orders.at(-1)?.brace, false);
});

test("each captain's ship carries its people as the fight leaves its men; the player's own and one boarded carry none", () => {
  const struck: FightCaptain = { ...captain, crew: 6, max_crew: 12, state: 'struck', run_out: ['port'] };
  const fight = new SeaCombat(ROOM, { ...FIRST, captain: struck }, MARKS, 0);
  const [own, theirs] = fight.ships(0.1, 0, 0, 1);
  assert.equal(own?.crew, undefined);
  assert.deepEqual(theirs?.crew, {
    key: 'fight-1',
    faction: 2,
    rank: 2,
    share: 0.5,
    state: 'struck',
    runOut: ['port'],
  });
  assert.equal(fight.ships(0.1, 0, 0, 1, 1)[1]?.crew, undefined, "boarded, its crew is the fight on foot's");
});
