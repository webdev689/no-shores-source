// Smooth faces: plaster and render, trowelled plaster, marble and tiles. Each paints a box of a surface (all of it
// by default) from periodic noise, so it tiles with no seam.
import { clamp01, fbm, hash01, ridged, smooth, speckle, stream, worley, wrap } from './noise.ts';
import { cos, pow, sin } from './portableMath.ts';
import { mottle, type Mask } from './stone.ts';
import { areaOf, ellipse, stroke, type Box, type Surface } from './surface.ts';

/** Plaster: a mottle about `base`, `amp` its swing, `bump` its lumps, `fine` its grain; `rough` a pebbly stucco,
 *  `patches` soft lighter patches, `pits` the share of small slanted hollows of a rough cast, `pitSize` their size. */
export interface PlasterOptions {
  material: number;
  seed: number;
  base: number;
  amp: number;
  bump: number;
  fine: number;
  pits: number;
  pitSize?: number;
  rough?: number;
  patches?: number;
}

export function plaster(surf: Surface, options: PlasterOptions, box?: Box): void {
  const seed = options.seed;
  mottle(
    surf,
    {
      seed,
      material: options.material,
      base: options.base,
      amp: options.amp,
      bump: options.bump,
      cells: 3,
      octaves: 6,
      fine: options.fine,
    },
    box,
  );
  const area = areaOf(surf, box);
  surf.each(
    (x, y, i) => {
      if (options.rough) {
        const cell = worley(
          seed + 11,
          x,
          y,
          surf.width,
          surf.height,
          Math.round(surf.width / 5),
          Math.round(surf.height / 5),
          1,
        );
        surf.relief[i] += (1 - clamp01(cell.nearest / 3.2)) * options.rough;
        surf.tone[i] += (hash01(seed, cell.id) - 0.5) * 0.1;
      }
      if (options.patches) {
        // soft lighter patches a few texels across, faintly raised, as a lime render dries unevenly
        const lift = smooth(0.54, 0.66, fbm(seed + 17, x, y, surf.width, surf.height, { cells: 5, octaves: 3 }));
        surf.tone[i] += lift * options.patches;
        surf.relief[i] += lift * 0.7;
      }
    },
    area.x0,
    area.y0,
    area.x1,
    area.y1,
  );
  // each pit dark on its upper side and lit on its lower, as the light falls into it from the top left
  const rng = stream(seed + 23);
  const n = Math.round(((area.x1 - area.x0) * (area.y1 - area.y0) * options.pits) / 12);
  const size = options.pitSize ?? 1;
  for (let k = 0; k < n; k++) {
    const midX = area.x0 + rng.next() * (area.x1 - area.x0);
    const midY = area.y0 + rng.next() * (area.y1 - area.y0);
    const len = rng.range(1.4, 3) * size;
    const wid = rng.range(0.7, 1.3) * size;
    const angle = rng.range(0.5, 1.2) * (rng.next() < 0.7 ? 1 : -1);
    const cosA = cos(angle);
    const sinA = sin(angle);
    ellipse(midX, midY, len + 1, len + 1, (placeX, placeY) => {
      const i = surf.idx(placeX, placeY);
      if (surf.material[i] !== options.material) return;
      const offsetX = placeX + 0.5 - midX;
      const offsetY = placeY + 0.5 - midY;
      const along = (offsetX * cosA + offsetY * sinA) / len;
      const across = (-offsetX * sinA + offsetY * cosA) / wid;
      const dist = along * along + across * across;
      if (dist > 1) return;
      surf.relief[i] -= (1 - dist) * 1.8;
      surf.tone[i] -= (1 - dist) * 0.1;
    });
  }
}

/** Trowelled plaster: a cloudy ground (`cloud` its swing, about `cells` patches across, `texel` its grain) under
 *  `count` light smears a 1,000 texels, `wid` wide and `amp` light; `mask` keeps it to some places. */
export interface TrowelOptions {
  material: number;
  seed: number;
  count: number;
  cloud: number;
  cells?: number;
  texel?: number;
  wid?: number;
  amp?: number;
  mask?: Mask;
}

/** Trowelled plaster: each smear a tapered stroke, most slanting one way or the other, standing a little proud so the
 *  light leaves a shadow under it. */
