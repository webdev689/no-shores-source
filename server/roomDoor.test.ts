import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import course from '../content/testground/course.json' with { type: 'json' };
// The browser's side of the messages and rules, so these tests send the room exactly the bytes a browser sends and
// check its bodies with the browser's own steps.
import { EVENT } from '../client/src/combat/cues.ts';
import { CHARGES_MOST } from '../client/src/combat/vitals.ts';
import {
  type FightEvent,
  type Look,
  type SeenPlayer,
  inputBytes,
  readFromRoom,
} from '../client/src/network/messages.ts';
import { courseBytes } from '../client/src/network/courseMessages.ts';
import { type FleetOrders, ordersBytes } from '../client/src/network/fleetMessages.ts';
import { ASKS } from '../client/src/network/gearMessages.ts';
import { SnapshotKeeper } from '../client/src/network/snapshots.ts';
import { fightViewOf } from '../client/src/network/seaFight.ts';
import { startFleetRules } from '../client/src/rules/fleetRules.ts';
import { chargesOf, fighterView } from '../client/src/rules/fighters.ts';
import type { Helm } from '../client/src/rules/landRules.ts';
import { type Controls, floatsOf, floatsOfControls, startMovementRules } from '../client/src/rules/movementRules.ts';
import { type RoomDoor, startRoomDoor } from './roomDoor.ts';
import { PROTOCOL } from '../generated/messages/ts/version.ts';

const built = (name: string) =>
  readFile(new URL(`../target/wasm32-unknown-unknown/release/${name}.wasm`, import.meta.url)).catch(() => {
    throw new Error(`${name}.wasm is not built: run \`npm run wasm\` first`);
  });
const compiled = new WebAssembly.Module(await built('room_wasm'));
/** Forward at a walk, looking north, no fight's buttons. */
const walk = new Float64Array([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, Number.NaN, Number.NaN, Number.NaN, 0]);
const walking = { anim: 'walk', frame: 2, facing: 0 };
/** An input as a browser writes it, holding nothing and seeing the start of the room. */
const asking = (sequence: number, intent: Float64Array, look: Look, dress?: string, respawn = false) =>
  inputBytes(sequence, {
    intent,
    look,
    arms: 0,
    seen: 0n,
    respawn,
    ...(dress === undefined ? {} : { dress }),
  });

test('a room welcomes players, takes the inputs a browser writes in order, and its snapshots read back in the browser', () => {
  const room = startRoomDoor(compiled);
  assert.equal(room.tickSeconds, 1 / 60);
  assert.equal(room.open(course.start, course.blocks), true);
  const [first, second] = [room.join(), room.join()];
  // The room speaks the protocol the page was built from: the same schema's hash.
  const protocol = PROTOCOL;
  const plate = (player: number, more = {}) => ({ player, name: '', level: 1, menu: false, tag: '', ...more });
  assert.deepEqual(readFromRoom(room.joined(first)), {
    kind: 'joined',
    player: first,
    dressed: [],
    plates: [plate(first), plate(second)],
    node: null,
    protocol,
    epoch: 0,
  });
  assert.equal(room.input(first, asking(1, walk, walking, '{"body":"male","outfit":{}}')), 'taken');
  for (let sequence = 2; sequence <= 30; sequence++)
    assert.equal(room.input(first, asking(sequence, walk, walking)), 'taken');
  assert.equal(room.input(first, asking(40, walk, walking)), 'out of order');
  assert.equal(room.input(second, asking(1, walk, { ...walking, anim: 'Not A Move' })), 'not an input');
  assert.equal(room.input(second, new Uint8Array([1, 2, 3])), 'not an input');
  for (let tick = 0; tick < 30; tick++) room.tick();
  const snapshot = readFromRoom(room.snapshot(first));
  assert.equal(snapshot?.kind, 'snapshot');
  if (snapshot?.kind !== 'snapshot') return;
  const [walker, stander] = snapshot.players;
  assert.equal(walker?.acknowledged, 30);
  assert.ok(Math.abs((walker?.body.y ?? 0) - (course.start.y - 4.43 / 2)) < 0.01, `walked half a second north`);
  assert.deepEqual([stander?.player, stander?.acknowledged, stander?.body.y], [second, 0, course.start.y]);
  assert.deepEqual(walker?.standing, { kind: 'inside' }, 'a course has no section to leave');
  // The walker's look came with its last input, and its dress once, to everyone and to whoever joins after.
  assert.deepEqual([walker?.anim, walker?.frame], ['walk', 2]);
  assert.deepEqual(snapshot.dressed, [{ player: first, dress: '{"body":"male","outfit":{}}' }]);
  // Once the page says its screen showed that snapshot, the dress is not sent it again.
  const shown = inputBytes(31, { intent: walk, look: walking, arms: 0, seen: snapshot.tick });
  assert.equal(room.input(first, shown), 'taken');
  room.tick();
  assert.deepEqual((readFromRoom(room.snapshot(first)) as { dressed: unknown }).dressed, []);
  // Named by their account and with a menu open, a player's plate goes to everyone once, as a dress does.
  assert.equal(room.name(first, 'Mariner'), true);
  assert.equal(room.name(second, 'not a name'), false);
  assert.equal(room.tag(first, 'SALT'), true);
  assert.equal(room.tag(second, 'not a tag'), false);
  const told = { id: 'guild-salt', done: [true, false, false, false], beforeTheWeek: true };
  assert.equal(room.guild(first, JSON.stringify(told)), true, "the guild's word is taken");
  assert.equal(room.guild(first, ''), true, 'and none, for a player who left it');
  assert.equal(room.guild(first, '{"id":3}'), false, 'but not a word that is no guild');
  assert.equal(room.guild(99, ''), false, 'nor for a player not there');
  const busy = inputBytes(32, { intent: walk, look: walking, arms: 0, seen: snapshot.tick, menu: true });
  assert.equal(room.input(first, busy), 'taken');
  room.tick();
  const named = plate(first, { name: 'Mariner', menu: true, tag: 'SALT' });
  // The page's screen showed the tick before, so only what changed since comes.
  assert.deepEqual((readFromRoom(room.snapshot(first)) as { plates: unknown }).plates, [named]);
  const third = room.join();
  assert.deepEqual(readFromRoom(room.joined(third)), {
    kind: 'joined',
    player: third,
    dressed: [{ player: first, dress: '{"body":"male","outfit":{}}' }],
    plates: [named, plate(second), plate(third)],
    node: null,
    protocol,
    epoch: 0,
  });
  // Shut again before any screen showed it open, the plate goes as it is now, once: its newest change alone.
  const shut = inputBytes(33, { intent: walk, look: walking, arms: 0, seen: snapshot.tick });
  assert.equal(room.input(first, shut), 'taken');
  room.tick();
  const { plates } = readFromRoom(room.snapshot(second)) as unknown as { plates: { player: number }[] };
  assert.deepEqual(
    plates.filter((each) => each.player === first),
    [plate(first, { name: 'Mariner', tag: 'SALT' })],
  );
});

