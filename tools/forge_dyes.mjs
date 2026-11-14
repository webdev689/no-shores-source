// Reads Daggerfall's palette once into the forge's dye table, as the owner chose Daggerfall's exact colours: the
// 256 colours a frame is snapped to, and for each dye the 16 colours the forge's greys are laid on, darkest first.
// Cloth takes a clothing dye's run of the palette; metal takes its metal's run. Daggerfall's files never enter git.
//
//     ARENA2_PATH=<daggerfall>/arena2 node tools/forge_dyes.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = new URL('./forge/src/systems/studioArt/forgeDyes.json', import.meta.url);
/** Where each clothing dye's run starts in the palette: 16 colours from there. */
const CLOTHING = {
  Blue: 0x60,
  Grey: 0x50,
  Red: 0xef,
  DarkBrown: 0x20,
  Purple: 0x30,
  LightBrown: 0x40,
  White: 0x70,
  Aquamarine: 0x80,
  Yellow: 0x90,
  Green: 0xa0,
};
/** Each metal's 16 palette colours, as Daggerfall lays them on a weapon or a piece of armour. */
const METALS = {
  Iron: [119, 120, 87, 121, 88, 89, 122, 90, 123, 91, 124, 92, 125, 93, 94, 95],
  Steel: [112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127],
  Silver: [224, 112, 80, 113, 81, 114, 115, 82, 116, 83, 117, 84, 85, 86, 87, 88],
  Elven: [224, 112, 80, 113, 81, 114, 115, 82, 116, 83, 117, 84, 118, 86, 119, 120],
  Dwarven: [144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159],
  Mithril: [103, 104, 105, 106, 107, 108, 109, 110, 111, 216, 217, 218, 219, 220, 221, 222],
  Adamantium: [90, 91, 124, 92, 125, 93, 126, 94, 127, 216, 217, 218, 219, 220, 221, 222],
  Ebony: [119, 120, 121, 122, 123, 124, 125, 126, 127, 216, 217, 218, 219, 220, 221, 222],
  Orcish: [198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 216, 217, 218, 219, 220, 221],
  Daedric: [239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254],
};

const arena2 = process.env.ARENA2_PATH;
if (!arena2) throw new Error('set ARENA2_PATH to Daggerfall’s arena2 folder');
const bytes = readFileSync(join(arena2, 'ART_PAL.COL'));
// An 8-byte header, then 256 colours of red, green and blue.
const palette = Array.from({ length: 256 }, (unused, index) => [...bytes.subarray(8 + index * 3, 11 + index * 3)]);
const sum = (colour) => colour[0] + colour[1] + colour[2];
const ramp = (indices) => indices.map((index) => palette[index]).sort((first, second) => sum(first) - sum(second));
const run = (start) => Array.from({ length: 16 }, (unused, step) => start + step);

const table = {
  palette,
  clothing: Object.fromEntries(Object.entries(CLOTHING).map(([name, start]) => [name, ramp(run(start))])),
  armour: Object.fromEntries(Object.entries(METALS).map(([name, indices]) => [name, ramp(indices)])),
};
writeFileSync(OUT, `${JSON.stringify(table)}\n`);
console.log(
  `wrote ${OUT.pathname}: 256 colours, ${Object.keys(CLOTHING).length} dyes, ${Object.keys(METALS).length} metals`,
);
