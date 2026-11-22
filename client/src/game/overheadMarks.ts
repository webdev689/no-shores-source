// What wears a mark over it on foot (combat/marksOver.ts lays them): over each keeper who deals with a player their
// sign in its brass diamond, or a faction's emblem in the diamond edged in its Art's colour, as their screen shows them
// (npc/npcMarks.ts), the Postmaster's sealed letter beating while letters wait; over the bounty board its gold "!";
// over Shape on his week's spot his own; over each dungeon entrance's door a door; and over each chapter of the lore
// lying there for the player a closed book (compendium/loreArt.ts). A resource node wears none: its
// own picture stands on the ground (nodeCards.ts).

import type { PixelPicture } from '../combat/dropPictures.ts';
import { type Marked, OVER_HEAD_M, WIDTH_M } from '../combat/marksOver.ts';
import type { PropTable } from '../models/tables.ts';
import type { GearState } from '../network/gearMessages.ts';
import { BODY_HEIGHT } from '../player/crosshair.ts';
import { ELEMENTS } from '../player/gear.ts';
import { emblemOf, emblemPixels } from './emblemArt.ts';
import { doorOf, entrancesOf } from './entrances.ts';
import { keeperOf } from './keepers.ts';
import { factionOf } from './npc/factionRows.ts';
import { keeperPicture } from './npc/npcMarks.ts';
import { offerAt } from './plazaLife.ts';
import { awayFromCounters, shapeSpot } from './townsfolk.ts';
import type { NodeInfo } from './worldData.ts';
import { LORE_PICTURE } from './compendium/loreArt.ts';

type Point = readonly [number, number, number];

/** How high the bounty board's gable stands, metres, as the city crate builds it (`board.rs`): its mark stands over it
 *  as a keeper's over their crown. */
const BOARD_TOP_M = 3.7;
/** How high over the ground a chapter of the lore lying there floats, metres, under its mark's foot. */
const LORE_TOP_M = 0.9;
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

/** A dungeon entrance's mark: an arched door of planks banded in iron, its ring brass, 12 × 12 as a resource's. */
export const DOOR_PICTURE: PixelPicture = {
  rows: [
    '...aaaaaa...',
    '..abbbbbba..',
    '.abcdcdcdba.',
    '.abcdcdcdba.',
    '.aeeeeeeeea.',
    '.abcdcdcdba.',
    '.abcdcdffba.',
    '.abcdcdffba.',
    '.aeeeeeeeea.',
    '.abcdcdcdba.',
    '.abcdcdcdba.',
    'aaaaaaaaaaaa',
  ],
  colours: [OUTLINE, '#3a2a18', '#6e4a22', '#b07a40', '#4a4a52', BRASS],
};

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
 *  over its keeper's crown while the keeper stands there (the bounty board over its gable), Shape over his while he is
 *  here, each chapter of the lore lying here for them (its gear's `loreHere`) as a book floating over where it lies, and
 *  each of a patrol's dungeon entrances (its gear's `dungeons`) over its door's lintel, once `props` gives its model's
 *  door. */
export function markedHere(
  gear: GearState | null,
  here: Pick<NodeInfo, 'stations' | 'visitorSpots'>,
  floor: (x: number, y: number) => number,
  props: PropTable | null = null,
): Marked[] {
  const marked: Marked[] = [];
  const crown = (x: number, y: number, top = BODY_HEIGHT): Point => [x, y, floor(x, y) + top + OVER_HEAD_M];
  // The Postmaster's mark beats while letters wait for the player, so it is seen from across the plaza.
  const waiting = (gear?.mail?.length ?? 0) > 0;
  for (const station of here.stations ?? []) {
    // A keeper away from their post (the elder on her welcome) leaves it unmarked until they are back.
    const there = !awayFromCounters.has(station.kind) && offerAt([station], ...station.counter);
    const picture = there ? markOfKind(station.kind) : null;
    const top = station.kind === 'board' ? BOARD_TOP_M : BODY_HEIGHT;
    if (picture)
      marked.push({ picture, at: crown(...station.keeper, top), beating: waiting && station.kind === 'mail' });
  }
  const shape = shapeSpot(gear?.shape, here.visitorSpots ?? []);
  const own = keeperPicture('shape');
  if (shape && own) marked.push({ picture: own, at: crown(...shape) });
  // A chapter lying in the world is the book itself, floating at a crown's height over where it lies.
  for (const { at } of gear?.loreHere ?? []) marked.push({ picture: LORE_PICTURE, at: crown(...at, LORE_TOP_M) });
  for (const entrance of entrancesOf(gear?.dungeons ?? [])) {
    const door = props && doorOf(entrance, props);
    if (!door) continue;
    // A mark's width out from the door's face, so it turns clear of the mound round the door.
    const [[x, y], [outX, outY]] = [door.middle, door.out];
    marked.push({ picture: DOOR_PICTURE, at: [x + outX * WIDTH_M, y + outY * WIDTH_M, door.top + OVER_HEAD_M] });
  }
  return marked;
}
