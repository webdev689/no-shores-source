// Which pictures a city wears and where each sits in its one texture array: the forged models' pictures turned to the
// city's climate, the ground's tiles of its terrain set, and the pictures chosen for its solids' materials. The most
// used come first, so a city that needs more than the array holds loses only its rarest.
import { climateArchive, pictureSize, type Climate, type PictureUse, type Season } from '../textures/picture.ts';
import type { CityClimate, SolidMaterial } from './plan.ts';

/** Layers the array holds for pictures; the four above them are the plain colours. WebGPU's default limit is 256. */
export const PICTURE_LAYERS = 252;
/** The solids' plain colours, drawn by code rather than a picture: gold, iron, bone, and the glow of a fire. */
export const COLOUR_LAYERS = { gold: 252, iron: 253, bone: 254, glow: 255 } as const;
/** Every picture is resampled to this square, so one array holds them all. */
export const LAYER_SIZE = 128;

type Pictured = Exclude<SolidMaterial, keyof typeof COLOUR_LAYERS>;
type Choice = readonly [archive: number, record: number, use: PictureUse];

/**
 * The pictures each climate's solids wear, from the textures' own sets: a castle's blocks for stone (a warm
 * sandstone in the temperate ports, so a landmark reads against the sea), a marble or dressed stone for trim, the
 * roof set's tiles or slates, plain or dark boards for timber, a plastered wall, and pale flags or sandstone for
 * paving, so a paved terrace reads as stone in the sun and not as a slab. Winter takes each set's snowed turn.
 */
const MATERIALS: Readonly<Record<Climate, Readonly<Record<Pictured, Choice>>>> = {
  temperate: {
    stone: [9, 1, 'wall'],
    trim: [341, 1, 'floor'],
    roof: [369, 2, 'roof'],
    timber: [364, 1, 'wall'],
    plaster: [312, 1, 'wall'],
    paving: [341, 1, 'floor'],
  },
  desert: {
    stone: [9, 1, 'wall'],
    trim: [41, 2, 'floor'],
    roof: [69, 0, 'roof'],
    timber: [67, 0, 'prop'],
    plaster: [38, 1, 'wall'],
    paving: [17, 1, 'wall'],
  },
  mountain: {
    stone: [109, 1, 'wall'],
    trim: [141, 1, 'floor'],
    roof: [469, 2, 'roof'],
    timber: [67, 0, 'prop'],
    plaster: [126, 1, 'wall'],
    paving: [341, 1, 'floor'],
  },
  swamp: {
    stone: [409, 1, 'wall'],
    trim: [417, 1, 'wall'],
    roof: [469, 3, 'roof'],
    timber: [426, 1, 'wall'],
    plaster: [442, 1, 'wall'],
    paving: [324, 1, 'floor'],
  },
};

const CLIMATE_OF_BASE: readonly [number, Climate][] = [
  [400, 'swamp'],
  [300, 'temperate'],
  [100, 'mountain'],
  [0, 'desert'],
];

/** A chosen picture in a season: its own climate's snowed turn in winter, where its set has one. */
function inSeason(archive: number, record: number, season: Season): number {
  const own = CLIMATE_OF_BASE.find(([base]) => archive >= base)?.[1] ?? 'temperate';
  return archive >= 500 ? archive : climateArchive(archive, record, own, season);
}

/** The terrain set a climate's ground tiles come from. */
export const terrainArchive = ({ climate, season }: CityClimate): number => climateArchive(302, 0, climate, season);

/** One layer's picture: where it is filed, its own size, what it is named for, and the colour drawn until painted. */
export type BookPicture = {
  readonly archive: number;
  readonly record: number;
  readonly width: number;
  readonly height: number;
  readonly uses: readonly PictureUse[];
  readonly guess: readonly [number, number, number];
};

export type PictureBook = {
  readonly pictures: readonly BookPicture[];
  /** A forged model's picture's layer, turned to the city's climate first. */
  layerOf(archive: number, record: number): number;
  /** A solid material's layer, or its plain colour's. */
  readonly materials: Readonly<Record<SolidMaterial, number>>;
  /** Each ground record's layer. */
  readonly ground: readonly number[];
};

