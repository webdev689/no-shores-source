// The pieces the website's scenes are built from: the night sky and the sea, ships, a rocky isle and its town,
// lanterns, the crystal and the figures. Each takes its inks from the palette here, so every scene shares one night.
import {
  box,
  disc,
  dot,
  fade,
  glow,
  inkAt,
  land,
  line,
  patternOn,
  ridge,
  shape,
  stamp,
  type Ink,
  type Sheet,
} from './sheet.ts';

/** The site's palette: night sea blues and greys, lantern gold, the Lattice's crystal. */
export const PALETTE = {
  sky: ['#04070e', '#070c18', '#0b1324', '#101b31', '#16243f', '#1f3050'],
  sea: ['#1c2b44', '#142238', '#0e192c', '#0a1322', '#060c17'],
  ripple: '#2a3d5c',
  star: '#c9d6ec',
  starDim: '#5f7090',
  moon: ['#9aa6b8', '#c9d2de', '#eef2f6'],
  rock: { hue: '#0a0f19', lit: '#18223a', edge: '#2b3a55' },
  far: { hue: '#111b2e', edge: '#1d2b45' },
  wall: '#1a2236',
  wallLit: '#3c3a3c',
  roof: '#0c1220',
  timber: '#2a1d16',
  gold: { deep: '#9a5a1c', mid: '#d99a36', bright: '#ffd36e', white: '#fff1c4' },
  ember: { deep: '#7a2a14', mid: '#d0602a', bright: '#ffa040' },
  grey: { sail: '#9199a5', shade: '#646c78', hull: '#2e343d', mist: '#363f4d' },
  crystal: { deep: '#2c1640', purple: '#7d46c0', red: '#c23c58', bright: '#e6c4ff', cold: '#a8e6ff' },
  sand: ['#2e2d33', '#4a4644', '#6e665c'],
  dawn: ['#1f3050', '#33445f', '#56627a', '#8a8a92'],
} as const;

/** Sky from its top down to the horizon, dithered band into band, and the stars over it. */
export function nightSky(
  sheet: Sheet,
  random: () => number,
  horizon: number,
  inks: readonly Ink[] = PALETTE.sky,
): void {
  fade(sheet, 0, horizon, inks);
  stars(sheet, random, Math.round(sheet.width * 0.5), horizon - 12);
}

export function stars(sheet: Sheet, random: () => number, count: number, lowest: number): void {
  for (let place = 0; place < count; place++) {
    const x = Math.floor(random() * sheet.width);
    const y = Math.floor(random() * random() * lowest);
    const bright = random() < 0.18;
    dot(sheet, x, y, bright ? PALETTE.star : PALETTE.starDim);
    if (bright && random() < 0.3) {
      dot(sheet, x - 1, y, PALETTE.starDim);
      dot(sheet, x + 1, y, PALETTE.starDim);
    }
  }
}

/** A moon, lit from its upper left, and its faint light round it. */
export function moon(sheet: Sheet, centreX: number, centreY: number, size: number): void {
  glow(sheet, centreX, centreY, size * 3, PALETTE.sky[5], 0.35);
  disc(sheet, centreX, centreY, size, size, PALETTE.moon[0]);
  disc(sheet, centreX - 1, centreY - 1, size - 1, size - 1, PALETTE.moon[1]);
  disc(sheet, centreX - 2, centreY - 2, size * 0.45, size * 0.45, PALETTE.moon[2]);
}

/** Where a light on the water casts its streak: its column, its width and its ink. */
export interface Glint {
  readonly x: number;
  readonly wide: number;
  readonly ink: Ink;
  /** The row the streak starts on, the light's own reflection point; the horizon when not given. */
  readonly from?: number;
}

/** The sea from the horizon down: its bands, broken ripples, and each light's streak on the water. */
export function sea(sheet: Sheet, random: () => number, horizon: number, glints: readonly Glint[] = []): void {
  fade(sheet, horizon, sheet.height - horizon, PALETTE.sea);
  box(sheet, 0, horizon, sheet.width, 1, PALETTE.ripple);
  for (let row = horizon + 2; row < sheet.height; row += 2) {
    const depth = (row - horizon) / (sheet.height - horizon);
    const count = Math.round(sheet.width * 0.06 * (1 - depth * 0.5));
    for (let place = 0; place < count; place++) {
      const x = Math.floor(random() * sheet.width);
      box(sheet, x, row, 2 + Math.floor(random() * (3 + depth * 8)), 1, PALETTE.ripple);
    }
  }
  for (const glint of glints)
    for (let row = glint.from ?? horizon + 1; row < sheet.height; row++) {
      const depth = (row - horizon) / (sheet.height - horizon);
      const wide = glint.wide * (0.6 + depth);
      for (let column = -wide; column <= wide; column++)
        if (row % 2 === 0 && random() < 0.55 * (1 - Math.abs(column) / (wide + 1)) * (1 - depth * 0.6))
          dot(sheet, glint.x + column + Math.round((random() - 0.5) * 2), row, glint.ink);
    }
}

