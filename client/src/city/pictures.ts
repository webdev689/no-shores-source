// Which pictures a city wears and where each sits in its one texture array: the forged models' pictures turned to the
// city's climate, the ground's tiles of its terrain set, and the pictures chosen for its solids' materials. The most
// used come first, so a city that needs more than the array holds loses only its rarest.
import cosmetics from '../../../content/gear/cosmetics.json' with { type: 'json' };
import factions from '../../../content/gear/factions.json' with { type: 'json' };
import { climateArchive, pictureSize, type Climate, type PictureUse, type Season } from '../textures/picture.ts';
import type { CityClimate, ClothMaterial, SolidMaterial } from './plan.ts';

/** Layers the array holds for pictures; the four above them are the plain colours. WebGPU's default limit is 256. */
export const PICTURE_LAYERS = 252;
/** The solids' plain colours, drawn by code rather than a picture: gold, iron, bone, the glow of a fire, cloth,
 *  still water and the Lattice's crystal.
 *  A plain colour never samples its own layer, so cloth's numbers lie past the array and cost it none. */
export const COLOUR_LAYERS = {
  gold: 252,
  iron: 253,
  bone: 254,
  glow: 255,
  linen: 256,
  crimson: 257,
  verdant: 258,
  black: 259,
  stormcaller_blue: 260,
  lamplighter_gold: 261,
  veiled_dusk: 262,
  straw: 263,
  water: 264,
  crystal: 265,
} as const;

/** A dye's cloth colour: the middle of its four-step ramp (its second and third steps' mean), as a cape wears it. */
function dyeColour(dye: string): Tint {
  const look = cosmetics.cosmetics.find((each) => each.id === dye)?.look ?? [];
  const channel = (hex: string | undefined, start: number): number =>
    parseInt((hex ?? '#808080').slice(start, start + 2), 16);
  return [1, 3, 5].map((start) => (channel(look[1], start) + channel(look[2], start)) / 2 / 255) as unknown as Tint;
}

const factionDye = (key: string): string => factions.factions.find((each) => each.key === key)?.dye ?? '';

/** Each cloth's colour (0 to 1 a channel): undyed linen, crimson, verdant, black and straw, and each faction's own dye, so
 *  a chapel's hangings are its capes' colour. */
export const CLOTH_COLOURS: Readonly<Record<ClothMaterial, Tint>> = {
  linen: [0.8, 0.75, 0.63],
  crimson: [0.56, 0.11, 0.12],
  verdant: [0.2, 0.42, 0.22],
  black: [0.1, 0.1, 0.11],
  straw: [0.78, 0.66, 0.36],
  stormcaller_blue: dyeColour(factionDye('stormcallers')),
  lamplighter_gold: dyeColour(factionDye('lamplighters')),
  veiled_dusk: dyeColour(factionDye('veiled')),
};
/** Every picture is resampled to this square, so one array holds them all. */
export const LAYER_SIZE = 128;

/** The materials with a picture of their climate's own; rubble wears RUBBLE in every climate, and chalk's CHALK; turf
 *  wears the ground's grass and canvas the plaster's picture. */
type Pictured = Exclude<SolidMaterial, keyof typeof COLOUR_LAYERS | 'rubble' | 'chalk' | 'turf' | 'canvas'>;
type Tint = readonly [number, number, number];
type Choice = readonly [archive: number, record: number, use: PictureUse, tint?: Tint];

/**
 * The pictures each climate's solids wear, from the textures' own sets, some lightened or warmed (`tint`, a factor
 * a channel) since Daggerfall's stone is dark: pale limestone ashlar, sandstone, grey granite or mossy grey for
 * stone; a carved frieze or a banded course for trim; the roof set's tiles, terracotta, slate or thatch; boards for
 * timber; a plastered wall; and flagstones or sandstone cobbles for paving. Winter takes each set's snowed turn, as
 * it is painted, untinted.
 */
