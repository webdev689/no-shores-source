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
  courseBytes,
  inputBytes,
  readFromRoom,
} from '../client/src/network/messages.ts';
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
const walk = new Float64Array([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, Number.NaN, Number.NaN, Number.NaN, 0]);
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
  assert.deepEqual(readFromRoom(room.joined(first)), {
    kind: 'joined',
    player: first,
    dressed: [],
    node: null,
    protocol,
    epoch: 0,
  });
  assert.equal(room.input(first, asking(1, walk, walking, '{"body":"male"}')), 'taken');
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
  assert.deepEqual(snapshot.dressed, [{ player: first, dress: '{"body":"male"}' }]);
  // Once the page says its screen showed that snapshot, the dress is not sent it again.
  const shown = inputBytes(31, { intent: walk, look: walking, arms: 0, seen: snapshot.tick });
  assert.equal(room.input(first, shown), 'taken');
  room.tick();
  assert.deepEqual((readFromRoom(room.snapshot(first)) as { dressed: unknown }).dressed, []);
  const third = room.join();
  assert.deepEqual(readFromRoom(room.joined(third)), {
    kind: 'joined',
    player: third,
    dressed: [{ player: first, dress: '{"body":"male"}' }],
    node: null,
    protocol,
    epoch: 0,
  });
});

test('the roster reads from the rules: every type it drives with its name, faction, ranks and hands', () => {
  const roster = JSON.parse(startRoomDoor(compiled).roster()) as {
    type: number;
    name: string;
    faction_name: string;
    ranks: number[];
    right: string;
  }[];
  assert.equal(roster.length, 20);
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
  assert.deepEqual(readFromRoom(room.joined(first)), {
    kind: 'joined',
    player: first,
    dressed: [],
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
  assert.deepEqual(floatsOf(seen.body), floatsOf(movement.standing(30, -40)), 'back at the spawn nearest its death');
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

/** The world time the clash's sea opens at (crates/room-wasm/src/door_tests.rs `CLASH_START_S`). */
const CLASH_START_S = 1_790_151_200;

test('a sea where rivals clash and a player joins them snapshots to the fingerprint the crate holds natively', () => {
  // crates/room-wasm/src/door_tests.rs runs the same sea natively and holds the same value (SEA_CLASH_HASH).
  const room = startRoomDoor(compiled);
  const square = [
    [100_000, 100_000],
    [200_000, 100_000],
    [200_000, 200_000],
    [100_000, 200_000],
  ];
  // The second island's waters are contested, so both factions come; on this seed two meet near the player.
  const contested = { continents: [{ id: 'continent-2', outline: square }], isles: [] };
  assert.equal(room.openSea(JSON.stringify(contested), 484, CLASH_START_S), true);
  const player = room.join();
  assert.equal(room.input(player, courseBytes([[50_000, 50_000]], 10)), 'taken');
  let hash = 0xcbf2_9ce4_8422_2325n;
  let others = 0;
  for (let tick = 1; tick <= 16_000; tick++) {
    if (tick === 6_523) assert.equal(room.input(player, courseBytes([[53_327, 53_450]], 10)), 'taken');
    room.tick();
    if (tick % 60 !== 0) continue;
    const bytes = room.snapshot(player);
    for (const byte of bytes) hash = ((hash ^ BigInt(byte)) * 0x0100_0000_01b3n) & 0xffff_ffff_ffff_ffffn;
    const snapshot = readFromRoom(bytes);
    const fight = snapshot?.kind === 'snapshot' ? snapshot.fights[0] : undefined;
    if (fight) others = Math.max(others, fightViewOf(fight.view).others?.length ?? 0);
  }
  assert.equal(others, 1, 'the player fights both rivals');
  assert.equal(hash.toString(16).padStart(16, '0'), '931bb63be1946e30');
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
  assert.equal(room.restoreCharacter(kept, JSON.stringify({ ...character, ship_at: [60_000, 40_000] })), true);
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
  // A pirate swordsman beside the player strikes once, then is sent away.
  const { x, y } = course.start;
  assert.ok(room.standFoe(14, 2, x, y - 1.5, Math.PI, 0) > 0);
  let wounded = joined;
  while (fighterView(wounded.fighter).health >= fighterView(wounded.fighter).healthMax) {
    wounded = step();
    assert.ok(sequence < 900, 'the swordsman struck');
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