export interface ShipLook {
  readonly hull: Ink;
  readonly sail: Ink;
  readonly shade: Ink;
  /** Masts, two or three. */
  readonly masts?: number;
  /** 1 sails right, -1 left. */
  readonly facing?: 1 | -1;
  /** A lantern at the stern, in gold. */
  readonly lantern?: boolean;
  /** Sails furled, as a ship at anchor keeps them. */
  readonly furled?: boolean;
}

/**
 * A ship side on, `length` cells from stern to bow, its keel on `waterline` and its middle at `x`. Square sails on
 * each mast, the lower one larger; furled, only the yards show.
 */
export function ship(sheet: Sheet, x: number, waterline: number, length: number, look: ShipLook): void {
  const facing = look.facing ?? 1;
  const half = length / 2;
  const deep = Math.max(2, Math.round(length * 0.15));
  const along = (share: number): number => x + share * half * facing;
  shape(
    sheet,
    [
      [along(-1), waterline - deep - 1],
      [along(-0.6), waterline - deep + 1],
      [along(0.75), waterline - deep + 1],
      [along(1.05), waterline - deep - 1],
      [along(0.8), waterline],
      [along(-0.85), waterline],
    ],
    look.hull,
  );
  line(sheet, along(1.05), waterline - deep - 1, along(1.45), waterline - deep - 4, look.hull);
  const masts = look.masts ?? 2;
  const tall = length * 0.95;
  for (let mast = 0; mast < masts; mast++) {
    const share = masts === 1 ? 0 : -0.45 + (mast * 0.95) / (masts - 1);
    const foot = Math.round(along(share));
    const height = tall * (mast === Math.floor(masts / 2) ? 1 : 0.85);
    line(sheet, foot, waterline - deep, foot, waterline - deep - height, look.hull);
    const yard = length * 0.2;
    for (const [from, to, wide] of [
      [0.14, 0.58, 1],
      [0.62, 0.9, 0.75],
    ] as const) {
      const top = waterline - deep - height * to;
      const bottom = waterline - deep - height * from;
      const span = yard * wide;
      if (look.furled) {
        box(sheet, Math.round(foot - span), Math.round(top), Math.round(span * 2), 1, look.shade);
        continue;
      }
      shape(
        sheet,
        [
          [foot - span, top],
          [foot + span, top],
          [foot + span + facing, bottom],
          [foot - span + facing, bottom],
        ],
        look.sail,
      );
      for (let row = Math.round(top); row < bottom; row++)
        for (let column = Math.round(foot - span); column < foot + span + 1; column++)
          if (inkAt(sheet, column, row) === look.sail && patternOn(column, row, (row - top) / (bottom - top) - 0.3))
            dot(sheet, column, row, look.shade);
    }
  }
  if (look.lantern) lantern(sheet, Math.round(along(-0.95)), waterline - deep - 3, 5);
}

/** A lantern: a gold point and its light, and a ring of brighter cells close in. */
export function lantern(sheet: Sheet, x: number, y: number, reach = 6): void {
  glow(sheet, x, y, reach, PALETTE.gold.deep, 0.55);
  glow(sheet, x, y, Math.ceil(reach / 2), PALETTE.gold.mid, 0.6);
  dot(sheet, x, y, PALETTE.gold.white);
}

/**
 * A rocky isle side on, from `left` to `right`: its shoulders rise from the water to `top`. Returns each column's
 * height, so what stands on it can find the ground.
 */
export function isle(
  sheet: Sheet,
  random: () => number,
  left: number,
  right: number,
  top: number,
  waterline: number,
): number[] {
  const width = right - left;
  const rough = ridge(random, width, top, top + (waterline - top) * 0.45, 0.6);
  const heights = rough.map((height, column) => {
    const edge = Math.min(column, width - 1 - column) / (width * 0.28);
    return waterline - (waterline - height) * Math.min(1, Math.sqrt(Math.max(0, edge)));
  });
  land(sheet, heights, PALETTE.rock.hue, waterline + 1, left);
  heights.forEach((height, column) => {
    dot(sheet, left + column, height, PALETTE.rock.edge);
    for (let row = Math.round(height) + 1; row < waterline; row++)
      if (patternOn(left + column, row, 0.35 - (row - height) / 40 + (random() - 0.5) * 0.2))
        dot(sheet, left + column, row, PALETTE.rock.lit);
  });
  return heights;
}

/** One house a town holds: where it stands and how big it is. */
interface House {
  readonly x: number;
  readonly ground: number;
  readonly wide: number;
  readonly tall: number;
}

/**
 * Houses climbing an isle between `from` and `to` columns, the higher ones behind; lit windows in gold, drawn into
 * `lights` too where a scene keeps its lights apart to make them flicker.
 */
