// The races' hair colours for the forge's hair (src/systems/studioArt/forgeHair.js). Each race's hair is read off
// Daggerfall's own faces (FACE<gender><race>I0.CIF): each face's colour (forgeHair.js FACE_HAIR) takes the texels of
// the palette's runs that colour is drawn in, less the race's own skin (its paper-doll body's colours), and each
// race's faces of one colour are pooled. Sorted by brightness, they are taken at SHARES even shares, so a texel's
// share of the hair's light gives its colour. Where the race's skin is drawn in the hair's own colours (the Dark Elf's
// grey skin, its white hair), its middle light goes with the skin: that ramp keeps its own darkest and brightest and
// takes the other races' spread between (`filled`). Beside each race's, the body's own across every race.
//
//   ARENA2_PATH=... node tools/sprite-forge/haircolours.mjs      writes src/systems/studioArt/forgeHairColours.json
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CifRciFile } from '../../src/formats/cifRciFile.js';
import { ImgFile } from '../../src/formats/imgFile.js';
import { DFPalette } from '../../src/formats/dfPalette.js';
import { FACE_HAIR, HAIR_COLOURS, FACES } from '../../src/systems/studioArt/forgeHair.js';
import { isMain } from '../lib/isMain.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const OUT = join(HERE, '..', '..', 'src', 'systems', 'studioArt', 'forgeHairColours.json');
/** The races with hair, in Daggerfall's order (their art index): the six of men and mer and the Khajiit. */
export const RACES = Object.freeze(['breton', 'redguard', 'nord', 'darkelf', 'highelf', 'woodelf', 'khajiit']);
export const SHARES = 16;
/** The runs of the palette (first and last index) each colour's hair is drawn in: black's blue sheen, greys and near
 *  blacks, the browns and tans, the reds, the yellows, the teals and the greens. */
export const RUNS_OF = Object.freeze({
  black: [[80, 127], [216, 223]], grey: [[80, 95], [112, 127], [216, 223]], white: [[80, 95], [112, 127]],
  brown: [[32, 47], [64, 79], [176, 191], [208, 215]], auburn: [[176, 191], [240, 254]],
  red: [[176, 191], [224, 254]], blond: [[144, 159], [224, 239]], teal: [[128, 143]], green: [[160, 175], [192, 207]],
});
const SKIN_USES = 3;   // a palette colour the body's skin draws this many texels in is skin, never hair
const HUE_OFF = 0.08;   // a body texel this far off its median hue is cloth or hair (raceskins.mjs)

const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
export const GAP = 40;   // a jump in light this big between two shares under the brightest: the skin took its middle

/** The palette indices a body picture draws its skin in: its texels of the body's own hue, used SKIN_USES times. */
export function skinIndices(indices, rgbOf) {
  const texels = [...indices].filter((i) => i && lum(rgbOf(i)) > 12);
  const hue = (i) => { const c = rgbOf(i), s = Math.max(1, c[0] + c[1] + c[2]); return c.map((v) => v / s); };
  const median = [0, 1, 2].map((k) => texels.map((i) => hue(i)[k]).sort((a, b) => a - b)[texels.length >> 1]);
  const count = new Map();
  for (const i of texels) {
    if (Math.hypot(...hue(i).map((v, k) => v - median[k])) <= HUE_OFF) count.set(i, (count.get(i) ?? 0) + 1);
  }
  return new Set([...count].filter(([, n]) => n >= SKIN_USES).map(([i]) => i));
}

/** A face's hair texels in one colour: its palette indices in that colour's runs, less the skin's. */
export function hairTexels(indices, colour, skin) {
  const runs = RUNS_OF[colour] ?? [];
  return [...indices].filter((i) => i && runs.some(([lo, hi]) => i >= lo && i <= hi) && !skin.has(i));
}

