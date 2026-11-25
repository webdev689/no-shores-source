// The light a scene is drawn in, and what it falls on first: the sky, its stars, moon and clouds, the far land in
// ranges that pale with distance, mist, and the sea with every light's streak on it. Each scene names one light, so
// its sky, water and land agree; every light is a night, or the edge of one.
import { box, dot, fade, halo, land, patternOn, ridge, type Ink, type Sheet } from './sheet.ts';

export interface Light {
  /** The sky from its top to the horizon. */
  readonly sky: readonly Ink[];
  /** The sea from the horizon down. */
  readonly sea: readonly Ink[];
  /** A ripple catching the sky, and one in shadow. */
  readonly ripple: Ink;
  readonly trough: Ink;
  /** Land from the farthest range to the nearest, each darker as it comes closer. */
  readonly ranges: readonly Ink[];
  /** The haze lying on the water at the horizon. */
  readonly haze: Ink;
  /** Stars from the brightest down. */
  readonly stars: readonly Ink[];
  /** A cloud's body and the edge the light catches. */
  readonly cloud: Ink;
  readonly cloudLit: Ink;
}

export const LIGHTS = {
  /** Overlook's night: deep blue, the horizon a little paler. */
  night: {
    sky: ['#03060d', '#050a15', '#08101f', '#0c162a', '#111e37', '#172845', '#203454', '#2b4264'],
    sea: ['#22354f', '#182841', '#111e34', '#0b1628', '#070f1e', '#040914'],
    ripple: '#2f4669',
    trough: '#050b16',
    ranges: ['#1c2c48', '#15223a', '#0e182b', '#080f1d'],
    haze: '#2a3c5c',
    stars: ['#e8f0ff', '#9fb0cc', '#4f6286'],
    cloud: '#101b30',
    cloudLit: '#24385a',
  },
  /** Fire on the water at dusk: the sky's last red under the dark. */
  ember: {
    sky: ['#05050b', '#0a0812', '#120c18', '#1c111c', '#2a161d', '#3e1d1d', '#5a2a1c', '#7c3e1e'],
    sea: ['#3a2220', '#28181b', '#1b1218', '#120c13', '#0a070d', '#050409'],
    ripple: '#6a3424',
    trough: '#060408',
    ranges: ['#3a1e1e', '#2a1619', '#1a0f13', '#0c070b'],
    haze: '#5a2e22',
    stars: ['#ffe6c8', '#b08870', '#5a4048'],
    cloud: '#1c1018',
    cloudLit: '#7a3a22',
  },
  /** The Tithe's weather: an overcast night, grey all the way down. */
  mist: {
    sky: ['#090d14', '#0d131c', '#121924', '#18202c', '#1f2835', '#27313f', '#303a48', '#3a4552'],
    sea: ['#2c3644', '#222b38', '#19212c', '#121921', '#0b1118', '#070b10'],
    ripple: '#46515f',
    trough: '#080c12',
    ranges: ['#343e4c', '#29323e', '#1e2630', '#141a22'],
    haze: '#4a5462',
    stars: ['#c4cad4', '#7a828e', '#3e4652'],
    cloud: '#1a212b',
    cloudLit: '#3e4856',
  },
  /** The ruined ports' night, lit from below by the crystal. */
  crystal: {
    sky: ['#04030a', '#070510', '#0b0818', '#110b22', '#180e2c', '#211236', '#2c1640', '#3a1a48'],
    sea: ['#261a3a', '#1c132d', '#140e22', '#0e0a18', '#080610', '#040309'],
    ripple: '#4a2c66',
    trough: '#05040a',
    ranges: ['#2a1a3c', '#1e132e', '#140d20', '#0a0712'],
    haze: '#3e2456',
    stars: ['#f0e2ff', '#a890c8', '#54446e'],
    cloud: '#120c1e',
    cloudLit: '#3a2050',
  },
  /** The first grey of morning: night overhead, a pale band where the day will come. */
  dawn: {
    sky: ['#070b16', '#0c1322', '#141d31', '#1e2a42', '#2c3952', '#424a62', '#62606f', '#8a7a78', '#b0907c'],
    sea: ['#4a5064', '#363e54', '#262f44', '#1a2236', '#111829', '#0a101c'],
    ripple: '#7a7480',
    trough: '#0c121e',
    ranges: ['#3c4458', '#2c3448', '#1d2436', '#111725'],
    haze: '#6a6874',
    stars: ['#dfe6f2', '#8a96ac', '#465068'],
    cloud: '#2a3046',
    cloudLit: '#a08478',
  },
} as const satisfies Record<string, Light>;

