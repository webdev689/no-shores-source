// An item's fight numbers as its page and card show them, asked of the room's own rules (`room::stats`), so they are
// the numbers the room fights by, moved by the traits the item gives. A weapon's say what it does in a fight; armour's
// what a body wearing it keeps. Each stands as a bar against the most any kind of its loadout reaches, room left for a
// trait's gain, and beside another item's or another choice of nodes, what changes.

import items from '../../../content/gear/items.json' with { type: 'json' };
import { type GearItem, NONE } from '../network/gearMessages.ts';
import { KINDS, RARITIES, isWeapon, slotOf } from '../player/gear.ts';
import type { CombatRules } from '../rules/combatRules.ts';

/** The numbers in the order `room::stats` lays them (`STATS_FLOATS`). */
const FIELDS = [
  'loadout',
  'impact',
  'aimed',
  'rate',
  'reach',
  'poise',
  'stamina',
  'ammo',
  'flight',
  'aimPace',
  'hands',
  'staminaBack',
  'dodgeCost',
  'poiseHeld',
  'healing',
] as const;
type Field = (typeof FIELDS)[number];
export type ItemStats = Readonly<Record<Field, number>>;

/** Which loadout the numbers are of (`room::stats::Loadout`), and how one is held (`Hands`): each but the last its
 *  note, a pair's by what it strikes with. */
export const LOADOUT = { none: 0, melee: 1, ranged: 2 } as const;
const HANDS = ['Leaves a hand free for a torch', 'Blocks with its shield', 'A pair', 'Two-handed'];

type Rules = Pick<CombatRules, 'itemStats'>;
let rules: Rules | null = null;
const asked = new Map<string, ItemStats | null>();

/** Gives the pages the room's rules to ask items' numbers of, once its module is made; none forgets them. */
export function setItemRules(given: Rules | null): void {
  rules = given;
  asked.clear();
  most.clear();
}

/** The numbers of an item of `kind` giving `traits`; null until the rules are given, for no such kind, or from rules
 *  that lay them out otherwise than this page reads them, which are never misread. */
export function statsOf(kind: number, traits: readonly string[]): ItemStats | null {
  if (!rules) return null;
  const key = `${kind}\n${traits.join('\n')}`;
  if (!asked.has(key)) {
    const numbers = rules.itemStats(kind, traits);
    const found = numbers.length === FIELDS.length;
    asked.set(
      key,
      found ? (Object.fromEntries(FIELDS.map((field, place) => [field, numbers[place] ?? 0])) as ItemStats) : null,
    );
  }
  return asked.get(key) ?? null;
}

/** The traits an item gives while worn, as the room counts them (`Item::active_traits`): an Atheric's intrinsic, at
 *  its catalogue's own rarity alone, then each trait column's chosen node, bought; with `trying`, that column's node
 *  in place of what it has chosen. */
export function givenTraits(
  item: Pick<GearItem, 'named' | 'rarity' | 'columns' | 'chosen' | 'bought'>,
  trying: { readonly column: number; readonly node: number } | null = null,
): string[] {
  const intrinsic = intrinsicIdOf(item);
  let offset = 0;
  const chosen = item.columns.flatMap((column, index) => {
    const start = offset;
    offset += Math.max(1, column.traits.length);
    const node = trying?.column === index ? trying.node : (item.chosen[index] ?? NONE);
    const bought = trying?.column === index || (item.bought & (1 << (start + node))) !== 0;
    const id = node === NONE || !bought ? undefined : column.traits[node];
    return id ? [id] : [];
  });
  return [...(intrinsic ? [intrinsic] : []), ...chosen];
}

/** A named item's intrinsic, where it is of its catalogue entry's rarity: one of another rarity keeps its traits and
 *  takes none, as the room counts it. */
export function intrinsicIdOf(item: Pick<GearItem, 'named' | 'rarity'>): string | null {
  const entry: { readonly id: string; readonly rarity: string; readonly intrinsic?: string } | undefined =
    items.items.find((found) => found.id === item.named);
  const rarity = RARITIES[item.rarity]?.name.toLowerCase();
  return entry?.intrinsic && entry.rarity === rarity ? entry.intrinsic : null;
}

/** One number as its row shows it: its name, its value and the words for it, its bar's share (none for a count),
 *  whether less is better (a cost), and what it was against another item or choice, where one is set beside it. */
export interface StatRow {
  readonly label: string;
  readonly value: number;
  readonly said: string;
  readonly bar: boolean;
  readonly share: number;
  readonly less: boolean;
  readonly from: number | null;
  readonly fromShare: number | null;
  /** The change's words, signed: "+2.1", "−0.4"; empty where nothing changes as shown. */
  readonly change: string;
}

/** What an item's numbers show: its rows, and the lines that say how it is held. */
export interface StatSheet {
  readonly rows: readonly StatRow[];
  readonly notes: readonly string[];
}

/** A number's row: its name, its field, the places it is shown to (a share shown in hundredths, as a percentage), its
 *  unit, whether less is better, and whether it is a count with no bar. */
interface Stat {
  readonly label: string;
  readonly field: Field;
  readonly places: number;
  readonly unit?: '/s' | ' m' | '%';
  readonly less?: boolean;
  readonly count?: boolean;
}

