import type { Dress } from '../player/dressing.ts';

/** A kind of foe, as the foes crate numbers them, and the dress its figure wears: its weapons are the ones its rules
 *  fight with. */
export interface FoeKind {
  readonly number: number;
  readonly name: string;
  readonly dress: Dress;
}

const human = (body: string, tone: number, outfit: Dress['outfit']): Dress => ({ body, race: 'human', tone, outfit });

export const FOE_KINDS: readonly FoeKind[] = [
  {
    number: 1,
    name: 'Skirmisher',
    dress: human('male', 0.45, {
      armour: { cuirass: 'leather', gauntlets: 'leather', boots: 'leather' },
      garments: ['shirt_short_v', 'breeches', 'hood'],
      dyes: { shirt_short_v: 'DarkBrown', breeches: 'Grey', hood: 'Grey' },
      right: 'dagger_iron',
      left: 'dagger_iron_l',
      drawn: true,
      hair: { style: 'crop', colour: 'black' },
    }),
  },
  {
    number: 2,
    name: 'Swordsman',
    dress: human('male', 0.25, {
      armour: { helm: 'chain', cuirass: 'chain', gauntlets: 'chain', greaves: 'chain', boots: 'chain' },
      garments: ['shirt_long_v', 'breeches'],
      dyes: { shirt_long_v: 'Red', breeches: 'DarkBrown' },
      right: 'sword_steel',
      left: 'shield_kite_steel',
      drawn: true,
      hair: null,
    }),
  },
  {
    number: 3,
    name: 'Brute',
    dress: human('male', 0.7, {
      armour: { pauldrons: 'iron', cuirass: 'iron', greaves: 'iron', boots: 'iron' },
      garments: ['breeches'],
      dyes: { breeches: 'DarkBrown' },
      right: 'warhammer_iron',
      left: null,
      drawn: true,
      hair: { style: 'tied', colour: 'brown' },
    }),
  },
  {
    number: 4,
    name: 'Archer',
    dress: human('female', 0.35, {
      armour: { cuirass: 'leather', boots: 'leather' },
      garments: ['shirt_short_v', 'breeches'],
      dyes: { shirt_short_v: 'Green', breeches: 'DarkBrown' },
      right: 'bow_short_iron',
      left: null,
      drawn: true,
      hair: { style: 'braid', colour: 'red' },
    }),
  },
  {
    number: 5,
    name: 'Captain',
    dress: human('male', 0.55, {
      armour: {
        helm: 'ebony',
        pauldrons: 'ebony',
        cuirass: 'ebony',
        gauntlets: 'ebony',
        greaves: 'ebony',
        boots: 'ebony',
      },
      garments: ['shirt_long_v', 'breeches'],
      dyes: { shirt_long_v: 'Purple', breeches: 'Grey' },
      right: 'sword_ebony',
      left: null,
      drawn: true,
      hair: null,
    }),
  },
];

/** The kind a number names, if any. */
export const foeKind = (number: number): FoeKind | undefined => FOE_KINDS.find((kind) => kind.number === number);

/** The number a panel sends to send every foe away. */
export const CLEAR_FOES = 255;
