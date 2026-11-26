// What the player gained between two words from the room on their gear: Aurem and Shapes, XP, each faction's
// reputation, each Art's progress and fragments, fragments, essence and Fruit of Dagon, each island's resource, the
// ship's materials and XP, ammunition from an Ammo box, Ammo crates, every item, Vestige, emblem and cosmetic new to
// them, every ship and ship's dress new to them, and the letters sent to their mail. What they spent or moved is not a gain, nor the ammunition a crate they
// used gave back. Currency, XP, reputation and an Art's progress are short lines, as Destiny shows them over the
// items' rows. Prestige is not a gain: it is what the armour worn is worth.
// The feed at the right of the screen shows these as Destiny shows what is picked up.

import cosmetics from '../../../content/gear/cosmetics.json' with { type: 'json' };
import factions from '../../../content/gear/factions.json' with { type: 'json' };
import { DROPPED, type GearItem, type GearState } from '../network/gearMessages.ts';
import { RARITIES, STOCK_NAMES, resourceName } from '../player/gear.ts';
import { ARTS, emblemSvg } from './artsCards.ts';
import { gearName, moduleGlyph, SHIP_MATERIALS } from './shipGear.ts';
import { cosmeticRamp } from '../forge/cosmetics.ts';
import { GAME_PALETTE } from './appearance/gamePalette.ts';
import { EMBLEMS } from '../plus/emblemArt.ts';
import type { Glyph } from './gearCards.ts';
import { bardingSvg, keeperMarkSvg, markSvg, shapesSvg } from './npc/npcMarks.ts';
import { holderName } from './finds.ts';
import { CHEST_PICTURE, SEARCH_PICTURE } from './overheadMarks.ts';
import { SHIPYARD } from './harbour/harbourModel.ts';
import { SHIP_DRESSES } from '../ships/fleetDress.ts';
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
   *  barding's mark, an Art's or its faction's emblem. */
  readonly icon: string | null;
  /** A chest's tier, 1 to 4, shown as pips in place of a count. */
  readonly pips?: number;
  /** Whether it names what was opened, with no count: a chest or a container searched. */
  readonly bare?: boolean;
  /** Whether it stands as a short line, a count beside its icon (and its word, where the icon alone is not enough),
   *  over the items' rows: currency, XP, reputation, an Art's progress. */
  readonly compact: boolean;
  readonly word: string | null;
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
  compact: false,
  word: null,
  ...fields,
});

/** The factions, in the order a player's reputation is told. */
const FACTIONS = factions.factions;

/** A short line's gain: currency, XP, reputation or an Art's progress. */
const line = (key: string, name: string, count: number, fields: Partial<Gain> = {}): Gain =>
  gain(key, name, count, { compact: true, ...fields });

/** What grew from `before` to `after`, place by place. */
const grown = (before: readonly number[] = [], after: readonly number[] = []) =>
  after.map((count, place) => count - (before[place] ?? 0));

/** XP, each faction's reputation, each Art's progress and fragments, and the ship's materials and XP. */
function standingGains(before: GearState, after: GearState): Gain[] {
  const gains: Gain[] = [];
  const earned = Number(after.xp - before.xp);
  if (earned > 0) gains.push(line('xp', 'XP', earned, { glyph: 'xp', word: 'XP' }));
  const [was, now] = [before.standing, after.standing];
  grown(was?.reputation, now?.reputation).forEach((count, place) => {
    const faction = FACTIONS[place];
    const art = ARTS.find((each) => each.id === faction?.art);
    if (count > 0 && faction && art)
      gains.push(
        line(`rep-${place}`, `${faction.name} reputation`, count, { icon: emblemSvg(art), word: 'Reputation' }),
      );
  });
  ARTS.forEach((art, place) => {
    const [level, levelBefore] = [now?.artLevels[place] ?? 0, was?.artLevels[place] ?? 0];
    const xpGrown = (now?.artXp[place] ?? 0) - (was?.artXp[place] ?? 0);
    if (level > levelBefore)
      gains.push(gain(`art-level-${place}`, `${art.name} level ${level}`, 1, { icon: emblemSvg(art) }));
    else if (xpGrown > 0)
      gains.push(line(`art-${place}`, `${art.name} XP`, xpGrown, { icon: emblemSvg(art), word: 'XP' }));
    const [owned, ownedBefore] = [now?.artOwned[place] ?? 0, was?.artOwned[place] ?? 0];
    const fresh = art.core.filter((unused, bit) => (owned & (1 << bit)) !== 0 && (ownedBefore & (1 << bit)) === 0);
    for (const fragment of fresh)
      gains.push(gain(`fragment-${place}-${fragment.name}`, fragment.name, 1, { icon: emblemSvg(art) }));
  });
  // A word on the gear with no ship, then one with it, gained none of its stock.
  if (before.ship)
    grown(before.ship.stocks, after.ship?.stocks).forEach((count, place) => {
      const material = SHIP_MATERIALS[place];
      if (count > 0 && material) gains.push(gain(`ship-${place}`, material.name, count, { glyph: material.glyph }));
    });
  const shipXp = Number((after.ship?.xp ?? 0n) - (before.ship?.xp ?? 0n));
  if (before.ship && shipXp > 0) gains.push(line('ship-xp', 'Ship XP', shipXp, { glyph: 'xp', word: 'Ship XP' }));
  return gains;
}

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