test('the roster reads from the rules: every type it drives with its name, faction, ranks and hands', () => {
  const roster = JSON.parse(startRoomDoor(compiled).roster()) as {
    type: number;
    name: string;
    faction_name: string;
    ranks: number[];
    right: string;
  }[];
  assert.equal(roster.length, 48);
  const taker = roster.find((entry) => entry.type === 45);
  assert.deepEqual([taker?.name, taker?.faction_name, taker?.ranks], ['Tithe-Taker', 'The Grey Tithe', [3]]);
  const thule = roster.find((entry) => entry.type === 12);
  assert.deepEqual(
    [thule?.name, thule?.faction_name, thule?.ranks, thule?.right],
    ['Captain Brannoc Thule', 'The Grey Tithe', [5], 'sword_ebony'],
  );
  const corvane = roster.find((entry) => entry.type === 18);
  assert.deepEqual(
    [corvane?.name, corvane?.faction_name, corvane?.ranks, corvane?.right],
    ['High Assessor Corvane', 'The Grey Tithe', [5], 'flail_iron'],
  );
});

test('a player who leaves is no longer seen, and each room is a room of its own', () => {
  const room = startRoomDoor(compiled);
  room.open(course.start, course.blocks);
  const player = room.join();
  room.leave(player);
  room.tick();
  const snapshot = readFromRoom(room.snapshot(player));
  assert.deepEqual(snapshot?.kind === 'snapshot' ? snapshot.players : null, []);
  const another = startRoomDoor(compiled);
  another.open(course.start, course.blocks);
  assert.equal(another.join(), 1);
});

/** A node's file as the bake writes it: a section 100 m square on land 10 m up, round a terrace at 12 m with a wall
 *  on it, and two spawns. */
function nodeFile(): { text: string; ground: string } {
  const grid = (value: number) => ({
    width: 4,
    height: 4,
    left_m: -2000,
    top_m: -2000,
    cell_m: 1000,
    first_column: 0,
    first_row: 0,
    data: Array<number>(16).fill(value),
  });
  const layers = { land: grid(10), lake_level: Array<number>(16).fill(0), rivers: [], roads: [], towns: [] };
  const pads = [{ bounds: [-10, -10, 10, 10], level: 12 }];
  const ground = { ...layers, coast: grid(5000), across: grid(-50), pads, seed: 7 };
  const section = {
    ring: [
      [-50, -50],
      [50, -50],
      [50, 50],
      [-50, 50],
    ],
    spawns: [
      [0, 0],
      [30, -40],
    ],
  };
  const named = { id: 'glade', kind: 'patrol', name: 'The Glade', continent: 'square', ...section };
  const file = { ...named, bounds: [-150, -150, 150, 150], ground, boxes: [[-5, -8, 5, -7, 13, 12]] };
  return { text: JSON.stringify(file), ground: JSON.stringify(ground) };
}

