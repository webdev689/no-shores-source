// Writes the pictures each dungeon style's parts wear, for tools/dungeon/preview.py to draw its contact sheets in:
// the painter's own pictures, chosen as the page chooses them (partPicture), turned to a climate and season, and
// resampled to the layer the page draws, with each part's metres a picture spans and the colour of each glowing part.
//
//     node tools/dungeon/previewPictures.ts <dir> [--style crypt ...] [--climate temperate] [--season summer]
//
// One file a style, <dir>/<style>.pictures: a u32 little-endian header length, the header as JSON (style, climate,
// season, and each part's name, tile metres and either its picture's size or its colour), then each picture's RGBA.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { resampled } from '../../client/src/city/layerImage.ts';
import { LAYER_SIZE, MATERIALS } from '../../client/src/city/pictures.ts';
import { CRYSTAL_GLOW, EMBER_GLOW, FLAME, FUNGUS_GLOW, WAX } from '../../client/src/game/dungeonLight.ts';
import { COLOUR, ROLE } from '../../client/src/game/dungeonMesh.ts';
import { PART_TILE_M, PARTS, partPicture } from '../../client/src/game/dungeonModules.ts';
import { CLIMATES, SEASONS, type Climate, type Season } from '../../client/src/textures/climate.ts';
import { climateArchive, paintPicture, type PictureUse } from '../../client/src/textures/picture.ts';

// The colours the dungeon's shader draws its glowing parts in; still water is its WATER_DEEP, lit by the lights.
const COLOURS = new Map<number, readonly number[]>([
  [COLOUR.glow, FLAME],
  [COLOUR.ember, EMBER_GLOW],
  [COLOUR.crystal, CRYSTAL_GLOW],
  [COLOUR.fungus, FUNGUS_GLOW],
  [COLOUR.wax, WAX],
  [COLOUR.water, [0.1, 0.14, 0.16]],
]);

/** Each style's main and second picture sets, read from the dungeon crate's styles table, the one source of them. */
function styleSets(): Map<string, number> {
  const table = readFileSync(new URL('../../crates/dungeon/src/styles.rs', import.meta.url), 'utf8');
  const sets = new Map<string, number>();
  for (const found of table.matchAll(/key: "(\w+)"[\s\S]*?pictures: \[(\d+), (\d+)\]/g))
    sets.set(found[1] ?? '', Number(found[2]));
  return sets;
}

type Part = { name: string; tile: number; size?: readonly [number, number]; colour?: readonly number[] };

/** One style's parts in kits.json's order, and the RGBA of each that wears a picture. */
function stylePictures(set: number, climate: Climate, season: Season): { parts: Part[]; rgba: Uint8Array[] } {
  // Room 0's look, as lookOf gives it: the main set, its first wall.
  const look = { set, wall: ROLE.wall };
  const [timberArchive, timberRecord, timberUse, timberTint] = MATERIALS[climate].timber;
  const parts: Part[] = [];
  const rgba: Uint8Array[] = [];
  PARTS.forEach((name, part) => {
    const [archive, record] = partPicture(part, look, climate);
    const tile = PART_TILE_M[part] ?? 3.2;
    const colour = COLOURS.get(archive);
    if (colour) {
      parts.push({ name, tile, colour });
      return;
    }
    // Named as the page names them: a set's record by its role, the timber by its own use, the rest as a prop.
    const timber = archive === timberArchive && record === timberRecord;
    const role = record === ROLE.floor ? 'floor' : record === ROLE.ceiling ? 'ceiling' : 'wall';
    const use: PictureUse = archive === set ? role : timber ? timberUse : 'prop';
    const turned = climateArchive(archive, record, climate, season);
    const picture = paintPicture(turned, record, 0, new Map([[`${turned}.${record}`, new Set([use])]]));
    if (!picture) throw new Error(`the painter paints no ${turned}.${record}, the ${name} part's picture`);
    const tint = timber ? timberTint : undefined;
    if (tint)
      for (let texel = 0; texel < picture.rgba.length; texel += 4)
        for (let channel = 0; channel < 3; channel++)
          picture.rgba[texel + channel] = Math.min(
            255,
            Math.round((picture.rgba[texel + channel] ?? 0) * tint[channel]),
          );
    parts.push({ name, tile, size: [LAYER_SIZE, LAYER_SIZE] });
    rgba.push(resampled(picture.rgba, picture.width, picture.height));
  });
  return { parts, rgba };
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    style: { type: 'string', multiple: true },
    climate: { type: 'string', default: 'temperate' },
    season: { type: 'string', default: 'summer' },
  },
});
const [folder] = positionals;
if (!folder) throw new Error('name the folder to write the pictures into');
const climate = CLIMATES.find((each) => each === values.climate);
const season = SEASONS.find((each) => each === values.season);
if (!climate || !season) throw new Error(`a climate of ${CLIMATES.join(', ')} and a season of ${SEASONS.join(', ')}`);
const sets = styleSets();
mkdirSync(folder, { recursive: true });
for (const style of values.style ?? [...sets.keys()]) {
  const set = sets.get(style);
  if (set === undefined) throw new Error(`${style} is no style in the dungeon crate's styles table`);
  const { parts, rgba } = stylePictures(set, climate, season);
  let header = Buffer.from(JSON.stringify({ style, climate, season, parts }));
  // Spaces after the JSON start the pictures on a 4-byte boundary.
  header = Buffer.concat([header, Buffer.alloc((4 - ((4 + header.length) % 4)) % 4, ' ')]);
  const length = Buffer.alloc(4);
  length.writeUInt32LE(header.length);
  writeFileSync(join(folder, `${style}.pictures`), Buffer.concat([length, header, ...rgba]));
  console.log(`${style}: ${parts.length} parts, ${rgba.length} pictures, ${climate} in ${season}`);
}
