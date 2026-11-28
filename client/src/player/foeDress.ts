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
/** A Lattice foe's clothes on its own body (tools/lattice/): the cloth it still wears, dyed, then its crystal, its
 *  flesh and blood and its veins, and its own parts, which its moves show or take away (combat/lattice.ts). Its skin
 *  is the dead's whatever the tone, as its body's skin is published. */
const lattice = (body: string, dyed: Readonly<Record<string, string>>, parts: readonly string[] = []): Clothes => ({
  body,
  tone: 0,
  outfit: {
    armour: {},
    garments: [
      ...Object.keys(dyed),
      `lattice_${body}_veins`,
      `lattice_${body}`,
      `lattice_${body}_gore`,
      ...parts.map((part) => `lattice_${body}_${part}`),
    ],
    dyes: dyed,
    hair: null,
  },
});

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
 *  The crew's own five types wear the Test Ground's five foes' clothes. The Brig's crew wear a plain hand's white shirt
 *  and brown breeches. The Lattice's foes wear what the ruined ports' people wore when it took them, torn and soaked;
 *  the Tithe-Taker, a Grey Tithe officer, a dark coat over grey under a grey cloak. */
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
  39: lattice('husk', { shirt_long_round: 'Grey', belt: 'DarkBrown', breeches: 'DarkBrown', boots: 'DarkBrown' }),
  40: lattice('flicker', { breeches: 'Grey' }, ['blade_L', 'blade_R']),
  41: lattice('idol', { breeches: 'DarkBrown' }, ['emitter']),
  42: lattice(
    'ravager',
    { shirt_short_v: 'Grey', vest: 'DarkBrown', belt: 'DarkBrown', casual_pants: 'Grey', tall_boots: 'DarkBrown' },
    ['shroud', 'blades', 'ammunition'],
  ),
  43: lattice('bulwark', { breeches: 'DarkBrown', belt: 'DarkBrown', tall_boots: 'DarkBrown' }, [
    'head',
    'shield',
    'maul',
  ]),
  44: lattice('heart', {}, ['fused', 'core', 'anchor', 'torn']),
  45: clothes(
    'male',
    0.3,
    { gauntlets: 'leather', boots: 'leather' },
    { shirt_long_v: 'Grey', breeches: 'DarkBrown', formal_tunic: 'DarkBrown', formal_cloak: 'Grey' },
    { style: 'crop', colour: 'black' },
  ),
  // The Drowned Vale's Bosses wear the Lattice's own bodies until their own art is drawn: the Scrivener shoots, as
  // the Idol does; the Steward is the Breach's last Boss, as the Heart is the Fissure's. A Bell (46) is no figure:
  // its crystal is drawn where it stands (`breachView.ts`).
  47: lattice('idol', { breeches: 'Grey' }, ['emitter']),
  48: lattice('heart', {}, ['fused', 'core', 'anchor', 'torn']),
};

/** A type's dress: its own clothes, with the weapons the rules' roster puts in its hands drawn. Null for a type with
 *  no clothes here, and for a Bell, which stands as a crystal and no figure. */
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

/** What an officer ashore wears by their post (0 First Mate to 4 Lookout), each their own, so no two posts look alike
 *  however the rules arm them: the ship's crew in blue cloth, the First Mate in mail under a blue surcoat, the Gunner
 *  in a white shirt and a red sash, the Bosun in iron over a brown vest, the Carpenter in a leather apron's brown, and
 *  the Lookout under a blue hooded cloak. */
const OFFICER_CLOTHES: readonly Clothes[] = [
  clothes(
    'male',
    0.3,
    { cuirass: 'chain', gauntlets: 'chain', boots: 'chain' },
    { shirt_long_v: 'Blue', breeches: 'DarkBrown', dwynnen_surcoat: 'Blue' },
    { style: 'tied', colour: 'black' },
  ),
  clothes(
    'male',
    0.6,
    { cuirass: 'leather', gauntlets: 'leather', boots: 'leather' },
    { shirt_short_round: 'White', casual_pants: 'Blue', waist_sash: 'Red' },
    { style: 'crop', colour: 'brown' },
  ),
  clothes(
    'male',
    0.75,
    { pauldrons: 'iron', cuirass: 'iron', boots: 'iron' },
    { casual_pants: 'Blue', vest: 'DarkBrown' },
    { style: 'tied', colour: 'brown' },
  ),
  clothes(
    'female',
    0.45,
    { cuirass: 'leather', boots: 'leather' },
    { shirt_long_round: 'LightBrown', breeches: 'Blue', vest: 'DarkBrown' },
    { style: 'tails', colour: 'black' },
  ),
  clothes(
    'female',
    0.2,
    { cuirass: 'leather', gauntlets: 'leather', boots: 'leather' },
    { shirt_long_deep: 'Blue', breeches: 'Grey', casual_cloak_hooded: 'Blue' },
    { style: 'long', colour: 'red' },
  ),
];

/** An officer ashore's dress: their post's clothes, with the weapons the rules give the type they fight as drawn. Null
 *  for a post past the Lookout. */
export function officerDress(type: Pick<FoeType, 'right' | 'left'>, post: number): Dress | null {
  const own = OFFICER_CLOTHES[post];
  if (!own) return null;
  return {
    body: own.body,
    race: 'human',
    tone: own.tone,
    outfit: { ...own.outfit, right: type.right, left: type.left, drawn: true },
  };
}
