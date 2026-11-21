// How a ship is drawn riding the sea the page draws: its pose from the swell under its bow, stern, sides and middle,
// felt through its inertia, its heel into a turn, its bow slamming into a crest, and the stirrings of its wake. The
// editor's ship takes the same pose from the rules; the Overworld's are drawn from the browser's swell, so this is for
// drawing, never for a rule.
import { headingFrame } from '../rules/landRules.ts';
import { type ShelteredSwell, swellHeight } from '../water/swell.ts';

/** Come Sail Away's handling under sail (crates/sailing/src/helm.rs `HANDLING`): its way, m/s, and its swing, degrees a
 *  second. */
const SAIL = { moveSpeed: 2, turnSpeedDeg: 10 } as const;
/** A ship stirs the water's ripples once it makes this way, m/s, a quarter of its sailing speed (Come Sail Away's
 *  wake threshold). */
export const WAKE_WAY = 0.5;
/** How a hull rides the swell: its time constant, seconds a metre of its waterline's length (crates/sailing/src/pose.rs
 *  `LAG_S_PER_M`, so a bigger hull answers slower); how fast its stem must close on a crest to slam as it pitches
 *  down into it, metres a second; and how long a slam's spray lasts, seconds. */
export const RIDE = { lagSPerM: 0.02, slamClosingMS: 1, slamSprayS: 0.8 } as const;

/** Its waterline's middle over still water, metres; its bow's rise and its heel to starboard, radians. */
export interface SwellPose {
  readonly heave: number;
  readonly pitch: number;
  readonly roll: number;
}

/** Where a ship lies: its middle and its heading, radians clockwise from north. */
export interface Lies {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
}

/** A push on the water's ripples: where (metres), how wide and how deep. */
export interface Stir {
  readonly x: number;
  readonly y: number;
  readonly radiusM: number;
  readonly strength: number;
}

/** Its pose on the swell at `time`, its waterline `halfLength` and `halfBeam` as drawn, the sea `depthAt` a point deep
 *  (Infinity off the charts): the mean of the water under its bow, stern, sides and middle, and its slope along and
 *  across it, each felt through its inertia, its length's `lagOf` (crates/sailing/src/pose.rs `pose_of`). Still water
 *  without a swell. */
export function poseOnSwell(
  swell: ShelteredSwell | undefined,
  depthAt: (x: number, y: number) => number,
  lies: Lies,
  halfLength: number,
  halfBeam: number,
  time: number,
): SwellPose {
  if (!swell) return { heave: 0, pitch: 0, roll: 0 };
  const lag = lagOf(2 * halfLength);
  const { forward, starboard } = headingFrame(lies.heading);
  const levelAt = (along: number, across: number) => {
    const x = lies.x + forward[0] * along + starboard[0] * across;
    const y = lies.y + forward[1] * along + starboard[1] * across;
    return swellHeight(swell, x, y, time, depthAt(x, y), lag);
  };
  const [bow, stern, port, starboardSide] = [
    levelAt(halfLength, 0),
    levelAt(-halfLength, 0),
    levelAt(0, -halfBeam),
    levelAt(0, halfBeam),
  ];
  return {
    heave: (bow + stern + port + starboardSide + levelAt(0, 0)) / 5,
    pitch: Math.atan2(bow - stern, 2 * halfLength),
    roll: Math.atan2(port - starboardSide, 2 * halfBeam),
  };
}

/** A hull's time constant on the swell, seconds, by its waterline's length as drawn (metres). */
export function lagOf(lengthM: number): number {
  return RIDE.lagSPerM * lengthM;
}

/** Whether its bow slams: pitching down (`pitchRate`, radians a second, bow up positive) as the crest at its stem
 *  rises over it (`bowUnder`, metres: the sea's height there less its stem's) faster than a slam's closing speed
 *  (`closingMS`, how fast `bowUnder` grows). */
export function slams(pitchRate: number, bowUnder: number, closingMS: number): boolean {
  return pitchRate < 0 && bowUnder > 0 && closingMS > RIDE.slamClosingMS;
}

/** Its bow's spray, 0 to 1: a little at way, more the rougher the sea, and a burst `sinceSlamS` after a slam that
 *  fades over `RIDE.slamSprayS`, as hard as its way and the sea state make it. `way` is its share of a full way. */
export function sprayOf(way: number, state: number, sinceSlamS: number): number {
  const going = Math.min(1, Math.max(0, way));
  const burst = sinceSlamS >= 0 ? Math.exp(-sinceSlamS / RIDE.slamSprayS) * (0.4 + 0.6 * state) : 0;
  return Math.min(1, going * (0.1 + 0.4 * state) + going * burst);
}

/** Come Sail Away's heel in a turn, radians to starboard: into it, by its swing (radians a second, to starboard) and its
 *  way (m/s), once it makes a wake (crates/sailing/src/pose.rs `turn_heel`). */
export function turnHeel(turn: number, way: number): number {
  if (way < SAIL.moveSpeed * 0.25) return 0;
  const lean = ((turn * 180) / Math.PI / SAIL.turnSpeedDeg) * ((way * 0.1) / SAIL.moveSpeed);
  return (Math.min(30, Math.max(-30, lean * 5)) * Math.PI) / 180;
}

/** Where its bow and quarters stir the water, its waterline `halfLength` and `halfBeam` as drawn, deeper the more way
 *  (m/s) it makes. */
export function wakeStirs(lies: Lies, halfLength: number, halfBeam: number, way: number): Stir[] {
  const { forward, starboard } = headingFrame(lies.heading);
  const strength = -0.02 * Math.min(way / 2, 1.5);
  const stirAt = (along: number, across: number, radiusM: number, share: number): Stir => ({
    x: lies.x + forward[0] * along + starboard[0] * across,
    y: lies.y + forward[1] * along + starboard[1] * across,
    radiusM,
    strength: strength * share,
  });
  return [
    stirAt(halfLength, 0, 0.6, 1),
    stirAt(-0.7 * halfLength, -halfBeam, 0.4, 0.5),
    stirAt(-0.7 * halfLength, halfBeam, 0.4, 0.5),
  ];
}
