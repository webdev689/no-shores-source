import items from '../../../content/gear/items.json' with { type: 'json' };
import resources from '../../../content/gear/resources.json' with { type: 'json' };
import rolled from '../../../content/gear/rolled.json' with { type: 'json' };
import traits from '../../../content/gear/traits.json' with { type: 'json' };
import { ASKS, type GearAsk, type GearItem, type GearState } from '../network/gearMessages.ts';
import type { Wardrobe } from './dressing.ts';

/** The kinds of item, by the gear crate's numbers: the Melee and Ranged loadouts, the armour and the cloak. */
export const KINDS = [
  '',
  'double_daggers',
  'sword',
  'mace',
  'flail',
  'great_axe',
  'warhammer',
  'staff',
  'bow',
  'crossbow',
  'pistolet',
  'thunderlock',
  'sword_and_shield',
  'head',
  'torso',
  'arms',
  'legs',
  'cloak',
  'dagger_and_shield',
  'double_swords',
  'double_mace',
  'mace_and_shield',
  'greatsword',
  'double_pistolet',
] as const;
/** The Ranged loadouts; every other kind but the armour and the cloak is a Melee one (the gear crate's `Kind::slot`). */
const RANGED: ReadonlySet<string> = new Set(['bow', 'crossbow', 'pistolet', 'double_pistolet', 'thunderlock']);
const ARMOUR_SLOTS: Readonly<Record<string, number>> = { head: 2, torso: 3, arms: 4, legs: 5, cloak: 6 };
/** The slot a kind is worn in: 0 Melee, 1 Ranged, or its own. */
export function slotOf(kind: number): number {
  const name = KINDS[kind] ?? '';
  return ARMOUR_SLOTS[name] ?? (RANGED.has(name) ? 1 : 0);
}
/** A kind's name as the screens show it: Sword & Shield, Double Daggers, Great Axe. */
export function kindName(kind: number): string {
  const words = (KINDS[kind] ?? '').split('_').filter(Boolean);
  return words.map((word) => (word === 'and' ? '&' : word.charAt(0).toUpperCase() + word.slice(1))).join(' ');
}
/** The elements by the gear crate's numbers (0 is none): each one's name, its colour, and its glyph's outline, body
 *  and light. */
export const ELEMENTS: readonly ({
  readonly name: string;
  readonly colour: string;
  readonly palette: readonly [string, string, string];
} | null)[] = [
  null,
  { name: 'Blaze', colour: '#ff8a3d', palette: ['#4a1606', '#ff7a2a', '#ffd36a'] },
  { name: 'Volt', colour: '#5ccbff', palette: ['#0b2a44', '#46beff', '#dcf6ff'] },
  { name: 'Cosmic', colour: '#b77cff', palette: ['#26093f', '#9c55ff', '#efd9ff'] },
];

/** A weapon's kind: a loadout, which carries Attack (the gear crate's `Kind::weapon`). */
export const isWeapon = (kind: number): boolean => kind >= 1 && kind < KINDS.length && slotOf(kind) <= 1;
/** The slots, by the gear crate's numbers: the two loadouts, then the armour and the cloak. */
export const SLOTS = ['melee', 'ranged', 'head', 'torso', 'arms', 'legs', 'cloak'] as const;
export const MELEE = 0;
export const RANGED_SLOT = 1;
/** The rarities, by the gear crate's numbers: each one's name, its colour with the lit and shaded edges of a frame in it
 *  (Enhanced Plus's bevel), the channels its glow is drawn in, and the pips that mark it. The colours are the owner's:
 *  Normal white, Magic blue, Rare yellow, Legendary gold, Atheric cyan blue; Magic is Enhanced Plus's own. A Normal
 *  piece's frame and glow are the kit's plain stone, so it never outshines a finer one. */
