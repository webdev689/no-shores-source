// The materials a picture is painted in, each the palette's own runs it is drawn from: light and grain move a place
// along its material, and the render lands it on the palette's shades of that hue. A material written `name:dim`
// keeps two shades darker.
import { exp } from './portableMath.ts';
import type { Accent, PaletteShades } from './render.ts';

/** One of the palette's sixteen runs a material keeps to: [run, lightest shade, darkest shade], and a fourth number
 *  for an accent run, its share of the texels. Shade 0 is a run's lightest. */
export type PaletteRun = readonly number[];
/** How many texels each palette index takes, by index. */
export type Counts = Readonly<Record<number, number>>;

/** The palette's runs by name, 0 to 15. */
const RUN: Readonly<Record<string, number>> = {
  yel: 0,
  tgr: 1,
  pch: 2,
  mau: 3,
  snd: 4,
  lav: 5,
  blu: 6,
  gry: 7,
  tea: 8,
  ylw: 9,
  sag: 10,
  rbr: 11,
  grs: 12,
  org: 13,
  fir: 14,
  red: 15,
};
const { yel, tgr, pch, mau, snd, lav, blu, gry, tea, ylw, sag, rbr, grs, org, fir, red } = RUN;
/** Row 13 holds two runs: an orange-brown one (shades 0-7) and the darkest greys (8-15). */
const DARK: PaletteRun = [org, 8, 15];

// prettier-ignore
const PALETTE_RUNS: Readonly<Record<string, readonly PaletteRun[]>> = {
  stone: [[gry, 4, 13], [lav, 6, 14]],
  stoneBlue: [[lav, 7, 14], [gry, 9, 15, 0.2]],
  stoneDark: [[gry, 6, 13], [lav, 4, 14], DARK],
  stoneGreen: [[sag, 7, 15], [gry, 9, 14]],
  sandstone: [[snd, 0, 7], [pch, 0, 7, 0.25]],
  adobe: [[snd, 3, 14], [pch, 4, 15]],
  mortar: [[org, 8, 11], [gry, 13, 15, 0.2]],
  rockGrey: [[gry, 6, 13], [lav, 11, 14]],
  slate: [[lav, 7, 15], DARK],
  cobbleBrown: [[snd, 9, 15], [pch, 12, 15, 0.3], [gry, 6, 13, 0.12]],
  plaster: [[snd, 1, 12], [pch, 1, 6, 0.15]],
  plasterWhite: [[gry, 0, 9], [lav, 0, 6]],
  plasterGrey: [[gry, 4, 11], [lav, 3, 9]],
  wood: [[pch, 6, 12], [rbr, 7, 13]],
  timber: [[pch, 8, 15]],
  woodGap: [[org, 3, 7], [pch, 13, 15]],
  woodDark: [[rbr, 8, 15], [pch, 11, 15], DARK],
  woodPale: [[snd, 4, 15], [pch, 3, 15, 0.18]],
  woodRed: [[pch, 6, 13], [rbr, 6, 12]],
  woodGrey: [[tgr, 4, 15], [gry, 8, 14]],
  woodOlive: [[snd, 9, 15], [pch, 12, 15]],
  woodPainted: [[red, 6, 14], [rbr, 4, 13]],
  brick: [[red, 4, 13], [pch, 5, 14]],
  brickDark: [[red, 7, 13], [pch, 8, 14, 0.18], [snd, 7, 14, 0.05]],
  brickTan: [[snd, 2, 12], [pch, 3, 12]],
  roofTile: [[red, 3, 12], [org, 8, 11, 0.06]],
  thatch: [[snd, 4, 13]],
  shingle: [[snd, 6, 15], [pch, 13, 15, 0.15], [org, 8, 11, 0.09]],
  marble: [[gry, 0, 8], [lav, 0, 6]],
  marbleTeal: [[tea, 3, 14]],
  marblePink: [[mau, 0, 10]],
  marbleGreen: [[sag, 0, 11]],
  marbleBlack: [DARK, [gry, 11, 15]],
  marbleRed: [[rbr, 2, 12], [red, 6, 12]],
  iron: [[gry, 2, 15], DARK],
  rust: [[rbr, 1, 13], [fir, 8, 15, 0.18], [org, 0, 7, 0.1]],
  bronze: [[snd, 7, 15], [org, 0, 7], DARK],
  gold: [[yel, 1, 15], [ylw, 2, 12]],
  glassDark: [DARK, [blu, 12, 15]],
  glassBlue: [[blu, 0, 12]],
  glassCyan: [[tea, 3, 14]],
  glassLit: [[fir, 0, 12], [yel, 1, 12]],
  grass: [[grs, 10, 12], [sag, 7, 13]],
  grassSwamp: [[sag, 6, 15], [grs, 9, 15]],
  grassMountain: [[sag, 5, 15], [grs, 7, 14]],
  dirt: [[snd, 4, 11]],
  dirtDark: [[snd, 8, 15], [tgr, 10, 15]],
  sand: [[snd, 0, 9], [yel, 8, 15]],
  mud: [[tgr, 8, 15], [snd, 11, 15]],
  water: [[blu, 5, 11], [tea, 6, 12, 0.04]],
  snow: [[lav, 0, 6], [gry, 0, 5]],
  ice: [[tea, 0, 6], [blu, 0, 4]],
  lava: [[fir, 0, 15], [red, 0, 9]],
  fire: [[fir, 0, 15], [red, 0, 5]],
  moss: [[sag, 7, 15], [grs, 11, 14]],
  leaf: [[grs, 2, 14], [sag, 3, 15]],
  leafDark: [[sag, 9, 15], [grs, 10, 15]],
  bark: [[pch, 9, 15], [snd, 9, 15], [org, 8, 11, 0.06]],
  petalYellow: [[ylw, 0, 10], [yel, 1, 12]],
  clothRed: [[red, 3, 14], [rbr, 4, 14]],
  clothBlue: [[blu, 3, 15]],
  clothGreen: [[sag, 3, 15], [grs, 6, 15]],
  clothYellow: [[ylw, 1, 13]],
  clothPurple: [[mau, 2, 15]],
  parchment: [[snd, 0, 9], [pch, 0, 8]],
  slime: [[ylw, 5, 15], [grs, 6, 12]],
  black: [[org, 8, 12]],
  rubbleWarm: [[snd, 6, 15], [gry, 7, 15], [lav, 12, 15, 0.12], [tea, 14, 15, 0.04]],
  flagstone: [[lav, 8, 14], [blu, 11, 14, 0.1], [gry, 9, 14, 0.15]],
  shore: [[gry, 9, 12], [lav, 8, 11], [sag, 5, 8, 0.3], [mau, 10, 13, 0.06]],
  white: [[gry, 0, 3]],
};

