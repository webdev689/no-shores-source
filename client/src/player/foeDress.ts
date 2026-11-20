import type { Dress } from './dressing.ts';
import type { ArmourPiece, Outfit } from '../forge/outfit.ts';
import type { FoeType } from '../rules/roster.ts';

/** What a type wears, its hands aside: a body and a skin tone, its armour, its garments in the order they are put on
 *  (each with its dye), and its hair. */
interface Clothes {
  readonly body: string;
  readonly tone: number;
  readonly outfit: Omit<Outfit, 'right' | 'left' | 'drawn'>;
}

type Armour = Partial<Record<ArmourPiece, string>>;
const every = (set: string): Armour => ({
  helm: set,
  pauldrons: set,
  cuirass: set,
  gauntlets: set,
  greaves: set,
  boots: set,
});
const clothes = (
  body: string,
  tone: number,
  armour: Armour,
  dyed: Readonly<Record<string, string>>,
  hair: Outfit['hair'] = null,
): Clothes => ({ body, tone, outfit: { armour, garments: Object.keys(dyed), dyes: dyed, hair } });

/** The High Assessor's clothes, which each Elite Dungeon's Boss wears too, in a body of its own. */
const assessor = (body: string): Clothes =>
  clothes(body, 0.4, every('iron'), { breeches: 'Grey', dwynnen_surcoat: 'Grey', formal_cloak: 'Grey' });
/** The Elite Dungeons' Bosses' bodies, types 21 to 38 in order, each as its name reads. */
const WARDEN_BODIES: readonly string[] = [
  ...['male', 'female', 'male', 'female', 'male', 'female', 'male', 'male', 'female'],
  ...['male', 'male', 'female', 'male', 'male', 'female', 'male', 'female', 'male'],
];

/** Each type's clothes by its number. The Grey Tithe wear grey cloth, over leather when they skirmish or shoot and
 *  over iron when they stand and fight; their captain is in steel from head to foot under a long grey cloak, and their
 *  High Assessor and the Elite Dungeons' Bosses in iron from head to foot under a grey surcoat and a long grey cloak.
 *  The pirates wear the Test Ground's five foes' clothes. The Brig's crew wear a plain hand's white shirt and brown
 *  breeches. */
const CLOTHES: Readonly<Record<number, Clothes>> = {
  1: clothes(
    'male',
    0.4,
    { cuirass: 'leather', gauntlets: 'leather', boots: 'leather' },
    { shirt_short_v: 'Grey', breeches: 'Grey', casual_cloak_short: 'Grey' },
    { style: 'crop', colour: 'black' },
  ),
  2: clothes(
    'male',
    0.3,
    { helm: 'iron', cuirass: 'iron', gauntlets: 'iron', boots: 'iron' },
    { shirt_long_v: 'Grey', breeches: 'Grey', dwynnen_surcoat: 'Grey' },
  ),
  3: clothes(
    'female',
    0.5,
    { cuirass: 'leather', gauntlets: 'leather', boots: 'leather' },
    { shirt_long_v: 'Grey', breeches: 'DarkBrown', waist_sash: 'Grey' },
    { style: 'tails', colour: 'brown' },
  ),
  4: clothes('male', 0.65, every('iron'), { breeches: 'Grey', casual_cloak_short: 'Grey' }),
  5: clothes(
    'male',
    0.2,
    { cuirass: 'leather', gauntlets: 'leather', boots: 'leather' },
    { shirt_long_v: 'Grey', casual_pants: 'Grey', casual_cloak_hooded: 'Grey' },
    { style: 'crop', colour: 'black' },
  ),
  6: clothes(
    'male',
    0.5,
    { helm: 'iron', pauldrons: 'iron', cuirass: 'iron', gauntlets: 'iron', boots: 'iron' },
    { breeches: 'DarkBrown', anticlere_surcoat: 'Grey', casual_cloak: 'Grey' },
  ),
  7: clothes(
    'male',
    0.6,
    { cuirass: 'leather', boots: 'leather' },
    { shirt_short_round: 'Grey', casual_pants: 'DarkBrown', waist_sash: 'Grey' },
    { style: 'tied', colour: 'black' },
  ),
  8: clothes(
    'male',
    0.35,
    { cuirass: 'leather', gauntlets: 'iron', boots: 'leather' },
    { shirt_long_round: 'Grey', breeches: 'Grey', vest: 'DarkBrown' },
    { style: 'crop', colour: 'brown' },
  ),
  9: clothes(
    'female',
    0.25,
    { cuirass: 'leather', gauntlets: 'leather', boots: 'leather' },
    { shirt_long_deep: 'Grey', breeches: 'Grey', casual_cloak_short: 'Grey' },
    { style: 'long', colour: 'black' },
  ),
  10: clothes(
    'male',
    0.8,
    { pauldrons: 'iron', cuirass: 'iron', boots: 'iron' },
    { casual_pants: 'Grey', waist_sash: 'Grey' },
    { style: 'tied', colour: 'brown' },
  ),
  11: clothes(
    'male',
    0.45,
    { helm: 'iron', cuirass: 'iron', gauntlets: 'iron', greaves: 'iron', boots: 'iron' },
    { breeches: 'Grey', dwynnen_surcoat: 'Grey', casual_cloak_short: 'Grey' },
  ),
  12: clothes('male', 0.55, every('steel'), { breeches: 'Grey', anticlere_surcoat: 'Grey', formal_cloak: 'Grey' }),
  13: clothes(
    'male',
    0.45,
    { cuirass: 'leather', gauntlets: 'leather', boots: 'leather' },
    { shirt_short_v: 'DarkBrown', breeches: 'Grey', hood: 'Grey' },
    { style: 'crop', colour: 'black' },
  ),
  14: clothes(
    'male',
    0.25,
    { helm: 'chain', cuirass: 'chain', gauntlets: 'chain', greaves: 'chain', boots: 'chain' },
    { shirt_long_v: 'Red', breeches: 'DarkBrown' },
  ),
  15: clothes(
    'male',
    0.7,
    { pauldrons: 'iron', cuirass: 'iron', greaves: 'iron', boots: 'iron' },
    { breeches: 'DarkBrown' },
    { style: 'tied', colour: 'brown' },
  ),
  16: clothes(
    'female',
    0.35,
    { cuirass: 'leather', boots: 'leather' },
    { shirt_short_v: 'Green', breeches: 'DarkBrown' },
    { style: 'braid', colour: 'red' },
  ),
  17: clothes('male', 0.55, every('ebony'), { shirt_long_v: 'Purple', breeches: 'Grey' }),
  18: assessor('male'),
  19: clothes('male', 0.45, {}, { shirt_long_v: 'White', breeches: 'DarkBrown', boots: 'DarkBrown' }),
  20: clothes('female', 0.45, {}, { shirt_long_v: 'White', breeches: 'DarkBrown', boots: 'DarkBrown' }),
  ...Object.fromEntries(WARDEN_BODIES.map((body, index) => [21 + index, assessor(body)])),
};

/** A type's dress: its own clothes, with the weapons the rules' roster puts in its hands drawn. Null for a type with
 *  no clothes here. */
export function foeDress(type: FoeType): Dress | null {
  const own = CLOTHES[type.type];
  if (!own) return null;
  return {
    body: own.body,
    race: 'human',
    tone: own.tone,
    outfit: { ...own.outfit, right: type.right, left: type.left, drawn: true },
  };
}
