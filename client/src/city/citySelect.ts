// What a city's frame draws and casts, worked out once a frame for its shadows' passes and its own: the chunks the
// view sees and those that may cast into each square, and of their cells those within the whole tier's reach, each
// test a box measured from the eye. Every list is the selector's own, laid afresh each frame, so a frame makes none.
import { boxSeen, viewPlanes } from '../frustum.ts';
import { FAR, NEAR, type ShadowMap } from '../shadow.ts';
import { type Chunk, type CityData, type Range, runs } from './cityBuild.ts';
import { NEAR_M, type Reach, reachesHulls, reachesMasses, reachesWhole, reachFrom } from './tiers.ts';

/** Some of the city's chunks, and of their cells within the whole tier's reach. */
type Selection = { readonly chunks: Chunk[]; readonly cells: number[] };
/** Which of a frame's selections: what the view sees, and what may cast into the near square and into the far one. */
type Holding = 'view' | 'near' | 'far';
/** The selections whose near cells draw their models: the far square casts buildings by their masses. */
export type Modelled = Exclude<Holding, 'far'>;
/** What a frame draws, from the view-projection it was selected for. */
export type Seen = { fromEye: Float32Array | null } & Record<Holding, Selection>;
/** A box measured from the eye. */
type Box = [number, number, number];

const HOLDINGS: readonly Holding[] = ['view', 'near', 'far'];
/** How far a near cell's box reaches past its middle: half a block and its props' overhang across, and its depth. */
const CELL_HALF_M = 51.2 + 10;
const CELL_BELOW_M = 5;
const CELL_ABOVE_M = 70;

/** A chunk's solids, as a run of the solids' buffer. */
export const solidsOf = (chunk: Chunk): Range => chunk.solids;
const itself = (range: Range): Range => range;
/** Whether two lists of cells are the same, in the same order. */
export const sameCells = (one: readonly number[], other: readonly number[]): boolean =>
  one.length === other.length && one.every((cell, place) => cell === other[place]);

export class CitySelector {
  private readonly seen: Seen = {
    fromEye: null,
    view: { chunks: [], cells: [] },
    near: { chunks: [], cells: [] },
    far: { chunks: [], cells: [] },
  };
  private readonly planes = new Float64Array(24);
  private readonly reach: Reach = { nearest: 0, farthest: 0 };
  private readonly low: Box = [0, 0, 0];
  private readonly high: Box = [0, 0, 0];
  private readonly massesListed: Range[] = [];
  private readonly hullsListed: Range[] = [];
  private readonly massesJoined: Range[] = [];
  private readonly hullsJoined: Range[] = [];

  /** What a frame drawn through `fromEye` from `eye` (measured from the city's middle) draws and casts, the casts
   *  only with a shadow map `casting`. Answers lists the selector keeps until its next frame. */
  select(
    data: Omit<CityData, 'solids' | 'night'>,
    fromEye: Float32Array,
    eye: readonly number[],
    casting: ShadowMap | null,
  ): Seen {
    const planes = viewPlanes(fromEye, this.planes);
    const { seen, low, high, reach } = this;
    seen.fromEye = fromEye;
    for (const holding of HOLDINGS) {
      seen[holding].chunks.length = 0;
      seen[holding].cells.length = 0;
    }
    const { cells: middles } = data;
    for (const chunk of data.chunks) {
      for (let axis = 0; axis < 3; axis++) {
        low[axis] = chunk.low[axis]! - eye[axis]!;
        high[axis] = chunk.high[axis]! - eye[axis]!;
      }
      const inView = boxSeen(planes, low, high);
      const inNear = !!casting?.reaches(low, high, NEAR);
      const inFar = !!casting?.reaches(low, high, FAR);
      if (!inView && !inNear && !inFar) continue;
      if (inView) seen.view.chunks.push(chunk);
      if (inNear) seen.near.chunks.push(chunk);
      if (inFar) seen.far.chunks.push(chunk);
      if (reachFrom(chunk.middlesLow, chunk.middlesHigh, eye, reach).nearest >= NEAR_M) continue;
      for (const cell of chunk.cells) {
        const offsetX = middles[cell * 4]! - eye[0]!;
        const offsetY = middles[cell * 4 + 1]! - eye[1]!;
        const offsetZ = middles[cell * 4 + 2]! - eye[2]!;
        if (Math.sqrt(offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ) >= NEAR_M) continue;
        low[0] = offsetX - CELL_HALF_M;
        low[1] = offsetY - CELL_HALF_M;
        low[2] = offsetZ - CELL_BELOW_M;
        high[0] = offsetX + CELL_HALF_M;
        high[1] = offsetY + CELL_HALF_M;
        high[2] = offsetZ + CELL_ABOVE_M;
        if (inView && boxSeen(planes, low, high)) seen.view.cells.push(cell);
        if (inNear && casting?.reaches(low, high, NEAR)) seen.near.cells.push(cell);
      }
    }
    return seen;
  }

  /** The masses and hulls of some chunks, by the tiers the eye's distance draws them in, each joined into runs;
   *  `standIn` takes the masses for the whole tier too, as the far shadow casts it. */
  massRuns(
    chunks: readonly Chunk[],
    eye: readonly [number, number, number],
    standIn = false,
  ): readonly [readonly Range[], readonly Range[]] {
    const [masses, hulls] = [this.massesListed, this.hullsListed];
    masses.length = 0;
    hulls.length = 0;
    for (const chunk of chunks) {
      const { nearest, farthest } = reachFrom(chunk.middlesLow, chunk.middlesHigh, eye, this.reach);
      if (reachesMasses(nearest, farthest) || (standIn && reachesWhole(nearest))) masses.push(chunk.masses);
      if (reachesHulls(farthest)) hulls.push(chunk.hulls);
    }
    return [runs(masses, itself, this.massesJoined), runs(hulls, itself, this.hullsJoined)];
  }
}
