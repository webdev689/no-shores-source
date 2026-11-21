import type { FightEvent } from '../rules/fightRules.ts';
import type { FleetLay, FleetLook } from '../rules/fleetRules.ts';
import type { Pose, ShipFloats } from '../rules/landRules.ts';
import type { fightDisplay } from '../ships/fightDisplay.ts';
import type { PlacedBar } from '../ships/shipBars.ts';
import type { Node } from '../ui/node.ts';

/** A captain asked for: none, one called round its ship, or every one sent off. */
export type FleetCall = 'none' | 'captain' | 'send off';

/** The faction (1 the Grey Tithe, 2 pirates), rank (1 Minor to 5 Boss) and level of a captain called, and the level
 *  the caller's ship is fitted at from then on (0 for none: unfitted). */
export interface CaptainChoice {
  readonly faction: number;
  readonly rank: number;
  readonly level: number;
  readonly shipLevel: number;
}

/** What the player does in a frame at sea in a fleet: their rudder from the keys held, each rung climbed or come down
 *  in turn (1 or -1), the look they lay while aiming, a release of the guns, the brace, steps of the load, and a
 *  captain asked for, of the faction and rank chosen. */
export interface FleetInput {
  readonly steer: number;
  readonly climbs: readonly number[];
  readonly look: FleetLook | null;
  readonly fire: boolean;
  readonly brace: boolean;
  readonly loadSteps: number;
  readonly call: FleetCall;
  readonly captain?: CaptainChoice;
}

/** Another ship as the fleet room last showed it: its number, whether a captain sails it, its helm's numbers and
 *  pose, its state, fires aboard, its hurts, a captain's mode, target and sides run out, and its faction and rank. */
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
  /** Its hull: 0 the Sloop to 3 the Frigate. */
  readonly hull?: number;
}

/** The Sloop's session in a fleet room, as the editor sees it: its number, why the room was lost and whether it is
 *  being joined again, the room's clock,
 *  its orders owed and its ship predicted, the room's word on it and on every other ship, the balls aloft, its look's
 *  lay, and what happened. */
export interface FleetSession {
  readonly id: number;
  readonly lost: string | null;
  readonly rejoining: boolean;
  roomTime(now: number): number;
  advance(seconds: number, input: FleetInput, now: number): void;
  shipFloats(): ShipFloats;
  shipPose(): Pose;
  own(): FleetVessel | null;
  others(): readonly FleetVessel[];
  balls(now: number): (readonly [number, number, number, number])[];
  lay(look: FleetLook, now: number): FleetLay | null;
  takeEvents(): FightEvent[];
  /** The fight's events for its feel, each ship by its own number. */
  takeFeel(): FightEvent[];
}

/** Where the editor finds a fleet room: it joins one with the Sloop put to sea at (x, y) heading `heading`, answering
 *  its session once the room has welcomed it, and lets it go. */
export interface FleetHarbour {
  join(
    start: readonly [number, number, number],
    joined: (session: FleetSession) => void,
    fail: (error: unknown) => void,
  ): void;
  leave(): void;
}

let offered: FleetHarbour | null = null;
/** The captain F calls in a fleet, as the panel last chose: a Major of the pirates of no level, the ship unfitted,
 *  until it does. */
let chosen: CaptainChoice = { faction: 2, rank: 2, level: 0, shipLevel: 0 };

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

/** The captains' plates as the interface draws them, as the page offers that drawing (the game's); none until it does. */
let plates: (bars: readonly PlacedBar[]) => readonly Node[] = () => [];

/** Offers the drawing of the captains' plates. */
export function offerPlates(drawn: (bars: readonly PlacedBar[]) => readonly Node[]): void {
  plates = drawn;
}

/** The captains' plates of `bars` as nodes over the view. */
export function platesOf(bars: readonly PlacedBar[]): readonly Node[] {
  return plates(bars);
}

/** The sea fight's readout as the interface draws it (the game's), shown with what a captain's fight says, or hidden
 *  for none; and how far down the ships' plates may stand under it. */
export interface Readout {
  update(model: ReturnType<typeof fightDisplay> | null): void;
  node(): Node | null;
  readonly under: number;
}

let readout: Readout | null = null;

/** Offers the drawing of the sea fight's readout. */
export function offerReadout(drawn: Readout): void {
  readout = drawn;
}

/** The sea fight's readout the page offered, if any. */
export function readoutOffered(): Readout | null {
  return readout;
}

/** The fleet room the page offered, if any. */
export function fleetOffered(): FleetHarbour | null {
  return offered;
}
