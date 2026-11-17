// The forges' tables, as content/forged holds them: each piece's measures, keyed by its classic model id. A page
// fetches and parses the file it needs and hands the parsed table to the forge.
import type { Picture } from './model.ts';

/** A measured point: x, y, z in metres, in the classic model's frame. */
export type Measured = readonly [number, number, number];

/** A door as measured: three corners of its face (`a`, `b`, `c`), its normal `n`, and its index where that is not
 *  its place in the list. */
export type MeasuredDoor = {
  readonly type: number;
  readonly index?: number;
  readonly a: Measured;
  readonly b: Measured;
  readonly c: Measured;
  readonly n: Measured;
};

/** A plan's rectangle on its grid: first column, first row, end column, end row, and a step's own top. */
export type PlanRect = readonly [column0: number, row0: number, column1: number, row1: number, stepTop?: number];

/** A wing of a plan: squares whose tops run on smoothly. `low` is a covered way's underside; `steps` and
 *  `platform` mark a flight or a low platform. */
export type Wing = {
  readonly low?: number;
  readonly steps?: boolean;
  readonly platform?: boolean;
  readonly eaves: number;
  readonly ridge: number;
  readonly rects: readonly PlanRect[];
};

/** A town building: its box, its plan's grid (columns along x, rows along z), its pictures, its doors and its plan. */
export type BuildingMeasure = {
  readonly min: Measured;
  readonly max: Measured;
  readonly grid: readonly [columns: number, rows: number];
  readonly walls: readonly Picture[];
  readonly glass?: Picture;
  readonly roofs: readonly Picture[];
  readonly looks: readonly Picture[];
  readonly doors?: readonly MeasuredDoor[];
  readonly doorLook?: Picture | null;
  readonly plan: readonly Wing[];
};

/** A tall rock's top: heights in centimetres over its floor on a grid of nodes, and its peak's x and z. */
export type Relief = {
  readonly grid: readonly [columns: number, rows: number];
  readonly peak: readonly [x: number, z: number];
  readonly tops: readonly number[];
};

/** A prop: its box, the pictures it wears most, its doors, a board's top cover (bit per quarter), a canopy bed's
 *  bedding and a tall rock's relief. */
export type PropMeasure = {
  readonly min: Measured;
  readonly max: Measured;
  readonly looks: readonly Picture[];
  readonly doors?: readonly MeasuredDoor[];
  readonly doorLook?: Picture | null;
  readonly cover?: number;
  readonly bedding?: Picture;
  readonly relief?: Relief;
};

/** A face square to an axis: its side (0 -x, 1 +x, 2 -y, 3 +y, 4 -z, 5 +z), its plane, its span on the other two
 *  axes in order, and its picture's place in `pictures`. */
export type KitFace = readonly [
  side: number,
  plane: number,
  acrossFrom: number,
  alongFrom: number,
  acrossTo: number,
  alongTo: number,
  picture: number,
];

/** A piece of the rooms' kit: its box, its pictures, its square faces, its sloped triangles (picture, then nine
 *  numbers: three corners) and its doors. */
export type KitMeasure = {
  readonly min: Measured;
  readonly max: Measured;
  readonly pictures: readonly Picture[];
  readonly faces: readonly KitFace[];
  readonly sloped?: readonly (readonly number[])[];
  readonly doors?: readonly MeasuredDoor[];
};

export type BuildingTable = Readonly<Record<string, BuildingMeasure>>;
export type PropTable = Readonly<Record<string, PropMeasure>>;
export type KitTable = Readonly<Record<string, KitMeasure>>;
