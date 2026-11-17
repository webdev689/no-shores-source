import * as flatbuffers from 'flatbuffers';
import { Orders } from '../../../generated/messages/ts/overlook/wire.ts';
import type { Snapshot } from '../../../generated/messages/ts/overlook/wire/snapshot.ts';
import type { FleetLook } from '../rules/fleetRules.ts';

/** A captain asked for: none, one called round her ship, or every one sent off. */
export type FleetCall = 'none' | 'captain' | 'send off';

/** One tick's orders at sea in a fleet room (crates/room/src/fleet.rs Input): her helm, her look, the fire, the
 *  brace, a load (0 none, 1 round, 2 grape, 3 chain, 4 heated), where she puts to sea (heeded once), and a call. */
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
}

/** The calls as the messages number them. */
const CALLS: Record<FleetCall, number> = { none: 0, captain: 1, 'send off': 255 };

/** One tick's orders as their bytes, as the schema defines them. */
export function ordersBytes(sequence: number, orders: FleetOrders): Uint8Array<ArrayBuffer> {
  const builder = new flatbuffers.Builder(256);
  const look = orders.look ? [orders.look.bearing, orders.look.range, ...(orders.look.ray ?? [])] : [];
  const aim = Orders.createAimVector(builder, look);
  const putToSea = Orders.createPutToSeaVector(builder, orders.putToSea ? [...orders.putToSea] : []);
  const message = Orders.createOrders(
    builder,
    sequence,
    orders.steer,
    orders.crab,
    orders.climb,
    aim,
    orders.fire,
    orders.brace,
    orders.load,
    putToSea,
    CALLS[orders.call],
  );
  builder.finish(message);
  return builder.asUint8Array().slice();
}

/** A ship's state, a captain's mode, as the messages number them. */
export const STATES = ['afloat', 'struck', 'sinking', 'sunk', 'wrecked'] as const;
export type VesselState = (typeof STATES)[number];
export const MODES = ['cruise', 'engage', 'flee', 'struck', 'sinking'] as const;
export type CaptainMode = (typeof MODES)[number];

/** One ship in a fleet room as it last stepped her: her number; whether a captain sails her; her helm's numbers and
 *  pose (crates/sailing/src/floats.rs); hull, sail and men with their wholes; her state and fires; her guns' seconds
 *  left to load and progress (port, starboard); her load and brace; a captain's mode, target (0 none) and sides run
 *  out (1 port, 2 starboard); and the number of her player's last orders taken. */
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
] as const;
export type NavalKind = (typeof NAVAL_KINDS)[number];

/** Something that happened in a fleet room's fight (messages.fbs Naval): what, the ship it happened to, who struck
 *  her with a ball or a stem, a number saying more, the side still loading, a point, a ball's launch, and the seconds
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
}

/** Exactly `length` numbers, or a throw: the message is not whole. */
function whole(numbers: Float64Array | null, length: number, what: string): Float64Array {
  if (!numbers || numbers.length !== length) throw new Error(`${what} is not whole`);
  return numbers.slice();
}

const point = (numbers: Float64Array | null): [number, number, number] => {
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
  return { vessels, balls, naval, fightClock: snapshot.fightClock() };
}