/** Sends one input a browser writes and ticks the room; answers what the room then saw of the player. */
function play(room: RoomDoor, player: number, sequence: number, controls: Controls, respawn = false): SeenPlayer {
  const intent = new Float64Array([
    ...floatsOfControls(controls),
    0,
    0,
    0,
    0,
    0,
    0,
    Number.NaN,
    Number.NaN,
    Number.NaN,
    0,
  ]);
  assert.equal(room.input(player, asking(sequence, intent, walking, undefined, respawn)), 'taken');
  room.tick();
  const snapshot = readFromRoom(room.snapshot(player));
  const seen = snapshot?.kind === 'snapshot' ? snapshot.players.find((each) => each.player === player) : undefined;
  if (!seen) throw new Error(`the room did not see player ${player}`);
  return seen;
}

test('a node’s room warns a player past its edge, kills them 60 m out, and respawns them only after 4 s', async () => {
  const { text, ground } = nodeFile();
  const room = startRoomDoor(compiled);
  assert.equal(room.openNode('not a node'), false);
  assert.equal(room.openNode(text), true);
  const [first, second] = [room.join(), room.join()];
  const node = { id: 'glade', bounds: [-150, -150, 150, 150] };
  const plate = (player: number) => ({ player, name: '', level: 1, menu: false, tag: '' });
  assert.deepEqual(readFromRoom(room.joined(first)), {
    kind: 'joined',
    player: first,
    dressed: [],
    plates: [plate(first), plate(second)],
    node,
    protocol: PROTOCOL,
    epoch: 0,
  });
  // The browser stands bodies on the same ground and boxes, and finds the same bodies, to the bit.
  const movement = await startMovementRules(await built('movement_wasm'));
  assert.equal(movement.setGround(ground), true);
  movement.setCourse([{ minX: -5, minY: -8, maxX: 5, maxY: -7, top: 13, bottom: 12 }]);
  room.tick();
  const joined = readFromRoom(room.snapshot(first));
  const bodies = joined?.kind === 'snapshot' ? joined.players.map((seen) => floatsOf(seen.body)) : [];
  assert.deepEqual(bodies[0], floatsOf(movement.standing(0, 0)), 'the first, whole');
  // The second crosses to the first packed: each number within half a thousandth.
  const standing = floatsOf(movement.standing(30, -40));
  const near = (number: number, index: number) => Math.abs(number - (standing[index] ?? 0)) <= 0.0005 + 1e-9;
  assert.ok(bodies[1]?.every(near), 'in turn');

  const still = { forward: 0, sideways: 0, yaw: 0, run: false, jump: false, crouch: false, mounted: false };
  const east = { ...still, forward: 1, yaw: Math.PI / 2, run: true };
  let sequence = 0;
  let seen = play(room, second, ++sequence, east);
  while (seen.standing.kind === 'inside') seen = play(room, second, ++sequence, east);
  assert.deepEqual(seen.standing, { kind: 'warned', ticks: 599 });
  while (seen.standing.kind === 'warned') seen = play(room, second, ++sequence, east);
  assert.deepEqual(seen.standing, { kind: 'dead', ticks: 0, fell: false });
  assert.ok(seen.body.x >= 110, `dead 60 m past the edge, at ${seen.body.x}`);
  const died = seen.body;
  for (let ticks = 1; ticks <= 240; ticks++) {
    seen = play(room, second, ++sequence, east, true);
    assert.deepEqual(seen.standing, { kind: 'dead', ticks, fell: false }, 'refused');
  }
  // Running on as it died, the body slides to rest on its feet, not steered by the inputs the room still takes.
  const [lies, before] = [seen.body, died];
  assert.ok(lies.x >= before.x && lies.x < before.x + 3 && lies.vx === 0, `at rest near where it died: ${lies.x}`);
  seen = play(room, second, ++sequence, east, true);
  assert.deepEqual(seen.standing, { kind: 'inside' });
  // Back at the spawn nearest its death: in a patrol zone, facing where it fell, due east (crates/room/src/respawns.rs).
  const back = { ...movement.standing(30, -40), facing: Math.PI / 2 };
  assert.equal(lies.y, -40, 'it fell due east of the spawn');
  assert.deepEqual(floatsOf(seen.body), floatsOf(back), 'back at the spawn nearest its death');
});

test('a locked node’s room takes no player and says why, so the host turns every join away; any other takes them', () => {
  const { text } = nodeFile();
  const locked = startRoomDoor(compiled);
  assert.equal(locked.openNode(JSON.stringify({ ...(JSON.parse(text) as object), locked: true })), true);
  assert.deepEqual([locked.join(), locked.refusal()], [0, 'The Glade is locked']);
  const open = startRoomDoor(compiled);
  assert.equal(open.openNode(text), true);
  assert.notEqual(open.join(), 0);
  assert.equal(open.refusal(), null);
});