const MELEE: readonly Stat[] = [
  { label: 'Impact', field: 'impact', places: 1 },
  { label: 'Speed', field: 'rate', places: 2, unit: '/s' },
  { label: 'Reach', field: 'reach', places: 1, unit: ' m' },
  { label: 'Poise', field: 'poise', places: 1 },
  { label: 'Swing cost', field: 'stamina', places: 1, less: true },
];
const RANGED: readonly Stat[] = [
  { label: 'Impact', field: 'impact', places: 1 },
  { label: 'Aimed', field: 'aimed', places: 1 },
  { label: 'Fire rate', field: 'rate', places: 2, unit: '/s' },
  { label: 'Poise', field: 'poise', places: 1 },
  { label: 'Pace aiming', field: 'aimPace', places: 0, unit: '%' },
  { label: 'Ammo', field: 'ammo', places: 0, count: true },
];
const BODY: readonly Stat[] = [
  { label: 'Stamina back', field: 'staminaBack', places: 1, unit: '/s' },
  { label: 'Dodge cost', field: 'dodgeCost', places: 1, less: true },
  { label: 'Poise held', field: 'poiseHeld', places: 1 },
  { label: 'Healing', field: 'healing', places: 0, unit: '%' },
];
/** What a weapon's finish moves of the body while it is drawn, shown with its own rows where it moves them. */
const DRAWN: readonly Stat[] = BODY.filter((stat) => stat.field === 'dodgeCost' || stat.field === 'poiseHeld');

/** A number as its row shows it, rounded to its places (a share in hundredths, as a percentage). */
const shown = (stat: Stat, value: number) => {
  const scale = 10 ** stat.places * (stat.unit === '%' ? 100 : 1);
  return Math.round(value * scale) / 10 ** stat.places;
};
/** A shown number's words, whole where it is whole but to a rate's hundredths. */
const wordsOf = (stat: Stat, number: number, unit = stat.unit ?? '') =>
  `${stat.places === 2 || !Number.isInteger(number) ? number.toFixed(stat.places) : String(number)}${unit}`;

/** A bar's most for each number: the most any kind of the loadout reaches with no traits and three tenths again, so a
 *  trait's gain still fits; a body's own number three fifths again; the pace kept aiming, all of it. */
const HEADROOM = 1.3;
const BODY_ROOM = 1.6;
const most = new Map<string, number>();

function mostOf(loadout: number, stat: Stat): number {
  const key = `${loadout} ${stat.field}`;
  let found = most.get(key);
  if (found === undefined) {
    if (stat.field === 'aimPace') found = 1;
    else if (BODY.includes(stat)) found = (statsOf(KINDS.indexOf('head'), [])?.[stat.field] ?? 0) * BODY_ROOM;
    else {
      const values = KINDS.map((_name, kind) => (isWeapon(kind) ? statsOf(kind, []) : null))
        .filter((stats) => stats?.loadout === loadout)
        .map((stats) => stats?.[stat.field] ?? 0);
      found = Math.max(0, ...values) * HEADROOM;
    }
    most.set(key, found);
  }
  return found;
}

/** The change from `from` to `to` as the row shows them, signed; empty where they show alike. */
function changeOf(stat: Stat, from: number, to: number): string {
  const places = 10 ** stat.places;
  const difference = Math.round((shown(stat, to) - shown(stat, from)) * places) / places;
  if (difference === 0) return '';
  const unit = stat.unit === '%' ? '%' : '';
  return `${difference > 0 ? '+' : '−'}${wordsOf(stat, Math.abs(difference), unit)}`;
}

/** A stat's row of `stats`, beside `compared`'s where it is set. */
function rowOf(stat: Stat, stats: ItemStats, compared: ItemStats | null): StatRow {
  const top = mostOf(stats.loadout, stat) || 1;
  const value = stats[stat.field];
  const from = compared ? compared[stat.field] : null;
  return {
    label: stat.label,
    value,
    said: wordsOf(stat, shown(stat, value)),
    bar: !stat.count,
    share: Math.min(1, value / top),
    less: stat.less ?? false,
    from,
    fromShare: from === null ? null : Math.min(1, from / top),
    change: from === null ? '' : changeOf(stat, from, value),
  };
}

/** An item's numbers as rows, from its traits (or `traits` given); beside `against`'s numbers where it is set, as the
 *  piece it would replace or the choice of nodes it had. A weapon whose finish moves the body while it is drawn, or is
 *  set beside one that does, shows those numbers too. Null until the rules are given. */
export function sheetOf(
  item: Pick<GearItem, 'kind' | 'named' | 'rarity' | 'columns' | 'chosen' | 'bought'>,
  against: ItemStats | null = null,
  traits: readonly string[] = givenTraits(item),
): StatSheet | null {
  const stats = statsOf(item.kind, traits);
  // A body's numbers are armour's and the cloak's (slots 2 to 6); a horse's or a ship module's are no one's.
  const worn = slotOf(item.kind);
  if (!stats || (stats.loadout === LOADOUT.none && (worn < 2 || worn > 6 || item.kind >= KINDS.length))) return null;
  const compared = against && against.loadout === stats.loadout ? against : null;
  const body = statsOf(KINDS.indexOf('head'), []);
  const moved = (stat: Stat) =>
    [stats, compared].some(
      (each) => each !== null && body !== null && shown(stat, each[stat.field]) !== shown(stat, body[stat.field]),
    );
  const measures =
    stats.loadout === LOADOUT.none
      ? BODY
      : [...(stats.loadout === LOADOUT.melee ? MELEE : RANGED), ...DRAWN.filter(moved)];
  const notes: string[] = [];
  if (stats.loadout === LOADOUT.ranged && stats.flight === 0) notes.push('Strikes at once');
  const held = HANDS[stats.hands];
  if (stats.loadout !== LOADOUT.none && held)
    notes.push(held === 'A pair' ? `A pair: ${stats.loadout === LOADOUT.ranged ? 'shots' : 'blows'} take turns` : held);
  return { rows: measures.map((stat) => rowOf(stat, stats, compared)), notes };
}