/** The sky from the top down to `horizon`, band dithered into band. */
export function sky(sheet: Sheet, light: Light, horizon: number): void {
  fade(sheet, 0, horizon, light.sky);
}

/** Stars thinning toward the horizon: a few bright, some with four points, most faint. */
export function stars(sheet: Sheet, random: () => number, light: Light, count: number, lowest: number): void {
  for (let place = 0; place < count; place++) {
    const x = Math.floor(random() * sheet.width);
    const y = Math.floor(random() * random() * lowest);
    const kind = random();
    const ink = kind < 0.1 ? light.stars[0] : kind < 0.4 ? light.stars[1] : light.stars[2];
    dot(sheet, x, y, ink ?? '');
    if (kind < 0.04)
      for (const [across, down] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const)
        dot(sheet, x + across, y + down, light.stars[2] ?? '');
  }
}

/** A moon lit from its upper left, its dark side dithered into the sky's colour, craters, and rings of light. */
export function moon(sheet: Sheet, light: Light, centreX: number, centreY: number, size: number): void {
  const near = light.sky[light.sky.length - 1] ?? '';
  const mid = light.sky[Math.floor(light.sky.length * 0.75)] ?? '';
  halo(sheet, centreX, centreY, size * 4, [light.sky[Math.floor(light.sky.length / 2)] ?? '', mid, near]);
  const inks = ['#6e7a8e', '#a6b0c0', '#d2d9e4', '#f2f5fa'];
  for (let row = -size; row <= size; row++)
    for (let column = -size; column <= size; column++) {
      const away = Math.hypot(column, row) / size;
      if (away > 1) continue;
      const lit = 0.55 - (column + row) / (size * 2.6) - away * 0.25;
      const step = Math.max(0, Math.min(inks.length - 1, lit * inks.length));
      const band = Math.floor(step);
      const ink = patternOn(centreX + column, centreY + row, step - band) ? inks[band + 1] : inks[band];
      dot(sheet, centreX + column, centreY + row, ink ?? inks[0] ?? '');
    }
  for (const [across, down, wide] of [
    [0.3, -0.2, 0.22],
    [-0.35, 0.3, 0.16],
    [0.15, 0.45, 0.12],
  ] as const) {
    const radius = Math.max(1, Math.round(size * wide));
    for (let row = -radius; row <= radius; row++)
      for (let column = -radius; column <= radius; column++)
        if (Math.hypot(column, row) <= radius)
          dot(sheet, centreX + across * size + column, centreY + down * size + row, inks[0] ?? '');
  }
}

/** Long low clouds between `top` and `top + depth`: dithered bodies, the edge facing the light caught by it. */
export function clouds(
  sheet: Sheet,
  random: () => number,
  light: Light,
  place: { readonly top: number; readonly depth: number; readonly count: number; readonly litBelow?: boolean },
): void {
  for (let cloud = 0; cloud < place.count; cloud++) {
    const centreX = random() * sheet.width;
    const centreY = place.top + random() * place.depth;
    const wide = 24 + random() * sheet.width * 0.22;
    const tall = 2 + random() * 5;
    for (let row = -Math.ceil(tall); row <= tall; row++)
      for (let column = -Math.ceil(wide); column <= wide; column++) {
        const away = (column / wide) ** 2 + (row / tall) ** 2;
        if (away > 1) continue;
        const x = Math.round(centreX + column);
        const y = Math.round(centreY + row);
        if (!patternOn(x, y, (1 - away) * 1.4)) continue;
        const edge = place.litBelow ? row > tall * 0.35 : row < -tall * 0.35;
        dot(sheet, x, y, edge && patternOn(x + 3, y, 0.7) ? light.cloudLit : light.cloud);
      }
  }
}

