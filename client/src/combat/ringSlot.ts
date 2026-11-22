// The pieces a bar of abilities at the bottom left is built from, as Destiny draws its abilities: each icon in a ring,
// a dark wedge over it sweeping clockwise away as it recharges with its last seconds counted in it, the ring lit and
// glowing once ready, a flash as it is used, grey under a hatch while it cannot be, and its key on a keycap under it.
// The Art's bar on foot and the ship's bar at sea are both built of them, so the two read as one display.
import { TONES } from '../plus/tones.ts';
import type { Child, Node, Picture } from '../ui/node.ts';
import { keycapNode } from './barDraw.ts';
import { RING_CELLS } from './hudLayout.ts';

/** An icon's cells across, and the clear middle of its ring's. */
export const ICON_CELLS = 12;
const RING_CLEAR = 14;
/** The steps a wedge sweeps in, and a ring in use drains in, round the circle. */
const SWEEP_STEPS = 60;
/** The seconds are counted only once fewer than this are left. */
const COUNT_UNDER = 10;
/** How long an ability just used flashes, in seconds. */
export const USED_SECONDS = 0.5;
/** Float error left by a share worked out from ticks, kept from tipping a step. */
const EPSILON = 1e-9;

/** `value` held from 0 to 1, and none for a number that is not one. */
export const share = (value: number): number => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

/** A recharge as its ring shows it: how many degrees of its wedge are still dark, clockwise from the top, the seconds
 *  written in it (none until fewer than ten are left), and whether it is ready. */
export interface Sweep {
  readonly sweep: number;
  readonly seconds: string;
  readonly ready: boolean;
}

/** A recharge `charged` of the way, with `secondsLeft` to go: the seconds rounded up, so it never reads 0 before it
 *  is ready, and a sliver left still one step of the wedge. */
export function sweepOf(charged: number, secondsLeft: number): Sweep {
  const left = 1 - share(charged);
  const counted = Number.isFinite(secondsLeft) ? Math.ceil(secondsLeft - EPSILON) : 0;
  const steps = Math.max(0, Math.ceil(left * SWEEP_STEPS - EPSILON));
  return {
    sweep: (steps * 360) / SWEEP_STEPS,
    seconds: left > 0 && counted > 0 && counted < COUNT_UNDER ? String(counted) : '',
    ready: left <= 0,
  };
}

/** An SVG picture with its colours turned by a filter: `saturate` keeps that share of its colour (0 grey), and
 *  `brightness` scales its light, as CSS's filters of those names do. */
export function filteredSvg(svg: string, saturate: number, brightness: number): string {
  if (saturate === 1 && brightness === 1) return svg;
  const parts = /^\s*(<svg[^>]*>)([\s\S]*)(<\/svg>)\s*$/.exec(svg);
  if (!parts) return svg;
  const slope = `type="linear" slope="${brightness}"`;
  const filter = `<defs><filter id="turned" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="${saturate}"/><feComponentTransfer><feFuncR ${slope}/><feFuncG ${slope}/><feFuncB ${slope}/></feComponentTransfer></filter></defs>`;
  return `${parts[1]}${filter}<g filter="url(#turned)">${parts[2]}</g>${parts[3]}`;
}

/** The dark wedge over a recharging ability, `sweep` degrees of it still dark, running clockwise to the top. */
const sweepDrawing =
  (sweep: number) =>
  (context: OffscreenCanvasRenderingContext2D, width: number, height: number): void => {
    const [middleX, middleY] = [width / 2, height / 2];
    const start = -Math.PI / 2 + ((360 - sweep) * Math.PI) / 180;
    context.fillStyle = 'rgba(5, 6, 8, 0.72)';
    context.beginPath();
    context.moveTo(middleX, middleY);
    context.arc(middleX, middleY, Math.min(middleX, middleY), start, (3 * Math.PI) / 2);
    context.closePath();
    context.fill();
  };

/** The light along a ring in use, `steps` of its steps still lit, clockwise from the top: over the ring's body, two of
 *  its 22 cells deep. */
