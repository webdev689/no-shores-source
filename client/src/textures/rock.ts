// Rock as a pick cuts it or as water leaves it: hewn faces scarred by chips and pick marks, layered sediment, faces
// fractured into planes, mineral veins, damp seeps, loose stones, stalactite stubs and a rounded ledge. Each paints
// from periodic noise or wraps its strokes, so a face tiles with no seam. Light is laid later.
import { clamp01, fbm, hash01, smooth, speckle, stream, worley, wrap, type Stream } from './noise.ts';
import { cos, pow, sin } from './portableMath.ts';
import { box, ellipse, stroke, type Surface } from './surface.ts';

/** A hewn face: chip scars `across` by `down` cells, each a scoop `depth` deep tilted its own way, toned about
 *  `base`; `marks` groups of pick marks, three to five parallel gouges each about `len` long at about `angle`. */
export interface HewnOptions {
  material: number;
  seed: number;
  across: number;
  down: number;
  marks: number;
  base?: number;
  toneVar?: number;
  depth?: number;
  len?: number;
  angle?: number;
}

/** A face hewn by picks: shallow chip scars meeting at sharp ridges, and the gouges the pick left in rows. */
export function hewn(surf: Surface, options: HewnOptions): void {
  const seed = options.seed;
  const depth = options.depth ?? 1.2;
  const tilt = depth * 0.12;
  surf.each((x, y, i) => {
    const warpX = x + (fbm(seed + 1, x, y, surf.width, surf.height, { cells: 4, octaves: 2 }) - 0.5) * 3;
    const warpY = y + (fbm(seed + 2, x, y, surf.width, surf.height, { cells: 4, octaves: 2 }) - 0.5) * 3;
    const wrapX = wrap(warpX, surf.width);
    const wrapY = wrap(warpY, surf.height);
    const cell = worley(seed, wrapX, wrapY, surf.width, surf.height, options.across, options.down, 0.95);
    // 0 at the scar's deepest point, 1 on the ridge where it meets the next
    const rel = clamp01((2 * cell.nearest) / Math.max(0.5, cell.nearest + cell.second));
    const slopeX = (hash01(seed, cell.id, 1) - 0.5) * 2 * tilt;
    const slopeY = (hash01(seed, cell.id, 2) - 0.3) * 2 * tilt;
    const cloud = fbm(seed + 3, x, y, surf.width, surf.height, { cells: 4, octaves: 4 });
    surf.material[i] = options.material;
    surf.tone[i] =
      (options.base ?? 0.5) +
      (hash01(seed, cell.id, 5) - 0.5) * 2 * (options.toneVar ?? 0.12) +
      (cloud - 0.5) * 0.2 +
      (rel > 0.85 ? (rel - 0.85) * 0.8 : 0) +
      speckle(seed + 4, x, y) * 0.07;
    surf.relief[i] =
      (rel * rel - 1) * depth +
      slopeX * (wrapX + 0.5 - cell.pointX) +
      slopeY * (wrapY + 0.5 - cell.pointY) +
      (cloud - 0.5) * 0.4;
  });
  const rng = stream(seed + 7);
  for (let group = 0; group < options.marks; group++) pickMarks(surf, options, rng);
}

/** One group of pick marks: parallel gouges side by side, deepest where the pick went in. */
function pickMarks(surf: Surface, options: HewnOptions, rng: Stream): void {
  const startX = rng.next() * surf.width;
  const startY = rng.next() * surf.height;
  const angle = (options.angle ?? 1.05) + rng.range(-0.3, 0.3);
  const alongX = cos(angle);
  const alongY = sin(angle);
  const gouges = 3 + rng.int(3);
  const spacing = rng.range(1.4, 2.1);
  const len = options.len ?? 3.5;
  for (let k = 0; k < gouges; k++) {
    const slide = rng.range(-0.8, 0.8);
    const fromX = startX - alongY * k * spacing + alongX * slide;
    const fromY = startY + alongX * k * spacing + alongY * slide;
    const reach = len * rng.range(0.6, 1.2);
    stroke(fromX, fromY, fromX + alongX * reach, fromY + alongY * reach, 1.1, 0.5, (x, y, along, across) => {
      const i = surf.idx(x, y);
      if (surf.material[i] !== options.material) return;
      const cut = (1 - across * across) * (1 - along * 0.6);
      surf.relief[i] -= cut * 1.5;
      surf.tone[i] -= cut * 0.2;
    });
  }
}

/** Layered sediment: beds `thin` to `thick` texels deep across the picture, each of one of `materials`, harder beds
 *  standing proud by `relief` and softer ones worn back; the beds undulate by `warp`. */
