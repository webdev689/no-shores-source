// The land map's icon glyphs, in the game's own devices: each keeper's coin in their sign's board colour with the
// device their sign carries (a star for the Mage, a key for the vaults, an anvil, a helm, open shears, a horseshoe, a
// ship's wheel, candles: tools/modules/adorn.py), each faction's with its banner's emblem, and a mark for each kind of
// site a layout holds. Each is painted about the origin in units, `GLYPH_HALF` either side.
import { CLOTH_COLOURS } from '../city/pictures.ts';
import type { Point2 } from '../overworld/ground.ts';
import { INK } from './mapKey.ts';
import { LIGHT_INK, type Painter, PARCHMENT, ROUTE } from './mapLetters.ts';

export type KeeperGlyph =
  | 'mage'
  | 'vault'
  | 'weaponsmith'
  | 'armorsmith'
  | 'tailor'
  | 'tack'
  | 'harbourmaster'
  | 'chandler'
  | 'stormcallers'
  | 'lamplighters'
  | 'veiled';
export type SiteGlyph = 'landing' | 'event' | 'gate' | 'door' | 'objective' | 'foes' | 'beacon';
export type ResourceGlyph = 'ore' | 'herbs' | 'timber' | 'salvage';
export type LandGlyph = KeeperGlyph | SiteGlyph | ResourceGlyph;

/** Every glyph in the order the table lists them: the keepers, the sites, the resources. */
export const GLYPHS: readonly LandGlyph[] = [
  'mage',
  'vault',
  'weaponsmith',
  'armorsmith',
  'tailor',
  'tack',
  'stormcallers',
  'lamplighters',
  'veiled',
  'harbourmaster',
  'chandler',
  'landing',
  'event',
  'gate',
  'door',
  'objective',
  'foes',
  'beacon',
  'ore',
  'herbs',
  'timber',
  'salvage',
];
export const isGlyph = (name: string): name is LandGlyph => (GLYPHS as readonly string[]).includes(name);

/** Units either side of a glyph's middle, and of a resource's smaller one. */
export const GLYPH_HALF = 8;
const RESOURCE_HALF = 5.5;
/** The devices' fill: the signs' gold, and bone. */
const GOLD = '#ecd389';
const BONE = '#efe6cf';

/** A cloth's colour darkened toward the ink, as a wash of it reads on the parchment. */
const inked = (cloth: keyof typeof CLOTH_COLOURS, share = 0.3): string => {
  const ink = [0x3a, 0x28, 0x16];
  const [red, green, blue] = CLOTH_COLOURS[cloth].map((channel, index) =>
    Math.round(channel * 255 * (1 - share) + (ink[index] ?? 0) * share),
  );
  return `rgb(${red}, ${green}, ${blue})`;
};

/** Each keeper's coin: its sign's board (a faction's, its banner's cloth) and the device's colour on it. */
const COINS: Readonly<Record<KeeperGlyph, readonly [coin: string, device: string]>> = {
  mage: [INK, GOLD],
  vault: [inked('crimson'), GOLD],
  weaponsmith: [INK, GOLD],
  armorsmith: [inked('crimson'), GOLD],
  tailor: [inked('verdant'), BONE],
  tack: [inked('linen', 0.15), INK],
  harbourmaster: [inked('verdant'), GOLD],
  chandler: ['#6e4d2c', BONE],
  stormcallers: [inked('stormcaller_blue'), BONE],
  lamplighters: [inked('lamplighter_gold', 0.35), PARCHMENT],
  veiled: [inked('veiled_dusk'), BONE],
};

/** An outline from the modules' devices (x across, z up, about a metre high), as units with y down, `units` a metre,
 *  its middle at `middle`. */
const outline = (points: readonly (readonly [number, number])[], units: number, middle: Point2 = [0, 0]): Point2[] =>
  points.map(([x, z]) => [middle[0] + x * units, middle[1] - z * units]);

/** A star of `points` points, `outer` and `inner` from its middle (adorn.py's `star`). */
const star = (points: number, outer: number, inner: number): [number, number][] =>
  Array.from({ length: points * 2 }, (unused, step) => {
    const radius = step % 2 === 0 ? outer : inner;
    return [radius * Math.sin((Math.PI * step) / points), radius * Math.cos((Math.PI * step) / points)];
  });

