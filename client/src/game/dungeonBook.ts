// The pictures a dungeon or a patrol's entrances wear, as one small array the city's painter paints: each turned to
// the island's climate as the textures turn it, and the plain colours by the city's own layers.
import { type BookPicture, COLOUR_LAYERS, LAYER_SIZE, MATERIALS } from '../city/pictures.ts';
import type { CityClimate } from '../city/plan.ts';
import { climateArchive, pictureSize, type PictureUse } from '../textures/picture.ts';
import type { ModelPart } from '../models/model.ts';
import type { DungeonLayout } from './dungeonLayout.ts';
import { COLOUR, IRON, lookOf, ROLE } from './dungeonMesh.ts';

/** Set in a vertex's layer for the return portal's face, over the layer of the picture it wears: past every layer. */
export const PORTAL_FLAG = 256;
/** Set in a vertex's layer for still water, over the layer of its bed, the floor of the set it lies in; and with it
 *  for foul water, an Ascent's drowned floor that harms. */
export const WATER_FLAG = 512;
export const FOUL_FLAG = 1024;

/** The dungeon's own plain layers, below the city's: candle wax, lit as a surface; an ember's, a lantern's glass, a
 *  crystal's and a fungus cap's glow, each drawn as its colour. A dungeon's pictures never reach them. */
export const DUNGEON_LAYERS = {
  fungus: 247,
  wax: 248,
  ember: 249,
  lanternGlass: 250,
  crystal: 251,
} as const;

/** A picture wanted: Daggerfall's archive and record (a negative archive for a glow drawn as a colour), what it is named for,
 *  and the factor each channel is painted at, if any. */
export type Wanted = readonly [
  archive: number,
  record: number,
  use: PictureUse,
  tint?: readonly [number, number, number],
];

/** What a small picture array holds, and the layer each picture wanted is drawn from. */
export interface SmallBook {
  readonly pictures: readonly BookPicture[];
  layerOf(archive: number, record: number): number;
}

/** The colour drawn before a picture is painted: wood for a door or a prop, stone for the rest. */
const guessOf = (use: PictureUse): readonly [number, number, number] =>
  use === 'door' || use === 'prop' ? [0.4, 0.3, 0.2] : [0.42, 0.4, 0.37];

/** The pictures wanted, each once, turned to `climate`; one the textures do not file keeps its guessed colour. */
export function smallBook(climate: CityClimate, wanted: Iterable<Wanted>): SmallBook {
  const layers = new Map<string, number>();
  const pictures: BookPicture[] = [];
  const turned = (archive: number, record: number) => climateArchive(archive, record, climate.climate, climate.season);
  for (const [archive, record, use, tint] of wanted) {
    if (archive < 0 || layers.has(`${archive}.${record}`)) continue;
    const turn = turned(archive, record);
    const size = pictureSize(turn, record);
    layers.set(`${archive}.${record}`, pictures.length);
    pictures.push({
      archive: turn,
      record,
      width: size?.width ?? LAYER_SIZE,
      height: size?.height ?? LAYER_SIZE,
      uses: [use],
      tint: tint ?? null,
      guess: guessOf(use),
    });
  }
  return {
    pictures,
    layerOf: (archive, record) => {
      if (archive === COLOUR.glow) return COLOUR_LAYERS.glow;
      if (archive === COLOUR.wax) return DUNGEON_LAYERS.wax;
      if (archive === COLOUR.ember) return DUNGEON_LAYERS.ember;
      if (archive === COLOUR.lanternGlass) return DUNGEON_LAYERS.lanternGlass;
      if (archive === COLOUR.crystal) return DUNGEON_LAYERS.crystal;
      if (archive === COLOUR.fungus) return DUNGEON_LAYERS.fungus;
      // Water's record is the set it lies in: its bed is that set's floor.
      if (archive === COLOUR.water) return WATER_FLAG | (layers.get(`${record}.${ROLE.floor}`) ?? 0);
      if (archive === COLOUR.foulWater) return FOUL_FLAG | WATER_FLAG | (layers.get(`${record}.${ROLE.floor}`) ?? 0);
      return layers.get(`${archive}.${record}`) ?? 0;
    },
  };
}

/** The book a dungeon's mesh is drawn from, in the island's climate: the climate's timber, the iron, the end room's
 *  wall (the portal's face wears it), and every picture the mesh's faces wear, a set's records named by their role,
 *  the exit door's picture as a door and the rest as a prop's. */
export function dungeonBook(
  layout: DungeonLayout,
  climate: CityClimate,
  door: readonly [number, number],
  parts: readonly ModelPart[],
): SmallBook {
  const [timberArchive, timberRecord, timberUse, timberTint] = MATERIALS[climate.climate].timber;
  const end = lookOf(layout, layout.end, layout.rooms[layout.end]?.look ?? 0);
  const sets = new Set(layout.looks.flatMap((look) => look.pictures));
  const useOf = (archive: number, record: number): PictureUse => {
    if (!sets.has(archive)) return archive === door[0] && record === door[1] ? 'door' : 'prop';
    return record === ROLE.floor ? 'floor' : record === ROLE.ceiling ? 'ceiling' : 'wall';
  };
  const wanted: Wanted[] = [
    [timberArchive, timberRecord, timberUse, timberTint],
    [...IRON, 'prop'],
    [end.set, end.wall, 'wall'],
    ...parts.map((part): Wanted =>
      part.archive === COLOUR.water || part.archive === COLOUR.foulWater
        ? [part.record, ROLE.floor, 'floor']
        : [part.archive, part.record, useOf(part.archive, part.record)],
    ),
  ];
  const plain = smallBook(climate, wanted);
  return {
    pictures: plain.pictures,
    layerOf: (archive, record) =>
      archive === COLOUR.portal ? PORTAL_FLAG | plain.layerOf(end.set, end.wall) : plain.layerOf(archive, record),
  };
}