test('a node’s room stands the foes a player asks for only once a page playing alone tells it to', () => {
  const foesAfterAsking = (told: boolean) => {
    const room = startRoomDoor(compiled);
    assert.equal(room.openNode(nodeFile().text), true);
    if (told) room.takeFoeAsks();
    const player = room.join();
    const spawn = { type: 2, rank: 1 };
    room.input(player, inputBytes(1, { intent: walk, look: walking, arms: 0, seen: 0n, spawn }));
    room.tick();
    const snapshot = readFromRoom(room.snapshot(player));
    return snapshot?.kind === 'snapshot' ? snapshot.foes.map((foe) => foe.type) : [];
  };
  // The patrol node's own garrison stands either way; the ask adds a Collector only when the room is told to take it.
  const garrison = foesAfterAsking(false);
  assert.ok(garrison.length > 0, 'its garrison');
  assert.deepEqual(foesAfterAsking(true), [...garrison, 2]);
});

test('the sea sails the course a browser writes, refuses one across land, and shows each ship', () => {
  const room = startRoomDoor(compiled);
  const square = [
    [100_000, 100_000],
    [200_000, 100_000],
    [200_000, 200_000],
    [100_000, 200_000],
  ];
  assert.equal(room.openSea(JSON.stringify({ continents: [{ id: 'square', outline: square }], isles: [] }), 7), true);
  const [first, second] = [room.join(), room.join()];
  const north: [number, number][] = [
    [50_000, 150_000],
    [50_000, 50_000],
  ];
  assert.equal(room.input(first, courseBytes(north, 10)), 'taken');
  assert.equal(
    room.input(
      second,
      courseBytes(
        [
          [50_000, 150_000],
          [250_000, 150_000],
        ],
        10,
      ),
    ),
    'refused',
  );
  assert.equal(room.input(second, asking(1, walk, walking)), 'not an input', 'the sea takes courses');
  for (let tick = 0; tick < 60; tick++) room.tick();
  const snapshot = readFromRoom(room.snapshot(first));
  const ships = snapshot?.kind === 'snapshot' ? snapshot.ships : [];
  assert.equal(ships.length, 1, 'only the ship whose course was taken is at sea');
  assert.deepEqual([ships[0]?.player, ships[0]?.x, ships[0]?.heading, ships[0]?.pace], [first, 50_000, 0, 10]);
  assert.ok(Math.abs((ships[0]?.y ?? 0) - (150_000 - 120)) < 1e-6, 'a second north at 10 × 12 m/s');
});

test('the sea travels a ship a browser asks to take anywhere at sea, within its own water or into another', () => {
  const room = startRoomDoor(compiled);
  const square = (west: number) => [
    [west, 100_000],
    [west + 100_000, 100_000],
    [west + 100_000, 200_000],
    [west, 200_000],
  ];
  const continents = [
    { id: 'continent-4', outline: square(100_000) },
    { id: 'continent-5', outline: square(600_000) },
  ];
  assert.equal(room.openSea(JSON.stringify({ continents, isles: [] }), 7), true);
  const player = room.join();
  assert.equal(room.input(player, courseBytes([[250_000, 150_000]], 10)), 'taken');
  for (let tick = 0; tick < 30; tick++) room.tick();
  assert.equal(room.input(player, courseBytes([[250_000, 300_000]], 10, true)), 'taken', 'within its own water');
  const within = readFromRoom(room.snapshot(player));
  const ship = within?.kind === 'snapshot' ? within.ships[0] : undefined;
  assert.deepEqual([ship?.x, ship?.y], [250_000, 299_600], '400 m short of its end');
  for (let tick = 0; tick < 30; tick++) room.tick();
  assert.equal(room.input(player, courseBytes([[550_000, 150_000]], 20, true)), 'taken', 'into another water');
  const into = readFromRoom(room.snapshot(player));
  const told = [within, into].flatMap((seen) => (seen?.kind === 'snapshot' ? seen.told : []));
  const outcomes = told.map((each) => [...each.numbers]).filter((numbers) => numbers[0] === 24);
  assert.deepEqual(
    outcomes.map((numbers) => numbers[2]),
    [0, 0],
    'told each was taken',
  );
});

/** The world time the clash's sea opens at (crates/room-wasm/src/door_tests.rs `CLASH_START_S`). */
const CLASH_START_S = 1_790_153_100;

