// What wears a mark over it on foot (combat/marksOver.ts lays them): over each keeper who deals with a player their
// sign in its brass diamond, or a faction's emblem in the diamond edged in its Art's colour, as their screen shows them
// (npc/npcMarks.ts); and over Shape on his week's spot his own. A resource node wears none: its own picture stands on
// the ground (nodeCards.ts).

import type { PixelPicture } from '../combat/dropPictures.ts';
import { type Marked, OVER_HEAD_M } from '../combat/marksOver.ts';
import type { GearState } from '../network/gearMessages.ts';
import { BODY_HEIGHT } from '../player/crosshair.ts';
import { ELEMENTS } from '../player/gear.ts';
import { emblemOf, emblemPixels } from './emblemArt.ts';
import { keeperOf } from './keepers.ts';
import { factionOf } from './npc/factionRows.ts';
import { keeperPicture } from './npc/npcMarks.ts';
import { offerAt } from './plazaLife.ts';
import { awayFromCounters, shapeSpot } from './townsfolk.ts';
import type { NodeInfo } from './worldData.ts';

type Point = readonly [number, number, number];

/** Every mark's outline, and the brass of a faction diamond with no Art's colour. */
const OUTLINE = '#2a1b08';
const BRASS = '#f3cf86';
/** A faction's diamond, as its keeper's mark is: its side in cells, and the emblem's sign's side. */
const SIDE = 21;
const SIGN = 24;

/** A colour `#rrggbb` as its three channels, 0 to 255. */
const channelsOf = (hex: string): [number, number, number] => {
  const value = Number.parseInt(hex.slice(1), 16);
  return [value >> 16, (value >> 8) & 255, value & 255];
};

/** A faction keeper's mark: their faction's emblem cut to the diamond, edged in its Art's colour. Pure. */
export function factionPicture(faction: number): PixelPicture {
  const found = factionOf(faction);
  const emblem = emblemOf(found?.faction.emblem);
  const pixels = emblemPixels(emblem, 'sign');
  const { ground, ink, accent } = emblem.art;
  const inks = [ground[0] ?? ink, ground[1] ?? ground[0] ?? ink, ink, accent];
  const palette = inks.map(channelsOf);
  const middle = (SIDE - 1) / 2;
  const rows = Array.from({ length: SIDE }, (unused, row) =>
    Array.from({ length: SIDE }, (unseen, column) => {
      const reach = Math.abs(row - middle) + Math.abs(column - middle);
      if (reach > middle) return '.';
      if (reach === middle) return 'a';
      if (reach === middle - 1) return 'b';
      // The sign's pixel under this cell, as the nearest of the emblem's own colours.
      const [x, y] = [Math.floor(((column + 0.5) * SIGN) / SIDE), Math.floor(((row + 0.5) * SIGN) / SIDE)];
      const place = (y * SIGN + x) * 4;
      const [red, green, blue] = [pixels[place] ?? 0, pixels[place + 1] ?? 0, pixels[place + 2] ?? 0];
      const far = palette.map(
        ([inkRed, inkGreen, inkBlue]) => (inkRed - red) ** 2 + (inkGreen - green) ** 2 + (inkBlue - blue) ** 2,
      );
      return 'cdef'.charAt(far.indexOf(Math.min(...far)));
    }).join(''),
  );
  return { rows, colours: [OUTLINE, ELEMENTS[found?.art.element ?? 0]?.colour ?? BRASS, ...inks] };
}

const faction = new Map<number, PixelPicture>();
/** The mark of the keeper at a station of `kind`: their sign, else their faction's emblem; none for a kind with none. */
export function markOfKind(kind: string): PixelPicture | null {
  const sign = keeperPicture(kind);
  if (sign) return sign;
  const id = keeperOf(kind)?.faction;
  if (id === undefined) return null;
  const kept = faction.get(id) ?? factionPicture(id);
  faction.set(id, kept);
  return kept;
}

/** What wears a mark where a player stands, on `floor`'s height, read once each: each station that deals with them
 *  over its keeper's crown while the keeper stands there, and Shape over his while he is here. */
export function markedHere(
  gear: GearState | null,
  here: Pick<NodeInfo, 'stations' | 'visitorSpots'>,
  floor: (x: number, y: number) => number,
): Marked[] {
  const marked: Marked[] = [];
  const crown = (x: number, y: number): Point => [x, y, floor(x, y) + BODY_HEIGHT + OVER_HEAD_M];
  for (const station of here.stations ?? []) {
    // A keeper away from their post (the elder on her welcome) leaves it unmarked until they are back.
    const there = !awayFromCounters.has(station.kind) && offerAt([station], ...station.counter);
    const picture = there ? markOfKind(station.kind) : null;
    if (picture) marked.push({ picture, at: crown(...station.keeper) });
  }
  const shape = shapeSpot(gear?.shape, here.visitorSpots ?? []);
  const own = keeperPicture('shape');
  if (shape && own) marked.push({ picture: own, at: crown(...shape) });
  return marked;
}
