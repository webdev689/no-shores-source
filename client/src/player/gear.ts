import items from '../../../content/gear/items.json' with { type: 'json' };
import resources from '../../../content/gear/resources.json' with { type: 'json' };
import rolled from '../../../content/gear/rolled.json' with { type: 'json' };
import traits from '../../../content/gear/traits.json' with { type: 'json' };
import type { GearItem, GearState } from '../network/gearMessages.ts';
import type { Wardrobe } from './dressing.ts';

/** The kinds of item, by the gear crate's numbers. */
export const KINDS = [
  '',
  'dagger',
  'sword',
  'mace',
  'flail',
  'axe',
  'warhammer',
  'staff',
  'bow',
  'crossbow',
  'pistolet',
  'thunderlock',
  'shield',
  'head',
  'torso',
  'arms',
  'legs',
  'cloak',
] as const;
/** The slots, by the gear crate's numbers. */
export const SLOTS = ['main hand', 'off hand', 'head', 'torso', 'arms', 'legs', 'cloak'] as const;
/** The rarities, by the gear crate's numbers: each one's name and colour. */
export const RARITIES = [
  { name: 'Normal', colour: '#e9e4d9' },
  { name: 'Magic', colour: '#6f9ee8' },
  { name: 'Rare', colour: '#e4c34f' },
  { name: 'Legendary', colour: '#e0a12e' },
  { name: 'Atheric', colour: '#4fd8f0' },
] as const;
/** A column's kind of node, by the gear message's numbers. */
export const COLUMNS = ['Upgrade', 'Handling', 'Finish', 'Perk', 'Its own'] as const;
/** Where an item is: carried, in the vault, or worn in a slot (2 and on). */
export const CARRIED = 0;
export const VAULTED = 1;
export const WORN = 2;
/** The kinds a hand holds two of: a blade or mace in each. */
const OFF_HAND_BLADES = new Set(['dagger', 'sword', 'mace', 'flail']);

/** Why an ask was refused, by the room's answer numbers: the gear crate's refusals, then the room's own. */
const REFUSALS: Readonly<Record<number, string>> = {
  1: 'There is no such item.',
  2: 'There is no such Vestige.',
  3: 'It does not go there.',
  4: 'Your level is too low for it.',
  5: 'Only one Atheric in your hands and one in your armour.',
  6: 'That slot already carries nine.',
  7: 'The vault is full.',
  8: 'You already carry ten Vestiges.',
  9: 'Only in a social space, or at the stall.',
  10: 'Not where it is: worn, or in the vault.',
  11: 'Its XP has not reached that column.',
  12: 'There is no such node.',
  13: 'That node is already bought.',
  14: 'That node is not bought.',
  15: 'You do not have enough for it.',
  16: 'You have no Fruit of Dagon.',
  17: 'It can earn no more XP.',
  100: 'Out of reach, or already gathered.',
  101: 'Only the Test Ground hands out gear.',
};

/** What a room's answer to an ask says: nothing for done. */
export function answerText(answer: number): string {
  return answer === 0 ? '' : (REFUSALS[answer] ?? `Refused (${answer}).`);
}

/** An item's name: a named item's own, or a rolled one's among its kind's for its rarity. */
export function itemName(item: Pick<GearItem, 'named' | 'kind' | 'rarity' | 'name'>): string {
  if (item.named) return items.items.find((found) => found.id === item.named)?.name ?? item.named;
  const kind = KINDS[item.kind] ?? '';
  const names = (rolled.names as Record<string, Record<string, readonly string[]> | undefined>)[kind];
  const rarity = (RARITIES[item.rarity]?.name ?? '').toLowerCase();
  return names?.[rarity]?.[item.name] ?? kind;
}

/** A named item's words, if it has any. */
export function itemWords(item: Pick<GearItem, 'named'>): string {
  return item.named ? (items.items.find((found) => found.id === item.named)?.words ?? '') : '';
}

/** A trait's name and words. */
export function traitOf(id: string): { readonly name: string; readonly words: string } {
  const found = traits.traits.find((each) => each.id === id);
  return { name: found?.name ?? id, words: found?.words ?? '' };
}

/** An island's resource's name, by its place in the list. */
export function resourceName(index: number): string {
  return resources.resources[index]?.name ?? `resource ${index}`;
}

export const RESOURCE_COUNT = resources.resources.length;

/** Every named item's id and name, for the Test Ground's grants. */
export const NAMED = items.items.map((found) => ({ id: found.id, name: found.name, rarity: found.rarity }));

/** The item worn in a slot. */
export function worn(state: GearState, slot: number): GearItem | undefined {
  return state.items.find((item) => item.at === WORN + slot);
}

/** The metals a rarity's weapon is drawn in, best liked first, until each item names its own look. */
const METALS: readonly (readonly string[])[] = [
  ['iron'],
  ['steel', 'iron'],
  ['silver', 'elven', 'dwarven', 'steel'],
  ['mithril', 'dwarven', 'adamantium', 'elven', 'ebony'],
  ['daedric', 'ebony', 'adamantium', 'mithril'],
];

/** The forge layer a weapon or shield of this kind and rarity is drawn with, among those a hand of the wardrobe takes:
 *  its rarity's metal where the forge draws one, else the first of its kind. */
function layerFor(choices: readonly string[], kind: string, rarity: number, left: boolean): string | null {
  const ofKind = choices.filter((layer) => layer.startsWith(`${kind}_`) && layer.endsWith('_l') === left);
  for (const metal of METALS[rarity] ?? []) {
    const found = ofKind.find((layer) => layer.includes(`_${metal}`));
    if (found) return found;
  }
  return ofKind[0] ?? null;
}

/** What the player's hands hold, drawn, as their gear has it: the main hand's weapon and the off hand's shield or
 *  blade, each as the forge draws it. A two-handed weapon leaves the off hand empty, as the room does. */
export function gearHands(state: GearState, wardrobe: Wardrobe): { right: string | null; left: string | null } {
  const main = worn(state, 0);
  const off = worn(state, 1);
  const mainKind = main ? (KINDS[main.kind] ?? '') : '';
  const right = main ? layerFor(wardrobe.right, mainKind, main.rarity, false) : null;
  const offKind = off ? (KINDS[off.kind] ?? '') : '';
  const twoHanded = /^(axe|warhammer|staff|bow|crossbow|thunderlock)$/.test(mainKind);
  const left =
    !off || twoHanded
      ? null
      : OFF_HAND_BLADES.has(offKind)
        ? layerFor(wardrobe.left, offKind, off.rarity, true)
        : layerFor(wardrobe.left, offKind, off.rarity, false);
  return { right, left };
}