test('a sea where a Tithe ship attacks a friendly ship and a player joins them snapshots to the crate’s fingerprint', () => {
  // crates/room-wasm/src/door_tests.rs runs the same sea natively and holds the same value (SEA_CLASH_HASH): Overlook's
  // and Sunspire's islands with the lane between them (`TRAFFIC_SEA`).
  const room = startRoomDoor(compiled);
  const square = (west: number) => [
    [west, 100_000],
    [west + 100_000, 100_000],
    [west + 100_000, 200_000],
    [west, 200_000],
  ];
  const layout = {
    continents: [
      { id: 'continent-1', outline: square(100_000) },
      { id: 'continent-4', outline: square(400_000) },
    ],
    isles: [],
  };
  const ports = [
    { id: 'overlook', name: 'Overlook', continent: 'continent-1', centre: [150_000, 150_000] },
    { id: 'sunspire', name: 'Sunspire', continent: 'continent-4', centre: [450_000, 150_000] },
  ];
  assert.equal(room.openSea(JSON.stringify({ layout, ports }), 6, CLASH_START_S), true);
  const player = room.join();
  const out = [
    [450_000, 97_000],
    [340_000, 86_000],
  ] as const;
  assert.equal(room.input(player, courseBytes(out, 10)), 'taken');
  let hash = 0xcbf2_9ce4_8422_2325n;
  let friendly = false;
  for (let tick = 1; tick <= 16_000; tick++) {
    if (tick === 1_831) assert.equal(room.input(player, courseBytes([[441_700, 96_350]], 10)), 'taken');
    room.tick();
    if (tick % 60 !== 0) continue;
    const bytes = room.snapshot(player);
    for (const byte of bytes) hash = ((hash ^ BigInt(byte)) * 0x0100_0000_01b3n) & 0xffff_ffff_ffff_ffffn;
    const snapshot = readFromRoom(bytes);
    const fight = snapshot?.kind === 'snapshot' ? snapshot.fights[0] : undefined;
    const others = fight ? (fightViewOf(fight.view).others ?? []) : [];
    friendly ||= others.some((other) => other.faction === 0);
  }
  assert.ok(friendly, 'the player fights beside the friendly ship');
  assert.equal(hash.toString(16).padStart(16, '0'), '37b8fca918a836c5');
});

test('a fleet room sails the ships a browser orders, and the browser predicts its own to the bit', () => {
  const room = startRoomDoor(compiled);
  assert.equal(room.openFleet(), true);
  const [first, second] = [room.join(), room.join()];
  const still: Helm = { steer: 0, climb: 0 };
  const helmAt = (sequence: number): Helm =>
    sequence <= 3 ? { ...still, climb: 1 } : { ...still, steer: sequence % 40 < 15 ? 0.7 : -0.3 };
  const orders = (sequence: number, more: Partial<FleetOrders> = {}): Uint8Array<ArrayBuffer> =>
    ordersBytes(sequence, {
      ...helmAt(sequence),
      look: null,
      fire: false,
      brace: false,
      load: 0,
      putToSea: null,
      call: 'none',
      ...more,
    });
  assert.equal(room.input(first, orders(1, { ...still, putToSea: [200_000, 300_000, 0.25] })), 'taken');
  assert.equal(room.input(second, orders(1, { ...still, putToSea: [200_100, 300_000, 0] })), 'taken');
  assert.equal(room.input(second, orders(3)), 'out of order');
  assert.equal(room.input(second, new Uint8Array([9, 9, 9])), 'not an input');
  room.tick();
  const read = () => {
    const snapshot = readFromRoom(room.snapshot(first));
    if (snapshot?.kind !== 'snapshot') throw new Error('a fleet room answers snapshots');
    return snapshot;
  };
  const put = read().vessels.find((vessel) => vessel.id === first);
  for (let sequence = 2; sequence <= 150; sequence++) {
    assert.equal(room.input(first, orders(sequence)), 'taken');
    room.tick();
  }
  const last = read().vessels.find((vessel) => vessel.id === first);
  assert.deepEqual([last?.acknowledged, read().vessels.length], [150, 2]);
  const rules = startFleetRules(compiled);
  const helms = Array.from({ length: 149 }, (unused, index) => helmAt(index + 2));
  const hurts = { sail: last?.hurts.sail ?? 0, maxSail: last?.hurts.maxSail ?? 0 };
  const predicted = rules.predict(put?.ship ?? [], hurts, 151 / 60, 0, helms);
  assert.deepEqual(Array.from(predicted?.ship ?? []), Array.from(last?.ship ?? []), 'their ship, to the bit');
  assert.equal(room.input(first, orders(151, { call: 'captain' })), 'taken');
  room.tick();
  const called = read();
  assert.equal(called.vessels.filter((vessel) => vessel.captain).length, 1, 'a captain called round it');
});

/** How often, in ticks, the room sends one player's gear (`room::GEAR_EVERY_TICKS`). */
const GEAR_EVERY_TICKS = 12;

