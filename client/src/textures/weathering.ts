// What weathers a painted face: moss in the joints, ivy and its leaves, drips, grime toward the foot, and cracks.
import { fbm, speckle, stream, type Stream } from './noise.ts';
import { cos, pow, sin } from './portableMath.ts';
import { ellipse, stroke, type Surface } from './surface.ts';

/** Moss in the hollows: a place lower than `below` under a patch of noise past `joints`, or anywhere under a patch
 *  past `amount`, turns mossy. */
export function moss(
  surf: Surface,
  options: { material: number; seed: number; below: number; joints: number; amount: number },
): void {
  const seed = options.seed;
  surf.each((x, y, i) => {
    const patch = fbm(seed, x, y, surf.width, surf.height, { cells: 3, octaves: 4 });
    const low = surf.relief[i] < options.below;
    if (!((low && patch > 1 - options.joints) || patch > 1 - options.amount)) return;
    surf.material[i] = options.material;
    surf.tone[i] = 0.35 + (patch - 0.5) * 0.5 + speckle(seed, x, y) * 0.12;
    surf.relief[i] += 0.3;
  });
}

/** Ivy climbing from the foot at `x`: `stems` stems spread `spread` either side, reaching `reach` texels up, a leaf
 *  at a share `leaves` of their steps, `leafSize` large and fanned `fan` texels out. */
export interface IvyOptions {
  material: number;
  stemMaterial: number;
  seed: number;
  x: number;
  stems: number;
  spread: number;
  reach: number;
  leaves: number;
  leafSize: number;
  fan: number;
}

/** Ivy: stems that wander up and leaves along them. */
export function ivy(surf: Surface, options: IvyOptions): void {
  const rng = stream(options.seed);
  for (let k = 0; k < options.stems; k++) {
    let x = options.x + rng.range(-options.spread, options.spread);
    let y = surf.height - 1;
    const top = Math.max(0, surf.height - options.reach * rng.range(0.65, 1));
    while (y > top) {
      const nextX = x + rng.range(-1.2, 1.2);
      const nextY = y - rng.range(1, 2.5);
      stroke(x, y, nextX, nextY, 1, 1, (placeX, placeY) =>
        surf.put(placeX, placeY, { material: options.stemMaterial, tone: 0.18, bump: 0.4 }),
      );
      const fan = options.fan;
      if (rng.next() < options.leaves)
        leaf(
          surf,
          nextX + rng.range(-fan, fan),
          nextY + rng.range(-2, 2),
          rng.range(1.4, 2.6) * options.leafSize,
          options.material,
          rng,
        );
      x = nextX;
      y = nextY;
    }
  }
}

/** One leaf, a little lit dome widest a third of the way along and coming to a point. */
function leaf(surf: Surface, midX: number, midY: number, radius: number, material: number, rng: Stream): void {
  const tone = rng.range(0.38, 0.58);
  const angle = rng.range(-Math.PI, Math.PI) * 0.45 + (rng.next() < 0.5 ? 0 : Math.PI);
  const cosA = cos(angle);
  const sinA = sin(angle);
  const len = radius * 1.5;
  const wid = radius * 0.95;
  ellipse(midX, midY, len, len, (x, y) => {
    const offsetX = x + 0.5 - midX;
    const offsetY = y + 0.5 - midY;
    // u runs stalk (-1) to tip (+1), v across
    const relU = (offsetX * cosA + offsetY * sinA) / len;
    const relV = (-offsetX * sinA + offsetY * cosA) / wid;
    const half = pow(Math.max(0, 1 - relU * relU), 0.7) * (1 - Math.max(0, relU) * 0.35);
    if (Math.abs(relV) > half || relU < -0.95) return;
    const side = relV * Math.sign(sinA || 1);
    const vein = Math.abs(relV) < 0.1 * half + 0.06 ? -0.12 : 0;
    surf.put(x, y, {
      material,
      tone: tone + (side < 0 ? 0.12 : -0.1) + vein - (Math.abs(relV) / (half || 1)) * 0.08,
      relief: (1 - Math.abs(relV)) * 2 + 2,
    });
  });
}

/** Drips running down from the joints: `count` streaks of `material` up to `len` texels long, `size` wide. */
export function drips(
  surf: Surface,
  options: { material: number; seed: number; count: number; len: number; size?: number },
): void {
  const rng = stream(options.seed);
  const material = options.material;
  for (let k = 0; k < options.count; k++) {
    const x = Math.floor(rng.next() * surf.width);
    let y = Math.floor(rng.next() * surf.height);
    for (let step = 0; step < 30 && surf.relief[surf.idx(x, y)] > -0.1; step++) y++;
    const len = 2 + rng.int(options.len);
    const w = rng.range(1.2, 2.2) * (options.size ?? 1);
    const tone = rng.range(0.45, 0.65);
    ellipse(x + 0.5, y + 0.5, w * 1.2, w * 0.8, (placeX, placeY) =>
      surf.put(placeX, placeY, { material, tone, bump: 0.8 }),
    );
    stroke(x + 0.5, y + 0.5, x + 0.5 + rng.range(-0.4, 0.4), y + 1 + len, w, w * 0.6, (placeX, placeY, along) =>
      surf.put(placeX, placeY, { material, tone: tone - along * 0.1, bump: 0.6 }),
    );
    if (rng.next() < 0.5)
      ellipse(x + 0.5, y + len + 1.5, w * 0.7, w * 0.8, (placeX, placeY) =>
        surf.put(placeX, placeY, { material, tone: tone + 0.05, bump: 0.8 }),
      );
  }
}

/** Grime: tone pulled down toward the foot (`foot` there) and in blotches (`blot`). */
export function grime(surf: Surface, options: { seed: number; foot: number; blot: number }): void {
  surf.each((x, y, i) => {
    const blotch = fbm(options.seed, x, y, surf.width, surf.height, { cells: 3, octaves: 4 });
    const down = y / surf.height;
    surf.tone[i] -= down * down * options.foot + Math.max(0, blotch - 0.6) * options.blot;
  });
}

/** Cracks: `count` wandering dark lines of eighteen steps each. */
export function cracks(surf: Surface, options: { seed: number; count: number }): void {
  const rng = stream(options.seed);
  for (let k = 0; k < options.count; k++) {
    let x = rng.next() * surf.width;
    let y = rng.next() * surf.height;
    let angle = rng.next() * Math.PI * 2;
    for (let step = 0; step < 18; step++) {
      const nextX = x + cos(angle);
      const nextY = y + sin(angle);
      stroke(x, y, nextX, nextY, 0.9, 0.9, (placeX, placeY) => {
        const i = surf.idx(placeX, placeY);
        surf.tone[i] -= 0.22;
        surf.relief[i] -= 0.7;
      });
      angle += rng.range(-0.7, 0.7);
      x = nextX;
      y = nextY;
    }
  }
}
