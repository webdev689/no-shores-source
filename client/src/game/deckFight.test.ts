import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import course from '../../../content/testground/course.json' with { type: 'json' };
import { startRoomDoor } from '../../../server/roomDoor.ts';
import { Fighting } from '../combat/fighting.ts';
import { readFromRoom } from '../network/messages.ts';
import { SnapshotKeeper } from '../network/snapshots.ts';
import type { RoomLink, Snapshot } from '../network/roomConnection.ts';
import { startCombatRules } from '../rules/combatRules.ts';
import type { Body, Controls, MovementRules } from '../rules/movementRules.ts';
import type { SeenDeck, SeenFlotsam } from '../network/seaHarbour.ts';
import type { CardAt } from '../player/cards.ts';
import type { FightCaptain, FightView } from '../rules/fightRules.ts';
import { cellHeight, deckFloats, deckToWorld, HULL_DECKS, type Lying, railSpot } from '../ships/deck.ts';
import { fromEyeMatrix, shifted, type Shot } from './camera.ts';
import { boardedLying, boardingSide, deckLink, deckNode, deckTurn, holdWords, laidOnDeck, times } from './deckFight.ts';
import type { FootFrame } from './foot.ts';
import { SeaRoom } from './seaRoom.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const compiled = new WebAssembly.Module(
  await readFile(MODULE).catch(() => {
    throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
  }),
);

/** Its ship hove to on a swell: turned, lifted, its bow up a little and heeled to starboard. */
const LYING: Lying = { x: 120, y: -70, heading: 2.2, scale: 1, heave: 0.7, pitch: 0.06, roll: -0.11 };

/** A column-major matrix applied to a point. */
function apply(matrix: Float32Array, [x, y, z]: readonly number[]): number[] {
  return [0, 1, 2, 3].map(
    (row) =>
      (matrix[row] ?? 0) * (x ?? 0) +
      (matrix[4 + row] ?? 0) * (y ?? 0) +
      (matrix[8 + row] ?? 0) * (z ?? 0) +
      (matrix[12 + row] ?? 0),
  );
}

function near(actual: readonly number[], expected: readonly number[], within: number, what: string): void {
  actual.forEach((value, index) => assert.ok(Math.abs(value - (expected[index] ?? 0)) < within, `${what}: ${actual}`));
}

test('its deck’s land frame follows its ship’s pose: each figure, the eye and every step on its deck lie where it carries them', () => {
  const turn = deckTurn(LYING);
  const origin = deckToWorld(LYING, 0, 0, 0);
  const points: readonly (readonly [number, number, number])[] = [
    [1.2, -3.4, 0.9],
    [-0.8, 5.1, 2.3],
  ];
  for (const point of points) {
    const step = apply(turn, point).slice(0, 3);
    const world = deckToWorld(LYING, ...point);
    near(step, [world[0] - origin[0], world[1] - origin[1], world[2] - origin[2]], 1e-3, 'a step turned as it lies');
  }
  const local: Shot = { eye: [0.5, 4, 2.1], yaw: 0.3, pitch: 0.2, fov: 1.1, near: 0.1, far: 900 };
  const figure = { card: {}, x: -1, y: -2, z: 0.8, flip: false } as unknown as CardAt;
  const shown = { shot: local, figures: [figure] } as unknown as FootFrame;
  const laid = laidOnDeck(shown, LYING);
  near(laid.shot.eye, deckToWorld(LYING, ...local.eye), 1e-9, 'the eye rides it');
  assert.equal(laid.shot.yaw, 0.3 + LYING.heading, 'looking along its deck as it is turned');
  const [placed] = laid.figures;
  near([placed?.x ?? 0, placed?.y ?? 0, placed?.z ?? 0], deckToWorld(LYING, -1, -2, 0.8), 1e-9, 'its figure');
  // The fight's display projects a point on its deck where the world's camera sees it, as it carries it.
  const fromEye = fromEyeMatrix(laid.shot, 16 / 9);
  const onDeck = shifted(times(fromEye, turn), [-local.eye[0], -local.eye[1], -local.eye[2]]);
  const inWorld = shifted(fromEye, [-laid.shot.eye[0], -laid.shot.eye[1], -laid.shot.eye[2]]);
  const point = [1.5, -6, 1.1] as const;
  near(apply(onDeck, point), apply(inWorld, deckToWorld(LYING, ...point)), 1e-3, 'projected');
});

