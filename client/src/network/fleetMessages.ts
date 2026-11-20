import * as flatbuffers from 'flatbuffers';
import { Orders } from '../../../generated/messages/ts/overlook/wire.ts';
import type { Snapshot } from '../../../generated/messages/ts/overlook/wire/snapshot.ts';
import type { FleetLook } from '../rules/fleetRules.ts';

/** A captain asked for: none, one called round the player's ship, or every one sent off. */
export type FleetCall = 'none' | 'captain' | 'send off';

/** One tick's orders at sea in a fleet room (crates/room/src/fleet.rs Input): its helm, its look, the fire, the
 *  brace, a load (0 none, 1 round, 2 grape, 3 chain, 4 heated), where it puts to sea (heeded once), and a call,
 *  with the faction and rank of a captain called (a Major of the pirates when none is named). */
export interface FleetOrders {
  readonly steer: number;
  readonly crab: boolean;
  readonly climb: number;
  readonly look: FleetLook | null;
  readonly fire: boolean;
  readonly brace: boolean;
  readonly load: number;
  readonly putToSea: readonly [number, number, number] | null;
  readonly call: FleetCall;
  readonly captain?: { readonly faction: number; readonly rank: number };
}

/** A captain's faction and rank as a room sends them; an older room sends 0 for both, and every captain it held was a
 *  Major of the pirates (2 for each, as the messages number them). */
export function commissionOf(faction: number, rank: number): { readonly faction: number; readonly rank: number } {
  return { faction: faction || 2, rank: rank || 2 };
}

/** The calls as the messages number them. */
const CALLS: Record<FleetCall, number> = { none: 0, captain: 1, 'send off': 255 };

/** The farthest a look may lay, metres (crates/room/src/fleet.rs MOST_RANGE_M). */
const MOST_RANGE_M = 1e5;

/** A whole number from `low` to `high`, as a field of the schema holds it; any other is refused (a RangeError), since
 *  a number past what its field holds would reach the room as another. */
export function wholeIn(value: number, low: number, high: number, what: string): number {
  if (!Number.isInteger(value) || value < low || value > high) throw new RangeError(`${what} is ${value}`);
  return value;
}

/** A number held within `low` to `high`, as the room takes it; one that is not a number is refused (a RangeError). */
export function heldIn(value: number, low: number, high: number, what: string): number {
  if (Number.isNaN(value)) throw new RangeError(`${what} is not a number`);
  return Math.min(high, Math.max(low, value));
}

/** Numbers the room takes only when each is one; any other is refused (a RangeError). */
function finite(numbers: readonly number[], what: string): number[] {
  if (!numbers.every(Number.isFinite)) throw new RangeError(`${what} holds a number that is not one`);
  return [...numbers];
}

/** One tick's orders as their bytes, as the schema defines them: its rudder, rung and look held within what the room
 *  takes, and its number, load and call refused outside what their fields hold. */
export function ordersBytes(sequence: number, orders: FleetOrders): Uint8Array<ArrayBuffer> {
  const builder = new flatbuffers.Builder(256);
  const { look: laid, captain } = orders;
  const look = laid
    ? [
        heldIn(laid.bearing, -180, 180, "the look's bearing"),
        heldIn(laid.range, 0, MOST_RANGE_M, "the look's range"),
        ...finite(laid.ray ?? [], "the look's ray"),
      ]
    : [];
  const aim = Orders.createAimVector(builder, look);
  const put = orders.putToSea ? finite(orders.putToSea, 'where it puts to sea') : [];
  const putToSea = Orders.createPutToSeaVector(builder, put);
  const called = orders.call === 'captain';
  const message = Orders.createOrders(
    builder,
    wholeIn(sequence, 0, 0xffff_ffff, "the orders' number"),
    heldIn(orders.steer, -1, 1, 'the rudder'),
    orders.crab,
    Math.round(heldIn(orders.climb, -1, 1, 'the rung')),
    aim,
    orders.fire,
    orders.brace,
    wholeIn(orders.load, 0, 4, 'the load'),
    putToSea,
    CALLS[orders.call],
    called ? wholeIn(captain?.faction ?? 0, 0, 0xff, "the captain's faction") : 0,
    called ? wholeIn(captain?.rank ?? 0, 0, 5, "the captain's rank") : 0,
  );
  builder.finish(message);
  return builder.asUint8Array().slice();
}

/** A ship's state, a captain's mode, as the messages number them. */
export const STATES = ['afloat', 'struck', 'sinking', 'sunk', 'wrecked'] as const;
export type VesselState = (typeof STATES)[number];
export const MODES = ['cruise', 'engage', 'flee', 'struck', 'sinking'] as const;
export type CaptainMode = (typeof MODES)[number];

/** One ship in a fleet room as it last stepped it: its number; whether a captain sails it; its helm's numbers and
 *  pose (crates/sailing/src/floats.rs); hull, sail and men with their wholes; its state and fires; its guns' seconds
 *  left to load and progress (port, starboard); its load and brace; a captain's mode, target (0 none) and sides run
 *  out (1 port, 2 starboard); the number of its player's last orders taken; and the faction it sails for (0 a
 *  player's) and a captain's rank (1 Minor to 5 Boss, 0 none). */