const drainDrawing =
  (steps: number) =>
  (context: OffscreenCanvasRenderingContext2D, width: number, height: number): void => {
    const cell = Math.min(width, height) / RING_CELLS;
    context.strokeStyle = '#fff3c4';
    context.lineWidth = 2 * cell;
    context.beginPath();
    context.arc(width / 2, height / 2, 9 * cell, -Math.PI / 2, -Math.PI / 2 + (2 * Math.PI * steps) / SWEEP_STEPS);
    context.stroke();
  };

/** The hatch over an ability that cannot be used now: dark stripes 3 px wide and 3 apart, in a circle. */
const hatchDrawing = (context: OffscreenCanvasRenderingContext2D, width: number, height: number): void => {
  context.beginPath();
  context.arc(width / 2, height / 2, Math.min(width, height) / 2, 0, 2 * Math.PI);
  context.clip();
  context.strokeStyle = 'rgba(5, 6, 8, 0.75)';
  const unit = width / 30;
  context.lineWidth = 3 * unit * Math.SQRT1_2 * 1.4;
  for (let along = -height; along < width + height; along += 6 * unit * Math.SQRT2) {
    context.beginPath();
    context.moveTo(along, 0);
    context.lineTo(along - height, height);
    context.stroke();
  }
};

/** A bar's pictures with their colours turned, each SVG turned once by its key and look. */
export class TurnedPictures {
  private readonly turned = new Map<string, string>();

  /** `svg` keyed by `key`, keeping `saturate` of its colour and `brightness` of its light (grey and darker while
   *  `unable`), drawn in `tint` where one is given. */
  picture(key: string, svg: string, saturate = 1, brightness = 1, unable = false, tint?: string): Picture {
    const [turnedSaturate, turnedBrightness] = unable ? [0, 0.6 * brightness] : [saturate, brightness];
    const keyed = `${key} ${turnedSaturate} ${turnedBrightness}`;
    let turned = this.turned.get(keyed);
    if (turned === undefined) this.turned.set(keyed, (turned = filteredSvg(svg, turnedSaturate, turnedBrightness)));
    return { key: keyed, source: { svg: turned }, ...(tint ? { tint } : {}) };
  }
}

/** Where a piece of a ring stands: over its middle. */
const CENTRED = { at: [0.5, 0.5], anchor: [0.5, 0.5], z: 1 } as const;

/** A square `side` pixels across holding `children` laid over one another. */
export const layered = (side: number, children: readonly Child[]): Node => ({ width: side, height: side, children });

/** A picture filling its square, over what is under it. */
export const whole = (made: Picture, more: Partial<Node> = {}): Node => ({
  width: 'grow',
  height: 'grow',
  picture: made,
  ...more,
  float: { z: 1, ...more.float },
});

/** A glow round a frame: how many pixels out it reaches, its colour, and how strongly it shows. */
export interface Glow {
  readonly width: number;
  readonly colour: string;
  readonly opacity: number;
}

/** A frame `side` pixels across with its hard shadow, its colours turned as `turn` says (its colour kept, its light),
 *  and while it glows the glow round it. */
export function framed(
  pictures: TurnedPictures,
  frame: { readonly key: string; readonly svg: string },
  turn: readonly [number, number],
  glow: Glow | null,
  side: number,
  unable: boolean,
): Child[] {
  const [saturate, brightness] = turn;
  return [
    glow !== null &&
      glow.width > 0 && {
        width: side + 2 * glow.width,
        height: side + 2 * glow.width,
        opacity: glow.opacity,
        picture: pictures.picture(frame.key, frame.svg, 1, 1, unable, glow.colour),
        float: { x: -glow.width, y: -glow.width, z: 1 },
      },
    whole(pictures.picture(frame.key, frame.svg, saturate, brightness, unable, TONES.outline), {
      float: { x: 1, y: 1 },
    }),
    whole(pictures.picture(frame.key, frame.svg, saturate, brightness, unable)),
  ];
}

/** The hatch over an ability `side` pixels across while it cannot be used. */
export const hatchOver = (side: number, unable: boolean): Child =>
  unable
    ? {
        width: Math.round(side * 0.56),
        height: Math.round(side * 0.56),
        picture: { key: 'unable hatch', source: { draw: hatchDrawing } },
        float: CENTRED,
      }
    : null;

/** With less motion asked for, an ability just used (`used` seconds of its flash left) is ringed white instead of
 *  its frame brightening. */