export interface StrataOptions {
  materials: readonly number[];
  seed: number;
  thin: number;
  thick: number;
  warp: number;
  base?: number;
  relief?: number;
}

/** One bed: where it starts and how deep it is, its material, its hardness and its tone. */
interface Bed {
  readonly top: number;
  readonly deep: number;
  readonly material: number;
  readonly hard: number;
  readonly tone: number;
}

/** The beds down a picture `height` texels high, their depths scaled so they fill it exactly and so tile. */
function beds(options: StrataOptions, height: number): Bed[] {
  const rng = stream(options.seed + 13);
  const depths: number[] = [];
  let sum = 0;
  while (sum < height - options.thin * 0.5) {
    const deep = rng.range(options.thin, options.thick);
    depths.push(deep);
    sum += deep;
  }
  const scale = height / sum;
  let top = 0;
  return depths.map((deep, k) => {
    const bed = {
      top,
      deep: deep * scale,
      material: options.materials[Math.floor(hash01(options.seed, k, 3) * options.materials.length)],
      hard: rng.range(-1, 1),
      tone: rng.range(-0.18, 0.18),
    };
    top += deep * scale;
    return bed;
  });
}

/** Layered sediment, bed over bed, each with its fine laminae, its own tone and its edges lit and shadowed. */
export function strata(surf: Surface, options: StrataOptions): void {
  const seed = options.seed;
  const list = beds(options, surf.height);
  const relief = options.relief ?? 1.2;
  // the beds start part way down, so the picture's edge does not always fall between two of them
  const shift = hash01(seed, 7) * surf.height;
  surf.each((x, y, i) => {
    const wave = (fbm(seed + 1, x, y, surf.width, surf.height, { cells: 3, octaves: 3 }) - 0.5) * options.warp;
    const placeY = wrap(y + 0.5 + wave - shift, surf.height);
    let k = list.length - 1;
    while (k > 0 && list[k].top > placeY) k--;
    const bed = list[k];
    const inBed = (placeY - bed.top) / bed.deep;
    const laminae = fbm(seed + 2 + k, x, y, surf.width, surf.height, { cells: 2, octaves: 3, aspect: 12 });
    const cloud = fbm(seed + 3, x, y, surf.width, surf.height, { cells: 5, octaves: 3 });
    const edge = Math.min(inBed * bed.deep, (1 - inBed) * bed.deep);
    surf.material[i] = bed.material;
    surf.tone[i] =
      (options.base ?? 0.5) + bed.tone + (laminae - 0.5) * 0.18 + (cloud - 0.5) * 0.2 + speckle(seed + 4, x, y) * 0.05;
    surf.relief[i] =
      bed.hard * relief * pow(sin(Math.PI * clamp01(inBed)), 0.5) + (cloud - 0.5) * 0.6 - (edge < 0.6 ? 0.5 : 0);
  });
}

/** Fractures over a painted face: plates `across` by `down` cells, each a plane tilted its own way by up to `tilt`
 *  and toned its own way by up to `toneVar`, so the light finds each flat; where a slow field runs past `open`, the
 *  fracture between two plates stands open `gap` texels, dark. Keeps each place's material. */
export interface FractureOptions {
  seed: number;
  across: number;
  down: number;
  tilt: number;
  gap: number;
  open: number;
  toneVar?: number;
}

/** A face broken along its fractures into tilted planes, some of the fractures open as dark cracks. */
export function fractures(surf: Surface, options: FractureOptions): void {
  const seed = options.seed;
  surf.each((x, y, i) => {
    const warpX = x + (fbm(seed + 1, x, y, surf.width, surf.height, { cells: 3, octaves: 2 }) - 0.5) * 5;
    const warpY = y + (fbm(seed + 2, x, y, surf.width, surf.height, { cells: 3, octaves: 2 }) - 0.5) * 5;
    const wrapX = wrap(warpX, surf.width);
    const wrapY = wrap(warpY, surf.height);
    const cell = worley(seed, wrapX, wrapY, surf.width, surf.height, options.across, options.down, 1);
    const inset = (cell.second - cell.nearest) * 0.5;
    const opening = fbm(seed + 5, x, y, surf.width, surf.height, { cells: 4, octaves: 2 });
    if (inset < options.gap * 0.5 && opening > 1 - options.open) {
      surf.tone[i] -= 0.4;
      surf.relief[i] -= 1.5;
      return;
    }
    const slopeX = (hash01(seed, cell.id, 1) - 0.5) * 2 * options.tilt;
    const slopeY = (hash01(seed, cell.id, 2) - 0.5) * 2 * options.tilt;
    surf.tone[i] += (hash01(seed, cell.id, 3) - 0.5) * 2 * (options.toneVar ?? 0.1);
    surf.relief[i] += slopeX * (wrapX + 0.5 - cell.pointX) + slopeY * (wrapY + 0.5 - cell.pointY);
  });
}

