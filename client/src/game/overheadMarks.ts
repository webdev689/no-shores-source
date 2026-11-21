// What a player can use on foot wears its own mark over it, bobbing, after DFO's marks over the people who do
// something: over each keeper who deals with a player their sign in its brass diamond, or a faction's emblem in the
// diamond edged in its Art's colour, as their screen shows them (npc/npcMarks.ts); over Shape on his week's spot his
// own; over each resource node still to gather its resource's picture. A mark stands on a point over the head, turned
// to the eye and hidden by what stands before it, never narrower on the screen than MIN_RAD of the view so a keeper
// across the plaza still shows one, faded out over the last fifth of its reach, the nearest MOST of them; it holds
// still under reduced motion. It is laid as the drops' pictures are (combat/drops.ts).

import type { PixelPicture } from '../combat/dropPictures.ts';
import { markPicture, PIXEL_M } from '../combat/drops.ts';
import type { GearState } from '../network/gearMessages.ts';
import { BODY_HEIGHT } from '../player/crosshair.ts';
import { ELEMENTS } from '../player/gear.ts';
import { emblemOf, emblemPixels } from './emblemArt.ts';
import { resourcePicture } from './gearGlyphs.ts';
import { keeperOf } from './keepers.ts';
import { factionOf } from './npc/factionRows.ts';
import { keeperPicture } from './npc/npcMarks.ts';
import { offerAt } from './plazaLife.ts';
import { shapeSpot } from './townsfolk.ts';
import type { NodeInfo } from './worldData.ts';

type Point = readonly [number, number, number];

/** How far from the eye a mark shows (metres), and the share of that over which it fades out at its far end. */
export const REACH_M = 30;
const FADE = 0.2;
/** How far over the crown a mark's foot stands, and over a resource node's ground (metres). */
export const OVER_HEAD_M = 0.2;
export const OVER_NODE_M = 1.2;
/** A mark's width (metres): a hand across, as a hanging sign reads across a street. */
export const WIDTH_M = 0.42;
/** The narrowest half-width a mark stands at on the screen, as an angle of the view (radians): two screen pixels a cell
 *  of it on a 1080-line screen. */
export const MIN_RAD = 0.017;
/** The bob: how far a mark rises and falls (metres) and how often (cycles a second). */
const BOB_M = 0.06;
const BOB_HZ = 1;
/** The most marks a frame lays, the nearest. */
export const MOST = 16;
/** Every mark's outline, and the brass of a faction diamond with no Art's colour. */
const OUTLINE = '#2a1b08';
const BRASS = '#f3cf86';
/** A faction's diamond, as its keeper's mark is: its side in cells, and the emblem's sign's side. */
const SIDE = 21;
const SIGN = 24;

/** One mark to lay: its picture, and the point its foot stands on before the bob. */
export interface Marked {
  readonly picture: PixelPicture;
  readonly at: Point;
}

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

/** What wears a mark where a player stands, on `floor`'s height: each station that deals with them over its keeper's
 *  crown, Shape over his while he is here, and each node still to gather over its ground. Pure. */
export function markedHere(
  gear: GearState | null,
  here: Pick<NodeInfo, 'stations' | 'visitorSpots'>,
  floor: (x: number, y: number) => number,
): Marked[] {
  const marked: Marked[] = [];
  const crown = (x: number, y: number): Point => [x, y, floor(x, y) + BODY_HEIGHT + OVER_HEAD_M];
  for (const station of here.stations ?? []) {
    const picture = offerAt([station], ...station.counter) ? markOfKind(station.kind) : null;
    if (picture) marked.push({ picture, at: crown(...station.keeper) });
  }
  const shape = shapeSpot(gear?.shape, here.visitorSpots ?? []);
  const own = keeperPicture('shape');
  if (shape && own) marked.push({ picture: own, at: crown(...shape) });
  for (const node of gear?.nodes ?? []) {
    const picture = resourcePicture(node.resource);
    if (picture) marked.push({ picture, at: [node.x, node.y, floor(node.x, node.y) + OVER_NODE_M] });
  }
  return marked;
}

/** Whether the page asks for still pictures (the player's reduced motion). */
const still = (): boolean => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** The marks seen from `eye` at `seconds`, as mark vertices: the nearest MOST within reach, each bobbing on a phase of
 *  its own unless `holding`, as wide as WIDTH_M or MIN_RAD of the view, whichever is wider, fading at the far end. */
export function overheadMarks(marked: readonly Marked[], eye: Point, seconds: number, holding = still()): number[] {
  const out: number[] = [];
  const near = marked
    .map((mark) => ({ mark, far: Math.hypot(mark.at[0] - eye[0], mark.at[1] - eye[1], mark.at[2] - eye[2]) }))
    .filter(({ far }) => far <= REACH_M)
    .sort((one, other) => one.far - other.far)
    .slice(0, MOST);
  for (const { mark, far } of near) {
    const cells = mark.picture.rows[0]?.length ?? 1;
    const width = Math.max(WIDTH_M, 2 * far * Math.tan(MIN_RAD));
    // Each its own phase, by where it stands, so a row of keepers does not bob as one.
    const phase = (Math.abs(mark.at[0] * 7.31 + mark.at[1] * 3.17) % 1) * 2 * Math.PI;
    const bob = holding ? 0 : BOB_M * Math.sin(2 * Math.PI * BOB_HZ * seconds + phase);
    const fading = REACH_M * (1 - FADE);
    const opacity = far <= fading ? 1 : Math.max(0, (REACH_M - far) / (REACH_M - fading));
    const bobbing: Point = [mark.at[0], mark.at[1], mark.at[2] + bob];
    markPicture(out, mark.picture, bobbing, eye, width / cells / PIXEL_M, opacity);
  }
  return out;
}