// The devices' outlines, as adorn.py lays them.
// prettier-ignore
const ANVIL: readonly [number, number][] = [
  [-0.36, 0.08], [0.3, 0.08], [0.3, 0.0], [0.12, -0.04], [0.08, -0.14], [0.2, -0.2], [0.2, -0.24], [-0.2, -0.24],
  [-0.2, -0.2], [-0.08, -0.14], [-0.12, -0.04], [-0.22, 0.0],
];
// prettier-ignore
const HELM: readonly [number, number][] = [
  [-0.2, -0.26], [0.2, -0.26], [0.21, 0.08], [0.14, 0.22], [0.0, 0.28], [-0.14, 0.22], [-0.21, 0.08],
];
// prettier-ignore
const BOLT: readonly [number, number][] = [
  [-0.1, 0.42], [0.12, 0.42], [0.0, 0.08], [0.14, 0.1], [-0.12, -0.42], [-0.02, -0.06], [-0.16, -0.08],
];
// prettier-ignore
const FLAME: readonly [number, number][] = [
  [0.0, 0.5], [0.09, 0.32], [0.12, 0.18], [0.08, 0.08], [0.0, 0.05], [-0.08, 0.08], [-0.12, 0.18], [-0.06, 0.28],
  [-0.04, 0.22],
];
// prettier-ignore
const LAMP: readonly [number, number][] = [
  [-0.26, 0.0], [0.26, 0.0], [0.16, -0.14], [0.05, -0.16], [0.05, -0.3], [0.16, -0.34], [-0.16, -0.34], [-0.05, -0.3],
  [-0.05, -0.16], [-0.16, -0.14],
];
// prettier-ignore
const BEACON: readonly [number, number][] = [
  [-0.2, -0.5], [0.2, -0.5], [0.13, 0.12], [0.17, 0.14], [0.17, 0.2], [0.12, 0.2], [0.12, 0.3], [0.16, 0.3],
  [0.0, 0.42], [-0.16, 0.3], [-0.12, 0.3], [-0.12, 0.2], [-0.17, 0.2], [-0.17, 0.14], [-0.13, 0.12],
];
/** A waxing moon: the outer arc one way, an offset inner arc back (adorn.py's `crescent`). */
const CRESCENT: readonly [number, number][] = [
  ...Array.from({ length: 15 }, (unused, step): [number, number] => {
    const angle = ((70 + (220 * step) / 14) * Math.PI) / 180;
    return [Math.cos(angle) * 0.5, Math.sin(angle) * 0.5];
  }),
  ...Array.from({ length: 11 }, (unused, step): [number, number] => {
    const angle = ((260 - (160 * step) / 10) * Math.PI) / 180;
    return [0.16 + Math.cos(angle) * 0.41, Math.sin(angle) * 0.41];
  }),
];

/** Paints `glyph` about the origin, units. */
export function paintGlyph(painter: Painter, glyph: LandGlyph): void {
  painter.save();
  painter.lineJoin = 'round';
  if (glyph in COINS) {
    const [coin, device] = COINS[glyph as KeeperGlyph];
    badge(painter, 'coin', coin);
    painter.fillStyle = device;
    painter.strokeStyle = device;
    KEEPER_DEVICES[glyph as KeeperGlyph](painter, coin);
  } else if (glyph === 'ore' || glyph === 'herbs' || glyph === 'timber' || glyph === 'salvage') {
    painter.fillStyle = PARCHMENT;
    painter.strokeStyle = LIGHT_INK;
    painter.lineWidth = 1.1;
    painter.beginPath();
    painter.arc(0, 0, RESOURCE_HALF, 0, 2 * Math.PI);
    painter.fill();
    painter.stroke();
    painter.fillStyle = LIGHT_INK;
    RESOURCE_DEVICES[glyph](painter);
  } else SITE_DEVICES[glyph as SiteGlyph](painter);
  painter.restore();
}

/** A glyph's ground: a coin, a square plate or a diamond, filled, its rim ringed in the parchment inside. */
function badge(painter: Painter, shape: 'coin' | 'square' | 'diamond', fill: string): void {
  const trace = (half: number) => {
    painter.beginPath();
    if (shape === 'coin') painter.arc(0, 0, half, 0, 2 * Math.PI);
    else if (shape === 'square') painter.rect(-half * 0.86, -half * 0.86, half * 1.72, half * 1.72);
    else
      polygon(painter, [
        [0, -half],
        [half, 0],
        [0, half],
        [-half, 0],
      ]);
  };
  painter.fillStyle = fill;
  trace(GLYPH_HALF);
  painter.fill();
  painter.lineWidth = 1.2;
  painter.strokeStyle = PARCHMENT;
  trace(GLYPH_HALF);
  painter.stroke();
  painter.lineWidth = 0.6;
  painter.strokeStyle = 'rgba(238, 222, 190, 0.55)';
  trace(GLYPH_HALF - 1.7);
  painter.stroke();
}

/** A closed path through `points`, begun anew. */
function polygon(painter: Painter, points: readonly Point2[]): void {
  points.forEach(([x, y], index) => (index === 0 ? painter.moveTo(x, y) : painter.lineTo(x, y)));
  painter.closePath();
}

