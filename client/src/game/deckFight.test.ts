import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import course from '../../../content/testground/course.json' with { type: 'json' };
import { startRoomDoor } from '../../../server/roomDoor.ts';
import type { Snapshot } from '../network/roomConnection.ts';
import type { SeenDeck, SeenFlotsam } from '../network/seaHarbour.ts';
import type { CardAt } from '../player/cards.ts';
import type { FightCaptain, FightView } from '../rules/fightRules.ts';
import { deckToWorld, HULL_DECKS, type Lying } from '../ships/deck.ts';
import { fromEyeMatrix, shifted, type Shot } from './camera.ts';
import { deckLink, deckNode, deckTurn, herLying, holdWords, laidOnHer, times } from './deckFight.ts';
import type { FootFrame } from './foot.ts';
import { SeaRoom } from './seaRoom.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const compiled = new WebAssembly.Module(
  await readFile(MODULE).catch(() => {
    throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
  }),
);

/** Her ship hove to on a swell: turned, lifted, her bow up a little and heeled to starboard. */
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

test('her deck’s land frame follows her ship’s pose: each figure, the eye and every step on her deck lie where she carries them', () => {
  const turn = deckTurn(LYING);
  const origin = deckToWorld(LYING, 0, 0, 0);
  for (const point of [
    [1.2, -3.4, 0.9],
    [-0.8, 5.1, 2.3],
  ] as const) {
    const step = apply(turn, point).slice(0, 3);
    const world = deckToWorld(LYING, ...point);
    near(step, [world[0] - origin[0], world[1] - origin[1], world[2] - origin[2]], 1e-3, 'a step turned as she lies');
  }
  const local: Shot = { eye: [0.5, 4, 2.1], yaw: 0.3, pitch: 0.2, fov: 1.1, near: 0.1, far: 900 };
  const figure = { card: {}, x: -1, y: -2, z: 0.8, flip: false } as unknown as CardAt;
  const shown = { shot: local, figures: [figure] } as unknown as FootFrame;
  const laid = laidOnHer(shown, LYING);
  near(laid.shot.eye, deckToWorld(LYING, ...local.eye), 1e-9, 'the eye rides her');
  assert.equal(laid.shot.yaw, 0.3 + LYING.heading, 'looking along her deck as she is turned');
  const [placed] = laid.figures;
  near([placed?.x ?? 0, placed?.y ?? 0, placed?.z ?? 0], deckToWorld(LYING, -1, -2, 0.8), 1e-9, 'her figure');
  // The fight's display projects a point on her deck where the world's camera sees it, as she carries it.
  const fromEye = fromEyeMatrix(laid.shot, 16 / 9);
  const onDeck = shifted(times(fromEye, turn), [-local.eye[0], -local.eye[1], -local.eye[2]]);
  const inWorld = shifted(fromEye, [-laid.shot.eye[0], -laid.shot.eye[1], -laid.shot.eye[2]]);
  const point = [1.5, -6, 1.1] as const;
  near(apply(onDeck, point), apply(inWorld, deckToWorld(LYING, ...point)), 1e-3, 'projected');
});

/** A captain of a fight, struck or not, lying at (x, y). */
const captain = (x: number, y: number, name: string): FightCaptain =>
  ({ name, ship: [x, y, 0.4, 0, 0, 0, 0, 0], pose: [0.3, 0.01, 0.02], state: 'struck' }) as unknown as FightCaptain;

test('her ship is the fight’s captain lying nearest where she lay last, posed as the fight shows her', () => {
  const view = { captain: captain(0, 900, 'Far'), others: [captain(10, 25, 'Boarded')] } as unknown as FightView;
  const { captain: found, lying } = herLying(view, [12, 20], 1);
  assert.equal(found.name, 'Boarded');
  assert.deepEqual(lying, { x: 10, y: 25, heading: 0.4, scale: 1, heave: 0.3, pitch: 0.01, roll: 0.02 });
});

test('her deck is a place on foot whose ring is her bounds and whose spawn is where her deck room stands a boarder', () => {
  const [sloop, schooner] = HULL_DECKS;
  assert.ok(sloop && schooner && HULL_DECKS.length === 4, 'the four hulls’ decks');
  assert.deepEqual(deckNode(sloop, 'Her deck').spawns, [sloop.helm], 'the Sloop’s hatch amidships: at her helm');
  const node = deckNode(schooner, 'Her deck');
  const [west, north] = node.ring[0] ?? [0, 0];
  const [east, south] = node.ring[2] ?? [0, 0];
  assert.ok(west < 0 && east > 0 && north < 0 && south > 0, 'round amidships');
  assert.deepEqual(node.spawns, [[0, 0]], 'amidships, where her planks lie');
});

test('her deck room is reached through the sea’s link: the boarder’s inputs sent there, its gear the link’s', () => {
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
  assert.equal(link.player, 7, 'the boarder’s number on her deck, not at sea');
  link.send(new Uint8Array([9]));
  link.pump(1);
  assert.deepEqual(sent, [new Uint8Array([9])]);
  assert.deepEqual([link.trim, link.arms, link.rejoining, link.lost], [[1, 2], [4], false, null]);
});

test('her hold’s take reads as its pieces counted', () => {
  const piece = (id: number, kind: SeenFlotsam['kind']): SeenFlotsam => ({ player: 1, id, at: [0, 0], kind });
  assert.equal(holdWords([piece(1, 'crate'), piece(2, 'crate'), piece(3, 'chest')]), '2 crates, a chest');
  assert.equal(holdWords([piece(1, 'barrel')]), 'a barrel');
  assert.equal(holdWords([]), 'nothing');
});

test('the sea room hands each snapshot of the deck the player stands on, decoded, to the fight on her deck', async () => {
  const door = startRoomDoor(compiled);
  door.open(course.start, course.blocks);
  const boarder = door.join();
  door.tick();
  const deckBytes = door.snapshot();
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
      pirates: [],
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
    'the boarder stands on her deck',
  );
  assert.equal(room.deck?.holdLeft, 1200);
});