/** Mineral veins: `count` seams of `material` about `steps` texels long, running near `angle`, `wide` across at
 *  their middle and thinning to their ends. */
export interface VeinOptions {
  material: number;
  seed: number;
  count: number;
  steps: number;
  wide: number;
  angle: number;
}

/** Mineral veins: thin bright seams, jagged step by step but holding their line through the rock. */
export function veins(surf: Surface, options: VeinOptions): void {
  const rng = stream(options.seed);
  for (let k = 0; k < options.count; k++) {
    let x = rng.next() * surf.width;
    let y = rng.next() * surf.height;
    let heading = options.angle + rng.range(-0.4, 0.4);
    const steps = Math.round(options.steps * rng.range(0.6, 1));
    for (let step = 0; step < steps; step++) {
      const angle = heading + rng.range(-0.3, 0.3);
      const nextX = x + cos(angle);
      const nextY = y + sin(angle);
      const width = options.wide * (0.45 + 0.55 * sin((Math.PI * (step + 0.5)) / steps));
      stroke(x, y, nextX, nextY, width, width, (placeX, placeY, _along, across) => {
        const i = surf.idx(placeX, placeY);
        surf.material[i] = options.material;
        surf.tone[i] = 0.62 - Math.abs(across) * 0.15 + hash01(options.seed + 1, placeX, placeY) * 0.1;
        surf.relief[i] += 0.3;
      });
      heading += rng.range(-0.06, 0.06);
      x = nextX;
      y = nextY;
    }
  }
}

/** Damp seeps: `count` streaks running down from where water comes through, spreading to `wide` texels across over
 *  up to `len`, darkest at their head; their middles turn `material`, glinting, where one is given. */
export interface SeepOptions {
  seed: number;
  count: number;
  len: number;
  wide: number;
  dark: number;
  material?: number;
}

/** Damp seeps: wet streaks down a face, each wandering a little as it runs. */
export function seeps(surf: Surface, options: SeepOptions): void {
  const rng = stream(options.seed);
  const step = 0.5;
  for (let k = 0; k < options.count; k++) {
    const startX = rng.next() * surf.width;
    const startY = rng.next() * surf.height;
    const len = options.len * rng.range(0.6, 1);
    const wide = options.wide * rng.range(0.7, 1.3);
    const id = rng.int(1000);
    for (let down = 0; down < len; down += step) {
      const along = down / len;
      const drift = (fbm(options.seed + id, startX, startY + down, surf.width, surf.height, { cells: 4 }) - 0.5) * 6;
      const half = (wide * (0.6 + along * 0.6)) / 2;
      const midX = startX + drift;
      box(midX - half, startY + down, midX + half, startY + down + step, (x, y) => {
        const i = surf.idx(x, y);
        const middle = 1 - Math.abs(x + 0.5 - midX) / Math.max(0.5, half);
        const patch = fbm(options.seed + 4, x, y, surf.width, surf.height, { cells: 8, octaves: 2 });
        surf.tone[i] -= options.dark * (1 - along * 0.7) * (0.35 + 0.65 * smooth(0, 0.6, middle)) * (0.5 + patch);
        if (options.material === undefined || middle < 0.4 || along > 0.7) return;
        surf.material[i] = options.material;
        if (hash01(options.seed + 3, x, y) < 0.06) surf.tone[i] += 0.45;
      });
    }
  }
}

/** Loose stones: `count` of `materials` from `least` to `most` texels across, each a lit dome with a shadow at its
 *  foot, `lift` how high they stand. */
export interface StoneOptions {
  materials: readonly number[];
  seed: number;
  count: number;
  least: number;
  most: number;
  lift?: number;
  base?: number;
}

/** Loose stones lying on a floor, each casting a shadow below and to its right. */
export function stones(surf: Surface, options: StoneOptions): void {
  const rng = stream(options.seed);
  for (let k = 0; k < options.count; k++) {
    const midX = rng.next() * surf.width;
    const midY = rng.next() * surf.height;
    const radiusX = rng.range(options.least, options.most) / 2;
    const radiusY = radiusX * rng.range(0.6, 0.95);
    const material = rng.pick(options.materials);
    const tone = (options.base ?? 0.55) + rng.range(-0.12, 0.12);
    const lift = (options.lift ?? 1) * radiusX;
    ellipse(midX + 0.6, midY + 0.8, radiusX, radiusY, (x, y) => (surf.tone[surf.idx(x, y)] -= 0.14));
    ellipse(midX, midY, radiusX, radiusY, (x, y, relU, relV) => {
      const i = surf.idx(x, y);
      const dome = Math.max(0, 1 - relU * relU - relV * relV);
      surf.material[i] = material;
      surf.tone[i] = tone - (relU * 0.55 + relV * 0.7) * 0.18 + speckle(options.seed + k, x, y) * 0.05;
      surf.relief[i] += Math.sqrt(dome) * lift;
    });
  }
}