export interface SeenVessel {
  readonly id: number;
  readonly captain: boolean;
  readonly ship: Float64Array;
  readonly pose: Float64Array;
  readonly hurts: { hull: number; maxHull: number; sail: number; maxSail: number; crew: number; maxCrew: number };
  readonly state: VesselState;
  readonly fires: number;
  readonly guns: { readonly left: readonly [number, number]; readonly progress: readonly [number, number] };
  readonly load: number;
  readonly braced: boolean;
  readonly mode: CaptainMode;
  readonly target: number;
  readonly runOut: number;
  readonly acknowledged: number;
  readonly faction: number;
  readonly rank: number;
  /** Its hull: 0 the Sloop, 1 the Schooner, 2 the Brig, 3 the Frigate. */
  readonly hull?: number;
}

/** A ball aloft: the ship that fired it, where and when (the fight's clock) it left its gun, its launch, its radius. */
export interface AloftBall {
  readonly shooter: number;
  readonly start: readonly [number, number, number];
  readonly launch: readonly [number, number, number];
  readonly born: number;
  readonly radius: number;
}

/** The kinds of a fleet's events, as the messages number them. */
export const NAVAL_KINDS = [
  'none',
  'muzzle',
  'hit',
  'splash',
  'land',
  'run-out',
  'state',
  'refused',
  'no-sail',
  'load',
  'gone',
  'ram',
  'struck-at',
  'sail-lost',
  'mast-fell',
  'struck',
  'sinking',
  'flotsam',
  'gathered',
  'boarding',
] as const;
export type NavalKind = (typeof NAVAL_KINDS)[number];

/** Something that happened in a fleet room's fight (messages.fbs Naval): what, the ship it happened to, who struck
 *  it with a ball or a stem, a number saying more, the side still loading, a point, a ball's launch, and the seconds
 *  that side has left (or the hull a ram took). */
export interface NavalEvent {
  readonly tick: bigint;
  readonly kind: NavalKind;
  readonly ship: number;
  readonly by: number;
  readonly detail: number;
  readonly side: number;
  readonly point: readonly [number, number, number];
  readonly launch: readonly [number, number, number];
  readonly left: number;
}

/** What a fleet room's snapshot holds beyond the rest: every ship, the balls aloft, what happened, the fight's clock. */
export interface FleetPart {
  readonly vessels: readonly SeenVessel[];
  readonly balls: readonly AloftBall[];
  readonly naval: readonly NavalEvent[];
  readonly fightClock: number;
  /** The world time the fleet room's clock started at, seconds since the Unix epoch (0 from a room that sends none). */
  readonly worldStart: number;
}

/** Exactly `length` numbers, or a throw: the message is not whole. */
export function whole(numbers: Float64Array | null, length: number, what: string): Float64Array {
  if (!numbers || numbers.length !== length) throw new Error(`${what} is not whole`);
  return numbers.slice();
}

/** A point's three numbers. */
export const point = (numbers: Float64Array | null): [number, number, number] => {
  const [x = 0, y = 0, z = 0] = numbers ?? [];
  return [x, y, z];
};

/** The fleet's part of a snapshot; empty for a room that is not a fleet's. A ship that does not read throws. */
export function fleetOf(snapshot: Snapshot): FleetPart {
  const vessels = Array.from({ length: snapshot.vesselsLength() }, (unused, index): SeenVessel => {
    const vessel = snapshot.vessels(index);
    if (!vessel) throw new Error(`snapshot vessel ${index} is missing`);
    const [hull = 0, maxHull = 0, sail = 0, maxSail = 0, crew = 0, maxCrew = 0] = whole(
      vessel.hurtsArray(),
      6,
      `vessel ${index}'s hurts`,
    );
    const [portLeft = 0, starboardLeft = 0, portProgress = 0, starboardProgress = 0] = whole(
      vessel.gunsArray(),
      4,
      `vessel ${index}'s guns`,
    );
    return {
      id: vessel.id(),
      captain: vessel.captain(),
      ship: whole(vessel.shipArray(), 8, `vessel ${index}'s ship`),
      pose: whole(vessel.poseArray(), 4, `vessel ${index}'s pose`),
      hurts: { hull, maxHull, sail, maxSail, crew, maxCrew },
      state: STATES[vessel.state()] ?? 'afloat',
      fires: vessel.fires(),
      guns: { left: [portLeft, starboardLeft], progress: [portProgress, starboardProgress] },
      load: vessel.load(),
      braced: vessel.braced(),
      mode: MODES[vessel.mode()] ?? 'cruise',
      target: vessel.target(),
      runOut: vessel.runOut(),
      acknowledged: vessel.acknowledged(),
      hull: vessel.hull(),
      ...(vessel.captain()
        ? commissionOf(vessel.faction(), vessel.rank())
        : { faction: vessel.faction(), rank: vessel.rank() }),
    };
  });
  const balls = Array.from({ length: snapshot.ballsLength() }, (unused, index): AloftBall => {
    const ball = snapshot.balls(index);
    return {
      shooter: ball?.shooter() ?? 0,
      start: point(ball?.startArray() ?? null),
      launch: point(ball?.launchArray() ?? null),
      born: ball?.born() ?? 0,
      radius: ball?.radius() ?? 0,
    };
  });
  const naval = Array.from({ length: snapshot.navalLength() }, (unused, index): NavalEvent => {
    const event = snapshot.naval(index);
    return {
      tick: event?.tick() ?? 0n,
      kind: NAVAL_KINDS[event?.kind() ?? 0] ?? 'none',
      ship: event?.ship() ?? 0,
      by: event?.by() ?? 0,
      detail: event?.detail() ?? 0,
      side: event?.side() ?? 0,
      point: point(event?.pointArray() ?? null),
      launch: point(event?.launchArray() ?? null),
      left: event?.left() ?? 0,
    };
  });
  return { vessels, balls, naval, fightClock: snapshot.fightClock(), worldStart: snapshot.worldStart() };
}
