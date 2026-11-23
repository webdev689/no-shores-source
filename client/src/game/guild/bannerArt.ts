import { type Banner, hexOf } from './bannerLaw.ts';
import { signRows } from './guildSigns.ts';

/**
 * A guild's banner in the game's pixels, as Destiny 2 hangs a clan's: its cloth 32 cells wide and 64 long, cut at its
 * foot, a device across it, the sign on its ground in the cloth's upper middle, soft folds down its length and a hem of
 * loops at its head that the staff's crossbar runs through. The standard is the cloth hung on its staff, a picture of
 * its own. Each is drawn from the banner's choices alone, cell by cell, never from a picture.
 */

/** The cloth's size in cells. */
export const CLOTH_WIDTH = 32;
export const CLOTH_HEIGHT = 64;
/** The standard's size in cells: the staff's crossbar wider than the cloth, its pole down to a stone foot. */
export const STANDARD_WIDTH = 40;
export const STANDARD_HEIGHT = 100;
/** Where the cloth hangs on the standard: its head on the crossbar. */
const CLOTH_AT: readonly [number, number] = [4, 6];
/** The middle of the sign and its ground on the cloth. */
const SIGN_MIDDLE: readonly [number, number] = [15.5, 27];

type Rgb = readonly [number, number, number];
const rgb = (hex: string): Rgb => {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};
const mix = (from: Rgb, to: Rgb, share: number): Rgb => [
  Math.round(from[0] + (to[0] - from[0]) * share),
  Math.round(from[1] + (to[1] - from[1]) * share),
  Math.round(from[2] + (to[2] - from[2]) * share),
];
const shade = (colour: Rgb, times: number): Rgb => [
  Math.min(255, Math.round(colour[0] * times)),
  Math.min(255, Math.round(colour[1] * times)),
  Math.min(255, Math.round(colour[2] * times)),
];
const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [255, 255, 255];

/** Whether a cell is cloth, by the banner's cut: its foot square, forked, pointed, torn or in three tails. */
export function inCloth(cut: string, x: number, y: number): boolean {
  if (x < 0 || x >= CLOTH_WIDTH || y < 0 || y >= CLOTH_HEIGHT) return false;
  // The head's loops, through which the crossbar runs: cloth in five of every eight cells.
  if (y < 2) return x % 8 < 5;
  const across = Math.abs(x - 15.5);
  switch (cut) {
    case 'square':
      return y < 56;
    case 'point':
      return y < 40 || across < 16 - ((y - 40) * 16) / 24;
    case 'three-tails': {
      const notch = ((y - 47) * 2.5) / 16;
      return y < 48 || (Math.abs(x - 10.5) >= notch && Math.abs(x - 21.5) >= notch);
    }
    case 'tattered': {
      // A foot frayed unevenly, with two rents torn up into the cloth.
      const hangs = 52 + Math.round(3 * Math.sin(x * 1.3) + 2 * Math.sin(x * 0.5 + 1)) + ((x * 7) % 3);
      const rent = (x === 9 && y > hangs - 9) || (x === 22 && y > hangs - 6);
      return y < hangs && !rent;
    }
    default:
      return y < 46 || across >= ((y - 45) * 10) / 18;
  }
}

/** Whether a cell of the cloth bears the device. */
export function onDevice(device: string, cut: string, x: number, y: number): boolean {
  switch (device) {
    case 'halves':
      return x >= 16;
    case 'stripe':
      return x >= 11 && x <= 20;
    case 'bar':
      return y >= 22 && y <= 33;
    case 'slash':
      return Math.abs(x - 16 - (y - 28) * 0.5) < 5;
    case 'cross':
      return (x >= 13 && x <= 18) || (y >= 25 && y <= 30);
    case 'crossed':
      return Math.abs(x - 15.5 - (y - 28) * 0.5) < 3 || Math.abs(x - 15.5 + (y - 28) * 0.5) < 3;
    case 'chevron': {
      const into = y - 36 + Math.abs(x - 15.5) * 0.9;
      return into >= 0 && into < 7;
    }
    case 'quarters':
      return x < 16 === y < 30;
    case 'border':
      return y >= 4 && [-3, 0, 3].some((across) => [-3, 0, 3].some((down) => !inCloth(cut, x + across, y + down)));
    case 'stripes':
      return x % 6 < 3;
    case 'waves':
      return (y + Math.round(Math.sin(x / 2.5) * 1.5) + 64) % 8 < 3;
    case 'checks':
      return ((x >> 2) + (y >> 2)) % 2 === 0;
    default:
      return false;
  }
}

