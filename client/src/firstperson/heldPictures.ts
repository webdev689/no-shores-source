import type { Strip } from '../forge/compose.ts';
import {
  type FrameSource,
  type Picture,
  pieceCover,
  firstOf,
  forgeName,
  layOver,
  looksAsked,
  metalRamp,
  paintSet,
} from './fpFrames.ts';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from './fpMotion.ts';
import type { Shooter } from './handsLaw.ts';
import { SHOOTER_FEEL } from './shotMachine.ts';

/** A strip's texels as drawn, clear below half alpha and whole above it: the pictures DFO lays undyed and unsnapped. */
export function hardened(strip: Strip): Uint8Array {
  const pixels = Uint8Array.from(strip.data);
  for (let texel = 3; texel < pixels.length; texel += 4) pixels[texel] = (pixels[texel] ?? 0) >= 128 ? 255 : 0;
  return pixels;
}

/** A rectangle cut from a strip. */
export function cropped(strip: Strip, x: number, y: number, width: number, height: number): Strip {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++) {
    const from = ((y + row) * strip.width + x) * 4;
    data.set(strip.data.subarray(from, from + width * 4), row * width * 4);
  }
  return { width, height, data };
}

/** The box of the texels drawn in a strip (half alpha or more), or null when none is. */
export function drawnBox(strip: Strip): { x: number; y: number; width: number; height: number } | null {
  let [left, top, right, bottom] = [strip.width, strip.height, -1, -1];
  for (let row = 0; row < strip.height; row++) {
    for (let column = 0; column < strip.width; column++) {
      if ((strip.data[(row * strip.width + column) * 4 + 3] ?? 0) < 128) continue;
      [left, top, right, bottom] = [Math.min(left, column), Math.min(top, row), Math.max(right, column), row];
    }
  }
  return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/** One layer of a held thing's frame in the forge's studio: `forge/held/THUNDERLOCK_0-1_Gun.png`. */
export const heldPath = (archive: string | number, record: number, frame: number, layer: string) =>
  `forge/held/${archive}_${record}-${frame}_${layer}.png`;

/** A held thing's own layer with the hands laid over it in the gauntlets worn, the hands dyed as the fists' are (a
 *  set in its own colours keeps them). `own` is painted by the caller. Null where either layer is missing, or the two
 *  differ in size. */
async function withHands(
  source: FrameSource,
  ownPath: string | readonly string[],
  handsAt: (look: string) => string,
  hands: string | null,
  paintOwn: (strip: Strip) => Uint8Array | Promise<Uint8Array>,
): Promise<{ width: number; height: number; pixels: Uint8Array } | null> {
  const [own, over] = await Promise.all([
    firstOf(source, typeof ownPath === 'string' ? [ownPath] : ownPath),
    firstOf(
      source,
      looksAsked(hands, false).map((look) => handsAt(`Hands${look ?? ''}`)),
    ),
  ]);
  if (!own || !over || own.strip.width !== over.strip.width || own.strip.height !== over.strip.height) return null;
  const pixels = await paintOwn(own.strip);
  layOver(pixels, await paintSet(source, over.strip, hands, 'Steel'));
  return { width: own.strip.width, height: own.strip.height, pixels };
}

/** Each gun's name among the forge's held layers. */
const GUN_ARCHIVE = { thunderlock: 'THUNDERLOCK', pistolet: 'PISTOLET' } as const;
/** A gun's sprint, its carry at a run, sits this far under the screen's foot so the stride's dip never shows its cut. */
const CARRY_SUNK = 4;

/** A gun's frame (`record` 0 its shot, 1 its carry at a run): the gun as drawn, plain or gilded, under the hands in the
 *  gauntlets worn. It sits flush in the screen's bottom right corner, sunk a little below its foot. */
export async function gunPicture(
  source: FrameSource,
  shooter: Shooter,
  hands: string | null,
  record: number,
  frame: number,
): Promise<Picture | null> {
  // A crossbow is drawn as a gun is only in its carry at a run: its own archive's first record, a model a metal.
  if (shooter.kind === 'crossbow' && record !== 1) return null;
  const [archive, own, layer] =
    shooter.kind === 'crossbow'
      ? (['CROSSBOW', 0, `Crossbow${forgeName(crossbowMetal(shooter.metal))}`] as const)
      : ([GUN_ARCHIVE[shooter.kind], record, shooter.gilded ? 'GunGilded' : 'Gun'] as const);
  const ownPath = heldPath(archive, own, frame, layer);
  const laid = await withHands(source, ownPath, (look) => heldPath(archive, own, frame, look), hands, hardened);
  if (!laid) return null;
  const sunk = record === 1 ? CARRY_SUNK : SHOOTER_FEEL[shooter.kind].sunk;
  return { ...laid, at: [DESIGN_WIDTH - laid.width, DESIGN_HEIGHT - laid.height + sunk] };
}

/** The healing flask's frames over a drink: brought up, raised before the face, tipped up at the lips, lowered. */
export const FLASK_FRAMES = 4;

/** The healing flask in the right hand at the drink's frame `frame`, the hand round its neck in the gauntlets worn. Its
 *  colours are its own, its draught's red undyed. It sits flush in the screen's bottom right corner. */
export async function flaskPicture(source: FrameSource, hands: string | null, frame: number): Promise<Picture | null> {
  const handsAt = (look: string) => heldPath('FLASK', 0, frame, look);
  const laid = await withHands(source, handsAt('Flask'), handsAt, hands, hardened);
  return laid && { ...laid, at: [DESIGN_WIDTH - laid.width, DESIGN_HEIGHT - laid.height] };
}

/** A crossbow's strip: seven cells side by side, each the owner's frame at its top left with the stock carried on past
 *  its right and bottom edges. */
const CROSSBOW = { cells: 7, cellWidth: 282, cellHeight: 204, frameWidth: 218, frameHeight: 156 } as const;
/** The metals a crossbow is made in, each its own model and colours; any other metal is drawn as steel. */
const CROSSBOW_METALS = new Set(['iron', 'steel', 'silver', 'elven', 'dwarven', 'mithril']);

/** A crossbow's strip by its metal, or its pair's: the same cycle drawn farther off and across, for one of two. */
const crossbowMetal = (metal: string | null) => {
  const name = metal?.toLowerCase() ?? '';
  return CROSSBOW_METALS.has(name) ? name : 'steel';
};

export function crossbowPath(metal: string | null, pair: boolean): string {
  return `@art/crossbow/crossbow-${crossbowMetal(metal)}${pair ? '-pair' : ''}.png`;
}

/** A crossbow's frame, undyed. Its rest frame's drawn box sits flush in the screen's bottom right corner, and every
 *  frame lies where that puts it, so what runs on past the frame hangs past the screen's edges. */
export async function crossbowPicture(
  source: FrameSource,
  shooter: Shooter,
  frame: number,
  pair: boolean,
): Promise<Picture | null> {
  const strip = await source.strip(crossbowPath(shooter.metal, pair));
  if (!strip || strip.width < CROSSBOW.cells * CROSSBOW.cellWidth || strip.height < CROSSBOW.cellHeight) return null;
  const rest = drawnBox(cropped(strip, 0, 0, CROSSBOW.frameWidth, CROSSBOW.frameHeight));
  if (!rest) return null;
  const cell = cropped(strip, frame * CROSSBOW.cellWidth, 0, CROSSBOW.cellWidth, CROSSBOW.cellHeight);
  const corner = [DESIGN_WIDTH - rest.x - rest.width, DESIGN_HEIGHT - rest.y - rest.height] as const;
  return { width: cell.width, height: cell.height, pixels: hardened(cell), at: corner };
}

/** The forge's archive for the torch and the lantern, each its own record. */
const LIGHT_ARCHIVE = 112359;
const LIGHT = { torch: { record: 0, layer: 'Torch' }, lantern: { record: 1, layer: 'Lantern' } } as const;
/** The frames each light's flame plays through, and each shield's from raised to lowered. */
export const LIGHT_FRAMES = 4;
export const SHIELD_FRAMES = 5;

/**
 * Where the left hand's things lie on the screen, our own placement: the lower left, the mirror of the weapon side,
 * a texel a design pixel. The torch's arm leaves through its foot, across from where a dagger's does; the lantern's
 * arm and a shield's leave through their left edge, so those sit flush to it, and every foot is on the screen's.
 */
const TORCH_LEFT = 4;

/** A light in the left hand at its flame's frame `frame`, the hand that holds it in the gauntlets worn. */
export async function lightPicture(
  source: FrameSource,
  light: 'torch' | 'lantern',
  hands: string | null,
  frame: number,
): Promise<Picture | null> {
  const { record, layer } = LIGHT[light];
  const ownPath = heldPath(LIGHT_ARCHIVE, record, frame, layer);
  const handsAt = (look: string) => heldPath(LIGHT_ARCHIVE, record, 0, look);
  const laid = await withHands(source, ownPath, handsAt, hands, (strip) => source.painter.paint(strip, null));
  if (!laid) return null;
  return { ...laid, at: [light === 'torch' ? TORCH_LEFT : 0, DESIGN_HEIGHT - laid.height] };
}

/** A shield of the forge's kind `archive` in its metal's make (the plain wooden shield where none is drawn), dyed by
 *  its metal, at frame `frame` from raised (0) to lowered, the hand on its grip in the gauntlets worn. A faction's
 *  shield is covered whole by its colour, laid by the light of the forge's shield `layer`, as the figure's is. */
export async function shieldPicture(
  source: FrameSource,
  archive: number,
  metal: string | null,
  hands: string | null,
  frame: number,
  layer: string | null = null,
): Promise<Picture | null> {
  const makes = [
    ...(metal ? [heldPath(archive, 0, frame, `Shield${metal}`)] : []),
    heldPath(archive, 0, frame, 'Shield'),
  ];
  const handsAt = (look: string) => heldPath(archive, 0, frame, look);
  const own = source.own?.left;
  const covers = own && layer ? await pieceCover(source, layer) : null;
  const paint = (strip: Strip) => source.painter.paint(strip, own ?? metalRamp(source.dyes, metal), covers);
  const laid = await withHands(source, makes, handsAt, hands, paint);
  return laid && { ...laid, at: [0, DESIGN_HEIGHT - laid.height] };
}