/** The colours drawn before a picture is painted: by what it is named for, the ground's by its class. */
function guessOf(
  archive: number,
  record: number,
  uses: readonly PictureUse[],
  terrain: number,
): [number, number, number] {
  if (archive === terrain) {
    const classes: [number, number, number][] = [
      [0.25, 0.38, 0.5],
      [0.46, 0.37, 0.25],
      [0.3, 0.4, 0.19],
      [0.46, 0.45, 0.43],
    ];
    return classes[record] ?? [0.4, 0.38, 0.24];
  }
  const snowy = archive % 100 === 70 || archive % 100 === 10;
  if (uses.includes('roof')) return snowy ? [0.84, 0.86, 0.9] : [0.44, 0.28, 0.21];
  if (uses.includes('window')) return [0.24, 0.24, 0.27];
  if (uses.includes('door') || uses.includes('prop')) return [0.4, 0.3, 0.2];
  return [0.6, 0.56, 0.5];
}

/** A picture wanted by the city, how much of the city wears it, and what it is named for. */
export type PictureWant = { readonly archive: number; readonly record: number; weight: number; uses: Set<PictureUse> };

/**
 * The city's pictures, in one array of at most PICTURE_LAYERS layers. `wants` are the models' pictures as their
 * tables file them, with how much the city wears each; `usesOf` says what a turned picture is named for. The ground
 * and the solids' pictures come first, then the rest by how much the city wears them.
 */
export function pictureBook(
  climate: CityClimate,
  wants: Iterable<PictureWant>,
  groundRecords: Iterable<number>,
  usesOf: (archive: number, record: number) => readonly PictureUse[],
): PictureBook {
  const terrain = terrainArchive(climate);
  const turned = new Map<string, PictureWant>();
  const want = (archive: number, record: number, weight: number, uses: readonly PictureUse[]): string => {
    const key = `${archive}.${record}`;
    const found = turned.get(key) ?? { archive, record, weight: 0, uses: new Set<PictureUse>() };
    found.weight += weight;
    for (const use of uses) found.uses.add(use);
    turned.set(key, found);
    return key;
  };
  const first = Number.MAX_SAFE_INTEGER;
  const groundKeys = new Map<number, string>();
  for (const record of groundRecords) groundKeys.set(record, want(terrain, record, first, []));
  const materialKeys = new Map<Pictured, string>();
  for (const [material, [archive, record, use]] of Object.entries(MATERIALS[climate.climate]) as [Pictured, Choice][])
    materialKeys.set(material, want(inSeason(archive, record, climate.season), record, first / 2, [use]));
  const turnOf = (archive: number, record: number): string =>
    `${climateArchive(archive, record, climate.climate, climate.season)}.${record}`;
  for (const each of wants) {
    const [archive, record] = turnOf(each.archive, each.record).split('.').map(Number);
    want(archive, record, each.weight, [...each.uses, ...usesOf(archive, record)]);
  }
  const ordered = [...turned.entries()]
    .filter(([, each]) => pictureSize(each.archive, each.record))
    .sort((a, b) => b[1].weight - a[1].weight || a[1].archive - b[1].archive || a[1].record - b[1].record)
    .slice(0, PICTURE_LAYERS);
  const layers = new Map(ordered.map(([key], layer) => [key, layer]));
  const pictures = ordered.map(([, each]): BookPicture => {
    const size = pictureSize(each.archive, each.record);
    const uses = [...each.uses].sort();
    return {
      archive: each.archive,
      record: each.record,
      width: size?.width ?? LAYER_SIZE,
      height: size?.height ?? LAYER_SIZE,
      uses,
      guess: guessOf(each.archive, each.record, uses, terrain),
    };
  });
  const layerAt = (key: string | undefined): number => (key === undefined ? 0 : (layers.get(key) ?? 0));
  const materials = { ...COLOUR_LAYERS } as Record<SolidMaterial, number>;
  for (const [material, key] of materialKeys) materials[material] = layerAt(key);
  return {
    pictures,
    layerOf: (archive, record) => layerAt(turnOf(archive, record)),
    materials,
    ground: Array.from({ length: 56 }, (unused, record) => layerAt(groundKeys.get(record) ?? groundKeys.get(2))),
  };
}