export const MATERIALS: Readonly<Record<Climate, Readonly<Record<Pictured, Choice>>>> = {
  temperate: {
    stone: [109, 1, 'wall', [2.2, 2.05, 1.75]],
    trim: [161, 1, 'wall', [2.3, 2.2, 1.95]],
    roof: [369, 2, 'roof', [1.4, 1.5, 1.5]],
    timber: [364, 1, 'wall'],
    plaster: [312, 1, 'wall'],
    paving: [324, 2, 'slope', [1.85, 1.75, 1.55]],
    path: [324, 3, 'floor', [2.5, 2.3, 1.9]],
    lawn: [302, 2, 'floor', [1.25, 1.3, 1.15]],
    earth: [302, 1, 'floor', [1.15, 1.1, 1.05]],
  },
  desert: {
    stone: [9, 1, 'wall', [1.12, 1.12, 1.1]],
    trim: [42, 1, 'wall'],
    roof: [69, 0, 'roof', [1.3, 1.25, 1.2]],
    timber: [67, 0, 'prop'],
    plaster: [38, 1, 'wall'],
    paving: [17, 1, 'wall', [1.25, 1.2, 1.15]],
    path: [324, 3, 'floor', [2.5, 2.3, 1.9]],
    lawn: [2, 2, 'floor'],
    earth: [2, 1, 'floor'],
  },
  mountain: {
    stone: [109, 1, 'wall', [1.4, 1.4, 1.36]],
    trim: [161, 1, 'wall', [1.6, 1.6, 1.5]],
    roof: [469, 2, 'roof', [2.5, 2.5, 2.6]],
    timber: [67, 0, 'prop'],
    plaster: [126, 1, 'wall'],
    paving: [323, 2, 'floor', [1.5, 1.5, 1.45]],
    path: [324, 3, 'floor', [2.3, 2.25, 2.1]],
    lawn: [102, 2, 'floor'],
    earth: [102, 1, 'floor'],
  },
  swamp: {
    stone: [458, 1, 'wall', [1.35, 1.38, 1.3]],
    trim: [161, 1, 'wall', [1.4, 1.55, 1.35]],
    roof: [469, 3, 'roof'],
    timber: [426, 1, 'wall'],
    plaster: [442, 1, 'wall'],
    paving: [324, 2, 'slope', [1.4, 1.42, 1.35]],
    path: [324, 3, 'floor', [2.1, 2.1, 1.85]],
    lawn: [402, 2, 'floor'],
    earth: [402, 1, 'floor'],
  },
};

/** The terraces' retaining walls and the plates' skirts: rubble near the ground's own colour, so the many walls
 *  between the terraces read as terracing and not as a grid drawn over the city. */
const TERRACES: Readonly<Record<Climate, Choice>> = {
  temperate: [335, 1, 'wall', [1.35, 1.35, 1.3]],
  desert: [17, 1, 'wall'],
  mountain: [112, 1, 'wall', [1.25, 1.25, 1.2]],
  swamp: [409, 1, 'wall', [1.2, 1.2, 1.15]],
};

/** Natural rock (boulders, scree, drystone): each climate's ground stone, brought to the colour the terrain draws
 *  its cliffs in (groundColour.ts stone_tint: the stone's hue at bare rock's light), so the rock fallen from a cliff
 *  matches it; the gains are each stone tile's mean against that colour. */
const RUBBLE: Readonly<Record<Climate, Choice>> = {
  temperate: [302, 3, 'floor', [1.48, 1.47, 1.42]],
  desert: [2, 3, 'floor', [1.02, 1.16, 1.39]],
  mountain: [102, 3, 'floor', [1.81, 1.78, 1.8]],
  swamp: [402, 3, 'floor', [2.37, 2.05, 2.48]],
};

/** The rubble of a chalk zone's cliffs: the temperate stone tile brought to chalk's white (groundColour.ts CHALK). */
const CHALK: Choice = [302, 3, 'floor', [2.7, 2.65, 2.55]];

/** The ground record of grass, which a slab of turf wears. */
const GRASS = 2;

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

/** One layer's picture: where it is filed, its own size, what it is named for, the factor each channel is
 *  painted at (a solid's lightened stone), and the colour drawn until painted. */