/** Stalactite stubs seen from below: `count` knobs of `material` from `least` to `most` texels across, most of them
 *  in a line along a crack as they grow, each a lit knob with a dark wet tip; and `drips` wet marks between. */
export interface StubOptions {
  material: number;
  seed: number;
  count: number;
  least: number;
  most: number;
  drips: number;
}

/** Stalactite stubs along a crack in a ceiling, and the marks their drips leave. */
export function stubs(surf: Surface, options: StubOptions): void {
  const rng = stream(options.seed);
  let x = rng.next() * surf.width;
  let y = rng.next() * surf.height;
  let angle = rng.next() * Math.PI * 2;
  for (let k = 0; k < options.count; k++) {
    const onCrack = k % 4 !== 3;
    const stubX = onCrack ? x + rng.range(-1, 1) : rng.next() * surf.width;
    const stubY = onCrack ? y + rng.range(-1, 1) : rng.next() * surf.height;
    const radius = rng.range(options.least, options.most) / 2;
    knob(surf, options.material, stubX, stubY, radius, rng);
    const reach = rng.range(3, 6);
    stroke(x, y, x + cos(angle) * reach, y + sin(angle) * reach, 0.8, 0.8, (placeX, placeY) => {
      const i = surf.idx(placeX, placeY);
      if (surf.material[i] === options.material) return;
      surf.tone[i] -= 0.2;
      surf.relief[i] -= 0.6;
    });
    x += cos(angle) * reach;
    y += sin(angle) * reach;
    angle += rng.range(-0.6, 0.6);
  }
  for (let k = 0; k < options.drips; k++) {
    const midX = rng.next() * surf.width;
    const midY = rng.next() * surf.height;
    const radius = rng.range(0.7, 1.4);
    ellipse(midX, midY, radius + 0.6, radius + 0.6, (placeX, placeY, relU, relV) => {
      const i = surf.idx(placeX, placeY);
      const dist = Math.sqrt(relU * relU + relV * relV);
      surf.tone[i] += dist * (radius + 0.6) < radius ? -0.24 : 0.12;
    });
  }
}

/** One stub: a knob lit from the top left, standing `radius` proud, its tip dark with water. */
function knob(surf: Surface, material: number, midX: number, midY: number, radius: number, rng: Stream): void {
  const tone = rng.range(0.4, 0.55);
  ellipse(midX + 0.8, midY + 1, radius, radius, (x, y) => (surf.tone[surf.idx(x, y)] -= 0.22));
  ellipse(midX, midY, radius, radius * rng.range(0.8, 1), (x, y, relU, relV) => {
    const i = surf.idx(x, y);
    const dist = Math.sqrt(relU * relU + relV * relV);
    surf.material[i] = material;
    const shine = relU < -0.2 && relV < -0.2 && dist < 0.7 ? 0.2 : 0;
    surf.tone[i] = tone - (relU * 0.55 + relV * 0.7) * 0.45 + shine - (dist < 0.25 ? 0.4 : 0);
    surf.relief[i] += pow(Math.max(0, 1 - dist), 0.8) * radius * 1.8;
  });
}

/** A rounded ledge along the picture: its top rising to a crest `crest` texels down, its nose rounding over `round`
 *  texels into the shadow under it; the crest wanders `wander` texels and stands `lift` proud. Keeps each place's
 *  material. */
export function ledge(
  surf: Surface,
  options: { seed: number; crest: number; round: number; wander: number; lift: number },
): void {
  const seed = options.seed;
  surf.each((x, y, i) => {
    const wave = fbm(seed, x, 0, surf.width, surf.height, { cells: 4, octaves: 3 }) - 0.5;
    const crest = options.crest + wave * options.wander;
    const placeY = y + 0.5;
    if (placeY < crest) {
      const rise = placeY / crest;
      surf.relief[i] += options.lift * sin(rise * Math.PI * 0.5);
      surf.tone[i] += 0.1 + smooth(0.5, 1, rise) * 0.3;
      return;
    }
    const into = (placeY - crest) / options.round;
    if (into <= 1) {
      surf.relief[i] += options.lift * cos(into * Math.PI * 0.5);
      surf.tone[i] += 0.3 - into * 0.85;
      return;
    }
    const below = (placeY - crest - options.round) / Math.max(1, surf.height - crest - options.round);
    surf.tone[i] -= 0.55 * (1 - clamp01(below));
  });
}