/** Texels' colours sorted by brightness, at SHARES even shares: each share the mean of its own texels. */
export function hairRampOf(colours) {
  const sorted = [...colours].sort((a, b) => lum(a) - lum(b));
  const n = sorted.length;
  return Array.from({ length: SHARES }, (_, k) => {
    const lo = Math.floor((k / SHARES) * n), hi = Math.max(lo + 1, Math.floor(((k + 1) / SHARES) * n));
    const sum = [0, 0, 0];
    for (let i = lo; i < hi; i++) for (let c = 0; c < 3; c++) sum[c] += sorted[i][c];
    return sum.map((v) => Math.round(v / (hi - lo)));
  });
}

/** Whether a ramp's light jumps by GAP or more between two shares under its brightest (its sheen may stand apart). */
export const gapped = (ramp) => ramp.slice(1, -1).some((c, k) => lum(c) - lum(ramp[k]) >= GAP);

/** A ramp with a gap filled: its own darkest and brightest kept, and between them the spread of `others` (the same
 *  colour on other races' faces), channel by channel. */
export function filled(own, others) {
  const n = own.length - 1;
  return own.map((_, k) => [0, 1, 2].map((c) => {
    const span = others[n][c] - others[0][c];
    const share = span > 0 ? (others[k][c] - others[0][c]) / span : k / n;
    return Math.round(own[0][c] + share * (own[n][c] - own[0][c]));
  }));
}

if (isMain(import.meta.url)) {
  const arena2 = process.env.ARENA2_PATH;
  if (!arena2) throw new Error('ARENA2_PATH is not set (sh tools/fetch-data.sh)');
  const pal = new DFPalette();
  pal.load(new Uint8Array(readFileSync(join(arena2, 'ART_PAL.COL'))), 'ART_PAL.COL');
  const rgbOf = (i) => [pal.getRed(i), pal.getGreen(i), pal.getBlue(i)];
  const MIN = 120;   // the fewest texels a race's colour is read from; fewer, it takes the body's own
  const bodies = {};
  for (const [g, body] of [['0', 'male'], ['1', 'female']]) {
    const own = { '*': {} }, every = {};
    RACES.forEach((race, r) => {
      const img = new ImgFile();
      const bodyName = `BODY${g}${r}I0.IMG`;
      if (!img.load(new Uint8Array(readFileSync(join(arena2, bodyName))), bodyName, pal)) throw new Error(`${bodyName} would not load`);
      const skin = skinIndices(img.getDFBitmap(0, 0).data, rgbOf);
      const cif = new CifRciFile();
      const faceName = `FACE${g}${r}I0.CIF`;
      if (!cif.load(new Uint8Array(readFileSync(join(arena2, faceName))), faceName, pal)) throw new Error(`${faceName} would not load`);
      const pooled = {};
      for (let face = 0; face < FACES; face++) {
        const [, colour] = (FACE_HAIR[body][race][face] ?? '').split(' ');
        if (!colour) continue;
        const texels = hairTexels(cif.getDFBitmap(face, 0).data, colour, skin).map(rgbOf);
        (pooled[colour] ??= []).push(...texels);
        (every[colour] ??= []).push({ race, texels });
      }
      own[race] = Object.fromEntries(Object.entries(pooled).filter(([, t]) => t.length >= MIN)
        .map(([colour, t]) => [colour, hairRampOf(t)]));
    });
    for (const colour of HAIR_COLOURS) {
      if (!every[colour]?.length) continue;
      own['*'][colour] = hairRampOf(every[colour].flatMap((f) => f.texels));
      for (const race of RACES) {
        const ramp = own[race]?.[colour];
        if (!ramp || !gapped(ramp)) continue;
        const others = every[colour].filter((f) => f.race !== race).flatMap((f) => f.texels);
        if (others.length >= MIN) own[race][colour] = filled(ramp, hairRampOf(others));
      }
    }
    bodies[body] = own;
  }
  writeFileSync(OUT, JSON.stringify({ shares: SHARES, colours: HAIR_COLOURS, bodies }) + '\n');
  console.log(`forgeHairColours.json: ${RACES.length} races, ${SHARES} shares, both bodies`);
}
