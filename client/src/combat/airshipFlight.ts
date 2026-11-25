// How a Grey Tithe airship flies, as the page draws it from what the room sends (`arrivalMessages.ts`): in from far
// off along the way it comes, high, swinging a little to one side and settling as it slows, its nose flaring up to
// brake; hanging over its ground, bobbing, while its foes are let down through the drop hatch's doors, which the model
// keeps hung open; then on, climbing away in a turn. Each part runs on from the last with no step between them. The
// room sets only the ticks and the ground: where the ship is between them is drawing alone.
import type { ArrivalSeen } from '../network/arrivalMessages.ts';

type Point = readonly [number, number, number];

/** The flight's shape: how far off and how high over its ground it comes in from (metres), how far it swings aside on
 *  the way in, how far off and how high it climbs to on the way out and how far it turns (radians), how much it bobs
 *  and sways as it hangs, and how long its bob takes to set in as it comes to hang and to die away before it leaves
 *  (ticks). */
export const FLIGHT = {
  inFarM: 340,
  inHighM: 70,
  arcM: 28,
  outFarM: 420,
  outHighM: 110,
  outTurn: 0.9,
  bobM: 0.45,
  bobRad: 1.1,
  settleTicks: 60,
} as const;
const TICKS_A_SECOND = 60;

/** An airship as drawn at a moment: its keel's middle (world metres), the way its bow points (radians clockwise from
 *  north), its nose up (pitch) and its lean to port (roll), radians; and how hard its main thrusters and its lift
 *  thrusters burn, each 0 to 1. */
export interface ShipPose {
  readonly at: Point;
  readonly heading: number;
  readonly pitch: number;
  readonly roll: number;
  readonly burn: number;
  readonly lift: number;
}

const smooth = (from: number, to: number, value: number): number => {
  const share = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return share * share * (3 - 2 * share);
};
const share = (from: number, to: number, value: number): number =>
  Math.min(1, Math.max(0, (value - from) / (to - from)));
/** A way (radians clockwise from north) as east and south. */
const toward = (heading: number): readonly [number, number] => [Math.sin(heading), -Math.cos(heading)];
const headingOf = (east: number, south: number): number => Math.atan2(east, -south);

/** Which side a ship swings to on its way in and turns to on its way out: by its number, so ships differ. */
const sideOf = (ship: ArrivalSeen): number => (ship.id % 2 === 0 ? 1 : -1);

/** Where along its way in a ship is at a share of the way's time: decelerating to its ground, swung aside midway, and
 *  as high over its hanging height as is left to settle. */
function inbound(ship: ArrivalSeen, done: number): Point {
  const along = 1 - (1 - done) ** 3;
  const [east, south] = toward(ship.heading);
  const back = FLIGHT.inFarM * (1 - along);
  const aside = FLIGHT.arcM * Math.sin(Math.PI * along) * sideOf(ship);
  const high = ship.high + (FLIGHT.inHighM - ship.high) * (1 - along) ** 1.5;
  return [ship.at[0] - east * back - south * aside, ship.at[1] - south * back + east * aside, ship.at[2] + high];
}

/** Where along its way out a ship is at a share of the way's time: gathering speed, turning to its side, climbing. */
function outbound(ship: ArrivalSeen, done: number): Point {
  const steps = 16;
  let [east, south] = [0, 0];
  for (let step = 0; step < steps; step++) {
    const [from, to] = [step / steps, (step + 1) / steps].map((part) => Math.min(part, done));
    if (to <= from) break;
    const middle = (from + to) / 2;
    const way = toward(ship.heading + sideOf(ship) * FLIGHT.outTurn * smooth(0, 1, middle));
    const run = FLIGHT.outFarM * (to * to - from * from);
    [east, south] = [east + way[0] * run, south + way[1] * run];
  }
  const high = ship.high + (FLIGHT.outHighM - ship.high) * done ** 1.6;
  return [ship.at[0] + east, ship.at[1] + south, ship.at[2] + high];
}

