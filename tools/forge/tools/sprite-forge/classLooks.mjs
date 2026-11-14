// Each class archive's own look, as the forge's layers (layers.py `LOOKS_OF` reads it): the class's kit over its armour
// (src/characters/enemy/classKits.js `CLASS_ARCHIVES`), and each townsfolk archive's clothes and race
// (src/characters/mobile/townsfolkKits.js `TOWNSFOLK`), worn as a dressed character's is (forgeWardrobe.js `wornLook`),
// so every look is made one way.
//   node tools/sprite-forge/classLooks.mjs            writes tools/sprite-forge/specs/class-looks.json
//   node tools/sprite-forge/classLooks.mjs --check    fails where the file is not what the table makes
import { readFileSync, writeFileSync } from 'node:fs';
import { CLASS_ARCHIVES, classArchiveSlots } from '../../src/characters/enemy/classKits.js';
import { wornLook } from '../../src/systems/studioArt/forgeWardrobe.js';
import { TOWNSFOLK, townsfolkSlots } from '../../src/characters/mobile/townsfolkKits.js';
import { isMain } from '../lib/isMain.mjs';

const ROOT = new URL('../../', import.meta.url);
const OUT = new URL('tools/sprite-forge/specs/class-looks.json', ROOT);

/** Every class and townsfolk archive's look: its body, gear and dyes (and a person's race). */
export function classLooks() {
  const looks = JSON.parse(readFileSync(new URL('src/systems/studioArt/forgeLooks.json', ROOT), 'utf8'));
  /** @type {Record<string, any>} */
  const out = {};
  for (const [archive, own] of Object.entries(CLASS_ARCHIVES)) {
    const { gear, dyes } = wornLook(classArchiveSlots(Number(archive)), looks.bodies[own.body].layers);
    out[archive] = { body: own.body, type: own.type, gear, dyes };
  }
  for (const [archive, own] of Object.entries(TOWNSFOLK)) {   // a person of the town, unarmed
    const { gear, dyes } = wornLook(townsfolkSlots(Number(archive)), looks.bodies[own.body].layers);
    out[archive] = { body: own.body, race: own.race, gear, dyes };
  }
  return out;
}

if (isMain(import.meta.url)) {
  const text = `${JSON.stringify(classLooks(), null, 1)}\n`;
  if (process.argv.includes('--check')) {
    const now = readFileSync(OUT, 'utf8');
    if (now !== text) {
      console.error('class-looks.json is not what classKits.js makes: node tools/sprite-forge/classLooks.mjs');
      process.exit(1);
    }
  } else writeFileSync(OUT, text);
}