/** A range of land seen side on between `left` and `left + width`, its line between `top` and `foot`, inked down to
 *  `floor`; its crest catches `rim` where given. Returns each column's height. */
export function range(
  sheet: Sheet,
  random: () => number,
  look: {
    readonly left: number;
    readonly width: number;
    readonly top: number;
    readonly foot: number;
    readonly floor: number;
    readonly ink: Ink;
    readonly rim?: Ink;
    readonly rough?: number;
  },
): number[] {
  const heights = ridge(random, look.width, look.top, look.foot, look.rough ?? 0.55);
  land(sheet, heights, look.ink, look.floor, look.left);
  if (look.rim) {
    const rim = look.rim;
    heights.forEach((height, column) => {
      const x = look.left + column;
      const before = heights[column - 1] ?? height;
      if (height <= before + 0.5) dot(sheet, x, height, rim);
      if (patternOn(x, Math.round(height) + 1, 0.4)) dot(sheet, x, height + 1, rim);
    });
  }
  return heights;
}

/** Mist lying across the picture from `top` for `depth` rows, thickest in its middle. */
export function mist(sheet: Sheet, top: number, depth: number, ink: Ink, strength: number, from = 0, to = 0): void {
  const right = to || sheet.width;
  for (let row = 0; row < depth; row++) {
    const share = strength * Math.sin((row / depth) * Math.PI);
    for (let column = from; column < right; column++)
      if (patternOn(column, top + row, share)) dot(sheet, column, top + row, ink);
  }
}

/** Where a light on the water casts its streak: its column, its half width and its ink. */
export interface Glint {
  readonly x: number;
  readonly wide: number;
  readonly ink: Ink;
  /** The row the streak starts on, under the light itself; the horizon when not given. */
  readonly from?: number;
  /** A brighter ink for the streak's middle. */
  readonly core?: Ink;
}

/** The sea from `horizon` down: its bands, the haze on the horizon, ripples catching the sky and lying in shadow
 *  (longer and farther apart as they come near), and each light's broken streak. */
export function sea(
  sheet: Sheet,
  random: () => number,
  light: Light,
  horizon: number,
  glints: readonly Glint[] = [],
): void {
  fade(sheet, horizon, sheet.height - horizon, light.sea);
  box(sheet, 0, horizon, sheet.width, 1, light.haze);
  mist(sheet, horizon - 3, 7, light.haze, 0.35);
  for (let row = horizon + 2; row < sheet.height; row++) {
    const depth = (row - horizon) / (sheet.height - horizon);
    const gap = 1 + Math.floor(depth * 3);
    if ((row - horizon) % gap !== 0) continue;
    const count = Math.round(sheet.width * 0.05 * (1 - depth * 0.4));
    for (let place = 0; place < count; place++) {
      const x = Math.floor(random() * sheet.width);
      const long = 2 + Math.floor(random() * (2 + depth * 10));
      box(sheet, x, row, long, 1, random() < 0.6 ? light.ripple : light.trough);
    }
  }
  for (const glint of glints)
    for (let row = glint.from ?? horizon + 1; row < sheet.height; row++) {
      const depth = (row - horizon) / (sheet.height - horizon);
      const wide = glint.wide * (0.5 + depth * 1.2);
      if (row % (depth < 0.3 ? 1 : 2) !== 0) continue;
      for (let column = -wide; column <= wide; column++) {
        const share = (1 - Math.abs(column) / (wide + 1)) * (1 - depth * 0.55);
        if (random() > 0.6 * share) continue;
        const ink = glint.core && Math.abs(column) < wide * 0.35 && random() < 0.5 ? glint.core : glint.ink;
        const long = depth > 0.4 && random() < 0.5 ? 2 : 1;
        box(sheet, Math.round(glint.x + column + (random() - 0.5) * 2), row, long, 1, ink);
      }
    }
}

/** A gold lantern: its point, a ring of brighter cells and the light falling off round it. */
export function lantern(sheet: Sheet, x: number, y: number, reach = 6): void {
  halo(sheet, x, y, reach, ['#3a2414', '#7a4416', '#c0802c']);
  dot(sheet, x, y, '#fff1c4');
}
