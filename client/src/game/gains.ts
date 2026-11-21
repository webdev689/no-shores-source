// What the player gained between two words from the room on their gear: Aurem and Shapes, fragments, essence and
// Fruit of Dagon, each island's resource, ammunition from an Ammo box, Ammo crates, and every item, Vestige, emblem
// and cosmetic new to them. What they spent or moved is not a gain, nor the ammunition a crate they used gave back.
// The feed at the right of the screen shows these as Destiny shows what is picked up.

import cosmetics from '../../../content/gear/cosmetics.json' with { type: 'json' };
import factions from '../../../content/gear/factions.json' with { type: 'json' };
import { DROPPED, type GearItem, type GearState } from '../network/gearMessages.ts';
import { RARITIES, STOCK_NAMES, resourceName } from '../player/gear.ts';
import { gearName, moduleGlyph } from './shipGear.ts';
import { cosmeticRamp } from '../forge/cosmetics.ts';
import { GAME_PALETTE } from './appearance/gamePalette.ts';
import { EMBLEMS } from './emblemArt.ts';
import type { Glyph } from './gearCards.ts';
import { bardingSvg, shapesSvg } from './npc/npcMarks.ts';
import { rarityNamed } from './npc/npcWares.ts';

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
  /** The picture of what has no glyph of the menu's, as SVG markup: Shapes' mark, a cosmetic's colours or its
   *  barding's mark. */
  readonly icon: string | null;
  /** A chest's tier, 1 to 4, shown as pips in place of a count. */
  readonly pips?: number;
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
  icon: null,
  ...fields,
});

/** A dye's or a coat's colours as a picture: a band of each, darkest first, on the palette as the figure draws them. */
function bandsSvg(id: string): string {
  const ramp = cosmeticRamp(id, GAME_PALETTE) ?? [];
  const colours = ramp.filter((_rgb, step) => step % 5 === 0).map((rgb) => `rgb(${rgb.join(' ')})`);
  const size = colours.length;
  const bands = colours.map((colour, place) => `<rect x="${place}" width="1" height="${size}" fill="${colour}"/>`);
  const frame = `xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"`;
  return `<svg ${frame}>${bands.join('')}</svg>`;
}

/** A cosmetic newly kept, by its place in content/gear/cosmetics.json. */
function cosmeticGain(number: number): Gain[] {
  const cosmetic = cosmetics.cosmetics[number];
  if (!cosmetic) return [];
  const icon = cosmetic.kind === 'barding' ? bardingSvg() : bandsSvg(cosmetic.id);
  return [gain(`cosmetic-${number}`, cosmetic.name, 1, { rarity: rarityNamed(cosmetic.rarity), icon })];
}

/** A public event's chest opened between two words (lying in `before`, gone in `after`): its tier, the XP it gave and
 *  the reputation with the faction the player is pledged to. */
function chestGains(before: GearState, after: GearState): Gain[] {
  const chest = before.drops.find(
    (drop) => drop.kind === DROPPED.chest && !after.drops.some((left) => left.id === drop.id),
  );
  if (!chest) return [];
  const gains = [gain(`chest-${chest.id}`, chest.tier >= 3 ? 'Heroic chest' : 'Chest', 1, { pips: chest.tier })];
  const earnedXp = Number(after.xp - before.xp);
  if (earnedXp > 0) gains.push(gain('xp', 'XP', earnedXp));
  const place = factions.factions.findIndex((faction) => faction.id === after.standing?.pledge);
  const earned = (after.standing?.reputation[place] ?? 0) - (before.standing?.reputation[place] ?? 0);
  const name = factions.factions[place]?.name;
  if (earned > 0 && name) gains.push(gain(`reputation-${place}`, `${name} reputation`, earned));
  return gains;
}

/** What `after` holds that `before` did not: counts grown, and items, Vestiges and emblems new; a chest opened, with
 *  what it gave of XP and reputation. */
export function gainsOf(before: GearState, after: GearState): Gain[] {
  const gains: Gain[] = chestGains(before, after);
  if (after.aurem > before.aurem) gains.push(gain('aurem', 'Aurem', after.aurem - before.aurem, { glyph: 'aurem' }));
  const [shapes, shapesBefore] = [after.shapes ?? 0, before.shapes ?? 0];
  if (shapes > shapesBefore) gains.push(gain('shapes', 'Shapes', shapes - shapesBefore, { icon: shapesSvg() }));
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
  const [crates, cratesBefore] = [after.crates ?? 0, before.crates ?? 0];
  if ((after.ammoShare ?? 0) > (before.ammoShare ?? 0) && crates >= cratesBefore) {
    const shots = Math.max(1, (after.ammo ?? 0) - (before.ammo ?? 0));
    gains.push(gain('ammo', 'Ammo', shots, { glyph: 'ammo-box' }));
  }
  if (crates > cratesBefore)
    gains.push(gain('ammo-crate', 'Ammo crate', crates - cratesBefore, { glyph: 'ammo-crate' }));
  const had = new Set(before.items.map((item) => item.id));
  for (const item of after.items) {
    if (had.has(item.id)) continue;
    // A module shows its glyph: the forge draws only what a figure wears.
    const glyph = moduleGlyph(item.kind);
    const shown = glyph ? { rarity: item.rarity, glyph } : { rarity: item.rarity, glyph: 'item' as const, item };
    gains.push(gain(`item-${item.id}`, gearName(item), 1, shown));
  }
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
  const owned = new Set(before.cosmetics ?? []);
  for (const number of after.cosmetics ?? []) if (!owned.has(number)) gains.push(...cosmeticGain(number));
  return gains;
}
