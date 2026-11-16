import { CLOTHING_DYES, type DyeTable, type Rgb, metalOfLayer } from '../forge/dyes.ts';
import type { Figure, ForgeBody, ForgeLooks, IndexLook } from '../forge/looks.ts';
import { ARMOUR_PIECES, type ArmourPiece, type Outfit, outfitLayers } from '../forge/outfit.ts';

/** Overlook's three races: a Human's skin is a tone; Felid and Anole wear the forge's own bodies. */
export const RACES = { human: null, felid: 'khajiit', anole: 'argonian' } as const;
export type Race = keyof typeof RACES;

/** Each body's hair styles, as the forge renders them. */
const HAIR_STYLES: Readonly<Record<string, readonly string[]>> = {
  male: ['crop', 'shoulder', 'tied'],
  female: ['long', 'short', 'braid', 'tails'],
};
const WEAPON = /^(sword|dagger|axe|mace|flail|warhammer|staff|bow|crossbow|pistolet|thunderlock)(_|$)/;
const NOT_GARMENT =
  /^(body|face|under_|hair_|horse(_|$)|quiver$|spark$|torch|prop_|lute$|flute$|recorder$|tambourine$|sheath_|scabbard_|slung_|shield_)/;
const HANG = /_(drape|plated_skirted|plated|skirted)$/;
/** The lights a left hand carries. The lantern is drawn in first person only: the forge's bodies have no layer for it. */
const LIGHTS = ['torch_l', 'lantern'];

/** What a body can wear: the sets of each armour piece, its garments, and what each hand can hold. */
export interface Wardrobe {
  readonly sets: Readonly<Record<ArmourPiece, readonly string[]>>;
  readonly garments: readonly string[];
  readonly right: readonly string[];
  readonly left: readonly string[];
  readonly hairStyles: readonly string[];
}

export function wardrobeOf(body: string, drawn: ForgeBody['layers']): Wardrobe {
  const layers = Object.keys(drawn).sort();
  // Every armour set has a cuirass: a piece named for anything else (boots_laced) is a garment.
  const known = new Set(layers.filter((layer) => layer.startsWith('cuirass_')).map((layer) => layer.slice(8)));
  const pieces = new RegExp(`^(${ARMOUR_PIECES.join('|')})_([a-z]+)$`);
  const sets = Object.fromEntries(ARMOUR_PIECES.map((piece) => [piece, [] as string[]])) as Record<
    ArmourPiece,
    string[]
  >;
  const garments = new Set<string>();
  for (const layer of layers) {
    const armour = pieces.exec(layer);
    if (armour?.[1] && armour[2] && known.has(armour[2])) sets[armour[1] as ArmourPiece].push(armour[2]);
    else if (!WEAPON.test(layer) && !NOT_GARMENT.test(layer)) garments.add(layer.replace(HANG, ''));
  }
  const weapons = layers.filter((layer) => WEAPON.test(layer));
  return {
    sets,
    garments: [...garments].sort(),
    right: weapons.filter((layer) => !layer.endsWith('_l')),
    left: [
      ...layers.filter((layer) => /^shield_/.test(layer)),
      ...weapons.filter((layer) => layer.endsWith('_l')),
      ...LIGHTS.filter((light) => light === 'lantern' || drawn[light]),
    ],
    hairStyles: (HAIR_STYLES[body] ?? []).filter((style) => drawn[`hair_${style}`]),
  };
}

/** A figure placed on the Test Ground, as it is chosen: a body, a race and a skin tone, and what it wears. */
export interface Dress {
  readonly body: string;
  readonly race: Race;
  readonly tone: number;
  readonly outfit: Outfit;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
/** A name a dress may hold: short text. Names the forge does not draw are left for it to pass over. */
const isName = (value: unknown): value is string => typeof value === 'string' && value.length <= 64;

/** The dress another player's browser sent, as text, if it is one: each field of a dress's shape, its names short, so
 *  a broken or hostile one never reaches the forge. */
export function dressFrom(text: string): Dress | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value) || !isName(value['body']) || typeof value['tone'] !== 'number') return null;
  if (typeof value['race'] !== 'string' || !Object.hasOwn(RACES, value['race'])) return null;
  const outfit = value['outfit'];
  if (!isRecord(outfit)) return null;
  const { armour, garments, dyes, right, left, drawn, hair } = outfit;
  const pieces = ARMOUR_PIECES as readonly string[];
  if (!isRecord(armour) || !Object.entries(armour).every(([piece, set]) => pieces.includes(piece) && isName(set)))
    return null;
  if (!Array.isArray(garments) || garments.length > 40 || !garments.every(isName)) return null;
  if (!isRecord(dyes) || !Object.entries(dyes).every(([garment, dye]) => isName(garment) && isName(dye))) return null;
  if (!(right === null || isName(right)) || !(left === null || isName(left)) || typeof drawn !== 'boolean') return null;
  if (!(hair === null || (isRecord(hair) && isName(hair['style']) && isName(hair['colour'])))) return null;
  return value as unknown as Dress;
}

/** The forge figure a dress stacks in a move: the race's own body or the human tone, and its outfit's layers and hair,
 *  what is in hand worn for a move the forge does not draw it in. */
export function figureOf(dress: Dress, drawn: ForgeBody['layers'], anim?: string): Figure {
  const { gear, hair } = outfitLayers(dress.outfit, drawn, anim);
  const race = RACES[dress.race];
  return { body: dress.body, race, tone: race ? null : dress.tone, hair, gear };
}

/** One of the forge's dressed looks as an outfit: its armour by piece and set, its garments, its weapon drawn. */
export function lookOutfit(look: IndexLook, keep: Outfit): Outfit {
  const pieces =
    /^(helm|pauldrons|cuirass|gauntlets|greaves|boots)_(iron|steel|silver|elven|dwarven|mithril|adamantium|ebony|orcish|daedric|leather|chain|brotherhood|fighters|knights|mages|thieves)$/;
  const armour: Partial<Record<ArmourPiece, string>> = {};
  const garments: string[] = [];
  const dyes: Record<string, string> = {};
  for (const layer of look.gear) {
    const piece = pieces.exec(layer);
    if (piece?.[1] && piece[2]) armour[piece[1] as ArmourPiece] = piece[2];
    else if (!/^(face|under_)/.test(layer)) {
      const garment = layer.replace(HANG, '');
      if (!garments.includes(garment)) garments.push(garment);
      const dye = CLOTHING_DYES[look.dyes?.[layer] ?? -1];
      if (dye) dyes[garment] = dye;
    }
  }
  return { ...keep, armour, garments, dyes, right: look.weapon, left: null, drawn: !!look.weapon };
}

/** A garment's dye until one is chosen. */
export const PLAIN_DYE = 'LightBrown';

/** The ramp each dyed layer a figure wears is laid on: a metal layer its set's or metal's, a garment and its hangs
 *  their garment's dye. Layers that keep their own colours have none. */
export function rampsOf(
  gear: readonly string[],
  outfit: Outfit,
  looks: ForgeLooks,
  table: DyeTable,
): Record<string, readonly Rgb[]> {
  const metal = new Set(looks.metal ?? []);
  const dyed = new Set(looks.dye ?? []);
  const ramps: Record<string, readonly Rgb[]> = {};
  for (const layer of gear) {
    const ramp = metal.has(layer)
      ? table.armour[metalOfLayer(layer) ?? '']
      : dyed.has(layer)
        ? table.clothing[outfit.dyes[layer.replace(HANG, '')] ?? PLAIN_DYE]
        : undefined;
    if (ramp) ramps[layer] = ramp;
  }
  return ramps;
}
