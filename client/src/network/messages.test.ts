import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as flatbuffers from 'flatbuffers';
import { Course, Input } from '../../../generated/messages/ts/overlook/wire.ts';
import type { FightOrders } from '../rules/fightRules.ts';
import { fighterView, glanceView } from '../rules/fighters.ts';
import { floatsOf, startMovementRules } from '../rules/movementRules.ts';
import { courseBytes, inputBytes, ordersBytes, readFromRoom } from './messages.ts';
import { fightViewOf, ordersNumbers } from './seaFight.ts';

const target = (path: string) => new URL(`../../../target/${path}`, import.meta.url);
const built = (path: string, how: string) =>
  readFile(target(path)).catch(() => {
    throw new Error(`${path} is not built: ${how}`);
  });
const written = async (name: string) => new Uint8Array(await built(`protocol/${name}`, 'run `cargo test -p protocol`'));

test('a welcome and a snapshot the server wrote read back to the bit', async () => {
  // protocol_tests.rs writes these messages: a welcome into Overlook's social space; one player standing inside, one
  // after half a second's walk, swinging and warned; and the first's dress.
  const dressed = [{ player: 7, dress: '{"body":"male"}' }];
  const node = { id: 'overlook-social', bounds: [2_808_986, 1_201_139, 2_809_442, 1_201_455.5] };
  assert.deepEqual(readFromRoom(await written('joined.bin')), { kind: 'joined', player: 7, dressed, node });
  const snapshot = readFromRoom(await written('snapshot.bin'));
  assert.equal(snapshot?.kind, 'snapshot');
  if (snapshot?.kind !== 'snapshot') return;
  const rules = await startMovementRules(
    await built('wasm32-unknown-unknown/release/movement_wasm.wasm', 'run `npm run wasm`'),
  );
  rules.setCourse([]);
  let walked = rules.standing(1.5, -2.25);
  const walk = { forward: 1, sideways: 0, yaw: 0.3, run: false, jump: false, crouch: false, mounted: false };
  for (let tick = 0; tick < 30; tick++) walked = rules.step(walked, walk);
  assert.equal(snapshot.tick, 1234n);
  assert.deepEqual(
    snapshot.players.map(({ player, acknowledged, body, anim, frame, facing, standing }) => [
      player,
      acknowledged,
      floatsOf(body),
      anim,
      frame,
      facing,
      standing,
    ]),
    [
      [7, 0, floatsOf(rules.standing(1.5, -2.25)), '', 0, 0, { kind: 'inside' }],
      [9, 30, floatsOf(walked), 'attack_sword', 4, 0.75, { kind: 'warned', ticks: 432 }],
    ],
  );
  assert.deepEqual([snapshot.dressed, snapshot.ships], [dressed, []]);
  // The second player's fighter: a sword drawn, its lock on foe 12, stamina spent.
  const fighting = fighterView(snapshot.players[1]?.fighter ?? []);
  assert.deepEqual([fighting.target, fighting.stamina, fighting.health, fighting.side], [12, 88, 100, 'players']);
  assert.equal(fighting.x, walked.x);
  // The brute, staggered by a parry, 40 of its 130 health gone, its lock on the player.
  const [foe] = snapshot.foes;
  const brute = glanceView(foe?.glance ?? []);
  assert.deepEqual(
    [foe?.id, foe?.kind, brute.health, brute.healthMax, brute.target, brute.side],
    [12, 3, 90, 130, 9, 'foes'],
  );
  // A pirate brute of the Elite rank in its first phase, alert.
  assert.deepEqual([foe?.type, foe?.rank, foe?.faction, foe?.phase, foe?.alert], [15, 3, 2, 1, 2]);
  assert.deepEqual(brute.action, { kind: 'staggered', left: 30, cause: 'parried' });
  assert.deepEqual(
    snapshot.events.map((event) => [
      event.tick,
      event.kind,
      event.how,
      event.striker,
      event.defender,
      event.amount,
      event.stroke,
    ]),
    [
      [1233n, 3, 1, 12, 9, 0, 0],
      [1234n, 1, 2, 9, 12, 35, 3],
    ],
  );
  const [arrow] = snapshot.shots;
  assert.deepEqual([arrow?.owner, arrow?.ranged], [12, 1]);
  const flat = Math.cos(0.1);
  const along = [Math.sin(0.5) * flat, -Math.cos(0.5) * flat, Math.sin(0.1)];
  arrow?.at.forEach((value, axis) =>
    assert.ok(Math.abs(value - ([3, -6, 1.1][axis] ?? 0) - (along[axis] ?? 0) * 0.4) < 1e-12),
  );
});

