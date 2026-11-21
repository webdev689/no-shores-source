// What the Appearance screen shows, apart from how it is drawn: its rows (EMBLEM, DYE, COAT, BARDING), each tile kept
// or not and worn or not, its card's words and how it is had; and the dress a hovered tile previews on the display.

import factions from '../../../../content/gear/factions.json' with { type: 'json' };
import { COSMETICS, type CosmeticKind, type CosmeticSource } from '../../forge/cosmetics.ts';
import type { GearState } from '../../network/gearMessages.ts';
import type { Dress } from '../../player/dressing.ts';
import { RARITIES } from '../../player/gear.ts';
import { EMBLEMS } from '../emblemArt.ts';
import { owned } from '../factionNames.ts';

/** A row of the screen: the emblems, or one kind of cosmetic. */
export type AppearanceKind = 'emblem' | CosmeticKind;

/** A tile of a row: its number on the wire, its id and name, its rarity by the gear's numbers, its card's kind and
 *  words, how it is had, and whether it is kept and worn. */
export interface AppearanceTile {
  readonly kind: AppearanceKind;
  readonly number: number;
  readonly id: string;
  readonly name: string;
  readonly rarity: number;
  readonly label: string;
  readonly words: string;
  readonly how: string;
  readonly kept: boolean;
  readonly worn: boolean;
}

/** A row: its kind, its engraved heading and its tiles. */
export interface AppearanceRow {
  readonly kind: AppearanceKind;
  readonly heading: string;
  readonly tiles: readonly AppearanceTile[];
}

/** Each row's heading and its cards' kind, in the screen's order. */
const ROWS: readonly { readonly kind: AppearanceKind; readonly heading: string; readonly label: string }[] = [
  { kind: 'emblem', heading: 'Emblem', label: 'Emblem' },
  { kind: 'dye', heading: 'Dye', label: 'Armour Dye' },
  { kind: 'coat', heading: 'Coat', label: "Horse's Coat" },
  { kind: 'barding', heading: 'Barding', label: 'Barding' },
];
/** Who sells each kind of cosmetic. */
const SELLER: Readonly<Record<CosmeticKind, string>> = { dye: 'the Tailor', coat: 'the Tack', barding: 'the Tack' };
const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];

/** A rarity's number by its name in the catalogues (`legendary`). */
export const rarityNumber = (name: string): number =>
  Math.max(
    0,
    RARITIES.findIndex((each) => each.name.toLowerCase() === name),
  );

/** A faction's name as its own, by its number: the Stormcallers', the Veiled's. */
const factionOwn = (number: number): string =>
  owned(factions.factions.find((each) => each.id === number)?.name ?? 'faction');

/** How a cosmetic is had, in a sentence. */
export function howHad(source: CosmeticSource, kind: CosmeticKind): string {
  if (source.kind === 'sold') {
    const from = (source.level ?? 1) > 1 ? ` from level ${source.level ?? 1}` : '';
    return `Sold by ${SELLER[kind]}${from}.`;
  }
  if (source.kind === 'faction') {
    const rank = source.rank ?? 1;
    return `Reach ${factionOwn(source.faction ?? 0)} ${ORDINALS[rank - 1] ?? `${rank}th`} rank.`;
  }
  return 'Yours from the start.';
}

/** The screen's rows for the gear the room last sent: every emblem and every cosmetic of each kind, those kept to be
 *  worn and the rest dim. A start piece is always kept; with no word of what is worn, the start piece is. */
export function appearanceRows(gear: GearState): AppearanceRow[] {
  const keptEmblems = new Set(gear.emblems ?? []);
  const keptCosmetics = new Set(gear.cosmetics ?? []);
  return ROWS.map(({ kind, heading, label }) => {
    if (kind === 'emblem') {
      const worn = gear.emblem ?? 0;
      const tiles = EMBLEMS.map((emblem, number) => ({
        kind,
        number,
        id: emblem.id,
        name: emblem.name,
        rarity: rarityNumber(emblem.rarity),
        label,
        words: emblem.words,
        how: emblem.words,
        kept: keptEmblems.has(number) || emblem.source.kind === 'start',
        worn: number === worn,
      }));
      return { kind, heading, tiles };
    }
    const tiles: AppearanceTile[] = [];
    COSMETICS.forEach((cosmetic, number) => {
      if (cosmetic.kind !== kind) return;
      const start = cosmetic.source.kind === 'start';
      const worn = gear.worn ? gear.worn[kind] === number : start;
      tiles.push({
        kind,
        number,
        id: cosmetic.id,
        name: cosmetic.name,
        rarity: rarityNumber(cosmetic.rarity),
        label,
        words: cosmetic.words,
        how: howHad(cosmetic.source, kind),
        kept: start || keptCosmetics.has(number),
        worn,
      });
    });
    return { kind, heading, tiles };
  });
}

/** The dress a tile previews on the display: the player's own with the hovered dye, coat or barding worn in its
 *  place (a start piece its own colours or the bare horse); an emblem previews nothing. */
export function previewDress(dress: Dress, tile: AppearanceTile | null): Dress {
  if (!tile || tile.kind === 'emblem') return dress;
  const start = COSMETICS[tile.number]?.source.kind === 'start';
  return { ...dress, outfit: { ...dress.outfit, [tile.kind]: start ? null : tile.id } };
}

/** The tile the display previews: the one under the pointer, else the one the keys hold focused (the one left
 *  included), else none, for the player as they are; a tile a click focused holds no preview once the pointer goes. */
export function previewedTile(
  tiles: readonly AppearanceTile[],
  hovered: (tile: AppearanceTile) => boolean,
  keyFocused: (tile: AppearanceTile) => boolean,
): AppearanceTile | null {
  return tiles.find(hovered) ?? tiles.find(keyFocused) ?? null;
}