/** A captain of a fight, struck or not, lying at (x, y). */
const captain = (x: number, y: number, name: string): FightCaptain =>
  ({ name, ship: [x, y, 0.4, 0, 0, 0, 0, 0], pose: [0.3, 0.01, 0.02], state: 'struck' }) as unknown as FightCaptain;

test('its ship is the fight’s captain lying nearest where it lay last, posed as the fight shows it', () => {
  const view = { captain: captain(0, 900, 'Far'), others: [captain(10, 25, 'Boarded')] } as unknown as FightView;
  const { captain: found, lying } = boardedLying(view, [12, 20], 1);
  assert.equal(found.name, 'Boarded');
  assert.deepEqual(lying, { x: 10, y: 25, heading: 0.4, scale: 1, heave: 0.3, pitch: 0.01, roll: 0.02 });
});

test('its deck is a place on foot whose ring is its bounds and whose spawn is at its rail on the boarder’s side, as its room stands them', () => {
  const [sloop, schooner] = HULL_DECKS;
  assert.ok(sloop && schooner && HULL_DECKS.length === 4, 'the four hulls’ decks');
  const node = deckNode(schooner, 'The deck', -1);
  const [west, north] = node.ring[0] ?? [0, 0];
  const [east, south] = node.ring[2] ?? [0, 0];
  assert.ok(west < 0 && east > 0 && north < 0 && south > 0, 'round amidships');
  const [[portX = 0, portY = 1]] = node.spawns;
  assert.ok(portX < -1.5 && portY === 0, `at its port rail amidships: ${portX}`);
  const [[starboardX = 0]] = deckNode(sloop, 'The deck', 1).spawns;
  assert.ok(starboardX > 1.5, `the Sloop’s starboard rail, clear of its hatch and mast: ${starboardX}`);
  const view = (aside: number) =>
    ({ player: { ship: [aside, 3, 0] }, captain: captain(0, 0, 'Struck'), others: [] }) as unknown as FightView;
  // Its heading 0.4 rad: its starboard lies east and a little south; a ship east of it lies to starboard.
  assert.deepEqual([boardingSide(view(25)), boardingSide(view(-25))], [1, -1]);
  // A captain still fighting nearer the player's ship is not the one boarded.
  const afloat = { ...captain(24, 3, 'Afloat'), state: 'afloat', ship: [24, 3, 1.9] } as unknown as FightCaptain;
  const two = {
    player: { ship: [25, 3, 0] },
    captain: afloat,
    others: [captain(0, 0, 'Struck')],
  } as unknown as FightView;
  assert.equal(boardingSide(two), 1);
  const turned = { ...two, captain: { ...afloat, ship: [24, 3, 1.9 + Math.PI] } } as unknown as FightView;
  assert.equal(boardingSide(turned), 1, 'its side, whatever the other captain’s heading');
});

test('its deck room is reached through the sea’s link: the boarder’s inputs sent there, its gear the link’s', () => {
  const sent: Uint8Array[] = [];
  const sea = {
    deck: null,
    own: 3,
    rejoining: false,
    lost: null,
    gear: { trim: [1, 2], arms: [4], arts: null },
    flotsam: [],
    hearDeck: null,
    sendDeck: (bytes: Uint8Array) => void sent.push(bytes),
  };
  const link = deckLink(sea, 7);
  assert.equal(link.player, 7, 'the boarder’s number on its deck, not at sea');
  link.send(new Uint8Array([9]));
  link.pump(1);
  assert.deepEqual(sent, [new Uint8Array([9])]);
  assert.deepEqual([link.trim, link.arms, link.rejoining, link.lost], [[1, 2], [4], false, null]);
});

test('its hold’s take reads as its pieces counted', () => {
  const piece = (id: number, kind: SeenFlotsam['kind']): SeenFlotsam => ({ player: 1, id, at: [0, 0], kind });
  assert.equal(holdWords([piece(1, 'crate'), piece(2, 'crate'), piece(3, 'chest')]), '2 crates, a chest');
  assert.equal(holdWords([piece(1, 'barrel')]), 'a barrel');
  assert.equal(holdWords([]), 'nothing');
});

