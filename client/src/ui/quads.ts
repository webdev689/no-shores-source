// The interface as the GPU draws it: one list of quads a frame, each a rectangle in device pixels with its colour, a
// rectangle of the atlas it shows (stretched over it, or tiled at a texel's size), and the rectangle it is clipped to,
// drawn in one instanced draw (`uiShader.ts`); a turned quad is clipped by the pixel instead.

/** A colour, its four channels 0 to 1, not premultiplied. */
export type Colour = readonly [number, number, number, number];

/** A rectangle: its left, top, width and height. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Floats a quad takes: its box, its atlas rectangle, its colour, its clip and its tiling. */
export const QUAD_FLOATS = 20;

/** No clip: a box wider than any screen. */
export const UNCLIPPED: Box = { x: -1e6, y: -1e6, width: 2e6, height: 2e6 };

/** Colours read, by what they were written as: each is parsed once, not at every glyph and frame. */
const colours = new Map<string, Colour>();
/** shortcut: emptied whole at this many, as colours written afresh each frame would grow it without end; drop the
 *  least used instead if a page's colours ever number near it. */
const MOST_COLOURS = 1024;

/** A CSS colour as the kit writes them: `#rgb`, `#rrggbb` or `rgba(r, g, b, a)`. */
export function colourOf(css: string): Colour {
  const known = colours.get(css);
  if (known) return known;
  const read = parsed(css);
  if (colours.size >= MOST_COLOURS) colours.clear();
  colours.set(css, read);
  return read;
}

function parsed(css: string): Colour {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(css)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex;
    const channel = (from: number) => Number.parseInt(full.slice(from, from + 2), 16) / 255;
    return [channel(0), channel(2), channel(4), 1];
  }
  const rgba = /^rgba?\(([^)]+)\)$/i.exec(css)?.[1];
  if (!rgba) throw new Error(`not a colour the kit writes: ${css}`);
  const [red = 0, green = 0, blue = 0, alpha = 1] = rgba.split(',').map((part) => Number.parseFloat(part));
  return [red / 255, green / 255, blue / 255, alpha];
}

/** An atlas rectangle a quad shows: its texels on its layer, and, tiled, the device pixels a texel covers. */
export interface Texels extends Box {
  readonly tile?: number;
  readonly layer?: number;
}

/** A frame's quads, grown as they are added and handed whole to the GPU. */
export class QuadList {
  private floats = new Float32Array(QUAD_FLOATS * 256);
  count = 0;

  /** Starts a frame. */
  clear(): void {
    this.count = 0;
  }

  /** The quads added this frame. */
  get data(): Float32Array {
    return this.floats.subarray(0, this.count * QUAD_FLOATS);
  }

  /** `box` filled with `colour`, showing `texels` of the atlas where given, inside `clip`, turned `turn` radians
   *  clockwise about its middle. */
  add(box: Box, colour: Colour, clip: Box = UNCLIPPED, texels?: Texels, turn = 0): void {
    if (box.width <= 0 || box.height <= 0 || colour[3] <= 0) return;
    if ((this.count + 1) * QUAD_FLOATS > this.floats.length) {
      const grown = new Float32Array(this.floats.length * 2);
      grown.set(this.floats);
      this.floats = grown;
    }
    // Every glyph and box of the interface every frame: written in place, in the order the shader reads them.
    const [floats, start] = [this.floats, this.count * QUAD_FLOATS];
    floats[start] = box.x;
    floats[start + 1] = box.y;
    floats[start + 2] = box.width;
    floats[start + 3] = box.height;
    floats[start + 4] = texels?.x ?? 0;
    floats[start + 5] = texels?.y ?? 0;
    floats[start + 6] = texels?.width ?? 0;
    floats[start + 7] = texels?.height ?? 0;
    floats[start + 8] = colour[0];
    floats[start + 9] = colour[1];
    floats[start + 10] = colour[2];
    floats[start + 11] = colour[3];
    floats[start + 12] = clip.x;
    floats[start + 13] = clip.y;
    floats[start + 14] = clip.x + clip.width;
    floats[start + 15] = clip.y + clip.height;
    floats[start + 16] = texels?.tile ?? 0;
    floats[start + 17] = texels?.layer ?? 0;
    floats[start + 18] = turn;
    floats[start + 19] = 0;
    this.count += 1;
  }
}