const filled = (painter: Painter, points: readonly Point2[]) => {
  painter.beginPath();
  polygon(painter, points);
  painter.fill();
};

const line = (painter: Painter, width: number, ...points: Point2[]) => {
  painter.lineWidth = width;
  painter.beginPath();
  points.forEach(([x, y], index) => (index === 0 ? painter.moveTo(x, y) : painter.lineTo(x, y)));
  painter.stroke();
};

const ring = (painter: Painter, middle: Point2, radius: number, width: number) => {
  painter.lineWidth = width;
  painter.beginPath();
  painter.arc(middle[0], middle[1], radius, 0, 2 * Math.PI);
  painter.stroke();
};

const disc = (painter: Painter, middle: Point2, radius: number) => {
  painter.beginPath();
  painter.arc(middle[0], middle[1], radius, 0, 2 * Math.PI);
  painter.fill();
};

/** Each keeper's device on their coin, in the device's colour set; `coin` is the coin's, for what is cut through. */
const KEEPER_DEVICES: Readonly<Record<KeeperGlyph, (painter: Painter, coin: string) => void>> = {
  mage: (painter) => filled(painter, outline(star(8, 0.3, 0.12), 16)),
  vault: (painter) => {
    ring(painter, [-1.9, -1.9], 1.6, 1.3);
    line(painter, 1.3, [-0.8, -0.8], [3.4, 3.4]);
    line(painter, 1.2, [2.0, 2.0], [3.3, 0.7]);
    line(painter, 1.2, [3.2, 3.2], [4.3, 2.1]);
  },
  weaponsmith: (painter) => filled(painter, outline(ANVIL, 12, [0.4, -1])),
  armorsmith: (painter, coin) => {
    filled(painter, outline(HELM, 14, [0, -0.2]));
    painter.fillStyle = coin;
    painter.fillRect(-2.6, -1.2, 5.2, 0.9);
    painter.fillRect(-0.4, -1.2, 0.8, 3.4);
  },
  tailor: (painter) => {
    for (const side of [-1, 1]) {
      filled(painter, [
        [side * 0.2, 1.2],
        [side * -0.6, 1.0],
        [side * -2.6, -4.2],
      ]);
      line(painter, 1, [0, 1.2], [side * 1.3, 2.4]);
      ring(painter, [side * 1.9, 3.1], 1.0, 1);
    }
  },
  tack: (painter) => {
    const angles = Array.from({ length: 15 }, (unused, step) => ((140 + (260 * step) / 14) * Math.PI) / 180);
    const band = [
      ...angles.map((angle): Point2 => [Math.cos(angle) * 4.2, -Math.sin(angle) * 4.2 + 0.4]),
      ...[...angles].reverse().map((angle): Point2 => [Math.cos(angle) * 2.6, -Math.sin(angle) * 2.6 + 0.4]),
    ];
    filled(painter, band);
  },
  harbourmaster: (painter) => {
    ring(painter, [0, 0], 3.0, 1.1);
    for (let spoke = 0; spoke < 8; spoke++) {
      const angle = (Math.PI * 2 * spoke) / 8;
      line(painter, 0.8, [0, 0], [Math.cos(angle) * 4.6, Math.sin(angle) * 4.6]);
    }
    disc(painter, [0, 0], 1.0);
  },
  chandler: (painter) => {
    painter.fillRect(-4, 3, 8, 1);
    for (const [x, tall] of [
      [-2.4, 3.2],
      [0, 5.2],
      [2.4, 3.2],
    ] as const) {
      painter.fillRect(x - 0.6, 3 - tall, 1.2, tall);
      filled(painter, [
        [x, 3 - tall - 2.2],
        [x + 0.7, 3 - tall - 0.7],
        [x, 3 - tall - 0.3],
        [x - 0.7, 3 - tall - 0.7],
      ]);
    }
  },
  stormcallers: (painter) => filled(painter, outline(BOLT, 11.5)),
  lamplighters: (painter) => {
    filled(painter, outline(FLAME, 9, [0, 0.6]));
    filled(painter, outline(LAMP, 9, [0, 0.6]));
  },
  veiled: (painter) => {
    filled(painter, outline(CRESCENT, 9.5));
    filled(painter, outline(star(4, 0.12, 0.04), 12, [1.3, 0]));
  },
};

