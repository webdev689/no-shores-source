// The dungeon map's view: the plan seen straight along one line (no perspective), turned by its yaw about the view's
// middle and tilted by its pitch, at a scale in paper pixels a metre. A point (x east, y south, z up) lies on the paper
// at u = a cos(yaw) - b sin(yaw), v = (a sin(yaw) + b cos(yaw)) sin(pitch) - (z - z0) cos(pitch), each times the scale,
// from the paper's middle, where (a, b) is the point less the middle's; pitch a quarter turn and yaw 0 is the flat
// plan, north up.

/** A view of the map: its turn and tilt (radians), its scale (paper pixels a metre) and the point at the paper's
 *  middle (x east, y south, z up: z the floor the view is cut over). */
export interface MapView {
  readonly yaw: number;
  readonly pitch: number;
  readonly scale: number;
  readonly centre: readonly [number, number, number];
}

type Point = readonly [number, number, number];
type Paper = readonly [number, number];

/** How the view turns and zooms: its rest, its tilt's range, a key's turn and tilt, a right drag's (radians a pixel),
 *  how fast it eases to where it is sent (a second), a key's zoom, and its scales (paper pixels a metre): the closest,
 *  the farthest, and the least a rest view opens at. A rest view fits what is explored in this share of the paper,
 *  centred on the player where they would stand further than `offCentre` of the paper from its middle. */
export const ORBIT = {
  yawRest: -0.62,
  pitchRest: 1.12,
  pitchMin: 0.2,
  pitchMax: Math.PI / 2,
  yawStep: Math.PI / 4,
  pitchStep: 0.16,
  dragYaw: 0.008,
  dragPitch: 0.006,
  ease: 10,
  zoomStep: 1.35,
  scaleMost: 14,
  scaleLeast: 1,
  restLeast: 4,
  fit: 0.92,
  offCentre: 0.42,
} as const;

const TURN = Math.PI * 2;
const clamp = (value: number, least: number, most: number) => Math.min(most, Math.max(least, value));

/** Where `point` lies on the paper (pixels from its middle, y down), and how near the eye it stands (m, more nearer). */
export function toPaper(view: MapView, point: Point): [number, number, number] {
  const [a, b, height] = [point[0] - view.centre[0], point[1] - view.centre[1], point[2] - view.centre[2]];
  const [cosYaw, sinYaw, cosPitch, sinPitch] = [
    Math.cos(view.yaw),
    Math.sin(view.yaw),
    Math.cos(view.pitch),
    Math.sin(view.pitch),
  ];
  const along = a * sinYaw + b * cosYaw;
  const across = a * cosYaw - b * sinYaw;
  const down = along * sinPitch - height * cosPitch;
  return [across * view.scale, down * view.scale, along * cosPitch + height * sinPitch];
}

/** The move across the floor (m east, m south) that carries a point `paper` pixels across the paper. */
function floorMove(view: MapView, paper: Paper): [number, number] {
  const [across, along] = [paper[0] / view.scale, paper[1] / view.scale / Math.sin(view.pitch)];
  const [cosYaw, sinYaw] = [Math.cos(view.yaw), Math.sin(view.yaw)];
  return [across * cosYaw + along * sinYaw, along * cosYaw - across * sinYaw];
}

/** The point of the view's floor (at the middle's height) that lies at `paper` on the paper. */
export function fromPaper(view: MapView, paper: Paper): [number, number] {
  const [east, south] = floorMove(view, paper);
  return [view.centre[0] + east, view.centre[1] + south];
}

/** The view turned by `steps` eighths of a turn. */
export const turned = (view: MapView, steps: number): MapView => ({ ...view, yaw: view.yaw + steps * ORBIT.yawStep });

/** The view tilted by `steps` of a key's tilt, within the orbit. */
export const tilted = (view: MapView, steps: number): MapView => ({
  ...view,
  pitch: clamp(view.pitch + steps * ORBIT.pitchStep, ORBIT.pitchMin, ORBIT.pitchMax),
});