test("a room playing the prologue's wreck sends gear with no Art worn, so the page shows no ability bar", () => {
  const room = startRoomDoor(compiled);
  assert.equal(room.open(course.start, course.blocks, true), true);
  room.storyWreck();
  const player = room.join();
  room.tick();
  const gear = readFromRoom(room.gear(player));
  assert.ok(gear?.kind === 'gear');
  assert.deepEqual([gear.arts?.art, gear.arts?.anima], [0, 0]);
});

test('the Test Ground’s room lays out its stall and nodes, and sends each player their own gear when it changes', () => {
  const room = startRoomDoor(compiled);
  assert.equal(room.furnish(course.stall, course.resources), false, 'nothing to lay out before a room opens');
  assert.equal(room.open(course.start, course.blocks), true);
  assert.equal(room.furnish(course.stall, course.resources), true);
  const [first, second] = [room.join(), room.join()];
  room.tick();
  const gear = readFromRoom(room.gear(first));
  assert.equal(gear?.kind, 'gear', 'sent once on joining');
  if (gear?.kind !== 'gear') return;
  assert.equal(gear.items.length, 9, 'the starting kit and its four modules');
  assert.equal(room.gear(first).length, 0, 'and not again until it changes');
  const grant = inputBytes(1, {
    intent: walk.map(() => 0),
    look: walking,
    arms: 0,
    seen: 0n,
    ask: { kind: ASKS.grantNamed, named: 'lanternfall' },
  });
  assert.equal(room.input(first, grant), 'taken');
  // The room sends one player's gear five times a second at most: the answer goes out once it may again.
  for (let tick = 0; tick < GEAR_EVERY_TICKS; tick += 1) room.tick();
  const granted = readFromRoom(room.gear(first));
  assert.ok(granted?.kind === 'gear' && granted.items.some((item) => item.named === 'lanternfall'));
  assert.equal(readFromRoom(room.gear(second))?.kind, 'gear', 'the second player’s own first gear');
  assert.equal(room.gear(second).length, 0, 'the first player’s ask is not theirs');
  const sea = startRoomDoor(compiled);
  assert.equal(sea.openFleet(), true);
  assert.equal(sea.furnish(course.stall, course.resources), false, 'a fleet keeps no gear');
});

test('a patrol’s dungeon opens from its patrol’s file; a patrol’s room joins a player before an entrance, or not', () => {
  const room = startRoomDoor(compiled);
  const patrol = JSON.parse(nodeFile().text) as Record<string, unknown>;
  assert.equal(room.openDungeon(JSON.stringify({ ...patrol, kind: 'mission' }), 0), false, 'a mission has none');
  assert.equal(room.openDungeon(nodeFile().text, 3), false, 'a patrol has three');
  assert.equal(room.openDungeon(nodeFile().text, 2), true);
  assert.equal(room.difficulty(1), true, 'at the room name’s seas');
  assert.equal(room.joinAt(0), 0, 'a dungeon has no entrances');
  assert.notEqual(room.join(), 0);
  const ring = [
    [-800, -800],
    [800, -800],
    [800, 800],
    [-800, 800],
  ];
  const wide = { ...patrol, continent: 'continent-1', ring, bounds: [-900, -900, 900, 900] };
  assert.equal(room.openNode(JSON.stringify(wide)), true);
  assert.equal(room.joinAt(3), 0, 'no such entrance');
  const player = room.joinAt(0);
  assert.notEqual(player, 0);
  room.tick();
  const snapshot = readFromRoom(room.snapshot(player));
  const seen = snapshot?.kind === 'snapshot' ? snapshot.players.find((each) => each.player === player) : undefined;
  assert.ok(seen, 'standing in the patrol');
  assert.equal(room.standAtSpawn(player), true, 'not come out of that dungeon after all');
  room.tick();
  const stood = readFromRoom(room.snapshot(player));
  const body = stood?.kind === 'snapshot' ? stood.players.find((each) => each.player === player)?.body : undefined;
  assert.ok(body && Math.hypot(body.x, body.y) < 0.01, 'at the first spawn, as an ordinary join stands a player');
  assert.equal(room.standAtSpawn(player + 1), false, 'no such player');
});

test('a node’s room says why its gate shuts to a character, and to a new one', () => {
  const room = startRoomDoor(compiled);
  assert.equal(room.shut(0, null), '', 'no room open shuts nothing');
  assert.equal(room.openNode(nodeFile().text), true);
  assert.equal(room.difficulty(2), true);
  assert.equal(room.shut(0, null), 'This place opens after the prologue.');
  const player = room.join();
  const kept = JSON.parse(room.character(player) ?? '{}') as { story: { prologue: boolean } };
  kept.story.prologue = true;
  assert.equal(room.shut(player, JSON.stringify(kept)), 'Abyss seas open at level 20.');
  assert.equal(room.restoreCharacter(player, JSON.stringify(kept)), false, 'never given');
});

