import ships from '../../../../content/ships/ships.json' with { type: 'json' };
import wreck from '../../../../content/prologue/wreck.json' with { type: 'json' };
import type { CourseBlock } from '../../../../server/roomDoor.ts';
import { deckOf, type Lying } from '../../ships/deck.ts';
import { deckBlocks } from './wreckDecks.ts';

type Point = readonly [number, number];
export type Area = readonly [number, number, number, number];

/** What a block that shows is drawn as: a broken spar or mast, planks laid as a ramp or stair, a crate, or debris. */
export type SceneryKind = 'spar' | 'planks' | 'crate' | 'debris';

/** A block that shows, and what it is. */
export interface Scenery {
  readonly kind: SceneryKind;
  readonly block: CourseBlock;
}

/** A foe of the roster in a wave: its type and rank as the roster numbers them, where it stands, and the way it
 *  faces (radians clockwise from north). */
export interface WaveFoe {
  readonly type: number;
  readonly rank: number;
  readonly at: Point;
  readonly facing: number;
}

/** A stretch of the path: the area that, entered, reaches it, the checkpoint the player comes back to from it, the
 *  heap of debris that closes the way on from it until its wave has fallen (none for the arena), and the foes it
 *  holds. */
export interface Zone {
  readonly name: string;
  readonly area: Area;
  readonly checkpoint: Point;
  readonly gate: CourseBlock | null;
  readonly wave: readonly WaveFoe[];
}

/** Whether a deck crew's roster type fights for the Grey Tithe (7 to 12); the pirates' are 13 to 17. */
export const titheCrew = (type: number): boolean => type >= 7 && type <= 12;

/** A fire burning in the wreck: where, and how big across, metres. */
export interface Fire {
  readonly at: readonly [number, number, number];
  readonly size: number;
}

/** A ship drawn in the wreck: her published mesh's name and where she lies. */
export interface ShipShown {
  readonly ship: string;
  readonly lying: Lying;
}

/**
 * The wreck as the level plays it, in world metres (x east, y south, z up over the sea): the blocks of both ships'
 * decks, hidden under the ships as drawn; the blocks that show; where the player wakes and the way they face; the path
 * from there to the arena, as points; the zones along it; the arena's zone, the gate that closes its way in, and
 * where Thule stands; the fires; and the ships.
 */
export interface WreckLayout {
  readonly decks: readonly CourseBlock[];
  readonly scenery: readonly Scenery[];
  readonly wake: { readonly at: Point; readonly facing: number };
  readonly path: readonly Point[];
  readonly zones: readonly Zone[];
  readonly arena: { readonly zone: number; readonly gate: CourseBlock; readonly thule: Point };
  readonly fires: readonly Fire[];
  readonly ships: readonly ShipShown[];
}

const RADIANS = Math.PI / 180;

/** A block from a box's west, north, east and south edges and its top. */
function blockOf([minX = 0, minY = 0, maxX = 0, maxY = 0, top = 0]: readonly number[]): CourseBlock {
  return { minX, minY, maxX, maxY, top };
}

const pointOf = ([x = 0, y = 0]: readonly number[]): Point => [x, y];
const areaOf = ([minX = 0, minY = 0, maxX = 0, maxY = 0]: readonly number[]): Area => [minX, minY, maxX, maxY];

/** The file's layout, as `content/prologue/wreck.json` holds it: headings and facings in degrees. */
type WreckFile = typeof wreck;

const KINDS: readonly SceneryKind[] = ['spar', 'planks', 'crate', 'debris'];

/** Reads a wreck's file into its layout at the world's origin; throws on a ship the manifest has no deck for, a
 *  block of no kind it draws, or an arena no gate closes. The arena's gate is the heap across the way into it. */
