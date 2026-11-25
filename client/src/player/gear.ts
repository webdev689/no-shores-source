import factions from '../../../content/gear/factions.json' with { type: 'json' };
import items from '../../../content/gear/items.json' with { type: 'json' };
import resources from '../../../content/gear/resources.json' with { type: 'json' };
import rolled from '../../../content/gear/rolled.json' with { type: 'json' };
import traits from '../../../content/gear/traits.json' with { type: 'json' };
import words from '../../../content/gear/words.json' with { type: 'json' };
import type { GlowLook } from '../elementGlow.ts';
import { COSMETICS } from '../forge/cosmetics.ts';
import { ASKS, type GearAsk, type GearItem, type GearState } from '../network/gearMessages.ts';
import type { Wardrobe } from './dressing.ts';
import { STORY_SET, numberOf, rolledArmourSet, rolledMetal, setName, sourceLooks } from './sourceLooks.ts';

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
const OWN_SLOTS: Readonly<Record<string, number>> = { head: 2, torso: 3, arms: 4, legs: 5, cloak: 6, horse: 11 };
/** A horse's kind and the Mount slot it is worn in, by the gear crate's numbers (`horses.rs`). */
export const HORSE = 28;
export const MOUNT_SLOT = 11;
/** A kind's key: its name in the catalogues (`rolled.json`). */
const kindKey = (kind: number): string => (kind === HORSE ? 'horse' : (KINDS[kind] ?? ''));
/** The slot a kind is worn in: 0 Melee, 1 Ranged, or its own. */
export function slotOf(kind: number): number {
  const name = kindKey(kind);
  return OWN_SLOTS[name] ?? (RANGED.has(name) ? 1 : 0);
}
/** The coats, in the order a horse's name counts them. */
const COATS = COSMETICS.filter((each) => each.kind === 'coat');
/** The coat a horse wears, by its id; null for an item that is no horse. */
export const coatOfHorse = (item: Pick<GearItem, 'kind' | 'name'>): string | null =>
  item.kind === HORSE ? (COATS[item.name]?.id ?? null) : null;
/** Whether a piece may be dismantled: one carried, never a horse. */
export const dismantlable = (item: Pick<GearItem, 'at' | 'kind'>): boolean =>
  item.at === CARRIED && item.kind !== HORSE;