test('the sea room hands each snapshot of the deck the player stands on, decoded, to the fight on its deck', async () => {
  const door = startRoomDoor(compiled);
  door.open(course.start, course.blocks);
  const boarder = door.join();
  door.tick();
  const deckBytes = door.snapshot(boarder);
  let hand: (snapshot: Snapshot) => void = () => undefined;
  const link = {
    player: 1,
    dressed: [],
    joins: 1,
    rejoining: false,
    lost: null,
    send: () => undefined,
    pump: () => {},
  };
  const room = await SeaRoom.join((snapshot) => ((hand = snapshot), link), [0, 0], 10);
  const heard: Snapshot[] = [];
  room.hearDeck = (snapshot) => heard.push(snapshot);
  const atSea = (decks: readonly SeenDeck[]) =>
    hand({
      tick: 5n,
      players: [],
      ships: [],
      hostiles: [],
      fights: [],
      flotsam: [],
      kept: [],
      told: [],
      decks,
    } as never);
  atSea([{ aboard: [[2, 9]], hull: 0, snapshot: deckBytes, holdLeft: null }]);
  assert.equal(heard.length, 0, 'another player’s deck');
  atSea([{ aboard: [[1, boarder]], hull: 0, snapshot: deckBytes, holdLeft: 1200 }]);
  assert.equal(heard.length, 1);
  assert.ok(
    heard[0]?.players.some((seen) => seen.player === boarder),
    'the boarder stands on its deck',
  );
  assert.equal(room.deck?.holdLeft, 1200);
});

test('the page predicts its boarder on its deck exactly as its deck room steps them, on its planks among its crew', () => {
  const schooner = HULL_DECKS[1];
  assert.ok(schooner);
  const door = startRoomDoor(compiled);
  assert.ok(door.openDeck(1, 1, 1, 5), 'a Minor Tithe Schooner’s deck');
  assert.equal(door.openDeck(9, 1, 1, 5), false, 'no such hull');
  door.openDeck(1, 1, 1, 5);
  let fight: Fighting | null = null;
  const kept = new SnapshotKeeper();
  const link: RoomLink = {
    player: door.join(),
    dressed: [],
    joins: 1,
    rejoining: false,
    lost: null,
    send: (bytes) => void door.input(link.player, bytes),
    pump: () => {
      door.tick();
      // Each snapshot made whole from the changes it carries, as a room's connection makes it.
      const message = readFromRoom(door.snapshot(link.player));
      const whole = message?.kind === 'snapshot' ? kept.whole(message) : null;
      if (whole) fight?.receive(whole);
    },
  };
  const rules = startCombatRules(compiled);
  rules.setCourse([]);
  assert.ok(rules.setHeights(deckFloats(schooner)));
  assert.equal(rules.setHeights([1, 2]), false, 'numbers that are no grid');
  rules.setHeights(deckFloats(schooner));
  const fighting = new Fighting(rules, link);
  fight = fighting;
  link.pump(1 / 60);
  // Its room stands its first boarder at its starboard rail, where the page reckons it.
  const [railX, railY] = railSpot(schooner, 1);
  assert.ok(Math.abs((fighting.own?.x ?? 0) - railX) < 1e-9 && fighting.own?.y === railY, `${fighting.own?.x}`);
  const steps = fighting.steps({ tickSeconds: 1 / 60 } as unknown as MovementRules);
  const still: Controls = { forward: 0, sideways: 0, yaw: 0, run: false, jump: false, crouch: false, mounted: false };
  for (const [count, controls] of [
    [30, { ...still, sideways: 1 }],
    [40, { ...still, forward: -1, yaw: 0.2 }],
  ] as const)
    for (let tick = 0; tick < count; tick += 1) {
      steps.step({} as Body, controls);
      const predicted: string = JSON.stringify(fighting.own);
      link.pump(1 / 60);
      assert.equal(JSON.stringify(fighting.own), predicted, `the room's word is the page's, tick ${tick}`);
    }
  const own = fighting.own;
  assert.ok(own && Math.hypot(own.x, own.y) > 1, 'walked');
  assert.ok(Math.abs(own.z - (cellHeight(schooner, own.x, own.y) ?? -9)) < 0.05, `on its planks: ${own.z}`);
  assert.equal(fighting.foes.size, 3, 'a Minor’s three hands');
});