export const usedRing = (used: number, still: boolean): Child =>
  used > 0 && still
    ? { width: 'grow', height: 'grow', outline: { width: 2, colour: '#ffffff' }, float: { z: 1 } }
    : null;

/** Whether an ability just used (`used` seconds of its flash left) brightens its frame now: for the first half of its
 *  flash, and never with less motion asked for. */
export const flashing = (used: number, still: boolean): boolean => used > USED_SECONDS / 2 && !still;

/** How an ability's ring looks: its ring's and its icon's pictures, how much colour and light each keeps, its glow,
 *  its wedge and seconds while it recharges, how much of its ring is lit while in use, whether it cannot be used now,
 *  the seconds left of its flash, and what stands over it (a padlock). */
export interface RingLook {
  readonly ring: { readonly key: string; readonly svg: string };
  readonly icon: { readonly key: string; readonly svg: string };
  readonly frame: readonly [number, number];
  readonly iconTurn: readonly [number, number];
  readonly glow: Glow | null;
  readonly sweep: Sweep | null;
  readonly drain?: number;
  readonly unable: boolean;
  readonly used: number;
  readonly over?: Child;
}

/** The share of a ring lit while in use, in the steps its light is drawn in. */
export const drainSteps = (running: number): number => Math.max(0, Math.ceil(share(running) * SWEEP_STEPS - EPSILON));

/** An ability's icon in its ring as `look` says, `cell` pixels a cell at `zoom`, flashes still while `still`. */
export function ringNode(look: RingLook, pictures: TurnedPictures, cell: number, zoom: number, still: boolean): Node {
  const unit = cell * zoom;
  const side = RING_CELLS * unit;
  const { sweep, unable } = look;
  const counting = sweep !== null && sweep.seconds !== '';
  const [saturate, brightness] = look.frame;
  const glow = look.glow && { ...look.glow, width: Math.round(look.glow.width * zoom) };
  const drain = look.drain ?? 0;
  return layered(side, [
    ...framed(pictures, look.ring, [saturate, flashing(look.used, still) ? 3 : brightness], glow, side, unable),
    {
      width: ICON_CELLS * unit,
      height: ICON_CELLS * unit,
      ...(counting ? { opacity: 0.3 } : {}),
      picture: pictures.picture(look.icon.key, look.icon.svg, look.iconTurn[0], look.iconTurn[1], unable),
      float: CENTRED,
    },
    drain > 0 && {
      width: side,
      height: side,
      picture: { key: `ring drain ${drain}`, source: { draw: drainDrawing(drain) } },
      float: CENTRED,
    },
    sweep !== null &&
      sweep.sweep > 0 && {
        width: RING_CLEAR * unit,
        height: RING_CLEAR * unit,
        picture: { key: `ring sweep ${sweep.sweep}`, source: { draw: sweepDrawing(sweep.sweep) } },
        float: CENTRED,
      },
    counting && {
      text: { words: sweep.seconds, size: (cell === 2 ? 2 : 3) * zoom, colour: TONES.word, edge: 'halo', wrap: false },
      float: CENTRED,
    },
    hatchOver(side, unable),
    look.over ?? null,
    usedRing(look.used, still),
  ]);
}

/** An ability's slot, `cell` pixels a cell at `zoom`: `made` over its key's keycap, `face` drawn on the cap for a key
 *  that is no word; `label` is what a reader hears of it. */
export function slotNode(
  made: Node,
  key: string,
  label: string,
  cell: number,
  zoom: number,
  face: Node | null = null,
): Node {
  const keyTall = cell === 2 ? 17 : 27;
  return {
    direction: 'column',
    alignX: 'center',
    label,
    children: [
      made,
      { height: (keyTall - cell * 3) * zoom },
      {
        ...keycapNode(key, cell === 2 ? 1 : 2, cell * 9, keyTall, zoom, face),
        float: { at: [0.5, 1], anchor: [0.5, 1], z: 1 },
      },
    ],
  };
}

/** How tall a slot stands, `cell` pixels a cell at `zoom`: its ring and the room its keycap takes under it. */
export const slotTall = (cell: number, zoom: number): number =>
  (RING_CELLS * cell + (cell === 2 ? 17 : 27) - cell * 3) * zoom;
