import wreck from '../../../../content/prologue/wreck.json' with { type: 'json' };
import type { CourseBlock } from '../../../../server/roomDoor.ts';
import type { HullMask } from '../../water/hullMask.ts';

type Point = readonly [number, number];
export type Area = readonly [number, number, number, number];

/** A foe of the roster in a wave: its type and rank as the roster numbers them, where it stands, and the way it
 *  faces (radians clockwise from north). */
export interface WaveFoe {
  readonly type: number;
  readonly rank: number;
  readonly at: Point;
  readonly facing: number;
}

/** A stretch of the path: the area that, entered, reaches it, the checkpoint the player comes back to from it, the
 *  heap of wreckage that closes the way on from it until its wave has fallen (none for the quiet deck the player wakes
 *  on, nor the arena), the foes it holds, and where three of the Brig's crew stand fighting them. */
export interface Zone {
  readonly name: string;
  readonly area: Area;
  readonly checkpoint: Point;
  readonly gate: CourseBlock | null;
  readonly wave: readonly WaveFoe[];
  readonly crew: readonly Point[];
}

/** Whether a deck crew's roster type fights for the Grey Tithe (7 to 12); the pirates' are 13 to 17. */
export const titheCrew = (type: number): boolean => type >= 7 && type <= 12;

/** A fire burning in the wreck: where its base burns, how big it is, metres, and, for one burning along a line (a
 *  yard, a rail, a strip of canvas), the line from its base to its far end. */
export interface Fire {
  readonly at: readonly [number, number, number];
  readonly size: number;
  readonly along: readonly [number, number, number] | null;
}

/**
 * The wreck as the level plays it, in world metres (x east, y south, z up over the sea): the ground a body stands on
 * as blocks, measured from the wreck's model (tools/wreck/export_wreck.py); where the player wakes and the way they
 * face; the path from there to the arena, as points; the zones along it; the arena's zone, the gate that closes its
 * way in, and where Thule stands; the fires; where its masts still stand; the camera's way back to the player after
 * its flight down the wreck (points and heights over the sea); where no sea is drawn, its ships' waterlines and its
 * rafts, which the swell would rise through; and the keys on R2 of its mesh and its baked light.
 */
export interface WreckLayout {
  readonly course: readonly CourseBlock[];
  readonly wake: { readonly at: Point; readonly facing: number };
  readonly path: readonly Point[];
  readonly zones: readonly Zone[];
  readonly arena: { readonly zone: number; readonly gate: CourseBlock; readonly thule: Point };
  readonly fires: readonly Fire[];
  readonly masts: readonly Point[];
  readonly flightBack: readonly (readonly [number, number, number])[];
  readonly dry: readonly HullMask[];
  readonly drawn: { readonly mesh: string; readonly light: string };
}

const RADIANS = Math.PI / 180;

/** A block from a box's west, north, east and south edges and its top. */
function blockOf([minX = 0, minY = 0, maxX = 0, maxY = 0, top = 0]: readonly number[]): CourseBlock {
  return { minX, minY, maxX, maxY, top };
}

const pointOf = ([x = 0, y = 0]: readonly number[]): Point => [x, y];
const areaOf = ([minX = 0, minY = 0, maxX = 0, maxY = 0]: readonly number[]): Area => [minX, minY, maxX, maxY];

/** The file's layout, as `content/prologue/wreck.json` holds it: facings in degrees. */
type WreckFile = typeof wreck;

/** Reads a wreck's file into its layout at the world's origin; throws on an arena no gate closes. The arena's gate is
 *  the heap across the way into it, the zone before it's. */
export function readWreck(file: WreckFile = wreck): WreckLayout {
  const [wakeX = 0, wakeY = 0, wakeFacing = 0] = file.wake;
  const zones = file.zones.map((zone) => ({
    name: zone.name,
    area: areaOf(zone.area),
    checkpoint: pointOf(zone.checkpoint),
    gate: zone.gate ? blockOf(zone.gate) : null,
    wave: zone.wave.map((foe) => ({ ...foe, at: pointOf(foe.at), facing: foe.facing * RADIANS })),
    crew: zone.crew.map(pointOf),
  }));
  const gate = zones[file.arena.zone - 1]?.gate;
  if (!gate) throw new Error("no gate closes the way into the wreck's arena");
  return {
    course: file.course,
    wake: { at: [wakeX, wakeY], facing: wakeFacing * RADIANS },
    path: file.path.map(pointOf),
    zones,
    arena: { zone: file.arena.zone, gate, thule: pointOf(file.arena.thule) },
    fires: file.fires.map((fire) => {
      const [x = 0, y = 0, z = 0] = fire.at;
      const along = 'along' in fire ? fire.along : null;
      return { at: [x, y, z], size: fire.size, along: along ? [along[0] ?? 0, along[1] ?? 0, along[2] ?? 0] : null };
    }),
    masts: file.masts.map(pointOf),
    flightBack: file.flightBack.map(([x = 0, y = 0, z = 0]) => [x, y, z] as const),
    dry: file.dry.map(([x = 0, y = 0, heading = 0, halfLength = 0, halfBeam = 0]) => ({
      x,
      y,
      heading,
      halfLength,
      halfBeam,
      way: 0,
    })),
    drawn: { mesh: file.mesh, light: file.light },
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
    ...layout,
    course: layout.course.map(block),
    wake: { ...layout.wake, at: point(layout.wake.at) },
    path: layout.path.map(point),
    zones: layout.zones.map((zone) => ({
      ...zone,
      area: area(zone.area),
      checkpoint: point(zone.checkpoint),
      gate: zone.gate && block(zone.gate),
      wave: zone.wave.map((foe) => ({ ...foe, at: point(foe.at) })),
      crew: zone.crew.map(point),
    })),
    arena: { ...layout.arena, gate: block(layout.arena.gate), thule: point(layout.arena.thule) },
    fires: layout.fires.map((fire) => ({ ...fire, at: [fire.at[0] + east, fire.at[1] + south, fire.at[2]] })),
    masts: layout.masts.map(point),
    flightBack: layout.flightBack.map(([x, y, z]) => [x + east, y + south, z] as const),
    dry: layout.dry.map((mask) => ({ ...mask, x: mask.x + east, y: mask.y + south })),
  };
}

/** Every block a body stands on in the wreck, its heaps aside. */
export function courseOf(layout: WreckLayout): readonly CourseBlock[] {
  return layout.course;
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