/** A material's shades written as a rule: its runs and how many texels each palette index takes. */
export interface ShadeRule {
  readonly runs: PaletteRun[];
  readonly counts: Record<number, number>;
}

/**
 * Read a rule: comma-separated runs, each `name peak light/dark *weight` - the run, the shade most of its texels
 * take, how many shades they spread to the light side and to the dark, and the run's weight among the material's
 * runs (1 if left out). A `~` before the name makes the run an accent at that weight.
 */
export function shadeSpec(text: string): ShadeRule {
  const runs: PaletteRun[] = [];
  const counts: Record<number, number> = {};
  for (const part of text.split(',')) {
    const [head, peakText, spreadText, weightText] = part.trim().split(/\s+/);
    const accent = head.startsWith('~');
    const run = RUN[head.replace('~', '')];
    if (run === undefined) throw new Error(`textures: no run '${head}' in shades '${text}'`);
    const peak = Number(peakText);
    const [lighter, darker] = spreadText.split('/').map(Number);
    const weight = weightText ? Number(weightText.replace('*', '')) : 1;
    // row 13 is two runs: a peak in its dark half keeps to the dark half, one in its light half to the light
    const floor = run === org && peak >= 8 ? 8 : 0;
    const ceil = run === org && peak < 8 ? 7 : 15;
    const lightest = Math.max(floor, Math.round(peak - 2.5 * lighter));
    const darkest = Math.min(ceil, Math.round(peak + 2.5 * darker));
    if (accent) {
      runs.push([run, lightest, darkest, weight]);
      continue;
    }
    runs.push([run, lightest, darkest]);
    let sum = 0;
    const bell: number[] = [];
    for (let shade = lightest; shade <= darkest; shade++) {
      const ratio = (shade - peak) / Math.max(0.05, shade < peak ? lighter : darker);
      const value = exp(-0.5 * (ratio * ratio));
      bell.push(value);
      sum += value;
    }
    bell.forEach((value, k) => (counts[run * 16 + lightest + k] = (1000 * weight * value) / sum));
  }
  return { runs, counts };
}

