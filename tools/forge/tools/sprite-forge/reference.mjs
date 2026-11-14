// The forge's reference: one classic sprite archive's outlines and colour classes from the player's own ARENA2,
// written to a file outside the repo for `forge.py --register` (placing the body in each record's canvas) and
// `fit.py` (fitting each frame's pose and the materials' colours). Each texel is a digit: 0 clear, 1 other, 2 skin,
// 3 boot teal, 4 cloth green; `rgb` holds each texel's colour as six hex digits. All of it is game data: it never
// enters the repo.
//   ARENA2_PATH=... node tools/sprite-forge/reference.mjs 488 /tmp/forge-ref-488.json
// A first-person weapon archive (`WEAPON04.CIF`) is read the same way for fpfit.py and fpcolour.py. Its texels are 0
// clear, 5 metal (the palette band the metal dye swaps), 6 tan (the palette's ramp a glove and cloth are drawn in),
// 7 red-brown (the ramp a boot's leather is) or 1 other.
// A forge spec whose records name a `picture` (the climbing arms, tools/sprite-forge/specs/CLIMB.json) is read from
// those pictures, the game's own art, with no ARENA2: 0 clear, 5 grey cloth, 6 leather.
//   node tools/sprite-forge/reference.mjs tools/sprite-forge/specs/CLIMB.json /tmp/ref-CLIMB.json
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { readPng } from '../pngIO.mjs';
import { TextureFile, texName } from '../../src/formats/textureFile.js';
import { CifRciFile } from '../../src/formats/cifRciFile.js';
import { DFPalette } from '../../src/formats/dfPalette.js';
import { heldClasses, gridded } from './heldClasses.mjs';   // the held map's painting, read as the forge reads it

/** The palette band a weapon's metal is drawn in: the band ChangeDye swaps for a metal (characters/dyes.js). */
const METAL_BAND = [0x70, 0x7f];
/** The palette's ramps a first-person frame's tan cloth and leather, and its red-brown leather, are drawn in. */
const TAN_RAMP = [0x40, 0x4f];
const RED_RAMP = [0x20, 0x2f];
const within = (v, [lo, hi]) => v >= lo && v <= hi;
/** A first-person texel's class from its palette index. */
const cifClass = (v) => (!v ? 0 : within(v, METAL_BAND) ? 5 : within(v, TAN_RAMP) ? 6 : within(v, RED_RAMP) ? 7 : 1);

/** A texel's class from its colour. */
export function colourClass(r, g, b) {
  if (g > r + 20 && b > r + 20) return 3;
  if (g > r + 12 && g > b + 15) return 4;
  if (r > g + 25 && r > b + 35 && r > 70) return 2;
  return 1;
}

/**
 * A painting's texels: 0 clear (alpha under half), 6 leather (warmer than grey by a fifth of its red), else 5 grey
 * cloth. A dark texel by leather is leather: a painted outline's, or a shadow's.
 * @param {{width: number, height: number, data: Uint8Array}} img RGBA, rows top first
 */
export function pictureClasses(img) {
  const { width: w, height: h, data } = img;
  const cls = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const [r, , b, a] = data.subarray(i * 4, i * 4 + 4);
    cls[i] = a < 128 ? 0 : r - b > Math.max(0.2 * r, 8) ? 6 : 5;
  }
  const out = cls.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (out[i] !== 5 || Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) >= 75) continue;
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

/** The palette's ramps a casting hand's glove is drawn in: its red-brown and tan leather, its mauve shadows and its
 *  brown-greys. The element's light round it is drawn in every other ramp. */
const HAND_RAMPS = [[0x20, 0x2f], [0x38, 0x4f], [0xf0, 0xff]];
/** The dark greys a painted outline is drawn in: the hand's where they touch it, the element's elsewhere. */
const DARK_RAMP = [0xd8, 0xdf];

/**
 * A casting record's texels (FIRE00C6.CIF and its kin): 6 the hand's glove, 0 the rest - clear, or the element's light,
 * which the hand is fitted without. A dark texel within two of the glove is the glove's outline.
 * @param {{width: number, height: number, data: Uint8Array}} bm palette indices, rows top first
 */
export function castClasses(bm) {
  const { width: w, height: h, data } = bm;
  const hand = Uint8Array.from(data, (v) => (HAND_RAMPS.some((r) => within(v, r)) ? 6 : 0));
  const out = hand.slice();
  for (let i = 0; i < w * h; i++) {
    if (!within(data[i], DARK_RAMP)) continue;
    const x = i % w, y = (i - x) / w;
    for (let dy = -2; dy <= 2 && !out[i]; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && hand[yy * w + xx]) { out[i] = 6; break; }
      }
    }
  }
  return out;
}

