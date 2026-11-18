import type { FightEvent } from '../rules/fightRules.ts';
import type { FleetLay, FleetLook } from '../rules/fleetRules.ts';
import type { Pose, ShipFloats } from '../rules/landRules.ts';

/** A captain asked for: none, one called round her ship, or every one sent off. */
export type FleetCall = 'none' | 'captain' | 'send off';

/** The faction (1 the Grey Tithe, 2 pirates) and rank (1 Minor to 5 Boss) of a captain called. */
export interface CaptainChoice {
  readonly faction: number;
  readonly rank: number;
}

/** What the player does in a frame at sea in a fleet: her rudder and crab from the keys held, each rung climbed or
 *  come down in turn (1 or -1), the look she lays while aiming, a release of the guns, the brace, steps of the load,
 *  and a captain asked for, of the faction and rank chosen. */
export interface FleetInput {
  readonly steer: number;
  readonly crab: boolean;
  readonly climbs: readonly number[];
  readonly look: FleetLook | null;
  readonly fire: boolean;
  readonly brace: boolean;
  readonly loadSteps: number;
  readonly call: FleetCall;
  readonly captain?: CaptainChoice;
}

/** Another ship as the fleet room last showed her: her number, whether a captain sails her, her helm's numbers and
 *  pose, her state, fires aboard, her hurts, a captain's mode, target and sides run out, and her faction and rank. */
export interface FleetVessel {
  readonly id: number;
  readonly captain: boolean;
  readonly ship: Float64Array;
  readonly pose: Float64Array;
  readonly state: string;
  readonly fires: number;
  readonly hurts: { hull: number; maxHull: number; sail: number; maxSail: number; crew: number };
  readonly guns: { readonly left: readonly [number, number] };
  readonly load: number;
  readonly braced: boolean;
  readonly mode: string;
  readonly target: number;
  readonly runOut: number;
  readonly faction: number;
  readonly rank: number;
}

/** The Sloop's session in a fleet room, as the editor sees it: her number, why the room was lost, the room's clock,
 *  her orders owed and her ship predicted, the room's word on her and on every other ship, the balls aloft, her look's
 *  lay, and what happened. */
export interface FleetSession {
  readonly id: number;
  readonly lost: string | null;
  roomTime(now: number): number;
  advance(seconds: number, input: FleetInput, now: number): void;
  shipFloats(): ShipFloats;
  shipPose(): Pose;
  own(): FleetVessel | null;
  others(): readonly FleetVessel[];
  balls(now: number): (readonly [number, number, number, number])[];
  lay(look: FleetLook, now: number): FleetLay | null;
  takeEvents(): FightEvent[];
}

/** Where the editor finds a fleet room: it joins one with the Sloop put to sea at (x, y) heading `heading`, answering
 *  her session once the room has welcomed her, and lets her go. */
export interface FleetHarbour {
  join(
    start: readonly [number, number, number],
    joined: (session: FleetSession) => void,
    fail: (error: unknown) => void,
  ): void;
  leave(): void;
}

let offered: FleetHarbour | null = null;
/** The captain F calls in a fleet, as the panel last chose: a Major of the pirates until it does. */
let chosen: CaptainChoice = { faction: 2, rank: 2 };

/** The panel chooses the faction and rank of the captain F calls. */
export function chooseCaptain(choice: CaptainChoice): void {
  chosen = choice;
}

/** The faction and rank of the captain F calls. */
export function chosenCaptain(): CaptainChoice {
  return chosen;
}

/** The page offers its fleet room, before the editor opens: none sails alone. */
export function offerFleet(harbour: FleetHarbour | null): void {
  offered = harbour;
}

/** The fleet room the page offered, if any. */
export function fleetOffered(): FleetHarbour | null {
  return offered;
}
