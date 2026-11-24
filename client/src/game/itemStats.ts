// An item's fight numbers as its page and card show them, asked of the room's own rules (`room::stats`), so they are
// the numbers the room fights by, moved by the traits the item gives. A weapon's say what it does in a fight; armour's
// what a body wearing it keeps. Each stands as a bar against the most any kind of its loadout reaches, room left for a
// trait's gain, and beside another item's or another choice of nodes, what changes.

import items from '../../../content/gear/items.json' with { type: 'json' };
import { type GearItem, NONE } from '../network/gearMessages.ts';
import { KINDS, isWeapon, slotOf } from '../player/gear.ts';
import type { CombatRules } from '../rules/combatRules.ts';

/** The numbers in the order `room::stats` lays them, then its trim's. */
const FIELDS = [
  'loadout',
  'impact',
  'aimed',
  'rate',
  'reach',
  'poise',
  'stamina',
  'ammo',
  'reload',
  'draw',
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

/** Which loadout the numbers are of (`room::stats::Loadout`), and how one is held (`Hands`). */
export const LOADOUT = { none: 0, melee: 1, ranged: 2 } as const;
const HANDS = ['Leaves a hand free for a torch', 'Blocks with its shield', 'A pair: blows take turns', 'Two-handed'];

type Rules = Pick<CombatRules, 'itemStats'>;
let rules: Rules | null = null;
const asked = new Map<string, ItemStats | null>();

/** Gives the pages the room's rules to ask items' numbers of, once its module is made; none forgets them. */
export function setItemRules(given: Rules | null): void {
  rules = given;
  asked.clear();
  most.clear();
}

/** The numbers of an item of `kind` giving `traits`; null until the rules are given, or for no such kind. */
export function statsOf(kind: number, traits: readonly string[]): ItemStats | null {
  if (!rules) return null;
  const key = `${kind}\n${traits.join('\n')}`;
  if (!asked.has(key)) {
    const numbers = rules.itemStats(kind, traits);
    const found = numbers.length >= FIELDS.length;
    asked.set(
      key,
      found ? (Object.fromEntries(FIELDS.map((field, place) => [field, numbers[place] ?? 0])) as ItemStats) : null,
    );
  }
  return asked.get(key) ?? null;
}

/** The traits an item gives while worn, as the room counts them (`Item::active_traits`): an Atheric's intrinsic, then
 *  each trait column's chosen node, bought; with `trying`, that column's node in place of what it has chosen. */
export function givenTraits(
  item: Pick<GearItem, 'named' | 'columns' | 'chosen' | 'bought'>,
  trying: { readonly column: number; readonly node: number } | null = null,
): string[] {
  const entry: { readonly id: string; readonly intrinsic?: string } | undefined = items.items.find(
    (found) => found.id === item.named,
  );
  let offset = 0;
  const chosen = item.columns.flatMap((column, index) => {
    const start = offset;
    offset += Math.max(1, column.traits.length);
    const node = trying?.column === index ? trying.node : (item.chosen[index] ?? NONE);
    const bought = trying?.column === index || (item.bought & (1 << (start + node))) !== 0;
    const id = node === NONE || !bought ? undefined : column.traits[node];
    return id ? [id] : [];
  });
  return [...(entry?.intrinsic ? [entry.intrinsic] : []), ...chosen];
}

/** One number as a bar shows it: its name, its value and the words for it, its share of the bar, whether less is
 *  better (a cost), and what it was against another item or choice, where one is set beside it. */
export interface StatRow {
  readonly label: string;
  readonly value: number;
  readonly said: string;
  readonly share: number;
  readonly less: boolean;
  readonly from: number | null;
  readonly fromShare: number | null;
  /** The change's words, signed: "+2.1", "−0.4"; empty where nothing changes. */
  readonly change: string;
}

/** What an item's numbers show: its bars, and the lines that say how it is held and what it carries. */
export interface StatSheet {
  readonly rows: readonly StatRow[];
  readonly notes: readonly string[];
}

interface Stat {
  readonly label: string;
  readonly field: Field;
  readonly said: (value: number) => string;
  readonly less?: boolean;
}

/** A number to a tenth, whole where it is whole. */
const tenth = (value: number) =>
  Math.abs(value - Math.round(value)) < 0.05 ? String(Math.round(value)) : value.toFixed(1);
const percent = (value: number) => `${Math.round(value * 100)}%`;
const perSecond = (value: number) => `${value.toFixed(2)}/s`;

const MELEE: readonly Stat[] = [
  { label: 'Impact', field: 'impact', said: tenth },
  { label: 'Speed', field: 'rate', said: perSecond },
  { label: 'Reach', field: 'reach', said: (value) => `${value.toFixed(1)} m` },
  { label: 'Poise', field: 'poise', said: tenth },
  { label: 'Swing cost', field: 'stamina', said: tenth, less: true },
];
const RANGED: readonly Stat[] = [
  { label: 'Impact', field: 'impact', said: tenth },
  { label: 'Aimed', field: 'aimed', said: tenth },
  { label: 'Fire rate', field: 'rate', said: perSecond },
  { label: 'Poise', field: 'poise', said: tenth },
  { label: 'Pace aiming', field: 'aimPace', said: percent },
];
const BODY: readonly Stat[] = [
  { label: 'Stamina back', field: 'staminaBack', said: (value) => `${tenth(value)}/s` },
  { label: 'Dodge cost', field: 'dodgeCost', said: tenth, less: true },
  { label: 'Poise held', field: 'poiseHeld', said: tenth },
  { label: 'Healing', field: 'healing', said: percent },
];

/** A bar's most for each number: the most any kind of the loadout reaches with no traits, with this much room left
 *  for a trait's gain; a body's, its own number's this many times, so a perk's change shows either way. */
const HEADROOM = 1.3;
const BODY_ROOM = 1.6;
const most = new Map<string, number>();

function mostOf(loadout: number, stat: Stat): number {
  const key = `${loadout} ${stat.field}`;
  let found = most.get(key);
  if (found === undefined) {
    if (stat.field === 'aimPace') found = 1;
    else if (loadout === LOADOUT.none) found = (statsOf(KINDS.indexOf('head'), [])?.[stat.field] ?? 0) * BODY_ROOM;
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

/** The change from `from` to `to` in a stat's own words, signed; empty for none. */
function changeOf(stat: Stat, from: number, to: number): string {
  const [before, after] = [stat.said(from), stat.said(to)];
  if (before === after) return '';
  const difference = Math.abs(to - from);
  const words = stat.said(difference).replace(/\/s$/, '');
  return `${to > from ? '+' : '−'}${words}`;
}

/** An item's numbers as bars, from its traits (or `traits` given); beside `against`'s numbers where it is set, as the
 *  piece it would replace or the choice of nodes it had. Null until the rules are given. */
export function sheetOf(
  item: Pick<GearItem, 'kind' | 'named' | 'columns' | 'chosen' | 'bought'>,
  against: ItemStats | null = null,
  traits: readonly string[] = givenTraits(item),
): StatSheet | null {
  const stats = statsOf(item.kind, traits);
  // A body's numbers are armour's and the cloak's (slots 2 to 6); a horse's or a ship module's are no one's.
  const worn = slotOf(item.kind);
  if (!stats || (stats.loadout === LOADOUT.none && (worn < 2 || worn > 6 || item.kind >= KINDS.length))) return null;
  const measures = stats.loadout === LOADOUT.melee ? MELEE : stats.loadout === LOADOUT.ranged ? RANGED : BODY;
  const compared = against && against.loadout === stats.loadout ? against : null;
  const rows = measures.map((stat): StatRow => {
    const top = mostOf(stats.loadout, stat) || 1;
    const value = stats[stat.field];
    const from = compared ? compared[stat.field] : null;
    return {
      label: stat.label,
      value,
      said: stat.said(value),
      share: Math.min(1, value / top),
      less: stat.less ?? false,
      from,
      fromShare: from === null ? null : Math.min(1, from / top),
      change: from === null ? '' : changeOf(stat, from, value),
    };
  });
  const notes: string[] = [];
  if (stats.loadout === LOADOUT.ranged) notes.push(`Ammo ${Math.round(stats.ammo)}`);
  if (stats.loadout === LOADOUT.ranged && stats.flight === 0) notes.push('Strikes at once');
  const held = HANDS[stats.hands];
  if (stats.loadout !== LOADOUT.none && held) notes.push(held);
  return { rows, notes };
}
