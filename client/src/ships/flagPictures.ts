// The flags the ships fly: a picture a side, its side's ground over a faint weave and its faction's emblem, the one
// the plates show, in its middle at whole multiples of its pixels; then a picture each flag a player may dress their
// ship in, its ground and its device in its ink (`flagDevices.ts`); then one each emblem a player may wear, its sign
// on its own ground. A flag is half again as long as it is deep, and its picture square, so an emblem is drawn two
// texels a pixel across and three down to stand square on it, and a sign as wide again as it is tall.
import { EMBLEMS, emblemPixels as signPixels, SIGN_CELLS } from '../plus/emblemArt.ts';
import { emblemPixels } from '../plus/emblems.ts';
import { hash01 } from '../textures/noise.ts';
import type { Picture } from '../textures/picture.ts';
import { SHIP_PICTURE_TEXELS } from '../textures/shipPictures.ts';
import { type Colour, colourOf, DRESSES, SHIP_SIDES } from './dress.ts';
import { shapeInks, signInks } from './flagDevices.ts';
import { FLAG_DESIGNS } from './fleetDress.ts';

/** Texels an emblem's pixel takes across and down the flag's picture. */
const EMBLEM_TEXELS = [2, 3] as const;

/** One picture a side, in `SHIP_SIDES`' order, then one a flag design in `FLAG_DESIGNS`' and one an emblem in
 *  `EMBLEMS`': the same bytes every time, painted once. */
export function flagPictures(): readonly Picture[] {
  flags ??= [...sideFlags(), ...FLAG_DESIGNS.map(designFlag), ...EMBLEMS.map((unused, index) => emblemFlag(index))];
  return flags;
}
let flags: Picture[] | null = null;

/** The flag a picture layer flies (`Painted.flagLayer`), counted from the first flag's layer `first`; none past them. */
export function flagPicture(layer: number, first: number): Picture | null {
  return flagPictures()[layer - first] ?? null;
}

/** A flag picture's texels over a faint weave, each from `colourAt`, seeded by `seed`. */
function woven(seed: number, colourAt: (x: number, y: number) => Colour): Picture {
  const size = SHIP_PICTURE_TEXELS;
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const weave = 1 + ((x + y) & 1) * 0.03 + (hash01(seed, x, y) - 0.5) * 0.06;
      colourAt(x, y).forEach((channel, place) => {
        rgba[(y * size + x) * 4 + place] = Math.round(Math.min(1, channel * weave) * 255);
      });
      rgba[(y * size + x) * 4 + 3] = 255;
    }
  return { width: size, height: size, rgba, glass: null };
}

/** A design's flag: its ground, and its device in its ink. */
function designFlag(design: (typeof FLAG_DESIGNS)[number], index: number): Picture {
  const size = SHIP_PICTURE_TEXELS;
  const ground = colourOf(design.colour ?? '#2f5d9a');
  const ink = colourOf(design.ink ?? '#efe9dc');
  const device = design.device ?? '';
  return woven(7100 + index, (x, y) => {
    const inked = shapeInks(device, (x + 0.5) / size, (y + 0.5) / size) ?? signInks(device, x, y, size) ?? false;
    return inked ? ink : ground;
  });
}

/** An emblem's flag: its sign laid on the flag's middle, a sign's cell a texel and a third across and two down, on
 *  the colour its sign's frame stands on. */
function emblemFlag(emblem: number): Picture {
  const size = SHIP_PICTURE_TEXELS;
  const sign = EMBLEMS[emblem];
  const cells = sign ? signPixels(sign, 'sign') : new Uint8ClampedArray(SIGN_CELLS * SIGN_CELLS * 4);
  const cellAt = (cell: number): Colour => [
    (cells[cell * 4] ?? 0) / 255,
    (cells[cell * 4 + 1] ?? 0) / 255,
    (cells[cell * 4 + 2] ?? 0) / 255,
  ];
  // The sign stands 32 texels across and 48 down: square on the flag.
  const [across, down] = [32, 48];
  const [left, top] = [(size - across) >> 1, (size - down) >> 1];
  const ground = cellAt(SIGN_CELLS * (SIGN_CELLS >> 1) + 1);
  return woven(7300 + emblem, (x, y) => {
    if (x < left || x >= left + across || y < top || y >= top + down) return ground;
    const [column, row] = [Math.floor(((x - left) * SIGN_CELLS) / across), Math.floor(((y - top) * SIGN_CELLS) / down)];
    return cellAt(row * SIGN_CELLS + column);
  });
}

/** One picture a side, in `SHIP_SIDES`' order. */
function sideFlags(): Picture[] {
  return SHIP_SIDES.map((side, index) => {
    const size = SHIP_PICTURE_TEXELS;
    const dress = DRESSES[side];
    const rgba = new Uint8Array(size * size * 4);
    const paint = (x: number, y: number, colour: readonly number[]) => {
      const weave = 1 + ((x + y) & 1) * 0.03 + (hash01(7000 + index, x, y) - 0.5) * 0.06;
      colour.forEach((channel, place) => {
        rgba[(y * size + x) * 4 + place] = Math.round(Math.min(1, channel * weave) * 255);
      });
      rgba[(y * size + x) * 4 + 3] = 255;
    };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) paint(x, y, dress.flag);
    const emblem = dress.emblem === null ? null : emblemPixels(dress.emblem);
    if (emblem) {
      const [across, down] = EMBLEM_TEXELS;
      const width = (emblem.rows[0]?.length ?? 0) * across;
      const [left, top] = [(size - width) >> 1, (size - emblem.rows.length * down) >> 1];
      emblem.rows.forEach((row, pixelY) =>
        [...row].forEach((letter, pixelX) => {
          const tone = emblem.tones[letter];
          if (!tone) return;
          const shade = tinted(colourOf(tone), dress.emblemTint);
          for (let y = 0; y < down; y++)
            for (let x = 0; x < across; x++) paint(left + pixelX * across + x, top + pixelY * down + y, shade);
        }),
      );
    }
    return { width: size, height: size, rgba, glass: null };
  });
}

/** An emblem's tone on a flag that tints it: the tint, lighter or darker as the tone is, so its shading stays. */
function tinted(tone: Colour, tint: Colour | null): Colour {
  if (!tint) return tone;
  const light = 0.75 + (tone[0] + tone[1] + tone[2]) / 6;
  return [tint[0] * light, tint[1] * light, tint[2] * light];
}
