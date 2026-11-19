import * as flatbuffers from 'flatbuffers';
import { Course, FromRoom, Input } from '../../../generated/messages/ts/overlook/wire.ts';
import type { Dressed } from '../../../generated/messages/ts/overlook/wire/dressed.ts';
import { GLANCE_FLOATS, UNTRIMMED_FLOATS } from '../rules/fighters.ts';
import { type FleetPart, commissionOf, fleetOf, heldIn, point, whole, wholeIn } from './fleetMessages.ts';
import { type GearAsk, type GearState, askOffset, gearOf } from './gearMessages.ts';
import { BODY_FLOATS, type Body, CONTROLS_FLOATS, bodyOf } from '../rules/movementRules.ts';
import { withOthers } from './seaFight.ts';

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
 *  their whole fighter in the combat crate's order, and where they stand with its section. In the sea room, a player
 *  off the helm, their body on her deck, in her own frame, with no fighter. */
export interface SeenPlayer extends Look {
  readonly player: number;
  readonly acknowledged: number;
  readonly body: Body;
  readonly fighter: Float64Array | null;
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

/** A captain's ship at sea, a pirate's or the Grey Tithe's: her number, where she is, her heading in radians clockwise
 *  from north, her faction (1 the Grey Tithe, 2 pirates) and her rank (1 Minor to 5 Boss). */
export interface SeenPirate {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly faction: number;
  readonly rank: number;
}

/** A player's fight at sea as the room last stepped it: the naval crate's numbers (crates/naval/src/wire.rs), its other
 *  captains put back in the view (`withOthers`), which `fightViewOf` reads, and her captain's faction and rank. */
export interface SeenSeaFight {
  readonly player: number;
  readonly view: Float64Array;
  readonly faction: number;
  readonly rank: number;
}

/** A node's room's word on where its player is: the node's id, and the rect (west, north, east, south) its window of
 *  the ground is cut to, for the browser to cut the same. */
export interface JoinedNode {
  readonly id: string;
  readonly bounds: readonly [number, number, number, number];
}

/** A foe as a room last stepped it: its number, its role's number (`kind`), a glance at its fighter, its type's number
 *  in the rules' roster, its rank (1 Minor to 5 Boss), its faction's number, the phase it fights in (1 to 3), and how
 *  alert it is (0 idle, 1 suspicious, 2 alert, 3 searching). */
export interface SeenFoe {
  readonly id: number;
  readonly kind: number;
  readonly glance: Float64Array;
  readonly type: number;
  readonly rank: number;
  readonly faction: number;
  readonly phase: number;
  readonly alert: number;
  /** Its level; 0 for a foe of none, which fights by combat's own numbers. */
  readonly level: number;
  /** Its shield, if it stands with one: its element (the gear crate's numbers), what it holds still and held whole. */
  readonly shield: FoeShield | null;
  /** Its debuffs; none for a foe made by hand. */
  readonly statuses?: FoeStatuses;
}

/** A foe's debuffs as the room keeps them: the ticks left of its Expose and its Charge, and of the immunity a Charge
 *  leaves after it. */
export interface FoeStatuses {
  readonly expose: number;
  readonly charge: number;
  readonly chargeImmune: number;
}

/** A foe's shield: its element, what it holds still, and what it held whole. */
export interface FoeShield {
  readonly element: number;
  readonly left: number;
  readonly most: number;
}

/** A foe a player asks the room to stand before them: a type's number in the roster, a rank (one the type does not
 *  come in takes its first) and the element of a shield it stands with (the gear crate's number, none if 0); or every
 *  foe sent away. */
export type FoeAsk = { readonly type: number; readonly rank: number; readonly shield?: number } | 'clear';

/** The number an input's `spawn` carries to send every foe away. */
const CLEAR_FOES = 255;
/** An input's `spawn` carries a shield's element above a foe's four bits (crates/room/src/foes.rs `SHIELD_SHIFT`). */
export const SHIELD_SHIFT = 4;

/** Something that happened in the fight, as the room numbers it. */
export interface FightEvent {
  readonly tick: bigint;
  readonly kind: number;
  readonly how: number;
  readonly striker: number;
  readonly defender: number;
  readonly amount: number;
  /** The stroke a swing came by, the combat crate's 1 to 6; 0 for anything else. */
  readonly stroke: number;
}

/** A shot in flight, or a gun's ball in the tick it stopped: `age` is the ticks it has flown. A stopped ball's last
 *  segment runs from `at` to `at` plus a tick of its velocity, where it stopped, and carries the point it left its gun
 *  (`muzzle`); a shot still flying carries none. */
export interface FlyingShot {
  readonly owner: number;
  readonly ranged: number;
  readonly at: readonly [number, number, number];
  readonly velocity: readonly [number, number, number];
  readonly age: number;
  readonly muzzle: readonly [number, number, number] | null;
}

/** What a room says: its welcome, with the joining player's number, every dress so far, and its node in a node's
 *  room; or everyone after one of its ticks, with the dresses that changed and what happened in the fight since the
 *  last, the shots in flight, every ship at sea, and a fleet's ships, balls and what happened in its fight. */
export type FromRoomMessage =
  | {
      readonly kind: 'joined';
      readonly player: number;
      readonly dressed: readonly PlayerDress[];
      readonly node: JoinedNode | null;
      /** The room's protocol: its schema's hash. */
      readonly protocol: number;
    }
  | ({
      readonly kind: 'snapshot';
      readonly tick: bigint;
      readonly players: readonly SeenPlayer[];
      readonly dressed: readonly PlayerDress[];
      readonly foes: readonly SeenFoe[];
      readonly events: readonly FightEvent[];
      readonly shots: readonly FlyingShot[];
      readonly ships: readonly SeenShip[];
      readonly pirates: readonly SeenPirate[];
      readonly fights: readonly SeenSeaFight[];
    } & FleetPart)
  | ({ readonly kind: 'gear' } & GearState);

/** One tick's input beyond its number: the intent's numbers (the controls', then the fight's), what the player's figure
 *  shows, their dress when it changed, what their hands hold, the room tick their screen showed, what they ask of the
 *  foes (none if nothing) and the foe's level (0 for none), whether they ask to respawn, dead past a node's section,
 *  and an ask of their gear. */
export interface InputParts {
  readonly intent: Float64Array;
  readonly look: Look;
  readonly dress?: string;
  readonly arms: number;
  readonly seen: bigint;
  readonly spawn?: FoeAsk | undefined;
  readonly spawnLevel?: number;
  readonly respawn?: boolean;
  readonly ask?: GearAsk;
}

/** The most a ulong field holds. */
const ULONG_MOST = 2n ** 64n - 1n;

/** One tick's input as its bytes, as the schema defines them: its number, its arms and a foe's type refused outside
 *  what their fields hold (a RangeError), and its frame, the tick seen and a foe's rank held within theirs. */
export function inputBytes(sequence: number, parts: InputParts): Uint8Array<ArrayBuffer> {
  const builder = new flatbuffers.Builder(320);
  const numbers = Array.from(parts.intent);
  const controls = Input.createControlsVector(builder, numbers.slice(0, CONTROLS_FLOATS));
  const combat = Input.createCombatVector(builder, numbers.slice(CONTROLS_FLOATS));
  const anim = builder.createString(parts.look.anim);
  const dressed = parts.dress === undefined ? 0 : builder.createString(parts.dress);
  const ask = parts.ask === undefined ? 0 : askOffset(builder, parts.ask);
  Input.startInput(builder);
  Input.addSequence(builder, wholeIn(sequence, 0, 0xffff_ffff, "the input's number"));
  Input.addControls(builder, controls);
  Input.addAnim(builder, anim);
  Input.addFrame(builder, Math.floor(heldIn(parts.look.frame, 0, 0xffff, "the look's frame")));
  Input.addFacing(builder, parts.look.facing);
  if (dressed) Input.addDress(builder, dressed);
  Input.addCombat(builder, combat);
  Input.addArms(builder, wholeIn(parts.arms, 0, 0xffff_ffff, 'the arms'));
  Input.addSeen(builder, parts.seen < 0n ? 0n : parts.seen > ULONG_MOST ? ULONG_MOST : parts.seen);
  const spawn = parts.spawn;
  const shielded = spawn === undefined || spawn === 'clear' ? 0 : wholeIn(spawn.shield ?? 0, 0, 3, "the foe's shield");
  Input.addSpawn(builder, spawn === 'clear' ? CLEAR_FOES : shielded << SHIELD_SHIFT);
  Input.addRespawn(builder, parts.respawn ?? false);
  if (ask) Input.addAsk(builder, ask);
  Input.addSpawnLevel(builder, wholeIn(parts.spawnLevel ?? 0, 0, 0xff, "the foe's level"));
  if (spawn !== undefined && spawn !== 'clear') {
    Input.addSpawnType(builder, wholeIn(spawn.type, 0, 0xff, "the foe's type"));
    Input.addSpawnRank(builder, Math.round(heldIn(spawn.rank, 1, 5, "the foe's rank")));
  }
  builder.finish(Input.endInput(builder));
  return builder.asUint8Array().slice();
}

/** A ship's course as its bytes: the world points it sails through in turn, and its pace, one of the steps of a
 *  ship's speed. No points brings it to rest. */
export function courseBytes(points: readonly (readonly [number, number])[], pace: number): Uint8Array<ArrayBuffer> {
  const builder = new flatbuffers.Builder(256);
  const numbers = Course.createPointsVector(builder, points.flat());
  builder.finish(Course.createCourse(builder, numbers, wholeIn(pace, 0, 0xffff, 'the pace'), 0, 0, 0, 0, 0));
  return builder.asUint8Array().slice();
}

/** A ship brought to rest turned to a heading (radians clockwise from north), as its bytes: the helm turned while she
 *  lies still. */
export function faceBytes(heading: number): Uint8Array<ArrayBuffer> {
  const builder = new flatbuffers.Builder(64);
  const facing = Course.createFacingVector(builder, [heading]);
  builder.finish(Course.createCourse(builder, 0, 0, 0, 0, 0, 0, facing));
  return builder.asUint8Array().slice();
}

/** A step of the walk on deck, off the helm, as its bytes: its number and its controls in the movement crate's order,
 *  in a course's message. */
export function walkBytes(sequence: number, controls: readonly number[]): Uint8Array<ArrayBuffer> {
  const builder = new flatbuffers.Builder(128);
  const numbers = Course.createWalkVector(builder, [...controls]);
  const numbered = wholeIn(sequence, 0, 0xffff_ffff, "the step's number");
  builder.finish(Course.createCourse(builder, 0, 0, 0, numbers, numbered, 0, 0));
  return builder.asUint8Array().slice();
}

/** Leaving the helm (`leave`), or taking it again at the wheel, as its bytes, in a course's message. */
export function helmBytes(leave: boolean): Uint8Array<ArrayBuffer> {
  const builder = new flatbuffers.Builder(32);
  builder.finish(Course.createCourse(builder, 0, 0, 0, 0, 0, leave ? 1 : 2, 0));
  return builder.asUint8Array().slice();
}

/** A fighting ship's orders as their bytes: the naval crate's numbers (`ordersNumbers`), in a course's message. */
export function ordersBytes(orders: readonly number[]): Uint8Array<ArrayBuffer> {
  const builder = new flatbuffers.Builder(128);
  const numbers = Course.createOrdersVector(builder, [...orders]);
  builder.finish(Course.createCourse(builder, 0, 0, numbers, 0, 0, 0, 0));
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
      return { kind: 'joined', player: joined.player(), dressed, node, protocol: joined.protocol() };
    }
    const gear = message.gear();
    if (gear) return { kind: 'gear', ...gearOf(gear) };
    const snapshot = message.snapshot();
    if (!snapshot) return null;
    const players = Array.from({ length: snapshot.playersLength() }, (unused, index) => {
      const seen = snapshot.players(index);
      if (!seen) throw new Error(`snapshot player ${index} is missing`);
      // A walker on a ship's deck crosses as their body alone, and has no fighter.
      const numbers = seen.fighterArray();
      const walker = numbers?.length === BODY_FLOATS;
      const fighter = walker ? null : whole(numbers, UNTRIMMED_FLOATS, `player ${index}'s fighter`);
      // A fighter's first numbers are its body: the room sends them once.
      const body = bodyOf(Array.from((fighter ?? Float64Array.from(numbers ?? [])).subarray(0, BODY_FLOATS)));
      const look = { anim: seen.anim() ?? '', frame: seen.frame(), facing: seen.facing() };
      const standing = standingOf(seen.standing(), seen.standingTicks());
      return { player: seen.player(), acknowledged: seen.acknowledged(), body, fighter, standing, ...look };
    });
    const foes = Array.from({ length: snapshot.foesLength() }, (unused, index) => {
      const foe = snapshot.foes(index);
      if (!foe) throw new Error(`snapshot foe ${index} is missing`);
      const glance = whole(foe.glanceArray(), GLANCE_FLOATS, `foe ${index}`);
      const element = foe.shieldElement();
      const shield = element > 0 ? { element, left: foe.shield(), most: foe.shieldMost() } : null;
      const named = { type: foe.type(), rank: foe.rank(), faction: foe.faction(), phase: foe.phase() };
      const statuses = { expose: foe.expose(), charge: foe.charge(), chargeImmune: foe.chargeImmune() };
      const read = { id: foe.id(), kind: foe.kind(), glance, level: foe.level(), shield, ...named, alert: foe.alert() };
      return { ...read, statuses };
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
        stroke: event?.stroke() ?? 0,
      };
    });
    const shots = Array.from({ length: snapshot.shotsLength() }, (unused, index) => {
      const shot = snapshot.shots(index);
      return {
        owner: shot?.owner() ?? 0,
        ranged: shot?.ranged() ?? 0,
        at: point(shot?.atArray() ?? null),
        velocity: point(shot?.velocityArray() ?? null),
        age: shot?.age() ?? 0,
        muzzle: shot?.muzzleArray()?.length === 3 ? point(shot.muzzleArray()) : null,
      };
    });
    const ships = Array.from({ length: snapshot.shipsLength() }, (unused, index) => {
      const ship = snapshot.ships(index);
      if (!ship) throw new Error(`snapshot ship ${index} does not read`);
      return { player: ship.player(), x: ship.x(), y: ship.y(), heading: ship.heading(), pace: ship.pace() };
    });
    const pirates = Array.from({ length: snapshot.piratesLength() }, (unused, index) => {
      const pirate = snapshot.pirates(index);
      if (!pirate) throw new Error(`snapshot pirate ${index} does not read`);
      const { faction, rank } = commissionOf(pirate.faction(), pirate.rank());
      return { id: pirate.id(), x: pirate.x(), y: pirate.y(), heading: pirate.heading(), faction, rank };
    });
    const fights = Array.from({ length: snapshot.fightsLength() }, (unused, index) => {
      const fight = snapshot.fights(index);
      if (!fight) throw new Error(`snapshot fight ${index} does not read`);
      const { faction, rank } = commissionOf(fight.faction(), fight.rank());
      return { player: fight.player(), view: withOthers(fight.viewArray() ?? [], fight.othersArray()), faction, rank };
    });
    const dressed = dressesOf(snapshot.dressedLength(), (index) => snapshot.dressed(index));
    return {
      kind: 'snapshot',
      tick: snapshot.tick(),
      players,
      dressed,
      foes,
      events,
      shots,
      ships,
      pirates,
      fights,
      ...fleetOf(snapshot),
    };
  } catch {
    return null;
  }
}