export function trowel(surf: Surface, options: TrowelOptions, box?: Box): void {
  const area = areaOf(surf, box);
  const seed = options.seed;
  const own = (x: number, y: number): boolean => !options.mask || options.mask(x, y);
  surf.each(
    (x, y, i) => {
      if (!own(x, y)) return;
      const cloud = fbm(seed, x, y, surf.width, surf.height, { cells: options.cells ?? 9, octaves: 4 });
      surf.material[i] = options.material;
      surf.tone[i] = 0.5 + (cloud - 0.5) * options.cloud + (hash01(seed + 1, x, y) - 0.5) * (options.texel ?? 0.12);
      surf.relief[i] = (cloud - 0.5) * 0.5;
    },
    area.x0,
    area.y0,
    area.x1,
    area.y1,
  );
  const rng = stream(seed + 2);
  const count = Math.round(((area.x1 - area.x0) * (area.y1 - area.y0) * options.count) / 1000);
  for (let k = 0; k < count; k++) {
    const startX = area.x0 + rng.next() * (area.x1 - area.x0);
    const startY = area.y0 + rng.next() * (area.y1 - area.y0);
    const angle = (rng.next() < 0.5 ? -0.7 : 0.6) + rng.range(-0.5, 0.5);
    const len = rng.range(4, 12);
    const wid = rng.range(1.2, 2.6) * (options.wid ?? 2.2);
    const bend = rng.range(-0.5, 0.5);
    const lift = rng.range(0.25, 0.45) * (options.amp ?? 1);
    const midX = startX + (cos(angle) * len) / 2;
    const midY = startY + (sin(angle) * len) / 2;
    const endX = midX + (cos(angle + bend) * len) / 2;
    const endY = midY + (sin(angle + bend) * len) / 2;
    const paint = (placeX: number, placeY: number, _along: number, across: number): void => {
      const i = surf.idx(placeX, placeY);
      if (!own(placeX, placeY) || surf.material[i] !== options.material) return;
      const core = 1 - Math.abs(across);
      surf.tone[i] = Math.max(surf.tone[i], 0.5 + lift * (0.5 + 0.5 * core));
      surf.relief[i] += core * 0.8;
    };
    stroke(startX, startY, midX, midY, wid * 0.4, wid, paint);
    stroke(midX, midY, endX, endY, wid, wid * 0.3, paint);
  }
}

/** Marble: a cloudy ground about `base` swinging `amp`, veins along a warped ridge `veins` strong, `sharp` thin,
 *  dark veins with `dark`. */
export interface MarbleOptions {
  material: number;
  seed: number;
  base: number;
  amp: number;
  veins: number;
  sharp: number;
  dark?: boolean;
}

export function marble(surf: Surface, options: MarbleOptions, box?: Box): void {
  const area = areaOf(surf, box);
  const seed = options.seed;
  surf.each(
    (x, y, i) => {
      const cloud = fbm(seed, x, y, surf.width, surf.height, { cells: 2, octaves: 5 });
      const warpX = x + (fbm(seed + 1, x, y, surf.width, surf.height, { cells: 2, octaves: 3 }) - 0.5) * 18;
      const warpY = y + (fbm(seed + 2, x, y, surf.width, surf.height, { cells: 2, octaves: 3 }) - 0.5) * 18;
      const ridge = ridged(seed + 3, wrap(warpX, surf.width), wrap(warpY, surf.height), surf.width, surf.height, {
        cells: 2,
        octaves: 4,
      });
      const vein = pow(ridge, options.sharp);
      surf.material[i] = options.material;
      surf.tone[i] =
        options.base +
        (cloud - 0.5) * options.amp +
        vein * options.veins * (options.dark ? -1 : 1) +
        speckle(seed, x, y) * 0.025;
      surf.relief[i] = (cloud - 0.5) * 0.25;
    },
    area.x0,
    area.y0,
    area.x1,
    area.y1,
  );
}

/** Two by two tiles over the box with `gap` joints of `grout` toned `groutTone`, each bevelled and raised `relief`. */
export function tiles(
  surf: Surface,
  options: { gap: number; grout: number; groutTone: number; relief: number },
  box?: Box,
): void {
  const area = areaOf(surf, box);
  const tileW = (area.x1 - area.x0) / 2;
  const tileH = (area.y1 - area.y0) / 2;
  const gap = options.gap;
  surf.each(
    (x, y, i) => {
      const placeX = x - area.x0 + 0.5;
      const placeY = y - area.y0 + 0.5;
      const inX = placeX - Math.floor(placeX / tileW) * tileW;
      const inY = placeY - Math.floor(placeY / tileH) * tileH;
      const inset = Math.min(inX, tileW - inX, inY, tileH - inY);
      if (inset < gap * 0.5 + 0.2) {
        surf.material[i] = options.grout;
        surf.tone[i] = options.groutTone;
        surf.relief[i] = -0.4;
        return;
      }
      surf.relief[i] += smooth(gap * 0.5, gap * 0.5 + 1.5, inset) * options.relief;
    },
    area.x0,
    area.y0,
    area.x1,
    area.y1,
  );
}