export type BookPicture = {
  readonly archive: number;
  readonly record: number;
  readonly width: number;
  readonly height: number;
  readonly uses: readonly PictureUse[];
  readonly tint: Tint | null;
  readonly guess: readonly [number, number, number];
};

export type PictureBook = {
  readonly pictures: readonly BookPicture[];
  /** A forged model's picture's layer, turned to the city's climate first. */
  layerOf(archive: number, record: number): number;
  /** A solid material's layer, or its plain colour's. */
  readonly materials: Readonly<Record<SolidMaterial, number>>;
  /** The layer of the terraces' retaining walls and the plates' skirts. */
  readonly terrace: number;
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
export type PictureWant = {
  readonly archive: number;
  readonly record: number;
  weight: number;
  uses: Set<PictureUse>;
  readonly tint?: Tint | null;
};

/**
 * The city's pictures, in one array of at most PICTURE_LAYERS layers. `wants` are the models' pictures as their
 * tables file them, with how much the city wears each; `usesOf` says what a turned picture is named for. The ground
 * and the solids' pictures come first (chalk's only where `chalky`: the plan holds chalk solids), then the rest by how much the city wears them.
 */
export function pictureBook(
  climate: CityClimate,
  wants: Iterable<PictureWant>,
  groundRecords: Iterable<number>,
  usesOf: (archive: number, record: number) => readonly PictureUse[],
  chalky = false,
): PictureBook {
  const terrain = terrainArchive(climate);
  const turned = new Map<string, PictureWant>();
  const want = (
    archive: number,
    record: number,
    weight: number,
    uses: readonly PictureUse[],
    tint: Tint | null = null,
  ): string => {
    const key = tint ? `${archive}.${record}*${tint.join(',')}` : `${archive}.${record}`;
    const found = turned.get(key) ?? { archive, record, weight: 0, uses: new Set<PictureUse>(), tint };
    found.weight += weight;
    for (const use of uses) found.uses.add(use);
    turned.set(key, found);
    return key;
  };
  const first = Number.MAX_SAFE_INTEGER;
  const groundKeys = new Map<number, string>();
  for (const record of groundRecords) groundKeys.set(record, want(terrain, record, first, []));
  const materialKeys = new Map<Pictured, string>();
  const chosen = ([archive, record, use, tint]: Choice): string => {
    const turnedArchive = inSeason(archive, record, climate.season);
    return want(turnedArchive, record, first / 2, [use], turnedArchive === archive ? (tint ?? null) : null);
  };
  for (const [material, choice] of Object.entries(MATERIALS[climate.climate]) as [Pictured, Choice][])
    materialKeys.set(material, chosen(choice));
  const terraceKey = chosen(TERRACES[climate.climate]);
  const rubbleKey = chosen(RUBBLE[climate.climate]);
  const chalkKey = chalky ? chosen(CHALK) : rubbleKey;
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
    const tint = each.tint ?? null;
    const guess = guessOf(each.archive, each.record, uses, terrain);
    return {
      archive: each.archive,
      record: each.record,
      width: size?.width ?? LAYER_SIZE,
      height: size?.height ?? LAYER_SIZE,
      uses,
      tint,
      guess: tint
        ? ([0, 1, 2].map((channel) => Math.min(1, guess[channel] * tint[channel])) as [number, number, number])
        : guess,
    };
  });
  const layerAt = (key: string | undefined): number => (key === undefined ? 0 : (layers.get(key) ?? 0));
  const materials = { ...COLOUR_LAYERS } as Record<SolidMaterial, number>;
  for (const [material, key] of materialKeys) materials[material] = layerAt(key);
  materials.rubble = layerAt(rubbleKey);
  materials.chalk = layerAt(chalkKey);
  materials.canvas = materials.plaster;
  materials.turf = layerAt(groundKeys.get(GRASS));
  return {
    pictures,
    layerOf: (archive, record) => layerAt(turnOf(archive, record)),
    materials,
    terrace: layerAt(terraceKey),
    ground: Array.from({ length: 56 }, (unused, record) => layerAt(groundKeys.get(record) ?? groundKeys.get(2))),
  };
}