/** Each site's mark: where players land, a public event, a gate and a sealed door, an objective, foes and a beacon. */
const SITE_DEVICES: Readonly<Record<SiteGlyph, (painter: Painter) => void>> = {
  landing: (painter) => {
    painter.fillStyle = PARCHMENT;
    painter.strokeStyle = INK;
    painter.beginPath();
    painter.arc(0, 0, GLYPH_HALF - 0.5, 0, 2 * Math.PI);
    painter.fill();
    ring(painter, [0, 0], GLYPH_HALF - 0.5, 1.4);
    line(painter, 1.5, [-3.5, -3.2], [0, 0.2], [3.5, -3.2]);
    line(painter, 1.5, [-3.5, 0.6], [0, 4.0], [3.5, 0.6]);
  },
  event: (painter) => {
    badge(painter, 'diamond', ROUTE);
    painter.fillStyle = PARCHMENT;
    filled(painter, [
      [-0.9, -4.6],
      [0.9, -4.6],
      [0.5, 1.2],
      [-0.5, 1.2],
    ]);
    disc(painter, [0, 3.2], 1.0);
  },
  gate: (painter) => {
    badge(painter, 'square', INK);
    painter.strokeStyle = PARCHMENT;
    painter.lineWidth = 1.3;
    painter.beginPath();
    painter.moveTo(-2.8, 4.4);
    painter.lineTo(-2.8, -0.6);
    painter.arc(0, -0.6, 2.8, Math.PI, 0);
    painter.lineTo(2.8, 4.4);
    painter.stroke();
  },
  door: (painter) => {
    badge(painter, 'square', INK);
    painter.fillStyle = PARCHMENT;
    painter.beginPath();
    painter.moveTo(-2.8, 4.4);
    painter.lineTo(-2.8, -0.6);
    painter.arc(0, -0.6, 2.8, Math.PI, 0);
    painter.lineTo(2.8, 4.4);
    painter.closePath();
    painter.fill();
    painter.fillStyle = INK;
    painter.fillRect(-3.4, 0.6, 6.8, 1.3);
  },
  objective: (painter) => {
    painter.fillStyle = PARCHMENT;
    disc(painter, [0, 0], GLYPH_HALF - 0.5);
    painter.strokeStyle = ROUTE;
    painter.fillStyle = ROUTE;
    ring(painter, [0, 0], 6.2, 1.4);
    ring(painter, [0, 0], 3.4, 1.2);
    disc(painter, [0, 0], 1.3);
  },
  foes: (painter) => {
    for (const width of [3.2, 1.5]) {
      painter.strokeStyle = width > 2 ? PARCHMENT : ROUTE;
      for (const side of [-1, 1]) {
        line(painter, width, [side * -5, -5], [side * 4, 4]);
        line(painter, width, [side * -1.8, 4.6], [side * 4.6, -1.8]);
      }
    }
  },
  beacon: (painter) => {
    painter.fillStyle = PARCHMENT;
    filled(
      painter,
      outline(BEACON, 15.5, [0, 0.6]).map(([x, y]): Point2 => [x * 1.25, y * 1.1]),
    );
    painter.fillStyle = INK;
    filled(painter, outline(BEACON, 15.5, [0, 0.6]));
    painter.strokeStyle = ROUTE;
    for (const side of [-1, 0, 1])
      line(painter, 1, [side * 1.6, -7.4 + Math.abs(side)], [side * 3, -9 + Math.abs(side)]);
  },
};

/** Each resource's device on its small ring: ore's lumps, a sprig of herbs, a log of timber, a crate of salvage. */
const RESOURCE_DEVICES: Readonly<Record<ResourceGlyph, (painter: Painter) => void>> = {
  ore: (painter) => {
    filled(painter, [
      [-3.2, 2],
      [-2.2, -0.8],
      [-0.4, -1.2],
      [0.4, 2],
    ]);
    filled(painter, [
      [0, 2],
      [0.8, -2.6],
      [2.4, -1.8],
      [3.2, 2],
    ]);
  },
  herbs: (painter) => {
    painter.strokeStyle = LIGHT_INK;
    line(painter, 0.9, [0, 3.2], [0, -2.6]);
    for (const [y, side] of [
      [-1.6, -1],
      [0.2, 1],
      [1.8, -1],
    ] as const)
      filled(painter, [
        [0, y],
        [side * 2.8, y - 1.6],
        [side * 2.2, y + 0.4],
      ]);
  },
  timber: (painter) => {
    painter.fillRect(-3.4, -1.4, 5.4, 2.8);
    painter.strokeStyle = LIGHT_INK;
    ring(painter, [2.4, 0], 1.4, 0.9);
  },
  salvage: (painter) => {
    painter.strokeStyle = LIGHT_INK;
    painter.lineWidth = 1;
    painter.strokeRect(-2.8, -2.8, 5.6, 5.6);
    line(painter, 0.8, [-2.8, -2.8], [2.8, 2.8]);
    line(painter, 0.8, [2.8, -2.8], [-2.8, 2.8]);
  },
};