/** Whether a cell lies on the sign's ground. */
function onGround(ground: string, x: number, y: number): boolean {
  const [middleX, middleY] = SIGN_MIDDLE;
  const [across, down] = [x - middleX, y - middleY];
  switch (ground) {
    case 'roundel':
      return across * across + down * down <= 11.5 * 11.5;
    case 'shield':
      return x >= 5 && x <= 26 && y >= 15 && (y <= 31 || Math.abs(across) <= ((40 - y) * 10.5) / 9);
    case 'lozenge':
      return Math.abs(across) / 12 + Math.abs(down) / 14 <= 1;
    default:
      return false;
  }
}

/** The sign's cells on the cloth: 1 its colour, 2 its lighter shade, by cell index; centred on the sign's middle. */
function signOnCloth(sign: string): Map<number, 1 | 2> {
  const rows = signRows(sign);
  const filled = rows.flatMap((row, y) => [...row].flatMap((char, x) => (char === '.' ? [] : [[x, y, char] as const])));
  const cells = new Map<number, 1 | 2>();
  if (filled.length === 0) return cells;
  const [left, right] = [Math.min(...filled.map(([x]) => x)), Math.max(...filled.map(([x]) => x))];
  const [top, bottom] = [Math.min(...filled.map(([, y]) => y)), Math.max(...filled.map(([, y]) => y))];
  const offsetX = Math.round(SIGN_MIDDLE[0] - (right - left) / 2) - left;
  const offsetY = Math.round(SIGN_MIDDLE[1] - (bottom - top) / 2) - top;
  for (const [x, y, char] of filled) cells.set((y + offsetY) * CLOTH_WIDTH + x + offsetX, char === '+' ? 2 : 1);
  return cells;
}

/** A colour's lighter shade, for a sign's `+` cells: lighter, or darker where it is already near white. */
function lit(colour: Rgb): Rgb {
  return colour[0] + colour[1] + colour[2] > 600 ? mix(colour, BLACK, 0.28) : mix(colour, WHITE, 0.32);
}

/** The cloth's cells as colours, four numbers each, see-through where the cut takes it away. */
export function clothPixels(banner: Banner): Uint8ClampedArray<ArrayBuffer> {
  const [cloth, device, ground, sign] = [banner.cloth, banner.deviceColour, banner.groundColour, banner.signColour].map(
    (colour) => rgb(hexOf(colour)),
  ) as [Rgb, Rgb, Rgb, Rgb];
  const signCells = signOnCloth(banner.sign);
  const isSign = (x: number, y: number) => x >= 0 && x < CLOTH_WIDTH && signCells.has(y * CLOTH_WIDTH + x);
  const grounded = (x: number, y: number) => inCloth(banner.cut, x, y) && onGround(banner.ground, x, y);
  const pixels = new Uint8ClampedArray(CLOTH_WIDTH * CLOTH_HEIGHT * 4);
  for (let y = 0; y < CLOTH_HEIGHT; y++)
    for (let x = 0; x < CLOTH_WIDTH; x++) {
      if (!inCloth(banner.cut, x, y)) continue;
      const near = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ] as const;
      let colour = onDevice(banner.device, banner.cut, x, y) ? device : cloth;
      if (grounded(x, y))
        colour = near.every(([across, down]) => grounded(across, down)) ? ground : shade(ground, 0.55);
      const signCell = signCells.get(y * CLOTH_WIDTH + x);
      if (signCell !== undefined) colour = signCell === 1 ? sign : lit(sign);
      else if (near.some(([across, down]) => isSign(across, down))) colour = mix(colour, BLACK, 0.55);
      // The hem at its head is folded double, so it reads darker; the cloth falls in soft folds and darkens below.
      if (y < 4) colour = shade(colour, 0.72);
      const folds = 1 + 0.07 * Math.cos(((x + 0.5) * Math.PI) / 4) - Math.max(0, y - 40) * 0.004;
      colour = shade(colour, folds);
      if (y >= 2 && near.some(([across, down]) => !inCloth(banner.cut, across, down))) colour = shade(colour, 0.62);
      pixels.set([...colour, 255], (y * CLOTH_WIDTH + x) * 4);
    }
  return pixels;
}

