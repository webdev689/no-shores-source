// The Arts' birds as the forge draws them (tools/sprite-forge/artbirds.py): Dawnflare's bird of fire and Duskraven's
// raven, each in its four wing beats and the forge's five views, rendered as light alone and turned here into its element's four stops, so they
// show in whatever element their caster's Art is. Until a frame has come, the spells draw their own.
import { CLEAR, HOT, type Sprite, hashOf } from './spellPixels.ts';

export type ForgedBird = 'fire' | 'raven';

/** A forge picture as decoded: its texels' channels, row by row from the top. */
export interface Texels {
  readonly width: number;
  readonly height: number;
  readonly data: ArrayLike<number>;
}

/** Where a bird's beat in one of the forge's five views lies among its published pictures. */
export const birdPath = (bird: ForgedBird, view: number, beat: number) => `@art/arts/birds/${bird}-${view}-${beat}.png`;
/** The forge's views of a bird: facing the eye, turned to its left an eighth at a time to its back. */
const VIEWS = 5;

/** The light at which each stop above the dark begins: the body, the light and the white-hot. */
const CUTS = [0.3, 0.55, 0.8] as const;
/** A flame's outline takes one of this many patterns, in turn. */
const FLICKERS = 8;

/** A forge frame as cells: a texel at least half covered takes the stop its light falls in; any other, none. */
export function spriteOfTexels(texels: Texels): Sprite {
  const cells = new Int8Array(texels.width * texels.height);
  for (let cell = 0; cell < cells.length; cell++) {
    const light = (texels.data[cell * 4] ?? 0) / 255;
    const cover = (texels.data[cell * 4 + 3] ?? 0) / 255;
    cells[cell] = cover < 0.5 ? CLEAR : CUTS.filter((cut) => light >= cut).length;
  }
  return { width: texels.width, height: texels.height, cells };
}

/** The cells on a sprite's outline: drawn, with a side on nothing. */
function outlineOf(picture: Sprite): number[] {
  const { width, height, cells } = picture;
  const drawn = (column: number, row: number) =>
    column >= 0 && row >= 0 && column < width && row < height && (cells[row * width + column] ?? CLEAR) !== CLEAR;
  const out: number[] = [];
  for (let row = 0; row < height; row++)
    for (let column = 0; column < width; column++)
      if (
        drawn(column, row) &&
        !(drawn(column - 1, row) && drawn(column + 1, row) && drawn(column, row - 1) && drawn(column, row + 1))
      )
        out.push(row * width + column);
  return out;
}

/** A sprite whose outline flickers in pattern `flicker`, as a flame's or a light's does: a few of its cells gone, a few
 *  lit a step higher. */
export function flickered(picture: Sprite, outline: readonly number[], flicker: number): Sprite {
  const cells = picture.cells.slice();
  for (const index of outline) {
    const chance = hashOf(flicker, index);
    if (chance < 0.15) cells[index] = CLEAR;
    else if (chance < 0.4) cells[index] = Math.min(HOT, (cells[index] ?? 0) + 1);
  }
  return { ...picture, cells };
}

const frames = new Map<string, { readonly picture: Sprite; readonly outline: readonly number[] }>();
const shown = new Map<string, Sprite>();

/** Fetches every bird's beats from the forge's published pictures through `strip`; one that never comes leaves that
 *  bird drawn as its spell draws it. */
export function loadForgedBirds(strip: (path: string) => Promise<Texels | null>): void {
  for (const bird of ['fire', 'raven'] as const)
    for (let view = 0; view < VIEWS; view++)
      for (let beat = 0; beat < 4; beat++)
        strip(birdPath(bird, view, beat))
          .then((texels) => {
            if (!texels) return;
            const picture = spriteOfTexels(texels);
            frames.set(`${bird}-${view}-${beat}`, { picture, outline: outlineOf(picture) });
          })
          .catch(() => undefined);
}

/** A bird in a forge view (`viewOf`'s, 0 to 4) at beat `beat` (0 to 3: up, half, down, half) as the forge draws it,
 *  its outline flickering afresh at each `strike`; null until that frame has come. */
export function forgedBird(bird: ForgedBird, view: number, beat: number, strike: number): Sprite | null {
  const beatShown = ((beat % 4) + 4) % 4;
  const frame = frames.get(`${bird}-${view}-${beatShown}`);
  if (!frame) return null;
  const flicker = ((Math.floor(strike) % FLICKERS) + FLICKERS) % FLICKERS;
  const key = `${bird}-${view}-${beatShown}-${flicker}`;
  const kept = shown.get(key);
  if (kept) return kept;
  const made = flickered(frame.picture, frame.outline, flicker);
  shown.set(key, made);
  return made;
}
