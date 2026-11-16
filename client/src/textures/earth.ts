// The ground's own layers: grass blades, pebbles and stones, and water. Blades and stones lie over a ground already
// painted, only on its own material and where the mask lets them.
import { fbm, speckle, stream, wrap } from './noise.ts';
import { cos, sin } from './portableMath.ts';
import type { Mask } from './stone.ts';
import { box, ellipse, stroke, type Surface } from './surface.ts';

/** Grass blades: `density` a texel, leaning within `lean`, up to `length` long, half `dark` and half `light`; with
 *  `clumps` (a 1,000 texels) they stand in tufts `spread` texels across. */
export interface GrassOptions {
  material: number;
  seed: number;
  density: number;
  mask?: Mask;
  lean?: readonly [number, number];
  dark?: number;
  light?: number;
  clumps?: number;
  spread?: number;
  length?: number;
}

/** Grass blades, short dark and light strokes, over a sward already painted. */
export function grass(surf: Surface, options: GrassOptions): void {
  const seed = options.seed;
  const rng = stream(seed + 5);
  const area = surf.width * surf.height;
  const n = Math.round((area * options.density) / 4);
  const tufts = Array.from({ length: Math.round((area * (options.clumps ?? 0)) / 1000) }, () => [
    rng.next() * surf.width,
    rng.next() * surf.height,
  ]);
  for (let k = 0; k < n; k++) {
    let x = rng.next() * surf.width;
    let y = rng.next() * surf.height;
    if (tufts.length) {
      const [midX, midY] = tufts[k % tufts.length];
      const angle = rng.next() * Math.PI * 2;
      const dist = Math.sqrt(rng.next()) * (options.spread ?? 2.5);
      x = wrap(midX + cos(angle) * dist, surf.width);
      y = wrap(midY + sin(angle) * dist * 0.7, surf.height);
    }
    if (options.mask && !options.mask(x, y)) continue;
    const [leanLeast, leanMost] = options.lean ?? [-0.6, 0.6];
    const len = 1 + rng.next() * (options.length ?? 2.5);
    const lean = rng.range(leanLeast, leanMost);
    const shift = rng.next() < 0.5 ? -(options.dark ?? 0.16) : (options.light ?? 0.14);
    stroke(x, y, x + lean * len, y - len, 1, 0.8, (placeX, placeY, along) => {
      const i = surf.idx(placeX, placeY);
      if (surf.material[i] !== options.material) return;
      surf.tone[i] += shift * (1 - along * 0.6);
      surf.relief[i] += 0.3;
    });
  }
}

/** Pebbles (`pebbles` a share of the texels) lit as little domes, `stones` a 1,000 texels standing proud with a
 *  shadow at their foot, and `specks` a 1,000 texels of single dark stones or holes. */
export function dirt(
  surf: Surface,
  options: { material: number; seed: number; mask: Mask; pebbles: number; stones?: number; specks?: number },
): void {
  const seed = options.seed;
  const own = (x: number, y: number, i: number): boolean => surf.material[i] === options.material && options.mask(x, y);
  const rng = stream(seed + 7);
  const area = surf.width * surf.height;
  const pebbles = Math.round((area * options.pebbles) / 3);
  for (let k = 0; k < pebbles; k++) {
    const midX = rng.next() * surf.width;
    const midY = rng.next() * surf.height;
    const radius = 0.8 + rng.next() * 1.4;
    const lift = rng.range(-0.1, 0.15);
    ellipse(midX, midY, radius * 1.2, radius, (x, y, relU, relV) => {
      const i = surf.idx(x, y);
      if (!own(x, y, i)) return;
      surf.relief[i] += (1 - relU * relU - relV * relV) * 1.8;
      surf.tone[i] += lift;
    });
  }
  const stones = Math.round((area * (options.stones ?? 0)) / 1000);
  for (let k = 0; k < stones; k++) {
    const midX = rng.next() * surf.width;
    const midY = rng.next() * surf.height;
    const radiusX = 1.2 + rng.next() * 1.3;
    const radiusY = radiusX * rng.range(0.55, 0.8);
    const lift = rng.range(0.16, 0.3);
    ellipse(midX + 0.7, midY + 0.9, radiusX, radiusY, (x, y) => {
      const i = surf.idx(x, y);
      if (!own(x, y, i)) return;
      const outX = (x - midX) / radiusX;
      const outY = (y - midY) / radiusY;
      if (outX * outX + outY * outY > 1) surf.tone[i] -= 0.16;
    });
    ellipse(midX, midY, radiusX, radiusY, (x, y, relU, relV) => {
      const i = surf.idx(x, y);
      if (!own(x, y, i)) return;
      const dome = Math.max(0, 1 - relU * relU - relV * relV);
      surf.relief[i] += dome * 2;
      surf.tone[i] += lift * (0.6 + 0.4 * dome) - (relU + relV) * 0.05;
    });
  }
  const specks = Math.round((area * (options.specks ?? 0)) / 1000);
  for (let k = 0; k < specks; k++) {
    const x = Math.floor(rng.next() * surf.width);
    const y = Math.floor(rng.next() * surf.height);
    const size = rng.next() < 0.3 ? 2 : 1;
    box(x, y, x + size, y + 1, (placeX, placeY) => {
      const i = surf.idx(placeX, placeY);
      if (!own(placeX, placeY, i)) return;
      surf.tone[i] -= 0.38;
      surf.relief[i] -= 0.4;
    });
  }
}

/** Water: a deep mottle about `base` swinging `amp`, bright crests where a stretched wave field runs high, `fine`
 *  its grain. It takes no light from relief. */
export function water(
  surf: Surface,
  options: { material: number; seed: number; mask: Mask; base: number; amp: number; fine: number },
): void {
  const seed = options.seed;
  surf.each((x, y, i) => {
    if (!options.mask(x, y)) return;
    const n = fbm(seed, x, y, surf.width, surf.height, { cells: 3, octaves: 5 });
    const wave = fbm(seed + 1, x, y, surf.width, surf.height, { cells: 3, octaves: 4, aspect: 5 });
    surf.material[i] = options.material;
    surf.tone[i] =
      options.base +
      (n - 0.5) * options.amp +
      (wave > 0.62 ? (wave - 0.62) * 1.2 : 0) -
      (wave < 0.32 ? 0.1 : 0) +
      speckle(seed, x, y) * options.fine;
    surf.relief[i] = 0;
    surf.flat[i] = 1;
  });
}
