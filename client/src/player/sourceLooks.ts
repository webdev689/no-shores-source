// The looks each content gives, as the owner chose: every armour set and weapon metal the forge draws belongs to the
// content that drops it (`content/gear/looks.json`, numbered as the gear crate's `Source`), so what a player wears says
// where it was earned. A rolled piece climbs its own content's sets and metals by its level and name, and is named by
// the set it is drawn in.

import factions from '../../../content/gear/factions.json' with { type: 'json' };
import items from '../../../content/gear/items.json' with { type: 'json' };
import looks from '../../../content/gear/looks.json' with { type: 'json' };
import type { GearItem } from '../network/gearMessages.ts';

/** One content's looks: its key and name, its armour sets and its weapon metals, each lightest first, and the set
 *  name each look carries (a faction's by its faction's key). */
export interface SourceLooks {
  readonly key: string;
  readonly name: string;
  readonly armour: readonly string[];
  readonly metals: readonly string[];
  readonly sets: Readonly<Record<string, string | undefined>>;
}

/** Every content's looks, by the gear crate's `Source` numbers: the world first. */
export const SOURCES: readonly SourceLooks[] = looks.sources;
/** The set name of a Normal piece, the world's clothes or a plain weapon. */
export const NORMAL_SET: string = looks.normal;

/** The world's: patrols, missions, the sea's fights, the smiths. */
const WORLD = 0;
/** Where a rolled Rare piece starts on the world's sets: chain, past its Magic leather and the thieves'. */
const WORLD_RARE_FROM = 2;

/** An item's content's looks; the world's for a number past the last. */
export const sourceLooks = (item: Pick<GearItem, 'source'>): SourceLooks => SOURCES[item.source] ?? SOURCES[WORLD]!;

/** The rung a rolled item stands on among `count` looks from `from`. The world's climbs to the last over levels 1 to
 *  20, and one more by its name where one is left, so two pieces of one level need not look alike. Any other content
 *  drops at its own levels (an Abyss Dungeon's all at 20), so its rung is its name's alone: each of its looks is seen
 *  at every level it drops. */
function climbed(item: Pick<GearItem, 'level' | 'name'>, from: number, count: number, world: boolean): number {
  if (!world) return from + (item.name % Math.max(count - from, 1));
  const climb = Math.max(count - 1 - from, 0);
  const level = Math.min(Math.max(item.level, 1), 20);
  return Math.min(from + Math.round(((level - 1) * climb) / 19) + (item.name % 2), count - 1);
}

/** The sets a rolled Magic piece of this content is drawn in, by its number: the world's leather and the thieves', or
 *  another content's lightest set. */
export function magicSets(item: Pick<GearItem, 'source'>): readonly string[] {
  const own = sourceLooks(item);
  return own.key === SOURCES[WORLD]?.key ? own.armour.slice(0, WORLD_RARE_FROM) : own.armour.slice(0, 1);
}

/** The set a rolled Rare or finer armour piece of this content is drawn in, by its level and name. */
export function rareSet(item: Pick<GearItem, 'source' | 'level' | 'name'>): string {
  const own = sourceLooks(item);
  const world = own.key === SOURCES[WORLD]?.key;
  return own.armour[climbed(item, world ? WORLD_RARE_FROM : 0, own.armour.length, world)] ?? 'steel';
}

/** The metal a rolled Magic or finer weapon of this content is made in, by its level and name. */
export function rolledMetal(item: Pick<GearItem, 'source' | 'level' | 'name'>): string {
  const own = sourceLooks(item);
  return own.metals[climbed(item, 0, own.metals.length, own.key === SOURCES[WORLD]?.key)] ?? 'iron';
}

/** The set the prologue's own armour is drawn in, Normal though it is: the steel the story dresses the player in. */
export const STORY_SET = 'steel';

/** The item's own number for a choice of make, shield or Magic set: its look roll's sixths (`name`, rolled as it was
 *  made, `vestige::LOOK_ROLLS`), apart from the remainders its metal and set climb by, so each pairs with each and a
 *  smith's or Shape's ware shows the look it keeps once bought. */
export const numberOf = (item: Pick<GearItem, 'name'>): number => Math.floor(item.name / 6);

/** The set a rolled armour piece is drawn in where the forge draws it, or null for clothes: a Normal piece's clothes;
 *  a Magic one's its content's lightest sets by its number, on the torso and legs clothes among them; a finer one's
 *  `rareSet`. */
export function rolledArmourSet(
  item: Pick<GearItem, 'source' | 'level' | 'name' | 'id' | 'named' | 'rarity'>,
  clothesToo: boolean,
): string | null {
  if (item.rarity === 0) return null;
  if (item.rarity > 1) return rareSet(item);
  const choices = clothesToo ? [null, ...magicSets(item)] : magicSets(item);
  return choices[numberOf(item) % choices.length] ?? null;
}

/** The set name a piece drawn in `look` carries (`content/gear/looks.json`): its content's name for that set or
 *  metal, Homespun for clothes (none) or a plain look. */
export const setName = (item: Pick<GearItem, 'source'>, look: string | null): string =>
  (look && sourceLooks(item).sets[look]) || NORMAL_SET;

/** A content's sets nearest first from `set`, then every other set by `ladder` nearest `set` first: a set the forge
 *  does not draw for a body falls to the nearest of its own content's before any other's. */
export function nearestOwnFirst(item: Pick<GearItem, 'source'>, set: string, ladder: readonly string[]): string[] {
  const own = sourceLooks(item).armour;
  const from = (list: readonly string[], index: number) =>
    [...list].sort((a, b) => Math.abs(list.indexOf(a) - index) - Math.abs(list.indexOf(b) - index));
  const mine = from(own, Math.max(own.indexOf(set), 0));
  const rest = from(ladder, Math.max(ladder.indexOf(set), 0)).filter((each) => !mine.includes(each));
  return [...mine, ...rest];
}

/** Each faction's named piece's faction, by the item's id, as a player reads it: "the Stormcallers", "the Veiled". */
const FACTION_OF: ReadonlyMap<string, string> = new Map(
  items.items.flatMap((item) => {
    const faction = factions.factions.find((each) => 'faction' in item && each.key === item.faction);
    return faction ? [[item.id, faction.name.replace(/^(The )?/, 'the ')] as const] : [];
  }),
);

/** Where a piece or a Vestige was earned, in words: a faction's piece its faction ("the Stormcallers"), anything else
 *  its content ("an Elite Dungeon"). */
export const earnedFrom = (item: Pick<GearItem, 'source'> & { readonly named?: string | null }): string =>
  FACTION_OF.get(item.named ?? '') ?? sourceLooks(item).name;