/** Each ship and each ship's dress newly kept between two words of a room that sends the ship's part: a hull under the
 *  hull's glyph, a dress as its colours. */
function fleetGains(before: GearState, after: GearState): Gain[] {
  if (!before.ship || !after.ship) return [];
  const kept = new Set(before.ship.fleet.map((ship) => ship.hull));
  const ships = after.ship.fleet
    .filter((ship) => !kept.has(ship.hull))
    .map((ship) => gain(`hull-${ship.hull}`, SHIPYARD.hulls[ship.hull]?.name ?? 'Ship', 1, { glyph: 'hull' }));
  const had = new Set(before.ship.dresses);
  const dresses = after.ship.dresses.flatMap((number) => {
    const entry = SHIP_DRESSES[number];
    if (had.has(number) || !entry) return [];
    const colours = [entry.colour ?? '#7a5b3c', entry.ink ?? entry.colour ?? '#7a5b3c'];
    const bands = colours.map((colour, place) => `<rect x="${place}" width="1" height="2" fill="${colour}"/>`);
    const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2">${bands.join('')}</svg>`;
    return [gain(`dress-${number}`, entry.name, 1, { rarity: rarityNamed(entry.rarity), icon })];
  });
  return [...ships, ...dresses];
}

/** A public event's chest opened between two words (lying in `before`, gone in `after`), its tier as pips; the XP
 *  and reputation it gave are told as any are. */
function chestGains(before: GearState, after: GearState): Gain[] {
  const chest = before.drops.find(
    (drop) => drop.kind === DROPPED.chest && !after.drops.some((left) => left.id === drop.id),
  );
  return chest ? [gain(`chest-${chest.id}`, chest.tier >= 3 ? 'Heroic chest' : 'Chest', 1, { pips: chest.tier })] : [];
}

/** A chest or a container the room paid the player for between two words (`opened`, standing for them in
 *  `before`), named as its mark shows it; what it gave is told as any gain is. */
function findGains(before: GearState, after: GearState): Gain[] {
  const opened = after.opened ?? 0;
  if (opened === 0 || opened === before.opened) return [];
  const chest = before.chests?.find((find) => find.number === opened);
  if (chest) return [gain(`find-${opened}`, chest.vault ? 'Vault chest' : 'Chest', 1, { icon: CHEST_SVG, bare: true })];
  const held = before.searchables?.find((find) => find.number === opened);
  const searched = held && `Searched the ${holderName(held.model)}`;
  return searched ? [gain(`find-${opened}`, searched, 1, { icon: SEARCH_SVG, bare: true })] : [];
}

const CHEST_SVG = markSvg(CHEST_PICTURE.rows, CHEST_PICTURE.colours);
const SEARCH_SVG = markSvg(SEARCH_PICTURE.rows, SEARCH_PICTURE.colours);

/** What `after` holds that `before` did not: counts grown, and items, Vestiges and emblems new; a chest opened, or a
 *  container searched. */
export function gainsOf(before: GearState, after: GearState): Gain[] {
  const gains: Gain[] = [...chestGains(before, after), ...findGains(before, after)];
  if (after.aurem > before.aurem) gains.push(line('aurem', 'Aurem', after.aurem - before.aurem, { glyph: 'aurem' }));
  const [shapes, shapesBefore] = [after.shapes ?? 0, before.shapes ?? 0];
  if (shapes > shapesBefore) gains.push(line('shapes', 'Shapes', shapes - shapesBefore, { icon: shapesSvg() }));
  gains.push(...standingGains(before, after));
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
  gains.push(...fleetGains(before, after));
  // What went to the mail rather than being lost is told as it goes, under the Postmaster's mark.
  const posted = new Set((before.mail ?? []).map((letter) => letter.id));
  const sent = (after.mail ?? []).filter((letter) => !posted.has(letter.id)).length;
  if (sent > 0) gains.push(gain('mail', 'Sent to the mail', sent, { icon: keeperMarkSvg('mail') }));
  return gains;
}
