import type { Helm, ShipFloats } from './landRules.ts';

/** A gun's load (crates/naval/src/guns.rs Shot). */
export type ShotName = 'round' | 'grape' | 'chain' | 'heated';
/** The loads in the order a gunner steps through them. */
export const SHOT_CYCLE: readonly ShotName[] = ['round', 'grape', 'chain', 'heated'];
export type SideName = 'port' | 'starboard';
export type ShipState = 'afloat' | 'struck' | 'sinking' | 'sunk' | 'wrecked';
export type CaptainMode = 'cruise' | 'engage' | 'flee' | 'struck' | 'sinking';
export type Point = readonly [number, number, number];

/** The player's look: its bearing off its bow (degrees, to starboard), how far out it meets the water (metres), and
 *  its ray: the aim eye (east, south, up) then the way it looks. A ray that meets the captain lays on it. */
export interface FightLook {
  readonly bearing: number;
  readonly range: number;
  readonly ray?: readonly number[];
}

/** What the player orders for a step (crates/naval/src/fight.rs Orders): their helm, the look they lay, a release,
 *  the brace and a load; the climb, release and load act on the first tick alone. */
export interface FightOrders {
  readonly helm: Helm;
  readonly aim: FightLook | null;
  readonly fire: boolean;
  readonly brace: boolean;
  readonly load: ShotName | null;
}

/** A ship in the fight: its numbers and pose, its hurts and its guns (port, then starboard), and its hull (0 the
 *  Sloop, 1 the Schooner, 2 the Brig, 3 the Frigate) where the rules name it. */
export interface FightVessel {
  readonly hull_kind?: number;
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

/** A captain's ship in a fight: its name, its faction (1 the Grey Tithe, 2 pirates) and rank (1 Minor to 5 Boss),
 *  its mode, whether it is hostile to the player, its sides run out, and, from the land worker's fight, what its
 *  hurts and its going down do to its pose (metres settled, trim and list in radians). */
export interface FightCaptain extends FightVessel {
  /** Its number in the fight, as its events name it (`ship`): the first captain 1, each other its own after. */
  readonly id: number;
  readonly name: string;
  readonly faction: number;
  readonly rank: number;
  readonly mode: CaptainMode;
  readonly hostile: boolean;
  readonly run_out: readonly SideName[];
  readonly founder?: readonly [number, number, number];
  /** While it goes down: how it will lie once sunk (as `founder`), and in how many seconds. */
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
 *  point, whether in the water, and where it first meets it, if it does. */
export interface FightEnd {
  readonly time: number;
  readonly point: Point;
  readonly water: boolean;
  readonly strike: Point | null;
}

/** The side the look lays: each gun's unscattered launch (its mouth, then its velocity) and where it stops (null:
 *  still aloft), the landing zone's radius (metres), and whether any would strike it. */
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

/** A captain a fight begins with, where it is given (crates/land-wasm/src/fight.rs `captains_of`): world metres
 *  east and south, its heading (radians clockwise from north), its faction (1 the Grey Tithe, 2 pirates) and rank
 *  (1 Minor to 5 Boss), and its way (m/s) if it comes on under sail. */
export interface CaptainAt {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly faction: number;
  readonly rank: number;
  readonly way?: number;
}

/** What a fight begins with besides the player's ship: `captains`, each set upon it where given; without, one called
 *  onto the ring, a pirate in its rank's hull (a Major's unless `rank` names one). */
export interface FightBegun {
  readonly rank?: number;
  readonly captains?: readonly CaptainAt[];
}

/** A fight's begin request. */
export function beginRequest(ship: ShipFloats, seed: number, time: number, begun: FightBegun = {}): string {
  const { rank, captains } = begun;
  return JSON.stringify({
    ship: [...ship],
    seed,
    time,
    ...(rank === undefined ? {} : { rank }),
    ...(captains ? { captains } : {}),
  });
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
