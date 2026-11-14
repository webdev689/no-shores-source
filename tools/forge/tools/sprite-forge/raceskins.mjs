// The races' skins for the forge's bodies (src/systems/studioArt/forgeRaces.js). Each race's skin is read off
// Daggerfall's own paper-doll body (BODY<gender><race>I0.IMG): its skin texels sorted by brightness and taken at 64
// even shares, each the mean of the texels about it, so a palette's steps do not show. Beside them, each body's own
// skin ramp a view (its mannequin's grade), which the game reads a pixel's share of the skin off.
//
// The beast races' hides are the forge's to render (beastfolk.py): the Khajiit's fur, the Argonian's scales and its
// belly's ribs, each read the same way (a belly texel is yellower than the scales: its blue under BELLY of its green).
//
//   ARENA2_PATH=... node tools/sprite-forge/raceskins.mjs      writes src/systems/studioArt/forgeRaceSkins.json
//                                                              and tools/sprite-forge/specs/beast-skins.json
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ImgFile } from '../../src/formats/imgFile.js';
import { DFPalette } from '../../src/formats/dfPalette.js';
import { isMain } from '../lib/isMain.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const OUT = join(HERE, '..', '..', 'src', 'systems', 'studioArt', 'forgeRaceSkins.json');
export const BEAST_OUT = join(HERE, 'specs', 'beast-skins.json');
export const BELLY = 0.5;
/** The six races of men and mer, in Daggerfall's order (their art index); the beast races wear fur and scales. */
export const RACES = Object.freeze(['breton', 'redguard', 'nord', 'darkelf', 'highelf', 'woodelf']);
export const SHARES = 64;
export const VIEWS = 5;
const WINDOW = 0.02;   // each share's colour: the mean of the texels this share either side of it
// Daggerfall paints its High Elves from the Breton skin and its Wood Elves from the Nord's. Here each is cast, channel
// by channel, so the six read as six races. The palette holds no gold skin (a gold cast snaps to orange specks), so
// the High Elf takes its palest, yellowest tans and the Wood Elf its copper browns.
export const CAST = Object.freeze({ highelf: [1.25, 1.3, 1.25], woodelf: [0.86, 0.76, 0.6] });

/** A ramp cast by a race's [r, g, b] factors, held to the byte. */
export function castRamp(ramp, cast) {
  return cast ? ramp.map((c) => c.map((v, i) => Math.min(255, Math.round(v * cast[i] * 10) / 10))) : ramp;
}

const HUE_OFF = 0.08;   // a texel this far off the body's own hue (its r, g, b over their sum) is hair or cloth

/** One body's skin: its opaque texels brighter than the outline's black and of the body's own hue, as [r, g, b] by
 *  brightness, at SHARES shares. `keep(r, g, b)` takes only some texels: an Argonian's scales or its belly. */
export function skinRamp(rgba, keep = () => true) {
  let texels = [];
  for (let i = 0; i < rgba.length; i += 4) {
    if (!rgba[i + 3] || !keep(rgba[i], rgba[i + 1], rgba[i + 2])) continue;
    const lum = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    if (lum > 12) texels.push([lum, rgba[i], rgba[i + 1], rgba[i + 2]]);
  }
  const hue = (t) => [1, 2, 3].map((c) => t[c] / Math.max(1, t[1] + t[2] + t[3]));
  const median = [0, 1, 2].map((c) => texels.map((t) => hue(t)[c]).sort((a, b) => a - b)[texels.length >> 1]);
  texels = texels.filter((t) => Math.hypot(...hue(t).map((v, c) => v - median[c])) <= HUE_OFF);
  texels.sort((a, b) => a[0] - b[0]);
  const n = texels.length;
  return Array.from({ length: SHARES }, (_, k) => {
    const at = (k + 0.5) / SHARES;
    const lo = Math.max(0, Math.floor((at - WINDOW) * n)), hi = Math.min(n, Math.ceil((at + WINDOW) * n));
    const sum = [0, 0, 0];
    for (let i = lo; i < hi; i++) for (let c = 0; c < 3; c++) sum[c] += texels[i][c + 1];
    return sum.map((v) => Math.round((v / Math.max(1, hi - lo)) * 10) / 10);
  });
}

/** A body's skin ramp in each view, as the forge grades its bare skin (specs/mannequin-<body>.json `skin@<view>`). */
export function bodySkin(body) {
  const grade = JSON.parse(readFileSync(join(HERE, 'specs', `mannequin-${body}.json`), 'utf8')).grade;
  return Array.from({ length: VIEWS }, (_, v) => (grade[`skin@${v}`] ?? grade.skin).ramp[1]);
}

function bodyRgba(arena2, name) {
  const pal = new DFPalette();
  pal.load(new Uint8Array(readFileSync(join(arena2, 'ART_PAL.COL'))), 'ART_PAL.COL');
  const im = new ImgFile();
  if (!im.load(new Uint8Array(readFileSync(join(arena2, name))), name, pal)) throw new Error(`${name} would not load`);
  const bm = im.getDFBitmap(0, 0);
  return new Uint8Array(im.getColor32(bm, -1, 0, -1, 255).colors.buffer);
}

if (isMain(import.meta.url)) {
  const arena2 = process.env.ARENA2_PATH;
  if (!arena2) throw new Error('ARENA2_PATH is not set (sh tools/fetch-data.sh)');
  const bodies = {}, beasts = {};
  for (const [g, body] of [['0', 'male'], ['1', 'female']]) {
    const races = Object.fromEntries(RACES.map((race, r) =>
      [race, castRamp(skinRamp(bodyRgba(arena2, `BODY${g}${r}I0.IMG`)), CAST[race])]));
    bodies[body] = { skin: bodySkin(body), races };
    const belly = (r, g, b) => b < BELLY * g;
    beasts[body] = {
      khajiit: { hide: skinRamp(bodyRgba(arena2, `BODY${g}6I0.IMG`)) },
      argonian: { hide: skinRamp(bodyRgba(arena2, `BODY${g}7I0.IMG`), (r, gr, b) => !belly(r, gr, b)),
        belly: skinRamp(bodyRgba(arena2, `BODY${g}7I0.IMG`), belly) },
    };
  }
  writeFileSync(OUT, JSON.stringify({ races: RACES, bodies }) + '\n');
  writeFileSync(BEAST_OUT, JSON.stringify(beasts) + '\n');
  console.log(`forgeRaceSkins.json: ${RACES.length} races, ${SHARES} shares, both bodies; beast-skins.json`);
}
