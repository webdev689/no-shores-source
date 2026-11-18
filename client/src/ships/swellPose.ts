// How a ship is drawn riding the sea the page draws: her pose from the swell under her bow, stern, sides and middle,
// her heel into a turn, and the stirrings of her wake. The editor's ship takes the same pose from the rules; the
// Overworld's are drawn from the browser's swell, so this is for drawing, never for a rule.
import type { Swell } from '../rules/landRules.ts';
import { swellHeight } from '../water/swell.ts';

/** Come Sail Away's handling under sail (crates/sailing/src/helm.rs `HANDLING`): her way, m/s, and her swing, degrees a
 *  second. */
const SAIL = { moveSpeed: 2, turnSpeedDeg: 10 } as const;
/** A ship stirs the water's ripples once she makes this way, m/s, a quarter of her sailing speed (Come Sail Away's
 *  wake threshold). */
export const WAKE_WAY = 0.5;

/** Her waterline's middle over still water, metres; her bow's rise and her heel to starboard, radians. */
export interface SwellPose {
  readonly heave: number;
  readonly pitch: number;
  readonly roll: number;
}

/** Where a ship lies: her middle and her heading, radians clockwise from north. */
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

/** Her forward and starboard ways, east and south. */
function frameOf(heading: number): { readonly forward: [number, number]; readonly starboard: [number, number] } {
  const [sine, cosine] = [Math.sin(heading), Math.cos(heading)];
  return { forward: [sine, -cosine], starboard: [cosine, sine] };
}

/** Her pose on the swell at `time`, her waterline `halfLength` and `halfBeam` as drawn, the sea `depthAt` a point deep
 *  (Infinity off the charts): the mean of the water under her bow, stern, sides and middle, and its slope along and
 *  across her (crates/sailing/src/pose.rs `pose_of`). Still water without a swell. */
export function poseOnSwell(
  swell: Swell | undefined,
  depthAt: (x: number, y: number) => number,
  lies: Lies,
  halfLength: number,
  halfBeam: number,
  time: number,
): SwellPose {
  if (!swell) return { heave: 0, pitch: 0, roll: 0 };
  const { forward, starboard } = frameOf(lies.heading);
  const levelAt = (along: number, across: number) => {
    const x = lies.x + forward[0] * along + starboard[0] * across;
    const y = lies.y + forward[1] * along + starboard[1] * across;
    return swellHeight(swell, x, y, time, depthAt(x, y));
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

/** Come Sail Away's heel in a turn, radians to starboard: into it, by her swing (radians a second, to starboard) and her
 *  way (m/s), once she makes a wake (crates/sailing/src/pose.rs `turn_heel`). */
export function turnHeel(turn: number, way: number): number {
  if (way < SAIL.moveSpeed * 0.25) return 0;
  const lean = ((turn * 180) / Math.PI / SAIL.turnSpeedDeg) * ((way * 0.1) / SAIL.moveSpeed);
  return (Math.min(30, Math.max(-30, lean * 5)) * Math.PI) / 180;
}

/** Where her bow and quarters stir the water, her waterline `halfLength` and `halfBeam` as drawn, deeper the more way
 *  (m/s) she makes. */
export function wakeStirs(lies: Lies, halfLength: number, halfBeam: number, way: number): Stir[] {
  const { forward, starboard } = frameOf(lies.heading);
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
