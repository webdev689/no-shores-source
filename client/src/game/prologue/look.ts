import { type Dress, RACES, type Race, plainDress } from '../../player/dressing.ts';

type Hair = { readonly style: string; readonly colour: string };

/** The look a player chose at the helm: a body, a race, a human's skin tone and hair. It is kept in this browser
 *  and nowhere else. An Anole has no hair. */
export interface Look {
  readonly body: 'male' | 'female';
  readonly race: Race;
  readonly tone: number;
  readonly hair: Hair | null;
}

/** Where this browser keeps the look. */
const KEY = 'overlook.look';

/** Each body's hair styles, as the forge draws them. */
const HAIR_STYLES: Readonly<Record<Look['body'], readonly string[]>> = {
  male: ['crop', 'shoulder', 'tied'],
  female: ['long', 'short', 'braid', 'tails'],
};
/** The hair colours a player may choose: the forge's natural ones, darkest to lightest. */
export const HAIR_COLOURS: readonly string[] = ['black', 'brown', 'auburn', 'red', 'blond', 'grey', 'white'];

/** The look before any is chosen: a human of middle tone with cropped brown hair. */
export const FIRST_LOOK: Look = { body: 'male', race: 'human', tone: 0.5, hair: { style: 'crop', colour: 'brown' } };

export const hairStylesOf = (body: Look['body']): readonly string[] => HAIR_STYLES[body];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The kept look, if one is kept whole: a broken or stale one is none, so the helm starts afresh. */
export function keptLook(kept: Pick<Storage, 'getItem'>): Look | null {
  let value: unknown;
  try {
    value = JSON.parse(kept.getItem(KEY) ?? '');
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const { body, race, tone, hair } = value;
  if (body !== 'male' && body !== 'female') return null;
  if (typeof race !== 'string' || !Object.hasOwn(RACES, race)) return null;
  if (typeof tone !== 'number' || !(tone >= 0 && tone <= 1)) return null;
  if (hair === null) return race === 'anole' ? { body, race, tone, hair } : null;
  if (!isRecord(hair) || race === 'anole') return null;
  const { style, colour } = hair;
  if (typeof style !== 'string' || !HAIR_STYLES[body].includes(style)) return null;
  if (typeof colour !== 'string' || !HAIR_COLOURS.includes(colour)) return null;
  return { body, race: race as Race, tone, hair: { style, colour } };
}

export function keepLook(kept: Pick<Storage, 'setItem'>, look: Look): void {
  kept.setItem(KEY, JSON.stringify(look));
}

/** The look on another body: the hair keeps its colour and takes that body's first style. */
export function withBody(look: Look, body: Look['body']): Look {
  if (body === look.body) return look;
  const style = HAIR_STYLES[body][0] ?? 'crop';
  return { ...look, body, hair: look.hair && { style, colour: look.hair.colour } };
}

/** The look as another race: an Anole loses its hair, and leaving one grows the body's first style back. The tone
 *  stays, so a player who looks at a Felid and comes back to a Human finds the tone they chose. */
export function withRace(look: Look, race: Race): Look {
  if (race === 'anole') return { ...look, race, hair: null };
  const hair = look.hair ?? { style: HAIR_STYLES[look.body][0] ?? 'crop', colour: FIRST_LOOK.hair?.colour ?? 'brown' };
  return { ...look, race, hair };
}

/** A human's skin tone, 0 (lightest) to 1 (deepest); the other races wear their own skins, so theirs is not changed. */
export function withTone(look: Look, tone: number): Look {
  return look.race === 'human' ? { ...look, tone: Math.max(0, Math.min(1, tone)) } : look;
}

/** The look with this hair, when the body and race can wear it. */
export function withHair(look: Look, hair: Hair): Look {
  const fits =
    look.race !== 'anole' && HAIR_STYLES[look.body].includes(hair.style) && HAIR_COLOURS.includes(hair.colour);
  return fits ? { ...look, hair } : look;
}

/** The game's everyday dress for the look: the plain shirt, breeches and boots, the sword at the hip. */
export function plainDressOf(look: Look): Dress {
  const plain = plainDress(look.race, look.tone);
  return { ...plain, body: look.body, outfit: { ...plain.outfit, hair: look.hair } };
}

/** The prologue's dress: steel armour but no helm, so the face shows, sword and kite shield drawn. */
export function armouredDress(look: Look): Dress {
  const plain = plainDressOf(look);
  return {
    ...plain,
    outfit: {
      ...plain.outfit,
      armour: { pauldrons: 'steel', cuirass: 'steel', gauntlets: 'steel', greaves: 'steel', boots: 'steel' },
      // The steel boots stand in for the plain ones.
      garments: plain.outfit.garments.filter((garment) => garment !== 'boots'),
      right: 'sword_steel',
      left: 'shield_kite_steel',
      drawn: true,
    },
  };
}