/** The view turned and tilted by a right drag of `right` and `down` pixels. */
export function dragTurn(view: MapView, right: number, down: number): MapView {
  const pitch = clamp(view.pitch - down * ORBIT.dragPitch, ORBIT.pitchMin, ORBIT.pitchMax);
  return { ...view, yaw: view.yaw + right * ORBIT.dragYaw, pitch };
}

/** The view `shown` eased `seconds` toward `goal`, its turn the short way round. */
export function eased(shown: MapView, goal: MapView, seconds: number): MapView {
  const share = 1 - Math.exp(-ORBIT.ease * seconds);
  const turn = goal.yaw - shown.yaw;
  const short = turn - TURN * Math.round(turn / TURN);
  const toward = (from: number, to: number) => from + (to - from) * share;
  return {
    yaw: shown.yaw + short * share,
    pitch: toward(shown.pitch, goal.pitch),
    scale: shown.scale * Math.pow(goal.scale / shown.scale, share),
    centre: [
      toward(shown.centre[0], goal.centre[0]),
      toward(shown.centre[1], goal.centre[1]),
      toward(shown.centre[2], goal.centre[2]),
    ],
  };
}

/** P: the flat plan, turned to the nearest whole turn, keeping the view it was laid from; P on that plan goes back to
 *  the view kept. */
export function planned(view: MapView, before: MapView | null): { view: MapView; before: MapView | null } {
  const plan = view.pitch === ORBIT.pitchMax && view.yaw === TURN * Math.round(view.yaw / TURN);
  if (plan && before) return { view: { ...before, centre: view.centre, scale: view.scale }, before: null };
  return { view: { ...view, pitch: ORBIT.pitchMax, yaw: TURN * Math.round(view.yaw / TURN) }, before: view };
}

/** The view panned so what lay under the pointer moves `paper` pixels with it. */
export function panned(view: MapView, paper: Paper): MapView {
  const [east, south] = floorMove(view, paper);
  return { ...view, centre: [view.centre[0] - east, view.centre[1] - south, view.centre[2]] };
}

/** The view zoomed by `factor` about the paper's point `at`, which stays where it is. */
export function zoomedAt(view: MapView, factor: number, pointer: Paper): MapView {
  const scale = clamp(view.scale * factor, ORBIT.scaleLeast, ORBIT.scaleMost);
  const kept = scale / view.scale;
  return panned({ ...view, scale }, [pointer[0] - pointer[0] * kept, pointer[1] - pointer[1] * kept]);
}

/** The view a map opens at with nothing kept: turned and tilted as `orbit`, fitting `explored` in the paper but never
 *  smaller than readable, its middle on the floor `player` stands on; centred on the player instead where the fit
 *  would leave them far from its middle, or where nothing is explored. */
export function restView(
  explored: readonly Point[],
  player: Point,
  paper: { readonly width: number; readonly height: number },
  orbit: { readonly yaw: number; readonly pitch: number },
): MapView {
  const onPlayer: MapView = { ...orbit, scale: ORBIT.restLeast, centre: player };
  if (explored.length === 0) return onPlayer;
  const placed = explored.map((point) => toPaper({ ...onPlayer, scale: 1 }, point));
  const [acrosses, downs] = [placed.map((each) => each[0]), placed.map((each) => each[1])];
  const [width, height] = [Math.max(...acrosses) - Math.min(...acrosses), Math.max(...downs) - Math.min(...downs)];
  const fits = Math.min(
    (paper.width * ORBIT.fit) / Math.max(width, 1),
    (paper.height * ORBIT.fit) / Math.max(height, 1),
  );
  const scale = clamp(fits, ORBIT.restLeast, ORBIT.scaleMost);
  const middle: Paper = [
    (Math.max(...acrosses) + Math.min(...acrosses)) / 2,
    (Math.max(...downs) + Math.min(...downs)) / 2,
  ];
  const [east, south] = floorMove({ ...onPlayer, scale: 1 }, middle);
  const fitted: MapView = { ...orbit, scale, centre: [player[0] + east, player[1] + south, player[2]] };
  const [across, down] = toPaper(fitted, player);
  const far = Math.abs(across) > paper.width * ORBIT.offCentre || Math.abs(down) > paper.height * ORBIT.offCentre;
  return far ? { ...onPlayer, scale } : fitted;
}
