// The first-person sword's reference: Diverse Weapons' longsword (RealAKP's paintings, a folder of the mod's PNGs the
// tree does not carry), read as fpfit.py reads a classic archive. The forge's sword is fitted to it:
// its hilt and fist in sight, where Daggerfall's frames cut the blade off below the guard. The idle is the mod's
// Weapon Widget idle (`w_LONGSWORD.CIF_0-0`), the whole sword in the fist; every strike is the mod's own frame.
// Each texel is a digit: 0 clear, 5 the blade's grey, 6 the guard's brass and the glove's leather. A dark grey texel
// within two of the leather is the glove's shadow. `rgb` holds each texel's colour as six hex digits.
//   node tools/sprite-forge/dwReference.mjs tools/sprite-forge/specs/WEAPON04.json /tmp/ref-SWORD.json <the mod's PNGs>
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { readPng } from '../pngIO.mjs';

const ROOT = resolve(import.meta.dirname, '../..');

const STEM = 'LONGSWORD.CIF';
const METAL = 'Steel';   // the fitted sword is steel's; every metal wears its poses
const GREY = 0.12;   // a texel's saturation under this is the blade's metal
const SHADOW = 75;   // a grey texel this dark beside the leather is its shadow

/** The picture a record's frame is fitted to: the idle's Weapon Widget picture, else the mod's frame. */
export const dwName = (record, frame) => `${record === 0 ? 'w_' : ''}${STEM}_${record}-${frame}_${METAL}.png`;

/**
 * A Diverse Weapons picture's texels: 0 clear, 5 grey metal, 6 warm (brass or leather), a dark grey within two of the
 * warm read as warm.
 * @param {{ width: number, height: number, data: Uint8Array }} img RGBA, rows top first
 */
export function dwClasses(img) {
  const { width: w, height: h, data } = img;
  const cls = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const [r, g, b, a] = data.subarray(i * 4, i * 4 + 4);
    const hi = Math.max(r, g, b), lo = Math.min(r, g, b);
    cls[i] = a < 128 ? 0 : (hi - lo) / Math.max(hi, 1) < GREY ? 5 : 6;
  }
  const out = cls.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (out[i] !== 5 || Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) >= SHADOW) continue;
      for (let dy = -2; dy <= 2 && out[i] === 5; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h && cls[yy * w + xx] === 6) { out[i] = 6; break; }
        }
      }
    }
  }
  return out;
}

const [specPath, out, folder] = process.argv.slice(2);
if (specPath && out) {
  if (!folder) {
    console.error('name the folder of the mod\'s PNGs: the tree does not carry them');
    process.exit(2);
  }
  if (resolve(out).startsWith(ROOT)) {
    console.error('the reference is written outside the repo, as every forge reference is');
    process.exit(2);
  }
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  const hex = (d, i) => [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]].map((c) => c.toString(16).padStart(2, '0')).join('');
  const records = spec.records.map((rec, r) => {
    const frames = [], rgb = [];
    for (let f = 0; f < rec.frames; f++) {
      const img = readPng(readFileSync(join(folder, dwName(r, f))));
      if (img.width !== rec.canvas[0] || img.height !== rec.canvas[1]) {
        throw new Error(`${dwName(r, f)} is ${img.width}x${img.height}, the spec's record ${r} ${rec.canvas.join('x')}`);
      }
      frames.push(Array.from(dwClasses(img)).join(''));
      rgb.push(Array.from({ length: img.width * img.height }, (_, i) => hex(img.data, i)).join(''));
    }
    return { canvas: rec.canvas, frames, rgb };
  });
  writeFileSync(out, JSON.stringify({ archive: spec.archive, from: STEM, records }));
  console.log(`${STEM}: ${records.length} records -> ${out} (${dirname(specPath)})`);
}
