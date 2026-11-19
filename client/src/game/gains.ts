// What the player gained between two words from the room on their gear: Aurem, fragments, essence and Fruit of
// Dagon, each island's resource, and every item, Vestige and emblem new to them. What they spent or moved is not a
// gain. The feed at the right of the screen shows these as Destiny shows what is picked up.

import type { GearItem, GearState } from '../network/gearMessages.ts';
import { RARITIES, STOCK_NAMES, itemName, resourceName } from '../player/gear.ts';
import { EMBLEMS } from './emblemArt.ts';
import type { Glyph } from './gearCards.ts';

/** One gain: what merges with the same gain shown already, its name, how many, and how it is drawn. */
export interface Gain {
  readonly key: string;
  readonly name: string;
  readonly count: number;
  /** An item's or a Vestige's rarity; null for what has none. */
  readonly rarity: number | null;
  readonly glyph: Glyph;
  /** A resource's place in the list, which colours its glyph. */
  readonly tint: number;
  readonly item: GearItem | null;
  /** An emblem's place in the catalogue, drawn as its own icon. */
  readonly emblem: number | null;
}

/** Each stock's glyph, in `stocks`' order. */
const STOCK_GLYPHS: readonly Glyph[] = [
  'weapon-fragments',
  'armor-fragments',
  'weapon-essence',
  'armor-essence',
  'fruit',
];

const gain = (key: string, name: string, count: number, fields: Partial<Gain> = {}): Gain => ({
  key,
  name,
  count,
  rarity: null,
  glyph: 'empty',
  tint: 0,
  item: null,
  emblem: null,
  ...fields,
});

/** What `after` holds that `before` did not: counts grown, and items, Vestiges and emblems new. */
export function gainsOf(before: GearState, after: GearState): Gain[] {
  const gains: Gain[] = [];
  if (after.aurem > before.aurem) gains.push(gain('aurem', 'Aurem', after.aurem - before.aurem, { glyph: 'aurem' }));
  after.stocks.forEach((count, index) => {
    const grown = count - (before.stocks[index] ?? 0);
    if (grown > 0)
      gains.push(gain(`stock-${index}`, STOCK_NAMES[index] ?? '', grown, { glyph: STOCK_GLYPHS[index] ?? 'empty' }));
  });
  after.resources.forEach((count, index) => {
    const grown = count - (before.resources[index] ?? 0);
    if (grown > 0)
      gains.push(gain(`resource-${index}`, resourceName(index), grown, { glyph: 'resource', tint: index }));
  });
  const had = new Set(before.items.map((item) => item.id));
  for (const item of after.items)
    if (!had.has(item.id))
      gains.push(gain(`item-${item.id}`, itemName(item), 1, { rarity: item.rarity, glyph: 'item', item }));
  const kept = new Set(before.vestiges.map((vestige) => vestige.id));
  for (const vestige of after.vestiges)
    if (!kept.has(vestige.id))
      gains.push(
        gain(`vestige-${vestige.rarity}`, `${RARITIES[vestige.rarity]?.name ?? ''} Vestige`, 1, {
          rarity: vestige.rarity,
          glyph: 'vestige',
        }),
      );
  const worn = new Set(before.emblems ?? []);
  for (const emblem of after.emblems ?? [])
    if (!worn.has(emblem)) gains.push(gain(`emblem-${emblem}`, EMBLEMS[emblem]?.name ?? 'Emblem', 1, { emblem }));
  return gains;
}
