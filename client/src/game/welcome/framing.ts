// Where the camera stands for each place the stranger names (`tour.ts`). A counter's eye is the first of a set of
// candidates round it, out before it first, whose lines to each keeper's head and each stall's front clear the node's
// solids (the blocks the camera's boom keeps clear of) with both in the view. The Hall of the Arts is an interior, so
// it is seen from inside, up under its roof by its door, down the nave to the three chapels, turning to each house's
// as she names it. Her farewell is seen from the side, both faces in the view.
import { lookAt } from '../../cinema/rail.ts';
import { blockReach } from '../../player/boom.ts';
import type { Block } from '../../rules/movementRules.ts';
import { type Shot, onScreen } from '../camera.ts';
import type { StationInfo } from '../nodes.ts';

type Point3 = readonly [number, number, number];

/** What a place is framed among: its counters, the ground's height, and the solids a line of sight must clear. */
export interface Place {
  readonly stations: readonly StationInfo[];
  readonly groundAt: (x: number, y: number) => number | null;
  readonly blocks: readonly Block[];
}

/** A keeper's head over the ground, and the stall's front a line must reach, metres. */
export const HEAD_M = 1.7;
const FRONT_M = 1;
/** How near a line may pass a solid, metres. */
const CLEAR_M = 0.05;
/** The eye's distances out from a counter, its turns off the counter's facing (degrees) and its heights, tried in turn:
 *  a group's spread adds to the distance and the height, so every counter of it stays in the view. */
const BACKS_M = [11, 8, 14, 5.5];
const TURNS = [0, 20, -20, 40, -40, 60, -60, 80, -80];
const UPS_M = [7, 4.5, 10, 3];
const SPREAD_BACK = 1.3;
const SPREAD_HEIGHT = 0.35;
/** The height over the ground a counter's eye looks at: over a keeper's head, so their stall's roof is in the view. */
const LOOK_M = 2.5;
/** The Hall's eye: how far in from its door (a share of the way past the chapels' middle to it) and how high over its
 *  floor it is tried, metres; its lens, wide enough for the chapels either side; and where a house's banner hangs. */
const HALL_IN_M = [3, 2, 5, 7, 9];
const HALL_UPS_M = [10, 11, 8, 12, 7];
const HALL_LENS = 1.35;
const DOOR_SHARE = 1.08;
const BANNER_M = 5;
/** How far below its target the view looks, a share of its lens: what it frames stands in the view's upper part,
 *  clear of the dialogue box over its lower middle. */
const RAISE = 0.2;
/** How far from the pair the farewell's eye stands. */
const FACES_M = 3.2;
/** The view a framing is checked against: the widest screen the game is laid out for. */
const CHECKED = { width: 16, height: 9 };

const inBlock = (eye: Point3, blocks: readonly Block[]) =>
  blocks.some(
    (block) =>
      eye[0] > block.minX &&
      eye[0] < block.maxX &&
      eye[1] > block.minY &&
      eye[1] < block.maxY &&
      eye[2] > block.bottom &&
      eye[2] < block.top,
  );

/** Whether the line between two points clears every solid by `CLEAR_M`. */
export const lineClear =
  (blocks: readonly Block[]) =>
  (from: Point3, to: Point3): boolean =>
    blockReach(from, to, blocks, CLEAR_M) >= Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]) - 1e-6;

/** Whether a shot sees every point, each by a line clear of the solids and on its view. */
function sees(shot: Shot, points: readonly Point3[], blocks: readonly Block[]): boolean {
  if (inBlock(shot.eye, blocks)) return false;
  return points.every((point) => {
    const spot = onScreen(shot, CHECKED, point);
    const shown = spot !== null && spot[0] > 0 && spot[0] < CHECKED.width && spot[1] > 0 && spot[1] < CHECKED.height;
    return shown && lineClear(blocks)(shot.eye, point);
  });
}

/** A shot from `eye` looking at `target` through the player's lens, or `fov`. */
const looking = (own: Shot, eye: Point3, target: Point3, fov = own.fov): Shot => {
  const { yaw, pitch } = lookAt(eye, target);
  return { ...own, fov, eye, yaw, pitch: pitch + fov * RAISE };
};

/** The first shot that sees every point, else the first tried. */
const firstSeeing = (shots: readonly Shot[], points: readonly Point3[], blocks: readonly Block[]): Shot | null =>
  shots.find((shot) => sees(shot, points, blocks)) ?? shots[0] ?? null;

/** The counter of `kind` nearest a point. */
function nearest(stations: readonly StationInfo[], kind: string | undefined, [x, y]: readonly number[]) {
  const away = (station: StationInfo) => Math.hypot(station.counter[0] - (x ?? 0), station.counter[1] - (y ?? 0));
  return stations.filter((station) => station.kind === kind).sort((one, two) => away(one) - away(two))[0];
}

/** The shot of the counters of `kinds`, the first the one of its kind nearest the player's view (`own`), each other
 *  the one of its kind nearest that, looking at their middle from the first candidate that sees each keeper and each
 *  stall's front. Null where one of the kinds keeps no counter here. */
