// The beast forge's seed: a creature's spec from the player's own archive and the game's animation tables. Each record
// gets its animation and view from where the game draws it (mobileUnit.js stateAnims), its frames, its canvas and its
// header scale from the archive, and `mirror` where the game draws it unflipped on the viewer's right: Daggerfall drew
// that record facing the other way (the rat's idle, RatIdleAnims). The place starts at the canvas's bottom middle;
// beastforge.py --register sets it. Sizes and scales are the file's layout, not its pictures.
//   ARENA2_PATH=... node tools/sprite-forge/beasts/seed.mjs <enemy id> <beast> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TextureFile, texName } from '../../../src/formats/textureFile.js';
import { VANILLA_ENEMY_BASICS, ENEMY_NAMES } from '../../../src/characters/enemy/enemyBasics.js';
import { MOBILE_GIANT_SCORPION, stateAnims } from '../../../src/characters/mobile/mobileUnit.js';
import { isMain } from '../../lib/isMain.mjs';

/** The animation a record block holds, five views a block. */
export const BLOCKS = ['walk', 'attack', 'hurt', 'idle', 'ranged', 'ranged2'];
const STATES = { walk: 'move', attack: 'attack', hurt: 'hurt', idle: 'idle', ranged: 'ranged', ranged2: 'ranged' };

/** Whether the game draws record `r` mirrored from the fighter's convention: at the orientations on the viewer's left
 *  (1-3) a record faces left unflipped; one the table flips there, or shows unflipped only on the right, faces right.
 *  The game turns every flip over for the giant scorpion (mobileUnit.js, DFU DaggerfallMobileUnit), so its are all
 *  drawn facing right (`invert`). */
export function mirrored(tables, r, invert = false) {
  for (const t of tables) {
    for (let o = 1; o <= 3; o++) if (t[o].record === r) return t[o].flip !== invert;
    for (let o = 5; o <= 7; o++) if (t[o].record === r) return t[o].flip === invert;
  }
  return false;
}

/** Whether the game turns an enemy's flips over (the giant scorpion's). */
export const flipsInverted = (enemyId) => enemyId === MOBILE_GIANT_SCORPION;

export function seed(enemyId, beast, tf) {
  const row = VANILLA_ENEMY_BASICS[enemyId];
  const tables = Object.values(STATES).map((s) => stateAnims(s, enemyId, !!row.hasIdle)).filter(Boolean);
  const records = [];
  for (let r = 0; r < tf.recordCount; r++) {
    const { width, height } = tf.getSize(r);
    const view = r % 5;
    const rec = { anim: BLOCKS[Math.floor(r / 5)], view, frames: tf.getFrameCount(r), canvas: [width, height],
      scale: tf.getScale(r).height };
    if (view && mirrored(tables, r, flipsInverted(enemyId))) rec.mirror = true;
    rec.place = [Math.floor(width / 2), height - 1];
    records.push(rec);
  }
  return { archive: row.maleTexture, name: ENEMY_NAMES[enemyId] ?? beast, beast, records };
}

if (isMain(import.meta.url)) {
  const [id, beast, out] = process.argv.slice(2);
  const arena2 = process.env.ARENA2_PATH;
  if (!arena2 || id == null || !beast || !out) {
    console.error('usage: ARENA2_PATH=<arena2> node tools/sprite-forge/beasts/seed.mjs <enemy id> <beast> <out.json>');
    process.exit(2);
  }
  const archive = VANILLA_ENEMY_BASICS[Number(id)].maleTexture;
  const tf = new TextureFile();
  const name = texName(archive);
  tf.load(new Uint8Array(readFileSync(join(arena2, name))), name);
  const spec = seed(Number(id), beast, tf);
  const head = JSON.stringify({ ...spec, records: undefined }, null, 1).replace(/\n}$/, '');
  writeFileSync(out, `${head},\n "records": [\n${spec.records.map((r) => `  ${JSON.stringify(r)}`).join(',\n')}\n ]\n}\n`);
  console.log(`${name}: ${spec.records.length} records -> ${out}`);
}