/** Each staff's wood or metal: its face, its shadow, its light and the colour of its bands or lashings. */
const STAFF_TONES: Readonly<Record<string, readonly [string, string, string, string]>> = {
  driftwood: ['#b5a78c', '#7d715d', '#d8ccb2', '#8b7a55'],
  oak: ['#6a4426', '#3f2614', '#8a5c36', '#55585e'],
  iron: ['#45484e', '#26282c', '#6c7078', '#8a8e96'],
  brass: ['#c9a24a', '#8a6a26', '#ecd27c', '#6d5220'],
  whalebone: ['#e6dcc4', '#b3a789', '#f6f0e0', '#8f8468'],
  gilded: ['#e0bb48', '#94711f', '#f6e08a', '#4a2f1a'],
};
/** Each staff's finial over the crossbar, five rows of four cells: `#` its face, `+` its bands. */
const FINIALS: Readonly<Record<string, readonly string[]>> = {
  driftwood: ['.##.', '####', '.##.', '.++.', '.##.'],
  oak: ['.++.', '++++', '++++', '.##.', '.##.'],
  iron: ['.#..', '.##.', '####', '.##.', '.++.'],
  brass: ['.##.', '####', '####', '.##.', '.++.'],
  whalebone: ['##..', '#...', '##..', '.##.', '.##.'],
  gilded: ['#..#', '#++#', '####', '.##.', '.++.'],
};
const STONE: readonly [Rgb, Rgb] = [rgb('#6b6760'), rgb('#4a4743')];

/** The standard: the staff's pole, crossbar and finial, the cloth hung from the crossbar, and a stone foot. */
export function standardPixels(banner: Banner): Uint8ClampedArray<ArrayBuffer> {
  const [face, shadow, light, band] = (STAFF_TONES[banner.staff] ?? STAFF_TONES['driftwood'] ?? []).map(rgb) as [
    Rgb,
    Rgb,
    Rgb,
    Rgb,
  ];
  const pixels = new Uint8ClampedArray(STANDARD_WIDTH * STANDARD_HEIGHT * 4);
  const put = (x: number, y: number, colour: Rgb) => pixels.set([...colour, 255], (y * STANDARD_WIDTH + x) * 4);
  const poleTones = [shadow, face, light, face];
  for (let y = 5; y < STANDARD_HEIGHT - 4; y++)
    for (let x = 18; x < 22; x++) put(x, y, y % 12 === 0 ? band : (poleTones[x - 18] ?? face));
  for (let x = 0; x < STANDARD_WIDTH; x++) {
    const end = x < 2 || x >= STANDARD_WIDTH - 2;
    put(x, 6, end ? band : light);
    put(x, 7, end ? band : face);
    put(x, 8, shadow);
  }
  const finial = FINIALS[banner.staff] ?? FINIALS['driftwood'] ?? [];
  finial.forEach((row, y) =>
    [...row].forEach((char, x) => char !== '.' && put(18 + x, y + 1, char === '+' ? band : face)),
  );
  for (let y = STANDARD_HEIGHT - 5; y < STANDARD_HEIGHT; y++)
    for (let x = 13; x < 27; x++) put(x, y, y === STANDARD_HEIGHT - 5 ? STONE[0] : STONE[1]);
  const cloth = clothPixels(banner);
  for (let y = 0; y < CLOTH_HEIGHT; y++)
    for (let x = 0; x < CLOTH_WIDTH; x++) {
      const from = (y * CLOTH_WIDTH + x) * 4;
      if (cloth[from + 3] === 0) continue;
      const [atX, atY] = [CLOTH_AT[0] + x, CLOTH_AT[1] + y];
      pixels.set(cloth.subarray(from, from + 4), (atY * STANDARD_WIDTH + atX) * 4);
    }
  return pixels;
}

/** A key that names a banner's look, for pictures kept by it. */
export function bannerKey(banner: Banner): string {
  return [banner.cut, banner.cloth, banner.device, banner.deviceColour, banner.sign, banner.signColour]
    .concat([banner.ground, banner.groundColour, banner.staff])
    .join(' ');
}
