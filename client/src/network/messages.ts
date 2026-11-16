import * as flatbuffers from 'flatbuffers';
import { Course, FromRoom, Input } from '../../../generated/messages/ts/overlook/wire.ts';
import type { Dressed } from '../../../generated/messages/ts/overlook/wire/dressed.ts';
import { BODY_FLOATS, type Body, type Controls, bodyOf, floatsOfControls } from '../rules/movementRules.ts';

/** What a player's figure shows on their own screen: the forge's move, its frame, and the way it faces. */
export interface Look {
  readonly anim: string;
  readonly frame: number;
  readonly facing: number;
}

/** Where a body stands with its node's section: inside, warned with `ticks` left before it dies, or dead `ticks`. */
export type Standing =
  | { readonly kind: 'inside' }
  | { readonly kind: 'warned'; readonly ticks: number }
  | { readonly kind: 'dead'; readonly ticks: number };

/** The standings in the order the messages number them. */
const STANDINGS = ['inside', 'warned', 'dead'] as const;

/** One player as a room last stepped them, what their figure showed with it, the number of their last input it took,
 *  and where they stand with its section. */
export interface SeenPlayer extends Look {
  readonly player: number;
  readonly acknowledged: number;
  readonly body: Body;
  readonly standing: Standing;
}

/** A player's dress as their browser wrote it; the room only carries it. */
export interface PlayerDress {
  readonly player: number;
  readonly dress: string;
}

/** One ship as the sea room last moved it: where it is, its heading in radians clockwise from north, and its pace, 0
 *  at rest. */
export interface SeenShip {
  readonly player: number;
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly pace: number;
}

/** A node's room's word on where its player is: the node's id, and the rect (west, north, east, south) its window of
 *  the ground is cut to, for the browser to cut the same. */
export interface JoinedNode {
  readonly id: string;
  readonly bounds: readonly [number, number, number, number];
}

/** What a room says: its welcome, with the joining player's number, every dress so far, and its node in a node's
 *  room; or every player after one of its ticks, with the dresses that changed since the last, and every ship at sea. */
export type FromRoomMessage =
  | {
      readonly kind: 'joined';
      readonly player: number;
      readonly dressed: readonly PlayerDress[];
      readonly node: JoinedNode | null;
    }
  | {
      readonly kind: 'snapshot';
      readonly tick: bigint;
      readonly players: readonly SeenPlayer[];
      readonly dressed: readonly PlayerDress[];
      readonly ships: readonly SeenShip[];
    };

/** One tick's input as its bytes, as the schema defines them: its number, its controls, what the player's figure
 *  shows, their dress when it changed, and whether they ask to respawn. */
export function inputBytes(
  sequence: number,
  controls: Controls,
  look: Look,
  dress?: string,
  respawn = false,
): Uint8Array<ArrayBuffer> {
  const builder = new flatbuffers.Builder(256);
  const numbers = Input.createControlsVector(builder, floatsOfControls(controls));
  const anim = builder.createString(look.anim);
  const dressed = dress === undefined ? 0 : builder.createString(dress);
  const { frame, facing } = look;
  builder.finish(Input.createInput(builder, sequence, numbers, anim, frame, facing, dressed, respawn));
  return builder.asUint8Array().slice();
}

/** A ship's course as its bytes: the world points it sails through in turn, and its pace, one of the steps of a
 *  ship's speed. No points brings it to rest. */
export function courseBytes(points: readonly (readonly [number, number])[], pace: number): Uint8Array<ArrayBuffer> {
  const builder = new flatbuffers.Builder(256);
  const numbers = Course.createPointsVector(builder, points.flat());
  builder.finish(Course.createCourse(builder, numbers, pace));
  return builder.asUint8Array().slice();
}

/** The dresses a message holds. */
function dressesOf(count: number, entry: (index: number) => Dressed | null): PlayerDress[] {
  return Array.from({ length: count }, (unused, index) => {
    const each = entry(index);
    return { player: each?.player() ?? 0, dress: each?.dress() ?? '' };
  });
}

/** A standing from its number and ticks; a number the messages do not give reads as inside. */
function standingOf(number: number, ticks: number): Standing {
  const kind = STANDINGS[number] ?? 'inside';
  return kind === 'inside' ? { kind } : { kind, ticks };
}

/** The message a room's bytes hold, or null when they hold neither a welcome nor a snapshot that reads. */
export function readFromRoom(bytes: Uint8Array): FromRoomMessage | null {
  // The TypeScript runtime has no verifier, so a message cut short throws while it is read.
  try {
    const message = FromRoom.getRootAsFromRoom(new flatbuffers.ByteBuffer(bytes));
    const joined = message.joined();
    if (joined) {
      const dressed = dressesOf(joined.dressedLength(), (index) => joined.dressed(index));
      const [id, bounds] = [joined.node(), Array.from(joined.boundsArray() ?? [])];
      const [west = 0, north = 0, east = 0, south = 0] = bounds;
      const node = id !== null && bounds.length === 4 ? { id, bounds: [west, north, east, south] as const } : null;
      return { kind: 'joined', player: joined.player(), dressed, node };
    }
    const snapshot = message.snapshot();
    if (!snapshot) return null;
    const players = Array.from({ length: snapshot.playersLength() }, (unused, index) => {
      const seen = snapshot.players(index);
      const numbers = Array.from(seen?.bodyArray() ?? []);
      if (!seen || numbers.length !== BODY_FLOATS) throw new Error(`snapshot player ${index} has no whole body`);
      const look = { anim: seen.anim() ?? '', frame: seen.frame(), facing: seen.facing() };
      const standing = standingOf(seen.standing(), seen.standingTicks());
      return { player: seen.player(), acknowledged: seen.acknowledged(), body: bodyOf(numbers), standing, ...look };
    });
    const dressed = dressesOf(snapshot.dressedLength(), (index) => snapshot.dressed(index));
    const ships = Array.from({ length: snapshot.shipsLength() }, (unused, index) => {
      const ship = snapshot.ships(index);
      if (!ship) throw new Error(`snapshot ship ${index} does not read`);
      return { player: ship.player(), x: ship.x(), y: ship.y(), heading: ship.heading(), pace: ship.pace() };
    });
    return { kind: 'snapshot', tick: snapshot.tick(), players, dressed, ships };
  } catch {
    return null;
  }
}