export function town(
  sheet: Sheet,
  random: () => number,
  ground: readonly number[],
  left: number,
  span: readonly [number, number],
  count: number,
  lights?: Sheet,
): void {
  const houses: House[] = [];
  for (let place = 0; place < count; place++) {
    const x = Math.round(span[0] + random() * (span[1] - span[0]));
    const under = ground[x - left] ?? 0;
    houses.push({
      x,
      ground: Math.round(under + 2),
      wide: 5 + Math.floor(random() * 7),
      tall: 5 + Math.floor(random() * 7),
    });
  }
  houses.sort((one, other) => one.ground - other.ground);
  for (const house of houses) {
    const top = house.ground - house.tall;
    box(sheet, house.x, top, house.wide, house.tall, PALETTE.wall);
    box(sheet, house.x + house.wide - 1, top, 1, house.tall, PALETTE.roof);
    shape(
      sheet,
      [
        [house.x - 1, top],
        [house.x + house.wide / 2, top - Math.ceil(house.wide / 2)],
        [house.x + house.wide + 1, top],
      ],
      PALETTE.roof,
    );
    for (let window = 0; window < Math.floor(house.wide / 3); window++) {
      if (random() < 0.35) continue;
      const windowX = house.x + 1 + window * 3;
      const windowY = top + 2 + (random() < 0.5 ? 0 : 3);
      if (windowY + 1 >= house.ground) continue;
      box(sheet, windowX, windowY, 1, 2, PALETTE.gold.mid);
      if (lights) box(lights, windowX, windowY, 1, 2, PALETTE.gold.bright);
    }
  }
}

/** The crystal's two strains, each a shadowed face, a lit face and its edge. */
const STRAINS = [
  { shadow: '#46226e', face: PALETTE.crystal.purple },
  { shadow: '#6a1c34', face: PALETTE.crystal.red },
] as const;

/** A shard of crystal from `base` up `tall` cells, leaning by `lean`: a shadowed face, a lit face, a bright edge. */
export function crystal(sheet: Sheet, x: number, base: number, tall: number, lean: number, strain: 0 | 1): void {
  const wide = Math.max(2, Math.round(tall / 3));
  const tip: [number, number] = [x + lean, base - tall];
  const inks = STRAINS[strain];
  shape(sheet, [[x - wide, base], tip, [x + wide + 1, base]], inks.face);
  shape(sheet, [[x - wide, base], tip, [x - 1, base]], inks.shadow);
  line(sheet, x, base - 1, tip[0], tip[1] + 1, PALETTE.crystal.bright);
}

/** A cluster of shards round one root, in the Lattice's red and purple. */
export function cluster(sheet: Sheet, random: () => number, x: number, base: number, size: number): void {
  glow(sheet, x, base - size / 2, Math.round(size * 1.6), PALETTE.crystal.deep, 0.7);
  glow(sheet, x, base - size / 3, Math.round(size * 0.8), '#4a2a78', 0.5);
  for (let shard = 0; shard < 5; shard++) {
    const lean = Math.round((random() - 0.5) * size * 0.8);
    const tall = Math.round(size * (0.45 + random() * 0.6));
    crystal(sheet, x + Math.round((random() - 0.5) * size * 0.7), base, tall, lean, random() < 0.55 ? 0 : 1);
  }
}

/** Ruined walls between two columns: houses with their roofs gone, their tops broken, `hole` showing through. */
export function ruins(
  sheet: Sheet,
  random: () => number,
  span: readonly [number, number],
  ground: number,
  ink: Ink,
  hole: Ink,
): void {
  const [from, to] = span;
  for (let x = from; x < to;) {
    const wide = 4 + Math.floor(random() * 9);
    const tall = 6 + Math.floor(random() * 18);
    for (let column = 0; column < wide; column++) {
      const broken = Math.floor(random() * (tall / 2));
      box(sheet, x + column, ground - tall + broken, 1, tall - broken, ink);
    }
    for (let row = ground - tall + 4; row < ground - 2; row += 4)
      if (random() < 0.6) box(sheet, x + 1 + Math.floor(random() * (wide - 2)), row, 1, 2, hole);
    x += wide + Math.floor(random() * 4);
  }
}

/** Little figures typed as letters: `d` dark, `m` mid, `l` lit. */
const FIGURES = {
  lying: [
    '...dd.....................',
    '..dlld....................',
    '..dlld.dddddddddd.........',
    '...ddddmmmmmmmmmmdddddddd.',
    '....ddmmmmmmmmmmmmmmmmmddd',
    '.dddd.ddddddddddddddddd.dd',
    '.........................d',
  ],
  sinking: [
    'd...........d',
    '.d.........d.',
    '..d.......d..',
    '..d..ddd..d..',
    '...d.dld.d...',
    '....ddldd....',
    '.....ddd.....',
    '....ddddd....',
    '...dmmmmmd...',
    '...dmmmmmd...',
    '...ddmmmdd...',
    '..dddmmmddd..',
    '..dd.ddd.dd..',
    '....dd.dd....',
    '....d...d....',
    '....d...d....',
    '...dd...dd...',
  ],
} as const;

/** A figure drawn two cells to each of its letters, so it reads at the size a scene shows it. */
export function figure(
  sheet: Sheet,
  kind: keyof typeof FIGURES,
  x: number,
  y: number,
  inks: readonly [Ink, Ink, Ink],
): void {
  stamp(sheet, FIGURES[kind], [x, y], { d: inks[0], m: inks[1], l: inks[2] }, 2);
}
