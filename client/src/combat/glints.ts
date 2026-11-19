// The wind-up's glint: as a foe's blow is about to land, a star of steel flashes on its weapon, the read every action
// game gives before a blow. A telegraphed blow's flashes 80% of the way through its wind-up, an iron one's red; a
// plain swing's at 80% of the way to its blow.
import type { Rgb } from '../elementGlow.ts';
import { FLASH } from '../player/cardLooks.ts';
import { type FighterView, type Shape, directionOf } from '../rules/fighters.ts';
import { IRON, type Ramp, STEEL, layPicture, starSprite } from './markSprites.ts';
import { CELL_M, HOT, LIGHT } from './spellPixels.ts';

type Point = readonly [number, number, number];

/** A glint shows from this share of the way to its blow, for this many ticks, the first of them white-hot. */
export const GLINT = { at: 0.8, ticks: 4, hot: 2 } as const;
/** An iron blow's foe is outlined red for its wind-up's last stretch, as the combat crate's NOW (0.2 s). */
const IRON_TELL_TICKS = 12;
/** Its cell (two of a spell's, so it reads across a fight), and how far toward the eye it stands, past the card the
 *  foe is drawn on. */
const GLINT_CELL_M = 2 * CELL_M;
const TOWARD_EYE_M = 0.45;
/** The arms of a glint white-hot, then cooled a stop, cell by cell. */
const STARS = [starSprite(2), starSprite(2)].map((picture, stage) => ({
  ...picture,
  cells: picture.cells.map((stop) =>
    stage === 1 && stop === HOT ? LIGHT : stage === 1 && stop >= 0 ? stop - 1 : stop,
  ),
}));

/** Where a foe's weapon is through a wind-up, from its feet: ahead, to its right and up (metres). */
const SHAPE_TIP: Readonly<Record<Shape, Point>> = {
  lunge: [0.7, 0.15, 1.25],
  charge: [0.7, 0.15, 1.25],
  aimed: [0.55, 0.15, 1.4],
  sweep: [-0.15, 0.6, 1.5],
  slam: [0.15, 0.2, 2.05],
  ring: [0.1, 0.35, 1.95],
  leap: [0.15, 0.2, 2.05],
};
const STROKE_TIP: Readonly<Record<ReturnType<typeof directionOf>, Point>> = {
  down: [0.1, 0.2, 2],
  downLeft: [0, 0.45, 1.9],
  downRight: [0, -0.45, 1.9],
  left: [-0.1, 0.55, 1.5],
  right: [-0.1, -0.55, 1.5],
  up: [0.6, 0.15, 1.2],
};

/** A glint's stage `elapsed` ticks into a wind-up whose blow lands at `lands`: 0 white-hot, 1 a stop cooler, or none. */
export function glintStage(elapsed: number, lands: number): 0 | 1 | null {
  const since = elapsed - Math.floor(GLINT.at * lands);
  if (since < 0 || since >= GLINT.ticks) return null;
  return since < GLINT.hot ? 0 : 1;
}

/** Where a glint stands and how it is drawn for a foe doing `action`, or none. */
function glintOf(view: FighterView): { tip: Point; bearing: number; stage: 0 | 1; ramp: Ramp } | null {
  const { action } = view;
  if (action.kind === 'telegraph') {
    const stage = glintStage(action.elapsed, action.windup);
    return stage === null
      ? null
      : { tip: SHAPE_TIP[action.shape], bearing: action.bearing, stage, ramp: action.iron ? IRON : STEEL };
  }
  if (action.kind === 'attack') {
    const stage = glintStage(action.elapsed, action.strike);
    return stage === null
      ? null
      : { tip: STROKE_TIP[directionOf(action.stroke)], bearing: view.facing, stage, ramp: STEEL };
  }
  return null;
}

/** An iron blow's body tell: its foe's outline in the display's iron red through the last 12 ticks of its wind-up,
 *  drawn as a struck figure's outline flash is. */
export function ironOutline(
  action: FighterView['action'],
): { readonly stage: number; readonly colour: Rgb } | undefined {
  if (action.kind !== 'telegraph' || !action.iron || action.windup - action.elapsed > IRON_TELL_TICKS) return undefined;
  return { stage: FLASH.outline, colour: IRON[2] };
}

/** The glints of `foes` winding up, seen from `eye`, as mark vertices. */
export function foeGlints(foes: Iterable<{ readonly view: FighterView }>, eye: Point): number[] {
  const out: number[] = [];
  for (const { view } of foes) {
    const glint = glintOf(view);
    if (!glint) continue;
    const [ahead, right, up] = glint.tip;
    const [sin, cos] = [Math.sin(glint.bearing), Math.cos(glint.bearing)];
    const place: [number, number, number] = [
      view.x + sin * ahead + cos * right,
      view.y - cos * ahead + sin * right,
      view.z + up,
    ];
    const toEye = Math.hypot(eye[0] - place[0], eye[1] - place[1], eye[2] - place[2]) || 1;
    const pull = Math.min(TOWARD_EYE_M, toEye / 2) / toEye;
    for (let axis = 0; axis < 3; axis++)
      place[axis] = (place[axis] ?? 0) + ((eye[axis] ?? 0) - (place[axis] ?? 0)) * pull;
    const picture = STARS[glint.stage] ?? starSprite(2);
    layPicture(out, picture, glint.ramp, place, eye, { cell: GLINT_CELL_M });
  }
  return out;
}