test('the sea’s snapshot the server wrote reads back as its ships, its pirates, its fights and its walkers on deck', async () => {
  const sea = readFromRoom(await written('sea.bin'));
  const walker = sea?.kind === 'snapshot' ? sea.players[0] : undefined;
  assert.deepEqual(
    [walker?.player, walker?.acknowledged, walker?.body.x, walker?.body.y, walker?.body.z],
    [3, 41, 0.25, 2.5, 0.8],
  );
  assert.equal(walker?.fighter, null, 'a walker on deck crosses as their body alone, with no fighter');
  assert.deepEqual(sea?.kind === 'snapshot' ? [sea.tick, sea.ships] : null, [
    77n,
    [
      // The pace she sailed at, held down near a pirate: 5 where 60 was asked.
      { player: 3, x: 50_000, y: 149_880.25, heading: 0, pace: 5 },
      { player: 4, x: 61_000, y: 149_000, heading: Math.PI / 2, pace: 0 },
    ],
  ]);
  assert.deepEqual(sea?.kind === 'snapshot' ? sea.pirates : null, [
    { id: 4, x: 1_000.5, y: 2_000.25, heading: 1.5, faction: 1, rank: 2 },
  ]);
  const fights = sea?.kind === 'snapshot' ? sea.fights : [];
  assert.deepEqual([fights[0]?.player, fights[0]?.faction, fights[0]?.rank], [2, 1, 4]);
  const named = { name: 'Tithe Sloop', faction: fights[0]?.faction ?? 0, rank: fights[0]?.rank ?? 0 };
  const fight = fightViewOf(fights[0]?.view ?? [], named);
  assert.deepEqual([fight.captain.name, fight.captain.faction, fight.captain.rank], ['Tithe Sloop', 1, 4]);
  assert.equal(fightViewOf(fights[0]?.view ?? []).captain.name, 'Pirate Sloop', 'unnamed, a Major of the pirates');
  assert.deepEqual(
    [fight.clock, fight.over, fight.player.ship.slice(0, 3), fight.captain.ship.slice(0, 3)],
    [0, null, [0, 0, 0], [0, -700, 3]],
  );
  assert.deepEqual([fight.player.state, fight.captain.mode, fight.player.guns.load], ['afloat', 'cruise', 'round']);
  const other = fightViewOf(fights[0]?.view ?? [], named, (faction) => `of ${faction}`).others?.[0];
  assert.deepEqual(
    [other?.name, other?.faction, other?.rank, other?.ship.slice(0, 3), other?.mode],
    ['of 2', 2, 3, [400, -700, 0.5], 'cruise'],
    'a pirates’ Elite fights too',
  );
  assert.deepEqual([fight.lay?.side, fight.lay?.launches.length, fight.lay?.ends.length], ['starboard', 3, 3]);
  assert.ok((fight.lay?.radius ?? 0) > 0, 'the landing zone has a size');
  assert.ok(
    fight.lay?.ends.every((end) => end !== null && end.water && end.strike === null),
    'laid 80 m out with her 700 m off, each ball splashes',
  );
  assert.deepEqual(fight.events, [
    { kind: 'run-out', side: 'port' },
    { kind: 'ram', ship: 1, by: 0, point: [1, 2, 3], dealt: 4.5 },
  ]);
});

test('a fighting ship’s orders cross as the naval crate’s numbers', () => {
  const helm = { steer: -0.5, crab: true, climb: 1 } as const;
  const aim = { bearing: 85, range: 120, ray: [4, 2.5, 6, 0.2, 1, -0.1] };
  const orders: FightOrders = { helm, aim, fire: true, brace: false, load: 'chain' };
  assert.deepEqual(ordersNumbers(orders), [-0.5, 1, 1, 1, 85, 120, 1, 4, 2.5, 6, 0.2, 1, -0.1, 1, 0, 3]);
  const rayless = { ...orders, aim: { bearing: 85, range: 120 } };
  assert.deepEqual(ordersNumbers(rayless), [-0.5, 1, 1, 1, 85, 120, 0, 0, 0, 0, 0, 0, 0, 1, 0, 3]);
  const course = Course.getRootAsCourse(new flatbuffers.ByteBuffer(ordersBytes(ordersNumbers(orders))));
  assert.deepEqual([Array.from(course.ordersArray() ?? []), course.pointsLength()], [ordersNumbers(orders), 0]);
});

test('an input is its number, its controls and fight buttons in the combat crate’s order, its look, its arms, the tick seen, a foe asked for, a dress if given, and a respawn', () => {
  const intent = new Float64Array([1, -0.5, 0.3, 1, 0, 1, 0, 6, 1, 0, 1, -0.2]);
  const look = { anim: 'ride_gallop', frame: 3, facing: -1.5 };
  const parts = { intent, look, arms: 0x10002, seen: 977n, spawn: { type: 12, rank: 5 } };
  const input = Input.getRootAsInput(
    new flatbuffers.ByteBuffer(inputBytes(42, { ...parts, dress: '{"body":"female"}', respawn: true })),
  );
  assert.equal(input.sequence(), 42);
  assert.deepEqual(Array.from(input.controlsArray() ?? []), [1, -0.5, 0.3, 1, 0, 1, 0]);
  assert.deepEqual(Array.from(input.combatArray() ?? []), [6, 1, 0, 1, -0.2]);
  assert.deepEqual(
    [input.anim(), input.frame(), input.facing(), input.dress(), input.arms(), input.seen(), input.spawn()],
    ['ride_gallop', 3, -1.5, '{"body":"female"}', 0x10002, 977n, 0],
  );
  assert.deepEqual([input.spawnType(), input.spawnRank(), input.respawn()], [12, 5, true]);
  const plain = Input.getRootAsInput(new flatbuffers.ByteBuffer(inputBytes(1, { ...parts, spawn: undefined })));
  assert.deepEqual([plain.dress(), plain.respawn(), plain.spawn(), plain.spawnType()], [null, false, 0, 0]);
  const clearing = Input.getRootAsInput(new flatbuffers.ByteBuffer(inputBytes(2, { ...parts, spawn: 'clear' })));
  assert.deepEqual([clearing.spawn(), clearing.spawnType()], [255, 0]);
});

test('a course is its points, x then y, and its pace', () => {
  const bytes = courseBytes(
    [
      [50_000, 150_000.5],
      [51_000, 149_000],
    ],
    20,
  );
  const course = Course.getRootAsCourse(new flatbuffers.ByteBuffer(bytes));
  assert.deepEqual([Array.from(course.pointsArray() ?? []), course.pace()], [[50_000, 150_000.5, 51_000, 149_000], 20]);
});

test('bytes that hold no message read as nothing', () => {
  assert.equal(readFromRoom(new Uint8Array()), null);
  assert.equal(readFromRoom(new Uint8Array([1, 2, 3])), null);
});