/** The way a ship's path runs at a share of its way's time, from a step either side of it. */
function wayAlong(path: (done: number) => Point, done: number, fallback: number): number {
  const [before, after] = [path(Math.max(0, done - 0.01)), path(Math.min(1, done + 0.01))];
  const [east, south] = [after[0] - before[0], after[1] - before[1]];
  return Math.hypot(east, south) > 1e-4 ? headingOf(east, south) : fallback;
}

/** An airship as drawn at room tick `tick` (whole or between ticks); null before it sets out and once it is gone. */
export function shipPose(ship: ArrivalSeen, tick: number): ShipPose | null {
  if (tick < ship.began || tick >= ship.gone) return null;
  const seconds = tick / TICKS_A_SECOND;
  if (tick < ship.hangs) {
    const done = share(ship.began, ship.hangs, tick);
    const flare = smooth(0.7, 0.93, done) * (1 - smooth(0.93, 1, done));
    return {
      at: inbound(ship, done),
      heading: done > 0.985 ? ship.heading : wayAlong((part) => inbound(ship, part), done, ship.heading),
      pitch: -0.08 * (1 - done) + 0.14 * flare,
      roll: 0.15 * sideOf(ship) * Math.sin(2 * Math.PI * (1 - (1 - done) ** 3)),
      burn: 0.25 + 0.75 * (1 - smooth(0.5, 0.9, done)),
      lift: smooth(0.55, 1, done),
    };
  }
  if (tick < ship.leaves) {
    // Its bob and sways set in as it comes to hang and die away before it leaves, so it hangs on from its flight in
    // and flies out from where it hung.
    const settle = FLIGHT.settleTicks;
    const sway = smooth(ship.hangs, ship.hangs + settle, tick) * (1 - smooth(ship.leaves - settle, ship.leaves, tick));
    const bob = Math.sin(seconds * FLIGHT.bobRad) * FLIGHT.bobM * sway;
    return {
      at: [ship.at[0], ship.at[1], ship.at[2] + ship.high + bob],
      heading: ship.heading + 0.04 * Math.sin(seconds * 0.4) * sway,
      pitch: 0.02 * Math.sin(seconds * 0.9) * sway,
      roll: 0.025 * Math.sin(seconds * 0.7) * sway,
      burn: 0.25,
      lift: 1,
    };
  }
  const done = share(ship.leaves, ship.gone, tick);
  return {
    at: outbound(ship, done),
    heading: wayAlong((part) => outbound(ship, part), Math.max(done, 0.01), ship.heading),
    pitch: 0.12 * smooth(0, 0.12, done) * (1 - smooth(0.4, 1, done)),
    roll: 0.2 * sideOf(ship) * Math.sin(Math.PI * done),
    burn: 0.25 + 0.75 * smooth(0, 0.15, done),
    lift: 1 - smooth(0.2, 0.7, done),
  };
}

/** A point of the airship's own frame (as its module is built: x to its port, y toward its bow, z up from its keel's
 *  middle) where `pose` has it in the world: rolled about its length, pitched about its beam and turned to its
 *  heading, as the props' shader places it (`eventPropsShader.ts`). */
export function shipPoint(pose: ShipPose, local: Point): Point {
  const [across, along, up] = local;
  // Rolled about its own y (its length).
  const [rollCos, rollSin] = [Math.cos(pose.roll), Math.sin(pose.roll)];
  const [rolledAcross, rolledUp] = [across * rollCos + up * rollSin, -across * rollSin + up * rollCos];
  // Pitched about its own x (its beam), the bow (+y) up for a positive pitch.
  const [pitchCos, pitchSin] = [Math.cos(pose.pitch), Math.sin(pose.pitch)];
  const [pitchedAlong, pitchedUp] = [along * pitchCos - rolledUp * pitchSin, along * pitchSin + rolledUp * pitchCos];
  // Turned so its bow (+y) points along its heading: the props' turn is the heading and a half turn.
  const turn = pose.heading + Math.PI;
  const [turnCos, turnSin] = [Math.cos(turn), Math.sin(turn)];
  return [
    pose.at[0] + rolledAcross * turnCos - pitchedAlong * turnSin,
    pose.at[1] + rolledAcross * turnSin + pitchedAlong * turnCos,
    pose.at[2] + pitchedUp,
  ];
}