test('a run’s room opens from its ask with its revives, and what is on reads as the rules draw it', () => {
  const room = startRoomDoor(compiled);
  const friday = 29_919_420;
  const drawn = JSON.parse(room.activities(friday)) as {
    day: number;
    week: number;
    dayModifier: string;
    weekAbyss: unknown;
  };
  assert.deepEqual([drawn.day, drawn.week, drawn.dayModifier], [20_778, 2_968, 'burn-shadow']);
  assert.deepEqual(drawn.weekAbyss, {
    place: 'saltworm-warrens',
    modifiers: ['lightswitch', 'burn-divine', 'juggler'],
    level: 30,
    opens: 28,
  });
  assert.equal(room.openRun(JSON.stringify({ dungeon: { place: 'saltworm-warrens' }, tier: 2, minute: friday })), true);
  const player = room.join();
  room.tick();
  assert.equal((readFromRoom(room.snapshot(player)) as { revives: number }).revives, 5);
  assert.equal(room.openRun(JSON.stringify({ dungeon: { place: 'krakens-grotto' }, tier: 2, minute: friday })), false);
  const laid = JSON.parse(room.layout(JSON.stringify({ place: 'krakens-grotto', name: 'Kraken’s Grotto' }))) as {
    name: string;
    style: string;
  };
  assert.deepEqual([laid.name, laid.style], ['Kraken’s Grotto', 'caverns']);
});

test('a patrol’s dungeon’s run opens only with its patrol’s file, and takes no player while the patrol is locked', () => {
  const ask = JSON.stringify({ dungeon: { patrol: 'saltgrass-downs', number: 0 }, tier: 1, minute: 29_919_420 });
  const patrol = (locked: boolean) =>
    JSON.stringify({ id: 'saltgrass-downs', kind: 'patrol', name: 'The Saltgrass Downs', locked });
  const room = startRoomDoor(compiled);
  assert.equal(room.openRun(ask), false, 'without its patrol’s file');
  assert.equal(room.openRun(ask, patrol(true)), true);
  assert.deepEqual([room.join(), room.refusal()], [0, 'The Saltgrass Downs is locked']);
  assert.equal(room.openRun(ask, patrol(false)), true);
  assert.notEqual(room.join(), 0);
});

test('the gates read as the rules judge them for a level and a story', () => {
  const room = startRoomDoor(compiled);
  const gates = JSON.parse(room.gates(9, true)) as { day: unknown[]; weekElite: unknown };
  assert.deepEqual(gates.day, [null, 'Elite seas open at level 10.', 'Abyss seas open at level 20.']);
  assert.equal(gates.weekElite, 'This dungeon opens at level 24.');
});

test('an input carrying those before it is taken whole after a loss, and what the room already had is passed over', () => {
  const room = startRoomDoor(compiled);
  room.open(course.start, course.blocks);
  const player = room.join();
  const parts = { intent: walk, look: walking, arms: 0, seen: 0n };
  assert.equal(room.input(player, inputBytes(1, parts)), 'taken');
  // Input 2 is lost on the way; 3 carries it, and 4 carries 2 and 3 again.
  assert.equal(room.input(player, inputBytes(3, parts, [{ sequence: 2, parts }])), 'taken');
  assert.equal(
    room.input(
      player,
      inputBytes(
        4,
        parts,
        [2, 3].map((sequence) => ({ sequence, parts })),
      ),
    ),
    'taken',
  );
  assert.equal(room.input(player, inputBytes(4, parts)), 'taken', 'one the room already had is no wrong');
  assert.equal(room.input(player, inputBytes(7, parts, [{ sequence: 6, parts }])), 'out of order', 'five was lost too');
  for (let tick = 0; tick < 4; tick++) room.tick();
  const snapshot = readFromRoom(room.snapshot(player));
  const seen = snapshot?.kind === 'snapshot' ? snapshot.players[0] : undefined;
  assert.equal(seen?.acknowledged, 4, 'all four stepped the player, in order');
});

test('a sea that keeps characters sails a course only once the keeper has answered, and sends gear at sea', () => {
  const room = startRoomDoor(compiled);
  const square = [
    [100_000, 100_000],
    [200_000, 100_000],
    [200_000, 200_000],
    [100_000, 200_000],
  ];
  assert.equal(room.openSea(JSON.stringify({ continents: [{ id: 'square', outline: square }], isles: [] }), 7), true);
  assert.equal(room.keepCharacters(), true);
  const [kept, unkept] = [room.join(), room.join()];
  for (const player of [kept, unkept]) assert.equal(room.input(player, courseBytes([[50_000, 50_000]], 10)), 'taken');
  room.tick();
  const ships = () => {
    const snapshot = readFromRoom(room.snapshot(kept));
    return snapshot?.kind === 'snapshot' ? snapshot.ships.map((ship) => [ship.player, ship.x, ship.y]) : [];
  };
  assert.deepEqual(ships(), [], 'held for the keeper');
  const character = JSON.parse(room.character(kept) ?? 'null') as { ship_at: [number, number] | null };
  const shipless = JSON.stringify({ ...character, ship_at: [60_000, 40_000] });
  assert.equal(room.restoreCharacter(kept, shipless), false, 'a new character keeps no ship, and the sea shuts to it');
  // Handed the Sloop, as the welcome's Harbourmaster hands it over.
  const fleet = { ships: [{ hull: 0 }], sailed: 0, dress: [] };
  assert.equal(room.restoreCharacter(kept, JSON.stringify({ ...character, ship_at: [60_000, 40_000], fleet })), true);
  room.noneKept(unkept);
  room.tick();
  assert.deepEqual(ships(), [
    [kept, 60_000, 40_000],
    [unkept, 50_000, 50_000],
  ]);
  assert.ok(room.gear(kept).length > 0, 'their gear, from the character given back');
  assert.equal(room.gear(unkept).length, 0, 'none for a character not kept');
});

