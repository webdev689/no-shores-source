// A Daggerfall horse's reference for the forge's horse: its hide's and its mane's colour at each of the grade's shares,
// over every frame. The riding picture (MRED00I0.CFA) is the first-person ride's (fpride.py --reference); the brown town
// horse (TEXTURE.201 record 0) is the third-person horse's (horsegrade.py). The hide is what the dye takes for hide
// (horseCoats.js isCoatPixel, no saddle drawn); the mane is every other drawn texel: its strands, their glints, the
// bridle, the hooves. Only these numbers leave the player's data, into a file outside the repo.
//
//     ARENA2_PATH=... node tools/sprite-forge/rideReference.mjs /tmp/ride-ref.json
//     ARENA2_PATH=... node tools/sprite-forge/rideReference.mjs /tmp/horse-ref.json TEXTURE.201:0
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CfaFile } from '../../src/formats/cfaFile.js';
import { TextureFile } from '../../src/formats/textureFile.js';
import { DFPalette } from '../../src/formats/dfPalette.js';
import { frameToColor32 } from '../../src/combat/fpsWeapon.js';
import { isCoatPixel } from '../../src/systems/horse/horseCoats.js';
import { HORSE_TEXTURE } from '../../src/systems/riding.js';
import { isMain } from '../lib/isMain.mjs';

/** The shares of a part's texels the grade maps (colour.py GRADE_AT). */
export const GRADE_AT = Object.freeze([1, 10, 25, 50, 75, 90, 99]);

/** The value at share `p` (0..100) of sorted `xs`, as numpy's percentile reads it (linear between neighbours). */
export function percentile(xs, p) {
  const at = ((xs.length - 1) * p) / 100;
  const lo = Math.floor(at), hi = Math.ceil(at);
  return xs[lo] + (xs[hi] - xs[lo]) * (at - lo);
}

/** Each part's channels at the grade's shares, from RGBA pictures: { hide: [[r..], [g..], [b..]], mane: ..., count }. */
export function rideReference(pictures) {
  const parts = { hide: [[], [], []], mane: [[], [], []] };
  for (const { data } of pictures) {
    for (let i = 0; i < data.length; i += 4) {
      if (!data[i + 3]) continue;
      const part = isCoatPixel(data[i], data[i + 1], data[i + 2], false) ? parts.hide : parts.mane;
      for (let c = 0; c < 3; c++) part[c].push(data[i + c]);
    }
  }
  const at = (chs) => chs.map((xs) => GRADE_AT.map((p) => +percentile(xs.sort((a, b) => a - b), p).toFixed(1)));
  return { at: GRADE_AT, hide: at(parts.hide), mane: at(parts.mane), count: { hide: parts.hide[0].length, mane: parts.mane[0].length } };
}

if (isMain(import.meta.url)) {
  const arena2 = process.env.ARENA2_PATH;
  const [out, source = HORSE_TEXTURE] = process.argv.slice(2);
  if (!arena2 || !out) throw new Error('usage: ARENA2_PATH=... node tools/sprite-forge/rideReference.mjs <out.json> [FILE[:record]]');
  const palette = new DFPalette();
  palette.load(readFileSync(join(arena2, 'ART_PAL.COL')));
  const [file, rec = '0'] = source.split(':');
  const image = /\.CFA$/i.test(file) ? new CfaFile() : new TextureFile();
  image.load(new Uint8Array(readFileSync(join(arena2, file))), file, palette);
  const record = Number(rec);
  const pictures = Array.from({ length: image.getFrameCount(record) }, (_, f) => {
    const c32 = frameToColor32(image.getDFBitmap(record, f), palette, null);
    return { data: new Uint8Array(c32.colors.buffer) };
  });
  const ref = rideReference(pictures);
  writeFileSync(out, `${JSON.stringify(ref, null, 1)}\n`);
  console.log(`${source}: ${ref.count.hide} hide and ${ref.count.mane} mane texels -> ${out}`);
}