/** A picture's materials: `index` names each one's number, the other lists are by that number. */
export interface Materials {
  readonly index: Readonly<Record<string, number>>;
  readonly runs: (readonly PaletteRun[])[];
  readonly counts: (Counts | null)[];
}

/** A material by name, or written out: its name, runs and counts. */
export type MaterialEntry = string | readonly [string, readonly PaletteRun[], Counts | undefined];

/** A picture's materials from names (a name may end `:dim`) or written-out entries; a repeated name is kept once. */
export function materials(entries: readonly MaterialEntry[]): Materials {
  const index: Record<string, number> = {};
  const out: Materials = { index, runs: [], counts: [] };
  for (const entry of entries) {
    const [key, runs, counts] = typeof entry === 'string' ? [entry, runsOf(entry), undefined] : entry;
    if (Object.hasOwn(index, key)) continue;
    index[key] = out.runs.length;
    out.runs.push(runs);
    out.counts.push(counts ?? null);
  }
  return out;
}

/** A material's palette runs; `:dim` moves its window two shades darker. */
function runsOf(name: string): readonly PaletteRun[] {
  const [base, kind] = name.split(':');
  const runs = PALETTE_RUNS[base];
  if (!runs) throw new Error(`textures: no material '${base}'`);
  const shift = kind === 'dim' ? 2 : 0;
  return runs.map(([run, lightest, darkest, share]) => {
    const floor = run === org && lightest >= 8 ? 8 : 0;
    const ceil = run === org && darkest <= 7 ? 7 : 15;
    const moved = [
      run,
      Math.max(floor, Math.min(ceil, lightest + shift)),
      Math.max(floor, Math.min(ceil, darkest + shift)),
    ];
    return share === undefined ? moved : [...moved, share];
  });
}

interface Candidate {
  readonly index: number;
  key: number;
}

/**
 * Each material's shades in the palette, darkest first: the indices its runs cover (never index 0, a record's clear
 * texel). One run keeps its painters' order, light to dark by index; runs merged as equals are ordered by light. A
 * material given counts is drawn in those proportions. `rgb` is the palette's 256 colours, flat.
 */
export function paletteShades(mats: Materials, rgb: Uint8Array): PaletteShades {
  const lum = (i: number): number => 0.2126 * rgb[i * 3] + 0.7152 * rgb[i * 3 + 1] + 0.0722 * rgb[i * 3 + 2];
  const order = (list: Candidate[], byLight: boolean): Int16Array =>
    Int16Array.from(
      list
        .sort((a, b) => (byLight ? lum(a.index) - lum(b.index) : a.key - b.key || lum(a.index) - lum(b.index)))
        .map((candidate) => candidate.index),
    );
  const shades: Int16Array[] = [];
  const accents: Accent[][] = [];
  const weights: (Float32Array | null)[] = [];
  mats.runs.forEach((runs, k) => {
    const own: Candidate[] = [];
    const accent: Accent[] = [];
    for (const [run, lightest, darkest, share] of runs) {
      const list: Candidate[] = [];
      for (let i = lightest; i <= darkest; i++)
        if (run * 16 + i > 0)
          list.push({ index: run * 16 + i, key: darkest === lightest ? 0.5 : (i - lightest) / (darkest - lightest) });
      // the run's lightest shade keys 1 and its darkest 0
      for (const candidate of list) candidate.key = 1 - candidate.key;
      if (share === undefined) own.push(...list);
      else {
        const sorted = order(list, false);
        accent.push({ share, shades: sorted, lum: [...sorted].map(lum) });
      }
    }
    const primaries = runs.filter((run) => run[3] === undefined).length;
    const list = order(own, primaries > 1);
    if (!list.length) throw new Error(`textures: material ${k} has no shades`);
    shades.push(list);
    accents.push(accent);
    // one set of counts over the same shades is one set of weights, so the render ranks its materials together
    const counts = mats.counts[k];
    const twin = counts
      ? weights.findIndex((_weights, j) => mats.counts[j] === counts && shades[j].join() === list.join())
      : -1;
    weights.push(twin >= 0 ? weights[twin] : counts ? Float32Array.from(list, (index) => counts[index] ?? 0) : null);
  });
  return { rgb, shades, accents, lum, weights };
}
