// The paper doll's reference: the weapon (TEXTURE.233 a woman's, 234 a man's), clothing (235-242) and armour (245-252)
// records and the doll's bodies, read from the player's own ARENA2 and written to a file outside the repo for
// dollweapons.py, dollarmour.py and dollclothes.py to fit the forge's pieces to. Each texel is a digit: 0 clear, 4 the
// cloth a clothing record's dye swaps (clothing records only), 5 metal (the palette band a metal's dye swaps), 6 tan, 7 red-brown, 9 the
// hair a helm hides (palette index 255, paperDoll.js blit), 1 other; each record's palette indices too (`index`, base64) and the palette's colours, which the armour's grade reads
// its shading from. All of it is game data: it never enters the repo.
//   ARENA2_PATH=... node tools/sprite-forge/dollReference.mjs /tmp/doll-ref.json [archive ...]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TextureFile, texName } from '../../src/formats/textureFile.js';
import { ImgFile } from '../../src/formats/imgFile.js';
import { CifRciFile } from '../../src/formats/cifRciFile.js';
import { DFPalette } from '../../src/formats/dfPalette.js';

/** The palette's bands a doll picture's metal, tan and red-brown are drawn in (reference.mjs's own). */
const METAL_BAND = [0x70, 0x7f];
/** The band a clothing record's dye swaps (DFU ImageProcessing.ChangeDye's 0x60). */
const CLOTH_BAND = [0x60, 0x6f];
const TAN_RAMP = [0x40, 0x4f];
const RED_RAMP = [0x20, 0x2f];
const within = (v, [lo, hi]) => v >= lo && v <= hi;
const classOf = (v, cloth) => (!v ? 0 : cloth && within(v, CLOTH_BAND) ? 4 : within(v, METAL_BAND) ? 5
  : within(v, TAN_RAMP) ? 6 : within(v, RED_RAMP) ? 7 : 1);
/** The weapons' doll archives, the clothing's and the armour's, a gender's four bodies each (paperdollArt.js
 *  playerArchiveFor: a clothing template's archive plus the body shape). */
const ARCHIVES = [233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 245, 246, 247, 248, 249, 250, 251, 252];
/** A clothing archive: a woman's 235-238, a man's 239-242. */
const isClothing = (archive) => archive >= 235 && archive <= 242;
/** A race of each body shape (morphology 0 Argonian, 1 the elves, 2 the men, 3 Khajiit - armorMaterials.js) by its
 *  art index (races.js): its bare body (BODY<gender><n>I0.IMG) and its first head (FACE<gender><n>I0.CIF). */
const BODIES = { 0: 7, 1: 3, 2: 0, 3: 6 };

const root = process.env.ARENA2_PATH;
const [out, ...asked] = process.argv.slice(2);
if (!root || !out) {
  console.error('usage: ARENA2_PATH=... node tools/sprite-forge/dollReference.mjs <out.json> [archive ...]');
  process.exit(1);
}
/** A bitmap's texels as rows of class digits, and 9 for palette index 255 (a helm's mask, paperDoll.js blit); `cloth`
 *  marks the clothing band, read only in a clothing record. */
const rowsOf = (bitmap, width, height, cloth = false) => {
  const rows = [];
  for (let y = 0; y < height; y++) {
    let row = '';
    for (let x = 0; x < width; x++) {
      const v = bitmap.data[y * width + x];
      row += v === 255 ? 9 : classOf(v, cloth);
    }
    rows.push(row);
  }
  return rows;
};
const archives = asked.length ? asked.map(Number) : ARCHIVES;
const result = {};
for (const archive of archives) {
  const file = new TextureFile();
  file.load(new Uint8Array(readFileSync(join(root, texName(archive)))), texName(archive));
  const records = {};
  for (let record = 0; ; record++) {
    let size;
    try {
      size = file.getSize(record);
    } catch {
      break;
    }
    if (!size?.width) break;
    const { width, height } = size;
    const bitmap = file.getDFBitmap(record, 0);
    const index = Buffer.from(bitmap.data.subarray(0, width * height)).toString('base64');
    records[record] = { width, height, offset: file.getOffset(record), rows: rowsOf(bitmap, width, height, isClothing(archive)),
      index };
  }
  result[archive] = records;
}
if (!asked.length) {
  result.bodies = {};
  for (const [g, gender] of [[0, 'male'], [1, 'female']]) {
    for (const [morph, n] of Object.entries(BODIES)) {
      const name = `BODY${g}${n}I0.IMG`;
      const img = new ImgFile();
      img.load(new Uint8Array(readFileSync(join(root, name))), name);
      const bm = img.getDFBitmap();
      const face = new CifRciFile();
      const fname = `FACE${g}${n}I0.CIF`;
      face.load(new Uint8Array(readFileSync(join(root, fname))), fname);
      const fb = face.getDFBitmap(0, 0);
      result.bodies[`${gender}:${morph}`] = {
        body: { width: bm.width, height: bm.height, offset: img.imageOffset, rows: rowsOf(bm, bm.width, bm.height) },
        head: { width: fb.width, height: fb.height, offset: face.getOffset?.(0) ?? null, rows: rowsOf(fb, fb.width, fb.height),
          index: Buffer.from(fb.data.subarray(0, fb.width * fb.height)).toString('base64') },
      };
    }
  }
}
const palette = new DFPalette();
palette.load(new Uint8Array(readFileSync(join(root, 'ART_PAL.COL'))));
result.palette = Array.from({ length: 256 }, (_, i) => {
  const c = palette.get(i);
  return [c.r, c.g, c.b];
});
writeFileSync(out, JSON.stringify(result));
console.log(`${out}: ${archives.map((a) => `${a} (${Object.keys(result[a]).length})`).join(', ')}`);
