// The townsfolk archives' forge specs (specs/people/<archive>.json), read off the player's own ARENA2: each record's canvas,
// its frame count, and where the ground under the person's feet lies in it (`place`: the middle of the lowest drawn
// rows, across every frame), so the forge's person stands where Daggerfall's did. Records 0-4 are the walk, a view
// each; record 5 the idle, the front view. Only the numbers are written: no picture leaves ARENA2.
//   ARENA2_PATH=... node tools/sprite-forge/peopleSpecs.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TextureFile, texName } from '../../src/formats/textureFile.js';
import { TOWNSFOLK, TOWNSFOLK_ARCHIVES } from '../../src/characters/mobile/townsfolkKits.js';
import { isMain } from '../lib/isMain.mjs';

const FOOT_ROWS = 3;   // the lowest drawn rows the feet are read from

/** Where the ground under the feet lies in record `r` of `tf`: [x, y], over all its frames. */
export function footOf(tf, r) {
  const { width, height } = tf.getSize(r);
  let low = -1;
  const frames = Array.from({ length: tf.getFrameCount(r) }, (_, f) => tf.getDFBitmap(r, f).data);
  for (const data of frames) for (let y = height - 1; y > low; y--) if (data.subarray(y * width, (y + 1) * width).some((v) => v)) { low = y; break; }
  let sum = 0, n = 0;
  for (const data of frames) for (let y = Math.max(0, low - FOOT_ROWS + 1); y <= low; y++)
    for (let x = 0; x < width; x++) if (data[y * width + x]) { sum += x; n++; }
  return [n ? Math.round(sum / n) : width >> 1, low + 1];
}

if (isMain(import.meta.url)) {
  const arena2 = process.env.ARENA2_PATH;
  if (!arena2) { console.error('set ARENA2_PATH'); process.exit(2); }
  for (const archive of TOWNSFOLK_ARCHIVES) {
    const tf = new TextureFile();
    tf.load(new Uint8Array(readFileSync(join(arena2, texName(archive)))), texName(archive));
    const records = Array.from({ length: tf.recordCount }, (_, r) => {
      const { width, height } = tf.getSize(r);
      return { anim: r < 5 ? 'walk' : 'idle', view: r < 5 ? r : 0, frames: tf.getFrameCount(r), canvas: [width, height],
        place: footOf(tf, r) };
    });
    const own = TOWNSFOLK[archive];
    const head = { archive, name: `Townsfolk (${own.race} ${own.body})` };
    const text = `${JSON.stringify(head, null, 1).slice(0, -2)},\n "records": [\n${records.map((r) => `  ${JSON.stringify(r)}`).join(',\n')}\n ]\n}\n`;
    writeFileSync(new URL(`specs/people/${archive}.json`, import.meta.url), text);
  }
  console.log(`${TOWNSFOLK_ARCHIVES.length} townsfolk specs written`);
}
