import type { Helm, ShipFloats } from './landRules.ts';

/** A gun's load (crates/naval/src/guns.rs Shot). */
export type ShotName = 'round' | 'grape' | 'chain' | 'heated';
/** The loads in the order a gunner steps through them. */
export const SHOT_CYCLE: readonly ShotName[] = ['round', 'grape', 'chain', 'heated'];
export type SideName = 'port' | 'starboard';
export type ShipState = 'afloat' | 'struck' | 'sinking' | 'sunk' | 'wrecked';
export type CaptainMode = 'cruise' | 'engage' | 'flee' | 'struck' | 'sinking';
export type Point = readonly [number, number, number];

/** The player's look: its bearing off her bow (degrees, to starboard), how far out it meets the water (metres), and
 *  its ray: the aim eye (east, south, up) then the way it looks. A ray that meets the captain lays on her. */
export interface FightLook {
  readonly bearing: number;
  readonly range: number;
  readonly ray?: readonly number[];
}

/** What the player orders for a step (crates/naval/src/fight.rs Orders): her helm, the look she lays, a release,
 *  the brace and a load; the climb, release and load act on the first tick alone. */
export interface FightOrders {
  readonly helm: Helm;
  readonly aim: FightLook | null;
  readonly fire: boolean;
  readonly brace: boolean;
  readonly load: ShotName | null;
}

/** A ship in the fight: her numbers and pose, her hurts and her guns (port, then starboard). */
export interface FightVessel {
  readonly ship: readonly number[];
  readonly pose: readonly number[];
  readonly hull: number;
  readonly max_hull: number;
  readonly sail: number;
  readonly max_sail: number;
  readonly crew: number;
  readonly max_crew: number;
  readonly state: ShipState;
  readonly fires: number;
  readonly guns: {
    readonly left: readonly [number, number];
    readonly progress: readonly [number, number];
    readonly load: ShotName;
    readonly braced: boolean;
  };
}

/** A captain's Sloop in a fight: her name, her faction (1 the Grey Tithe, 2 pirates) and rank (1 Minor to 5 Boss),
 *  her mode, whether she is hostile to the player, her sides run out, and, from the land worker's fight, what her
 *  hurts and her going down do to her pose (metres settled, trim and list in radians). */
export interface FightCaptain extends FightVessel {
  /** Her number in the fight, as its events name her (`ship`): the first captain 1, each other her own after. */
  readonly id: number;
  readonly name: string;
  readonly faction: number;
  readonly rank: number;
  readonly mode: CaptainMode;
  readonly hostile: boolean;
  readonly run_out: readonly SideName[];
  readonly founder?: readonly [number, number, number];
  /** While she goes down: how she will lie once sunk (as `founder`), and in how many seconds. */
  readonly sunk_founder?: readonly [number, number, number];
  readonly sinks_in?: number;
}

export type FightEvent =
  | { readonly kind: 'muzzle'; readonly ship: number; readonly point: Point; readonly launch: Point }
  | {
      readonly kind: 'hit';
      readonly ship: number;
      readonly by: number;
      readonly zone: 'hull' | 'holed' | 'rig';
      readonly point: Point;
    }
  | { readonly kind: 'splash'; readonly point: Point }
  | { readonly kind: 'land'; readonly point: Point }
  | { readonly kind: 'run-out'; readonly side: SideName }
  | { readonly kind: 'state'; readonly ship: number; readonly state: ShipState }
  | {
      readonly kind: 'refused';
      readonly why: 'no-guns' | 'silent' | 'braced' | 'reloading';
      readonly side?: SideName;
      readonly left?: number;
    }
  | { readonly kind: 'no-sail'; readonly wrecked: boolean }
  | { readonly kind: 'load'; readonly shot: ShotName }
  | { readonly kind: 'ram'; readonly ship: number; readonly by: number; readonly point: Point; readonly dealt: number }
  | { readonly kind: 'gone'; readonly ship: number; readonly sunk: boolean };

/** Where a gun's unscattered ball stops (crates/naval/src/shots.rs Stop): seconds after it leaves its gun, the
 *  point, whether in the water, and where it first meets her, if it does. */
export interface FightEnd {
  readonly time: number;
  readonly point: Point;
  readonly water: boolean;
  readonly strike: Point | null;
}

/** The side the look lays: each gun's unscattered launch (its mouth, then its velocity) and where it stops (null:
 *  still aloft), the landing zone's radius (metres), and whether any would strike her. */
export interface FightLay {
  readonly side: SideName;
  readonly launches: readonly (readonly number[])[];
  readonly elevation: number;
  readonly reach: number;
  readonly ends: readonly (FightEnd | null)[];
  readonly radius: number;
  readonly on_target: boolean;
}

/** The fight as the rules answer it (crates/land-wasm/src/fight.rs). Ships are numbered 0 the player, 1 the captain;
 *  at sea, any other captains in the fight follow (from 2); each ball aloft is its place and radius. */
export interface FightView {
  readonly clock: number;
  readonly player: FightVessel;
  readonly captain: FightCaptain;
  readonly others?: readonly FightCaptain[];
  readonly balls: readonly (readonly [number, number, number, number])[];
  readonly lay: FightLay | null;
  readonly events: readonly FightEvent[];
  /** How it ended: the last captain sunk or gone, or (an ambush) every captain beaten, sunk or struck. */
  readonly over: 'sunk' | 'gone' | 'beaten' | null;
  readonly fingerprint: string;
}

/** A captain a fight begins with, where she is given (crates/land-wasm/src/fight.rs `captains_of`): world metres
 *  east and south, her heading (radians clockwise from north), her faction (1 the Grey Tithe, 2 pirates) and rank
 *  (1 Minor to 5 Boss), and her way (m/s) if she comes on under sail. */
export interface CaptainAt {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly faction: number;
  readonly rank: number;
  readonly way?: number;
}

/** A fight's begin request: with `captains`, each set upon her where given; without, one called onto the ring. */
export function beginRequest(ship: ShipFloats, seed: number, time: number, captains?: readonly CaptainAt[]): string {
  return JSON.stringify({ ship: [...ship], seed, time, ...(captains ? { captains } : {}) });
}

/** A fight's step request: its orders, the swell's time, its ticks and the world's time for its wind. */
export function stepRequest(
  orders: FightOrders,
  time: number,
  ticks: number,
  world: number,
  wind?: readonly [number, number],
): string {
  return JSON.stringify({ ...orders, time, ticks, world, wind });
}

/** A fight's answer, or the rules' refusal as an error. */
export function readFight(text: string): FightView {
  const answer = JSON.parse(text) as FightView & { readonly error?: string };
  if (answer.error !== undefined) throw new Error(answer.error);
  return answer;
}