/** A slot's name as the screens show it. */
export const slotName = (slot: number): string => (slot === MOUNT_SLOT ? 'Mount' : capital(SLOTS[slot] ?? ''));
/** `word` with its first letter a capital. */
export const capital = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);
/** A kind's name as the screens show it: Sword & Shield, Double Daggers, Great Axe. */
export function kindName(kind: number): string {
  const words = kindKey(kind).split('_').filter(Boolean);
  return words.map((word) => (word === 'and' ? '&' : capital(word))).join(' ');
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
 *  Normal white, Magic green, Rare yellow, Legendary red, Atheric cyan blue, as the Vestiges' crystals are. A Normal
 *  piece's frame and glow are the kit's plain stone, so it never outshines a finer one. */
export const RARITIES = [
  { name: 'Normal', colour: '#e9e4d9', lit: '#a49b85', shade: '#3a352a', rgb: '154,144,121', pips: '' },
  { name: 'Magic', colour: '#4ec66e', lit: '#98f0ae', shade: '#206c3e', rgb: '78,198,110', pips: '◆' },
  { name: 'Rare', colour: '#e8d84e', lit: '#f7f0a6', shade: '#8c801f', rgb: '232,216,78', pips: '◆◆' },
  { name: 'Legendary', colour: '#fa5e5a', lit: '#ff8278', shade: '#961e1e', rgb: '250,94,90', pips: '◆◆◆' },
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
  11: 'Locked until its square fills.',
  12: 'There is no such node.',
  13: 'That node is already bought.',
  14: 'That node is not bought.',
  15: 'You do not have enough for it.',
  16: 'You have no Fruit of Dagon.',
  17: 'Nothing you wear can grow any more.',
  18: 'There is no such emblem.',
  19: 'You do not have that.',
  20: 'You already have that.',
  21: 'It is not sold here today.',
  22: 'You have no Ammo crate.',
  23: 'Your ammunition is full already.',
  24: 'You already carry five Ammo crates.',
  25: 'There is no such faction.',
  26: 'Pledge to them first.',
  27: 'You are pledged to them already.',
  28: 'Your rank with them is too low.',
  29: 'They hold no package for you.',
  30: 'Your Art is not ready to rise.',
  31: 'Your Art can rise no higher.',
  32: 'You own that fragment already.',
  33: 'There is no such dye or mount piece.',
  34: 'There is no such fragment.',
  81: 'The bounty board opens after the prologue.',
  82: 'That bounty is no longer on the board.',
  83: 'You already hold that bounty.',
  84: 'That bounty is not done yet.',
  85: 'That bounty is turned in already.',
  100: 'Out of reach, or already gathered.',
  101: 'Only the Test Ground hands out gear.',
  102: 'You can carry no more of it.',
  103: 'Wait a moment before you try that again.',
  104: 'Not on horseback.',
  105: 'You cannot return to your ship while fallen.',
  106: 'You cannot return to your ship within ten seconds of being struck.',
  110: 'There is no such Art.',
  111: 'An Art’s Core has three slots.',
  112: 'There is no such fragment.',
  113: 'That fragment is set in another slot.',
  114: 'You do not own that fragment yet.',
  115: 'That Art is not yours yet.',
  120: 'Wear a Ranged weapon first.',
  136: 'There is no such keeper.',
  137: 'They have nothing more to say to you now.',
  138: 'No fragment of that Art waits to be chosen.',
  141: 'There is no such letter.',
  151: 'There is no such guild bounty this week.',
  152: 'Your guild has not finished that bounty yet.',
  153: 'You have claimed that this week.',
  154: 'Only members who joined before the week turned may claim it.',
  155: 'You are in no guild.',
  156: "Do that at your guild's outpost.",
  157: 'The treasury cannot hold that much.',
  158: 'Nothing here needs that.',
  159: 'The stores hold none of that for you today.',
  160: 'The War Horn has sounded this week.',
  161: "The guild's books are busy. Try again in a moment.",
  162: 'The guild boss still stands.',
  163: 'Wait for your last ask.',
  164: 'Only the founder or an admin sounds the War Horn.',
  165: 'No War Horn stands here yet.',
  166: 'Too many asks. Wait a while.',
};

/** What a room's answer to an ask says: nothing for done. */
export function answerText(answer: number): string {
  // 107 is a return to the ship's yes (`toShip.ts`): no refusal either.
  return answer === 0 || answer === 107 ? '' : (REFUSALS[answer] ?? `Refused (${answer}).`);
}

/** Each armour and weapon kind's word, said after its set's name ("Portwatch Helm"). */
const KIND_WORDS: Readonly<Record<string, string | undefined>> = rolled.kinds;

/** What a Breach's piece won at Hard is called after its set's name: its Forged version, as Destiny's raid weapons
 *  are Adept (the decisions "Breach Weapons Come Normal and Forged" and "Forged Perks Are Stronger, and Hard Armour
 *  Is Forged Too"). */
export const FORGED = '(Forged)';

/** An item's name: a named item's own (a faction's piece's is its set's); a rolled armour piece or weapon its set's
 *  and its kind's word, by the look it is drawn in, the prologue's armour by its steel, a Breach's piece won at Hard
 *  Forged; a horse by its coat; the cloak its kind's. Ship modules are named by `gearName`. */
export function itemName(
  item: Pick<GearItem, 'named' | 'kind' | 'rarity' | 'name' | 'id' | 'level' | 'source' | 'story'> &
    Partial<Pick<GearItem, 'breach' | 'hard'>>,
): string {
  if (item.named) return items.items.find((found) => found.id === item.named)?.name ?? item.named;
  const parts = rolledParts(item);
  if (parts) return item.breach && item.hard ? `${parts.set} ${parts.word} ${FORGED}` : `${parts.set} ${parts.word}`;
  // A horse by its coat's name among its kind's; the cloak by its kind.
  const kind = kindKey(item.kind);
  const names = (rolled.names as Record<string, Record<string, readonly string[]> | undefined>)[kind];
  return names?.[(RARITIES[item.rarity]?.name ?? '').toLowerCase()]?.[item.name] ?? kind;
}

/** A rolled armour piece's or weapon's set name and kind word, by the look it is drawn in, the prologue's armour by
 *  its steel; null for a kind with no word (a horse, the cloak). */
function rolledParts(
  item: Pick<GearItem, 'named' | 'kind' | 'rarity' | 'name' | 'id' | 'level' | 'source' | 'story'>,
): { readonly set: string; readonly word: string } | null {
  const kind = kindKey(item.kind);
  const word = KIND_WORDS[kind];
  if (!word) return null;
  const armour = slotOf(item.kind) > 1;
  const look =
    item.story && armour
      ? STORY_SET
      : item.rarity === 0
        ? null
        : armour
          ? rolledArmourSet(item, kind === 'torso' || kind === 'legs')
          : rolledMetal(item);
  return { set: setName(item, look), word };
}

/** Each rolled set's words for each kind it is made in, by set name and kind word (`content/gear/words.json`). */
const SET_WORDS: Readonly<Record<string, Readonly<Record<string, string | undefined>> | undefined>> = words.sets;

/** An item's words: a named item's own, a faction's piece with none its faction's; a rolled armour piece's or
 *  weapon's its set's for its kind; a horse's its coat's; else none. */
export function itemWords(
  item: Pick<GearItem, 'named' | 'kind' | 'rarity' | 'name' | 'id' | 'level' | 'source' | 'story'>,
): string {
  const coat = coatOfHorse(item);
  if (coat) return COSMETICS.find((each) => each.id === coat)?.words ?? '';
  if (item.named) {
    const found = items.items.find((each) => each.id === item.named);
    const faction = found && 'faction' in found ? factions.factions.find((each) => each.key === found.faction) : null;
    return found?.words || faction?.words || '';
  }
  const parts = rolledParts(item);
  return (parts && SET_WORDS[parts.set]?.[parts.word]) ?? '';
}

/** A trait's name and words: all it does (`words`), and for a perk that gives and takes, what it gives and what it
 *  costs apart (`gives`, `takes`), so a screen can set the cost apart; and its short line, and its cost's, as a card
 *  shows them. A Breach's perk on a piece won at Hard is at its Forged grade (`forgedOn`): its Forged words and short
 *  line, and `forged` set. */
export function traitOf(
  id: string,
  forged = false,
): {
  readonly name: string;
  readonly words: string;
  readonly gives: string;
  readonly takes: string;
  readonly forged: boolean;
  readonly short: string;
  readonly shortTakes: string;
} {
  const found = traits.traits.find((each) => each.id === id);
  const graded = forged && found && 'forged' in found ? found.forged : undefined;
  const gradedShort = graded && found && 'forged_short' in found ? found.forged_short : undefined;
  const [gives, takes] = [graded ?? found?.words ?? '', (found && 'takes' in found ? found.takes : '') ?? ''];
  const shortTakes = (found && 'short_takes' in found ? found.short_takes : '') ?? '';
  return {
    name: found?.name ?? id,
    words: takes ? `${gives} ${takes}` : gives,
    gives,
    takes,
    forged: !!graded,
    short: gradedShort ?? found?.short ?? id,
    shortTakes,
  };
}

/** Whether an item gives a trait at its Forged grade: a Breach's perk, on a Breach's piece won at Hard
 *  (`gear::Item::forges`). */
export function forgedOn(item: Partial<Pick<GearItem, 'breach' | 'hard'>>, id: string): boolean {
  return (
    !!item.breach && !!item.hard && traits.traits.some((each) => each.id === id && 'breach' in each && each.breach)
  );
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
    words: trait ? traitOf(trait, forgedOn(item, trait)).words : 'Raises its power.',
    bought,
    chosen: bought && (!trait || item.chosen[column] === node),
    unlocked,
    cost: bought ? 'Bought.' : unlocked ? `Costs ${costs.join(', ')}.` : 'Its square fills as the item is used.',
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

/** The element each hand's weapon glows in while `loadout` (0 Melee, 1 Ranged) is drawn: the right hand's, and the
 *  left's only for a pair, since a shield or a free hand is no weapon. */
export function heldElements(state: GearState | null, loadout: number): readonly [GlowLook, GlowLook] {
  const item = state ? worn(state, loadout) : undefined;
  const element = item && isWeapon(item.kind) ? item.element : 0;
  const look: GlowLook = element === 1 || element === 2 || element === 3 ? element : 0;
  return [look, KINDS[item?.kind ?? 0]?.startsWith('double_') ? look : 0];
}

/** The forge's metals by their worth: a Normal weapon climbs it (`rung`), and a metal the forge does not draw for a
 *  kind falls to the nearest one it does. */
const WORTH = ['iron', 'steel', 'silver', 'elven', 'dwarven', 'orcish', 'mithril', 'adamantium', 'ebony', 'daedric'];
/** A Normal weapon's place on the metals: iron to level 10 and steel past it, from any content. A finer one is made
 *  in its content's metals (`rolledMetal`). */
const NORMAL_METALS = { start: 0, climb: 1, spread: 1 } as const;
/** A rolled shield's kinds by the weapon it is carried with, one by its number. */
const SHIELDS: Readonly<Record<string, readonly string[]>> = {
  sword_and_shield: ['kite', 'round', 'tower'],
  dagger_and_shield: ['buckler', 'round', 'kite'],
  mace_and_shield: ['round', 'kite', 'tower'],
};
/** Each named item's look and make as `content/gear/items.json` writes them, by its id. */
const WRITTEN: ReadonlyMap<string, { readonly look?: string; readonly make?: string }> = new Map(
  items.items.map((each) => [
    each.id,
    { ...('look' in each ? { look: each.look } : {}), ...('make' in each ? { make: each.make } : {}) },
  ]),
);
/** A rolled item's rung on a ladder of looks: `start`, climbing `climb` rungs over levels 1 to 20 (rounded, so a
 *  climb of one is reached past level 10), and spread over `spread` rungs by its name. */
export const rung = (item: GearItem, start: number, climb: number, spread: number): number =>
  start + Math.round(((Math.min(Math.max(item.level, 1), 20) - 1) * climb) / 19) + (item.name % spread);

export { numberOf };

/** The ladder sorted nearest first from rung `from`, the lesser first at one distance. */
export const nearest = (ladder: readonly string[], from: number): readonly string[] =>
  [...ladder].sort((a, b) => Math.abs(ladder.indexOf(a) - from) - Math.abs(ladder.indexOf(b) - from));

/** A named item's look and make as written on it, if it is named and has them. */
export const writtenLook = (item: GearItem): { readonly look?: string; readonly make?: string } | undefined =>
  WRITTEN.get(item.named ?? '');

/** A weapon's look: its metal (a gun's `gilded` or `plain`), its shield's metal, and its make where the forge draws
 *  more than one (a shield's kind, a bow's, a short sword). A faction's metal (`own`) comes first, then a named item's
 *  own look, then a rolled one's: its metal by its rarity, content, level and name, its make by its number. */
export function weaponLook(
  item: GearItem,
  own?: string,
): { readonly metal: string; readonly shield: string; readonly make: string | null } {
  const kind = KINDS[item.kind] ?? '';
  const written = writtenLook(item);
  const number = numberOf(item);
  const chosen = (choices: readonly string[]) => choices[number % choices.length] ?? null;
  const gun = kind === 'pistolet' || kind === 'double_pistolet' || kind === 'thunderlock';
  // A Normal weapon is plain iron or steel from any content, as Normal armour is clothes; a finer one its content's.
  const rolled = gun
    ? item.rarity >= 3
      ? 'gilded'
      : 'plain'
    : item.rarity === 0
      ? (WORTH[rung(item, NORMAL_METALS.start, NORMAL_METALS.climb, NORMAL_METALS.spread)] ?? 'iron')
      : rolledMetal(item);
  const metal = own ?? written?.look ?? rolled;
  const shields = SHIELDS[kind];
  const make = written?.make ?? (shields ? chosen(shields) : kind === 'bow' ? chosen(['long', 'short']) : null);
  // A Normal shield is plain or iron to level 10, its weapon's metal past it.
  const shield = item.rarity === 0 && item.level <= 10 ? (chosen(['plain', 'iron']) ?? 'plain') : metal;
  return { metal, shield, make };
}

/** The forge layer a weapon or shield of this kind is drawn with, among those a hand of the wardrobe takes: in its make
 *  and metal, else the nearest metal the forge draws it in of its content's (`own`), then of any, else the first of its
 *  kind, so a look the forge lacks still says where it was earned wherever it can. */
function layerFor(
  choices: readonly string[],
  kind: string,
  make: string | null,
  metal: string,
  left: boolean,
  own: readonly string[] = [],
) {
  const worth = WORTH.indexOf(metal);
  const ladder = worth < 0 ? [metal] : nearest(WORTH, worth);
  // Its own metal first, then its content's nearest first, then any other's.
  const [first = metal, ...rest] = ladder;
  const metals = [first, ...rest.filter((each) => own.includes(each)), ...rest.filter((each) => !own.includes(each))];
  const end = left ? '_l' : '';
  for (const each of metals) {
    // The forge names a short sword after its metal (`sword_orcish_short`), a bow's or a shield's make before it.
    const parts = kind === 'sword' ? [kind, each, make] : [kind, make, each];
    const layer = parts.filter(Boolean).join('_') + end;
    if (choices.includes(layer)) return layer;
  }
  return choices.find((layer) => layer.startsWith(`${kind}_`) && layer.endsWith('_l') === left) ?? null;
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
 *  second or shield, each as the forge draws it (in `metal` where it names one), and a greatsword's grip on its hilt.
 *  A loadout not worn is bare hands, as the room has it. */
export function gearHands(
  state: GearState,
  wardrobe: Wardrobe,
  loadout = MELEE,
  metal?: string,
): { right: string | null; left: string | null; grip: 'hilt' | null } {
  const item = worn(state, loadout);
  if (!item) return { right: null, left: null, grip: null };
  const kind = KINDS[item.kind] ?? '';
  const held = HELD[kind] ?? { right: kind };
  const look = weaponLook(item, metal);
  // A gun's plain look is the forge's bare `pistolet`, its gilded one `pistolet_gilded`.
  const drawn = look.metal === 'plain' ? '' : look.metal;
  // A shield's make is the shield's kind, not its weapon's.
  const make = held.left === 'shield' ? null : look.make;
  // A faction's metal and a Normal weapon's plain iron or steel fall along the ladder; any other first to its content's.
  const own = metal || item.rarity === 0 ? [] : sourceLooks(item).metals;
  const right = layerFor(wardrobe.right, held.right, make, drawn, false, own);
  if (held.left === 'hilt') return { right, left: null, grip: 'hilt' };
  const left =
    held.left === 'pair'
      ? layerFor(wardrobe.left, held.right, make, drawn, true, own)
      : held.left === 'shield'
        ? layerFor(wardrobe.left, 'shield', look.make, look.shield, false, own)
        : null;
  return { right, left, grip: null };
}

/** The ship's modules by the gear crate's kind numbers, each fitted in its own slot (`kinds.rs`). */
export const MODULES = [
  { kind: 24, key: 'guns', name: 'Guns', slot: 7 },
  { kind: 25, key: 'hull', name: 'Hull', slot: 8 },
  { kind: 26, key: 'sails', name: 'Sails', slot: 9 },
  { kind: 27, key: 'rigging', name: 'Rigging', slot: 10 },
] as const;
export type ModuleKey = (typeof MODULES)[number]['key'];
export const moduleOf = (kind: number) => MODULES.find((each) => each.kind === kind);
export const isModule = (kind: number): boolean => moduleOf(kind) !== undefined;