export function counterShot(place: Place, kinds: readonly string[], own: Shot): Shot | null {
  const first = nearest(place.stations, kinds[0], own.eye);
  const named = kinds.map((kind) => first && nearest(place.stations, kind, first.counter));
  if (named.length === 0 || named.some((station) => !station)) return null;
  const found = named as StationInfo[];
  const mean = (value: (station: StationInfo) => number) =>
    found.reduce((sum, each) => sum + value(each), 0) / found.length;
  const [x, y] = [mean((each) => each.counter[0]), mean((each) => each.counter[1])];
  const ground = place.groundAt(x, y) ?? own.eye[2];
  // A counter faces the plaza from its keeper: the eye stands out that way, turned from it where it must.
  const facing = Math.atan2(
    mean((each) => each.counter[1] - each.keeper[1]),
    mean((each) => each.counter[0] - each.keeper[0]),
  );
  const spread = Math.max(...found.map((each) => Math.hypot(each.counter[0] - x, each.counter[1] - y)));
  const target: Point3 = [x, y, ground + LOOK_M];
  const shots = BACKS_M.flatMap((back) =>
    TURNS.flatMap((turn) =>
      UPS_M.map((up) => {
        const bearing = facing + (turn * Math.PI) / 180;
        const out = back + spread * SPREAD_BACK;
        const eye: Point3 = [
          x + Math.cos(bearing) * out,
          y + Math.sin(bearing) * out,
          ground + up + spread * SPREAD_HEIGHT,
        ];
        return looking(own, eye, target);
      }),
    ),
  );
  const floor = (station: StationInfo) => place.groundAt(...station.keeper) ?? ground;
  const points = found.flatMap((station): Point3[] => [
    [...station.keeper, floor(station) + HEAD_M],
    [...station.counter, floor(station) + FRONT_M],
  ]);
  return firstSeeing(shots, points, place.blocks);
}

/** The Hall of the Arts seen from inside: from up under its roof a few metres in from its door, down the nave to all
 *  three chapels (`kinds` all three), or turned to the one house's chapel `kinds` names. Null where a chapel is
 *  missing. */
export function hallShot(place: Place, kinds: readonly string[], own: Shot): Shot | null {
  const [storm, veiled, lamps] = ['stormcallers', 'veiled', 'lamplighters'].map((kind) =>
    nearest(place.stations, kind, own.eye),
  );
  if (!storm || !veiled || !lamps) return null;
  const chapels = [storm, veiled, lamps];
  const middle = [(storm.counter[0] + veiled.counter[0]) / 2, (storm.counter[1] + veiled.counter[1]) / 2] as const;
  const [alongX, alongY] = [middle[0] - lamps.counter[0], middle[1] - lamps.counter[1]];
  const deep = Math.hypot(alongX, alongY) || 1;
  const [toDoorX, toDoorY] = [alongX / deep, alongY / deep];
  const door = [middle[0] + toDoorX * deep * DOOR_SHARE, middle[1] + toDoorY * deep * DOOR_SHARE] as const;
  const ground = place.groundAt(...middle) ?? own.eye[2];
  const floor = (station: StationInfo) => place.groundAt(...station.keeper) ?? ground;
  const heads = chapels.map((station): Point3 => [...station.keeper, floor(station) + HEAD_M]);
  const banners = chapels.map((station): Point3 => [...station.keeper, floor(station) + BANNER_M]);
  const nave: Point3 = [lamps.counter[0], lamps.counter[1], ground + LOOK_M];
  const eyes = HALL_IN_M.flatMap((inward) =>
    HALL_UPS_M.map((up): Point3 => [door[0] - toDoorX * inward, door[1] - toDoorY * inward, ground + up]),
  );
  const naveShots = eyes.map((eye) => looking(own, eye, nave, HALL_LENS));
  const fromNave = firstSeeing(naveShots, [...heads, ...banners], place.blocks);
  const house = kinds.length === 1 ? chapels.find((station) => station.kind === kinds[0]) : undefined;
  if (!house || !fromNave) return fromNave;
  // As she names a house the camera turns to its chapel from where it stands, or the nearest eye that sees it.
  const its: Point3 = [...house.keeper, floor(house) + HEAD_M];
  const turned = [fromNave.eye, ...eyes].map((eye) => looking(own, eye, [its[0], its[1], its[2] + 1], HALL_LENS));
  return firstSeeing(turned, [its], place.blocks);
}

/** Her farewell seen from the side of the pair, the side nearer the player's view first, else the one a solid leaves
 *  clear: level with their faces, both in the view. */
export function facesShot(own: Shot, stranger: Point3, player: Point3, blocks: readonly Block[]): Shot {
  const middle: Point3 = [(stranger[0] + player[0]) / 2, (stranger[1] + player[1]) / 2, (stranger[2] + player[2]) / 2];
  const [acrossX, acrossY] = [player[0] - stranger[0], player[1] - stranger[1]];
  const length = Math.hypot(acrossX, acrossY) || 1;
  const sides = [1, -1].map((side): Point3 => [
    middle[0] - (acrossY / length) * FACES_M * side,
    middle[1] + (acrossX / length) * FACES_M * side,
    middle[2] + HEAD_M,
  ]);
  const toOwn = (eye: Point3) => Math.hypot(eye[0] - own.eye[0], eye[1] - own.eye[1]);
  sides.sort((one, two) => toOwn(one) - toOwn(two));
  const faces = [stranger, player].map((feet): Point3 => [feet[0], feet[1], feet[2] + HEAD_M]);
  const shots = sides.map((eye) => looking(own, eye, [middle[0], middle[1], middle[2] + HEAD_M - 0.2]));
  return firstSeeing(shots, faces, blocks) ?? looking(own, sides[0] as Point3, middle);
}