test('a wounded player’s drink through the room heals them, and the page reads the heal as the room tells it', () => {
  const room = startRoomDoor(compiled);
  assert.equal(room.open(course.start, course.blocks), true);
  const player = room.join();
  let sequence = 0;
  const kept = new SnapshotKeeper();
  /** One tick of the player at rest, a drink asked if `heal`: what the page reads of them, and the fight's events. */
  const step = (heal = false) => {
    const intent = new Float64Array([
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      Number.NaN,
      Number.NaN,
      Number.NaN,
      heal ? 1 : 0,
    ]);
    assert.equal(room.input(player, asking(++sequence, intent, walking)), 'taken');
    room.tick();
    // As the page reads them: each event handed on once, though the room tells it again until a later tick is shown.
    const snapshot = kept.whole(readFromRoom(room.snapshot(player)) as never);
    if (!snapshot) throw new Error('no snapshot');
    const seen = snapshot.players.find((each) => each.player === player);
    if (!seen?.fighter) throw new Error('the room did not see the player');
    return { fighter: seen.fighter, events: snapshot.events as readonly FightEvent[] };
  };
  const joined = step();
  assert.equal(chargesOf(joined.fighter).charges, CHARGES_MOST, 'a player joins holding as many as the page shows');
  // A Tithe Collector beside the player strikes once, then is sent away.
  const { x, y } = course.start;
  assert.ok(room.standFoe(2, 2, x, y - 1.5, Math.PI, 0) > 0);
  let wounded = joined;
  while (fighterView(wounded.fighter).health >= fighterView(wounded.fighter).healthMax) {
    wounded = step();
    assert.ok(sequence < 900, 'the Collector struck');
  }
  assert.equal(room.clearFoes(), true);
  for (let tick = 0; tick < 60; tick++) wounded = step();
  const before = fighterView(wounded.fighter);
  assert.equal(before.action.kind, 'idle');
  const told: FightEvent[] = [...step(true).events];
  for (let tick = 0; tick < 61; tick++) told.push(...step().events);
  const healed = told.filter((event) => event.kind === EVENT.healed);
  const gave = Math.min(before.healthMax * 0.4, before.healthMax - before.health);
  assert.equal(healed.length, 1, 'one heal told');
  assert.deepEqual(
    [healed[0]?.striker, healed[0]?.defender, healed[0]?.amount],
    [player, player, gave],
    'the drinker, and the health it gave back',
  );
  const after = step();
  assert.equal(fighterView(after.fighter).health, before.health + gave);
  assert.equal(chargesOf(after.fighter).charges, CHARGES_MOST - 1);
});

test('logging back in, a social room stands the player where their kept character left it, and only then', () => {
  const { text } = nodeFile();
  const room = startRoomDoor(compiled);
  assert.equal(room.openNode(JSON.stringify({ ...(JSON.parse(text) as object), id: 'quay', kind: 'social' })), true);
  const player = room.join();
  room.tick();
  const character = JSON.parse(room.character(player) ?? 'null') as object;
  const last = { kind: 'social', node: 'quay', at: [3000, 2000, 1000], facing: 1500 };
  assert.equal(room.restoreCharacter(player, JSON.stringify({ ...character, last })), true);
  const feet = () => {
    room.tick();
    const seen = readFromRoom(room.snapshot(player));
    const body = seen?.kind === 'snapshot' ? seen.players.find((each) => each.player === player)?.body : undefined;
    return body ? [Math.round(body.x), Math.round(body.y), Math.round(body.facing * 1000)] : null;
  };
  assert.deepEqual(feet(), [0, 0, 3142], 'a claim alone stands no one elsewhere: at the spawn');
  assert.equal(room.standWhereLeft(player), true);
  assert.deepEqual(feet(), [30, 20, 1500], 'where it left the quay, facing as it did');
  assert.equal(room.restoreCharacter(player, JSON.stringify({ ...character, last: { kind: 'sea' } })), true);
  assert.equal(room.standWhereLeft(player), false, 'last at sea');
});
