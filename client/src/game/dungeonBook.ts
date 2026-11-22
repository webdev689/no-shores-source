// The pictures a dungeon or a patrol's entrances wear, as one small array the city's painter paints: each turned to
// the island's climate as the textures turn it, and the plain colours by the city's own layers.
import { type BookPicture, COLOUR_LAYERS, LAYER_SIZE } from '../city/pictures.ts';
import type { CityClimate } from '../city/plan.ts';
import { climateArchive, pictureSize, type PictureUse } from '../textures/picture.ts';
import { COLOUR } from './dungeonMesh.ts';

/** Set in a vertex's layer for the return portal's face, over the layer of the picture it wears: past every layer. */
export const PORTAL_FLAG = 256;

/** The dungeon's own plain layers, below the city's: candle wax, lit as a surface; an ember's, a lantern's glass, a
 *  crystal's and a fungus cap's glow, each drawn as its colour. A dungeon's pictures never reach them. */
export const DUNGEON_LAYERS = { fungus: 247, wax: 248, ember: 249, lanternGlass: 250, crystal: 251 } as const;

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
      return layers.get(`${archive}.${record}`) ?? 0;
    },
  };
}
