// Who keeps each counter of a social space, and Shape, who keeps none: the title their screen and their prompt show,
// a line of what they deal in, the speaker their words are said by (content/story/cast.json), and their whole dress,
// so the figure at the counter and the figure on their screen are one person.
import factions from '../../../content/gear/factions.json' with { type: 'json' };
import type { Dress, Race } from '../player/dressing.ts';
import type { Outfit } from '../forge/outfit.ts';

/** A counter's keeper, or Shape. `faction` is the faction a faction's counter serves, by its number. */
export interface Keeper {
  readonly title: string;
  readonly words: string;
  readonly speaker: string;
  readonly dress: Dress;
  readonly faction?: number;
}

/** The kinds whose keepers deal with a player, by the station's kind as the city crate names it, and Shape. */
export const KEEPER_KINDS = [
  'mage',
  'vault',
  'armorsmith',
  'weaponsmith',
  'tailor',
  'tack',
  'stormcallers',
  'lamplighters',
  'veiled',
  'shape',
] as const;
export type KeeperKind = (typeof KEEPER_KINDS)[number];

const dressed = (
  body: 'male' | 'female',
  race: Race,
  tone: number,
  hair: Outfit['hair'],
  garments: string[],
  dyes: Record<string, string>,
  armour: Outfit['armour'] = {},
): Dress => ({
  body,
  race,
  tone,
  outfit: { armour, garments, dyes, right: null, left: null, drawn: false, hair },
});

/** A faction's keeper: its name and words as the faction's own (content/gear/factions.json), so they are said once. */
function factionKeeper(faction: number, speaker: string, dress: Dress): Keeper {
  const found = factions.factions.find((each) => each.id === faction);
  if (!found) throw new Error(`no faction ${faction}`);
  return { title: found.name, words: found.words, speaker, faction, dress };
}

export const KEEPERS: Readonly<Record<KeeperKind, Keeper>> = {
  mage: {
    title: 'The Mage',
    words: 'Reads what the sea gives up. Bring your Vestiges here to see what they hold.',
    speaker: 'mage',
    dress: dressed('female', 'anole', 0.35, { style: 'long', colour: 'black' }, ['plain_robes_hooded', 'shoes'], {
      plain_robes_hooded: 'Purple',
      shoes: 'DarkBrown',
    }),
  },
  vault: {
    title: 'Vault',
    words: 'What you keep in Overlook stays in Overlook.',
    speaker: 'vaultkeeper',
    dress: dressed(
      'male',
      'human',
      0.7,
      { style: 'crop', colour: 'grey' },
      ['shirt_long_round', 'short_tunic', 'breeches', 'tall_boots'],
      { shirt_long_round: 'White', short_tunic: 'Grey', breeches: 'DarkBrown', tall_boots: 'DarkBrown' },
    ),
  },
  armorsmith: {
    title: 'The Armorsmith',
    words: 'Armour forged and fitted in Overlook. New pieces every day.',
    speaker: 'armorsmith',
    dress: dressed(
      'female',
      'human',
      0.45,
      { style: 'tails', colour: 'red' },
      ['shirt_long_round', 'breeches', 'tights'],
      { breeches: 'Grey' },
      { cuirass: 'chain', greaves: 'iron', boots: 'iron' },
    ),
  },
  weaponsmith: {
    title: 'The Weaponsmith',
    words: 'Blades, bows and guns, and the shot to feed them. New pieces every day.',
    speaker: 'weaponsmith',
    dress: dressed(
      'male',
      'felid',
      0.5,
      { style: 'tied', colour: 'brown' },
      ['shirt_short_round', 'breeches', 'tights'],
      { breeches: 'DarkBrown' },
      { cuirass: 'leather', gauntlets: 'leather', boots: 'leather' },
    ),
  },
  tailor: {
    title: 'The Tailor',
    words: 'Dyes for your armour and emblems to carry your name. New ones every day.',
    speaker: 'tailor',
    dress: dressed(
      'male',
      'human',
      0.25,
      { style: 'shoulder', colour: 'blond' },
      ['shirt_long_deep', 'vest', 'breeches', 'tall_boots'],
      { shirt_long_deep: 'White', vest: 'Red', breeches: 'DarkBrown', tall_boots: 'DarkBrown' },
    ),
  },
  tack: {
    title: 'The Tack',
    words: 'Coats and barding for your horse. New ones every day.',
    speaker: 'tack',
    dress: dressed(
      'female',
      'felid',
      0.6,
      { style: 'braid', colour: 'brown' },
      ['shirt_short_round', 'vest', 'casual_pants', 'tall_boots'],
      { shirt_short_round: 'White', vest: 'LightBrown', casual_pants: 'DarkBrown', tall_boots: 'DarkBrown' },
      { gauntlets: 'leather' },
    ),
  },
  stormcallers: factionKeeper(
    1,
    'stormcaller',
    dressed(
      'male',
      'anole',
      0.55,
      { style: 'crop', colour: 'black' },
      ['shirt_long_v', 'short_tunic', 'breeches', 'tall_boots', 'casual_cloak'],
      { short_tunic: 'Blue', breeches: 'Grey', casual_cloak: 'Blue' },
      { gauntlets: 'steel' },
    ),
  ),
  lamplighters: factionKeeper(
    2,
    'maren',
    dressed('female', 'human', 0.3, { style: 'long', colour: 'white' }, ['plain_robes', 'formal_cloak', 'shoes'], {
      plain_robes: 'Yellow',
      formal_cloak: 'White',
      shoes: 'DarkBrown',
    }),
  ),
  veiled: factionKeeper(
    3,
    'veiled',
    dressed('female', 'felid', 0.8, { style: 'short', colour: 'grey' }, ['plain_robes_hooded', 'boots'], {
      plain_robes_hooded: 'Grey',
      boots: 'DarkBrown',
    }),
  ),
  shape: {
    title: 'Shape',
    words: 'Here from Friday until Sunday evening. Trades in Shapes, and nothing else.',
    speaker: 'shape',
    dress: dressed('male', 'anole', 0.9, { style: 'crop', colour: 'black' }, ['plain_robes_hooded', 'sandals'], {
      plain_robes_hooded: 'Grey',
    }),
  },
};

/** The keeper of a station's kind, or none for a station whose keeper deals with no one. */
export function keeperOf(kind: string): Keeper | null {
  return (KEEPER_KINDS as readonly string[]).includes(kind) ? KEEPERS[kind as KeeperKind] : null;
}