export const RARITIES = [
  { name: 'Normal', colour: '#e9e4d9', lit: '#a49b85', shade: '#3a352a', rgb: '154,144,121', pips: '' },
  { name: 'Magic', colour: '#6f9ee8', lit: '#b3cdf6', shade: '#34568f', rgb: '111,158,232', pips: '◆' },
  { name: 'Rare', colour: '#e8d84e', lit: '#f7f0a6', shade: '#8c801f', rgb: '232,216,78', pips: '◆◆' },
  { name: 'Legendary', colour: '#e2a93b', lit: '#f6d38c', shade: '#8a5f17', rgb: '226,169,59', pips: '◆◆◆' },
  { name: 'Atheric', colour: '#4fd8f0', lit: '#b8f2fb', shade: '#1f7486', rgb: '79,216,240', pips: '◈' },
] as const;
/** A column's kind of node, by the gear message's numbers. */
export const COLUMNS = ['Upgrade', 'Handling', 'Finish', 'Perk', 'Its own'] as const;
/** Where an item is: carried, in the vault, or worn in a slot (2 and on). */
export const CARRIED = 0;
export const VAULTED = 1;
export const WORN = 2;

/** Why an ask was refused, by the room's answer numbers: the gear crate's refusals, then the room's own. */
const REFUSALS: Readonly<Record<number, string>> = {
  1: 'There is no such item.',
  2: 'There is no such Vestige.',
  3: 'It does not go there.',
  4: 'Your level is too low for it.',
  5: 'Only one Atheric in your loadouts and one in your armour.',
  6: 'That slot already carries nine.',
  7: 'The vault is full.',
  8: 'You already carry ten Vestiges.',
  9: 'Only at its counter in a social space.',
  10: 'Not while it is worn or in the vault.',
  11: 'Locked until its ring fills.',
  12: 'There is no such node.',
  13: 'That node is already bought.',
  14: 'That node is not bought.',
  15: 'You do not have enough for it.',
  16: 'You have no Fruit of Dagon.',
  17: 'It cannot grow any more.',
  18: 'There is no such emblem.',
  19: 'You do not have that emblem.',
  20: 'You already have that emblem.',
  21: 'The Tailor does not sell it today.',
  100: 'Out of reach, or already gathered.',
  101: 'Only the Test Ground hands out gear.',
  102: 'You can carry no more of it.',
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

/** An island's resource's words. */
export function resourceWords(index: number): string {
  return resources.resources[index]?.words ?? '';
}

export const RESOURCE_COUNT = resources.resources.length;

/** Every named item's id and name, for the Test Ground's grants. */
export const NAMED = items.items.map((found) => ({ id: found.id, name: found.name, rarity: found.rarity }));

/** The names of the stocks a gear message counts, in its order. */
export const STOCK_NAMES = ['Weapon Fragments', 'Armor Fragments', 'Weapon Essence', 'Armor Essence', 'Fruit of Dagon'];

/** What an item carries: its Attack, Defense and Prestige, its level and XP. */
export function itemNumbers(item: GearItem): string {
  const power = [
    item.attack ? `${item.attack} Attack` : '',
    item.defense ? `${item.defense} Defense` : '',
    item.prestige ? `${item.prestige} Prestige` : '',
  ].filter(Boolean);
  return `${power.join(', ')} · level ${item.level} · XP ${item.xp.toLocaleString()} of ${item.xpMost.toLocaleString()}`;
}

/** How many nodes an item has. */
function nodesOf(item: GearItem): number {
  return item.columns.reduce((total, column) => total + Math.max(1, column.traits.length), 0);
}

/** How far an item is upgraded, 0 to 1: the share of its nodes bought; null for one with none to buy. */
export function upgraded(item: GearItem): number | null {
  const nodes = nodesOf(item);
  if (nodes === 0) return null;
  let bought = 0;
  for (let node = 0; node < nodes; node++) if (item.bought & (1 << node)) bought++;
  return bought / nodes;
}

/** Whether every node of an item is bought: it is fully upgraded. */
export function fullyUpgraded(item: GearItem): boolean {
  const nodes = nodesOf(item);
  return nodes > 0 && item.bought === 2 ** nodes - 1;
}

/** One node of an item's column as a screen shows it: its name and words, whether it is bought, chosen (or, an
 *  upgrade, bought) and unlocked, what it costs, and what pressing it asks (buy, choose, or nothing). */
export interface NodeShown {
  readonly label: string;
  readonly words: string;
  readonly bought: boolean;
  readonly chosen: boolean;
  readonly unlocked: boolean;
  readonly cost: string;
  readonly ask: GearAsk | null;
}

/** A column's node of an item, or null for none there. */
export function nodeShown(item: GearItem, column: number, node: number): NodeShown | null {
  const kind = item.columns[column];
  if (!kind || node >= Math.max(1, kind.traits.length)) return null;
  const offsets = item.columns.slice(0, column).reduce((total, each) => total + Math.max(1, each.traits.length), 0);
  const bought = (item.bought & (1 << (offsets + node))) !== 0;
  const unlocked = item.xp >= kind.xp;
  const trait = kind.traits[node];
  const costs = [
    kind.aurem ? `${kind.aurem} Aurem` : '',
    kind.fragments ? `${kind.fragments} fragments` : '',
    kind.essence ? `${kind.essence} Essence` : '',
    kind.resource && item.resource !== null ? `${kind.resource} ${resourceName(item.resource)}` : '',
  ].filter(Boolean);
  const ask: GearAsk | null = !bought
    ? { kind: ASKS.buy, item: item.id, column, node }
    : trait && item.chosen[column] !== node
      ? { kind: ASKS.choose, item: item.id, column, node }
      : null;
  return {
    label: trait ? traitOf(trait).name : 'Upgrade',
    words: trait ? traitOf(trait).words : 'Raises its power.',
    bought,
    chosen: bought && (!trait || item.chosen[column] === node),
    unlocked,
    cost: bought ? 'Bought.' : unlocked ? `Costs ${costs.join(', ')}.` : 'Its ring fills as the item is used.',
    ask: unlocked ? ask : null,
  };
}

/** The asks that put a carried item on: in its own slot. */
export function wearAsks(item: GearItem): readonly { readonly label: string; readonly ask: GearAsk }[] {
  return [{ label: 'Equip', ask: { kind: ASKS.wear, item: item.id, slot: slotOf(item.kind) } }];
}

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

/** The forge's layers each loadout is drawn with: the right hand's weapon file, and the left's, a second of it (a
 *  pair) or a shield; a greatsword is the sword's, both hands on its hilt; the great axe the axe's. */
const HELD: Readonly<Record<string, { readonly right: string; readonly left?: 'pair' | 'shield' | 'hilt' }>> = {
  sword_and_shield: { right: 'sword', left: 'shield' },
  dagger_and_shield: { right: 'dagger', left: 'shield' },
  mace_and_shield: { right: 'mace', left: 'shield' },
  double_daggers: { right: 'dagger', left: 'pair' },
  double_swords: { right: 'sword', left: 'pair' },
  double_mace: { right: 'mace', left: 'pair' },
  double_pistolet: { right: 'pistolet', left: 'pair' },
  great_axe: { right: 'axe' },
  greatsword: { right: 'sword', left: 'hilt' },
};

/** What the player's hands hold, drawn, as a worn loadout has it (`loadout`, Melee or Ranged): its weapon and its
 *  second or shield, each as the forge draws it, and a greatsword's grip on its hilt. A loadout not worn is bare
 *  hands, as the room has it. */
export function gearHands(
  state: GearState,
  wardrobe: Wardrobe,
  loadout = MELEE,
): { right: string | null; left: string | null; grip: 'hilt' | null } {
  const item = worn(state, loadout);
  if (!item) return { right: null, left: null, grip: null };
  const kind = KINDS[item.kind] ?? '';
  const held = HELD[kind] ?? { right: kind };
  const right = layerFor(wardrobe.right, held.right, item.rarity, false);
  if (held.left === 'hilt') return { right, left: null, grip: 'hilt' };
  const left =
    held.left === 'pair'
      ? layerFor(wardrobe.left, held.right, item.rarity, true)
      : held.left === 'shield'
        ? layerFor(wardrobe.left, 'shield', item.rarity, false)
        : null;
  return { right, left, grip: null };
}