export function readWreck(file: WreckFile = wreck): WreckLayout {
  const decks = ships.ships as Readonly<Record<string, { readonly deck: Parameters<typeof deckOf>[0] }>>;
  const laid = file.ships.map((entry) => {
    const deck = decks[entry.ship]?.deck;
    if (!deck) throw new Error(`the ships manifest has no deck for "${entry.ship}"`);
    const [x, y] = pointOf(entry.at);
    const lying = { x, y, heading: entry.heading * RADIANS, scale: entry.scale, heave: 0, pitch: 0, roll: 0 };
    return { ship: entry.ship, lying, blocks: deckBlocks(deckOf(deck), { lying, cuts: entry.cuts.map(areaOf) }) };
  });
  const scenery = file.blocks.map((entry) => {
    const kind = KINDS.find((known) => known === entry.kind);
    if (!kind) throw new Error(`a wreck's block is of no kind it draws: "${entry.kind}"`);
    return { kind, block: blockOf(entry.box) };
  });
  const [wakeX = 0, wakeY = 0, wakeFacing = 0] = file.wake;
  const zones = file.zones.map((zone) => ({
    name: zone.name,
    area: areaOf(zone.area),
    checkpoint: pointOf(zone.checkpoint),
    gate: zone.gate ? blockOf(zone.gate) : null,
    wave: zone.wave.map((foe) => ({ ...foe, at: pointOf(foe.at), facing: foe.facing * RADIANS })),
  }));
  const gate = zones[file.arena.zone - 1]?.gate;
  if (!gate) throw new Error("no gate closes the way into the wreck's arena");
  return {
    decks: laid.flatMap((ship) => ship.blocks),
    scenery,
    wake: { at: [wakeX, wakeY], facing: wakeFacing * RADIANS },
    path: file.path.map(pointOf),
    zones,
    arena: { zone: file.arena.zone, gate, thule: pointOf(file.arena.thule) },
    fires: file.fires.map((fire) => {
      const [x = 0, y = 0, z = 0] = fire.at;
      return { at: [x, y, z], size: fire.size };
    }),
    ships: laid.map(({ ship, lying }) => ({ ship, lying })),
  };
}

/** The layout moved to stand at `origin` (x, y) in the world. */
export function layoutAt(layout: WreckLayout, [east, south]: Point): WreckLayout {
  const point = ([x, y]: Point): Point => [x + east, y + south];
  const block = (found: CourseBlock): CourseBlock => ({
    ...found,
    minX: found.minX + east,
    maxX: found.maxX + east,
    minY: found.minY + south,
    maxY: found.maxY + south,
  });
  const area = ([minX, minY, maxX, maxY]: Area): Area => [minX + east, minY + south, maxX + east, maxY + south];
  return {
    decks: layout.decks.map(block),
    scenery: layout.scenery.map((found) => ({ ...found, block: block(found.block) })),
    wake: { ...layout.wake, at: point(layout.wake.at) },
    path: layout.path.map(point),
    zones: layout.zones.map((zone) => ({
      ...zone,
      area: area(zone.area),
      checkpoint: point(zone.checkpoint),
      gate: zone.gate && block(zone.gate),
      wave: zone.wave.map((foe) => ({ ...foe, at: point(foe.at) })),
    })),
    arena: { ...layout.arena, gate: block(layout.arena.gate), thule: point(layout.arena.thule) },
    fires: layout.fires.map((fire) => ({ ...fire, at: [fire.at[0] + east, fire.at[1] + south, fire.at[2]] })),
    ships: layout.ships.map((shown) => ({
      ...shown,
      lying: { ...shown.lying, x: shown.lying.x + east, y: shown.lying.y + south },
    })),
  };
}

/** Every block a body stands on in the wreck: both decks and what shows on them. */
export function courseOf(layout: WreckLayout): CourseBlock[] {
  return [...layout.decks, ...layout.scenery.map((found) => found.block)];
}

/** The top a body stands on at (x, y) among `blocks`, from as high as it may be: 0, the sea, where none stands. */
export function topAt(blocks: readonly CourseBlock[], x: number, y: number): number {
  let top = 0;
  for (const block of blocks)
    if (x >= block.minX && x <= block.maxX && y >= block.minY && y <= block.maxY) top = Math.max(top, block.top);
  return top;
}

/** Whether (x, y) lies in an area. */
export function inArea([minX, minY, maxX, maxY]: Area, x: number, y: number): boolean {
  return x >= minX && x <= maxX && y >= minY && y <= maxY;
}
