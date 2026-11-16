import * as flatbuffers from 'flatbuffers';
import { Course, FromRoom, Input } from '../../../generated/messages/ts/overlook/wire.ts';
import type { Dressed } from '../../../generated/messages/ts/overlook/wire/dressed.ts';
import { FIGHTER_FLOATS, GLANCE_FLOATS } from '../rules/fighters.ts';
import { BODY_FLOATS, type Body, CONTROLS_FLOATS, bodyOf } from '../rules/movementRules.ts';

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
 *  their whole fighter in the combat crate's order, and where they stand with its section. */
export interface SeenPlayer extends Look {
  readonly player: number;
  readonly acknowledged: number;
  readonly body: Body;
  readonly fighter: Float64Array;
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

/** A foe as a room last stepped it: its number, its kind's number, and a glance at its fighter. */
export interface SeenFoe {
  readonly id: number;
  readonly kind: number;
  readonly glance: Float64Array;
}

/** Something that happened in the fight, as the room numbers it. */
export interface FightEvent {
  readonly tick: bigint;
  readonly kind: number;
  readonly how: number;
  readonly striker: number;
  readonly defender: number;
  readonly amount: number;
}

/** A shot in flight. */
export interface FlyingShot {
  readonly owner: number;
  readonly ranged: number;
  readonly at: readonly [number, number, number];
  readonly velocity: readonly [number, number, number];
}

/** What a room says: its welcome, with the joining player's number, every dress so far, and its node in a node's
 *  room; or everyone after one of its ticks, with the dresses that changed and what happened in the fight since the
 *  last, the shots in flight, and every ship at sea. */
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
      readonly foes: readonly SeenFoe[];
      readonly events: readonly FightEvent[];
      readonly shots: readonly FlyingShot[];
      readonly ships: readonly SeenShip[];
    };

/** One tick's input beyond its number: the intent's numbers (the controls', then the fight's), what the player's figure
 *  shows, their dress when it changed, what their hands hold, the room tick their screen showed, a foe's kind to stand
 *  before them (0 for none), and whether they ask to respawn, dead past a node's section. */
export interface InputParts {
  readonly intent: Float64Array;
  readonly look: Look;
  readonly dress?: string;
  readonly arms: number;
  readonly seen: bigint;
  readonly spawn: number;
  readonly respawn?: boolean;
}

/** One tick's input as its bytes, as the schema defines them. */
export function inputBytes(sequence: number, parts: InputParts): Uint8Array<ArrayBuffer> {
  const builder = new flatbuffers.Builder(320);
  const numbers = Array.from(parts.intent);
  const controls = Input.createControlsVector(builder, numbers.slice(0, CONTROLS_FLOATS));
  const combat = Input.createCombatVector(builder, numbers.slice(CONTROLS_FLOATS));
  const anim = builder.createString(parts.look.anim);
  const dressed = parts.dress === undefined ? 0 : builder.createString(parts.dress);
  Input.startInput(builder);
  Input.addSequence(builder, sequence);
  Input.addControls(builder, controls);
  Input.addAnim(builder, anim);
  Input.addFrame(builder, parts.look.frame);
  Input.addFacing(builder, parts.look.facing);
  if (dressed) Input.addDress(builder, dressed);
  Input.addCombat(builder, combat);
  Input.addArms(builder, parts.arms);
  Input.addSeen(builder, parts.seen);
  Input.addSpawn(builder, parts.spawn);
  Input.addRespawn(builder, parts.respawn ?? false);
  builder.finish(Input.endInput(builder));
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

/** Exactly `length` numbers, or a throw: the message is not whole. */
function whole(numbers: Float64Array | null, length: number, what: string): Float64Array {
  if (!numbers || numbers.length !== length) throw new Error(`${what} is not whole`);
  return numbers.slice();
}

/** A point's three numbers. */
const point = (numbers: Float64Array | null): [number, number, number] => {
  const [x = 0, y = 0, z = 0] = numbers ?? [];
  return [x, y, z];
};

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
      if (!seen) throw new Error(`snapshot player ${index} is missing`);
      const fighter = whole(seen.fighterArray(), FIGHTER_FLOATS, `player ${index}'s fighter`);
      // A fighter's first numbers are its body: the room sends them once.
      const body = bodyOf(Array.from(fighter.subarray(0, BODY_FLOATS)));
      const look = { anim: seen.anim() ?? '', frame: seen.frame(), facing: seen.facing() };
      const standing = standingOf(seen.standing(), seen.standingTicks());
      return { player: seen.player(), acknowledged: seen.acknowledged(), body, fighter, standing, ...look };
    });
    const foes = Array.from({ length: snapshot.foesLength() }, (unused, index) => {
      const foe = snapshot.foes(index);
      if (!foe) throw new Error(`snapshot foe ${index} is missing`);
      return { id: foe.id(), kind: foe.kind(), glance: whole(foe.glanceArray(), GLANCE_FLOATS, `foe ${index}`) };
    });
    const events = Array.from({ length: snapshot.eventsLength() }, (unused, index) => {
      const event = snapshot.events(index);
      return {
        tick: event?.tick() ?? 0n,
        kind: event?.kind() ?? 0,
        how: event?.how() ?? 0,
        striker: event?.striker() ?? 0,
        defender: event?.defender() ?? 0,
        amount: event?.amount() ?? 0,
      };
    });
    const shots = Array.from({ length: snapshot.shotsLength() }, (unused, index) => {
      const shot = snapshot.shots(index);
      return {
        owner: shot?.owner() ?? 0,
        ranged: shot?.ranged() ?? 0,
        at: point(shot?.atArray() ?? null),
        velocity: point(shot?.velocityArray() ?? null),
      };
    });
    const ships = Array.from({ length: snapshot.shipsLength() }, (unused, index) => {
      const ship = snapshot.ships(index);
      if (!ship) throw new Error(`snapshot ship ${index} does not read`);
      return { player: ship.player(), x: ship.x(), y: ship.y(), heading: ship.heading(), pace: ship.pace() };
    });
    const dressed = dressesOf(snapshot.dressedLength(), (index) => snapshot.dressed(index));
    return { kind: 'snapshot', tick: snapshot.tick(), players, dressed, foes, events, shots, ships };
  } catch {
    return null;
  }
}
