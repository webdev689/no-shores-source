// Writes the pictures a ship's parts wear (client/src/textures/shipPictures.ts) for tools/ships/paint_ship.py to
// pack into her model: for each part in order, its width and height (two little-endian u32s), then its RGBA, top row
// first.
//
//     node tools/ships/ship_pictures.ts <file>
import { writeFileSync } from 'node:fs';
import { shipPictures } from '../../client/src/textures/shipPictures.ts';

const out = process.argv[2];
if (!out) throw new Error('name the file to write the pictures to');
const parts = shipPictures().flatMap(({ width, height, rgba }) => [
  new Uint8Array(new Uint32Array([width, height]).buffer),
  rgba,
]);
writeFileSync(out, Buffer.concat(parts));