const [archive, out] = process.argv.slice(2);
const arena2 = process.env.ARENA2_PATH;
if (archive && out && /\.json$/i.test(archive)) {
  const spec = JSON.parse(readFileSync(archive, 'utf8'));
  const root = resolve(dirname(archive), '../../..');
  const hex = (d, i) => [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]].map((c) => c.toString(16).padStart(2, '0')).join('');
  if (spec.records.some((rec) => rec.cif)) {   // a casting hand: its records read from the player's own archive
    if (!arena2 || resolve(out).startsWith(resolve(import.meta.dirname, '../..'))) {
      console.error('a casting spec reads ARENA2_PATH and writes its reference outside the repo: it holds game data');
      process.exit(2);
    }
    const pal = new DFPalette();
    pal.load(new Uint8Array(readFileSync(join(arena2, 'ART_PAL.COL'))));
    const pix = (v) =>
      [pal.getRed(v), pal.getGreen(v), pal.getBlue(v)].map((c) => c.toString(16).padStart(2, '0')).join('');
    const archives = new Map();
    const read = (name) => {
      if (!archives.has(name)) {
        const cif = new CifRciFile();
        cif.load(new Uint8Array(readFileSync(join(arena2, name))), name, pal);
        archives.set(name, cif);
      }
      return archives.get(name);
    };
    const records = spec.records.map((rec) => {
      const cif = read(rec.cif);
      const bm = cif.getDFBitmap(rec.record, 0);
      const { width, height } = cif.getSize(rec.record);
      const cls = castClasses(bm);
      const idx = Uint8Array.from(bm.data);
      // the same hand in other archives (`union`), their light crossing it elsewhere: their glove's texels fill the
      // gaps this one's light left, each archive's record laid on this one's foot and left edge, as the game lays them
      for (const name of rec.union ?? []) {
        const other = read(name);
        const ob = other.getDFBitmap(rec.record, 0);
        const { width: ow, height: oh } = other.getSize(rec.record);
        const oc = castClasses(ob);
        for (let y = 0; y < oh; y++) {
          const ty = y + height - oh;
          if (ty < 0 || ty >= height) continue;
          for (let x = 0; x < Math.min(ow, width); x++) {
            const i = ty * width + x;
            if (!cls[i] && oc[y * ow + x]) { cls[i] = 6; idx[i] = ob.data[y * ow + x]; }
          }
        }
      }
      return { canvas: [width, height], frames: [Array.from(cls).join('')], rgb: [Array.from(idx, pix).join('')] };
    });
    // each element's light (`elements`: name -> archive): its texels, 1 where it is drawn and the hand is not
    const elements = Object.fromEntries(Object.entries(spec.elements ?? {}).map(([name, file]) => {
      const cif = read(file);
      return [name, Array.from({ length: cif.recordCount }, (_, r) => {
        const bm = cif.getDFBitmap(r, 0);
        const hand = castClasses(bm);
        const { width, height } = cif.getSize(r);
        return { canvas: [width, height], light: Array.from(bm.data, (v, i) => (v && !hand[i] ? 1 : 0)).join(''),
          rgb: Array.from(bm.data, pix).join('') };
      })];
    }));
    writeFileSync(out, JSON.stringify({ archive: spec.archive, records, elements }));
    const n = Object.keys(elements).length;
    console.log(`${spec.archive}: ${records.length} casting records, ${n} elements -> ${out}`);
    process.exit(0);
  }
  const records = spec.records.map((rec) => {
    const full = gridded(readPng(readFileSync(join(root, rec.picture))), rec.grid);
    const classes = rec.classes === 'held' ? heldClasses : pictureClasses;
    // `foot`: the canvas ends at the picture's lowest drawn row, so what the picture cuts there may run on past it
    let rows = full.height;
    if (rec.foot) for (rows = 0; rows < full.height && full.data.subarray(rows * full.width * 4).some((v, i) => i % 4 === 3 && v >= 128); rows++);
    const cls = classes(full).subarray(0, full.width * rows), n = full.width * rows;
    return { canvas: [full.width, rows], frames: [Array.from(cls).join('')],
      rgb: [Array.from({ length: n }, (_, i) => hex(full.data, i)).join('')] };
  });
  writeFileSync(out, JSON.stringify({ archive: spec.archive, records }));
  console.log(`${spec.archive}: ${records.length} pictures -> ${out}`);
  process.exit(0);
}
if (!arena2 || !archive || !out) {
  console.error('usage: ARENA2_PATH=<arena2> node tools/sprite-forge/reference.mjs <archive> <out.json>');
  process.exit(2);
}
if (resolve(out).startsWith(resolve(import.meta.dirname, '../..'))) {
  console.error('write the reference outside the repo: it holds game data');
  process.exit(2);
}
const pal = new DFPalette();
pal.load(new Uint8Array(readFileSync(join(arena2, 'ART_PAL.COL'))));
const cif = /\.CIF$/i.test(archive);
const name = cif ? archive.toUpperCase() : texName(Number(archive));
const tf = cif ? new CifRciFile() : new TextureFile();
tf.load(new Uint8Array(readFileSync(join(arena2, name))), name, pal);
const records = [];
for (let r = 0; r < tf.recordCount; r++) {
  const frames = [];
  const rgb = [];
  const hex = (v) => [pal.getRed(v), pal.getGreen(v), pal.getBlue(v)].map((c) => c.toString(16).padStart(2, '0')).join('');
  for (let f = 0; f < tf.getFrameCount(r); f++) {
    const bm = tf.getDFBitmap(r, f);
    // index 0 is a sprite's clear texel
    const cls = cif ? cifClass : (v) => (v ? colourClass(pal.getRed(v), pal.getGreen(v), pal.getBlue(v)) : 0);
    frames.push(Array.from(bm.data, cls).join(''));
    rgb.push(Array.from(bm.data, hex).join(''));
  }
  const { width, height } = tf.getSize(r);
  records.push({ canvas: [width, height], frames, rgb });
}
writeFileSync(out, JSON.stringify({ archive: cif ? name : Number(archive), records }));
console.log(`${name}: ${records.length} records -> ${out}`);
