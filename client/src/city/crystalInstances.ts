// A ruin's crystal formations laid out as model instances, the way the city's GPU draws them: a formation at a time
// and a chunk at a time, so the view draws only the chunks it sees (the great ones at every distance, the middle
// distance's within `MIDDLE_M`), each formation's chunks joined into as few draws as run.
import type { Chunk, Range } from './cityBuild.ts';
import { MODEL_INSTANCE_BYTES } from './cityGpu.ts';
import type { CrystalPlace } from './overtaken.ts';
import { boxReach } from './tiers.ts';

/** How far from the eye a chunk's middle-distance crystal is drawn, metres: past the near cells, to where a heavily
 *  overtaken building's crystal is a few pixels. */
export const MIDDLE_M = 1200;

/** The tier the city's shaders keep a crystal formation in: never dithered (cityShaders.ts TIER_CRYSTAL). */
export const TIER_CRYSTAL = 8;

/** A model drawn by instance: which, and its instances' run in the buffer. */
export type InstancedDraw = { readonly model: number; readonly first: number; readonly count: number };

/** The crystal's instances: their bytes, and each chunk's runs of them by formation, as `great[chunk][formation]`
 *  (drawn wherever the chunk is seen) and `middle[chunk][formation]` (within `MIDDLE_M` of the eye). */
export type CrystalInstances = {
  readonly bytes: ArrayBuffer;
  readonly great: readonly (readonly Range[])[];
  readonly middle: readonly (readonly Range[])[];
};

/** Writes formations placed in the world as instances, measured from the city's middle (`origin`), formation
 *  `formation` drawn as model `firstModel + formation`. */
export function writeInstances(
  places: readonly CrystalPlace[],
  origin: readonly number[],
  bytes: ArrayBuffer,
  first = 0,
): void {
  const [floats, whole] = [new Float32Array(bytes), new Uint32Array(bytes)];
  const stride = MODEL_INSTANCE_BYTES / 4;
  places.forEach((place, index) => {
    const slot = (first + index) * stride;
    floats.set([place.at[0] - origin[0], place.at[1] - origin[1], place.at[2], place.yaw], slot);
    whole[slot + 4] = 0;
    whole[slot + 5] = TIER_CRYSTAL;
    floats[slot + 6] = 0;
    floats[slot + 7] = place.scale;
  });
}

/** The draws of formations sorted by formation, a run of each laid from instance `first`, drawn as model
 *  `firstModel + formation`. */
export function drawsByFormation(sorted: readonly CrystalPlace[], firstModel: number, first = 0): InstancedDraw[] {
  const draws: InstancedDraw[] = [];
  sorted.forEach((place, index) => {
    const last = draws[draws.length - 1];
    if (last && last.model === firstModel + place.formation)
      draws[draws.length - 1] = { ...last, count: last.count + 1 };
    else draws.push({ model: firstModel + place.formation, first: first + index, count: 1 });
  });
  return draws;
}

/** A formation placed in a chunk. */
type InChunk = { readonly chunk: number; readonly place: CrystalPlace };

/** Lays the great and the middle-distance formations out, each a formation then a chunk at a time, and their runs. */
export function crystalInstances(
  great: readonly InChunk[],
  middle: readonly InChunk[],
  origin: readonly number[],
  formations: number,
  chunkCount: number,
): CrystalInstances {
  const byFormation = (a: InChunk, b: InChunk) => a.place.formation - b.place.formation || a.chunk - b.chunk;
  const sorted = [...great].sort(byFormation).concat([...middle].sort(byFormation));
  const bytes = new ArrayBuffer(Math.max(1, sorted.length) * MODEL_INSTANCE_BYTES);
  writeInstances(
    sorted.map((each) => each.place),
    origin,
    bytes,
  );
  const ranges = () =>
    Array.from({ length: chunkCount }, () => Array.from({ length: formations }, (): Range => ({ first: 0, count: 0 })));
  const [greatRanges, middleRanges] = [ranges(), ranges()];
  sorted.forEach(({ chunk, place }, index) => {
    const range = (index < great.length ? greatRanges : middleRanges)[chunk][place.formation];
    if (range.count === 0) range.first = index;
    range.count++;
  });
  return { bytes, great: greatRanges, middle: middleRanges };
}

/** Whether a chunk's middle-distance crystal is drawn from `eye` (from the city's middle): within `MIDDLE_M`. */
export const withinMiddle = (chunk: Chunk, eye: readonly number[]): boolean =>
  boxReach(
    [chunk.middlesLow[0] - eye[0], chunk.middlesLow[1] - eye[1], chunk.middlesLow[2] - eye[2]],
    [chunk.middlesHigh[0] - eye[0], chunk.middlesHigh[1] - eye[1], chunk.middlesHigh[2] - eye[2]],
  ).nearest < MIDDLE_M;

/** The instance runs to draw of some chunks' crystal (`byChunk[chunk][formation]`), a formation's chunks joined
 *  where their runs meet, laid into `into` (emptied first, so a view keeps one list a pass). */
export function chunkDraws(
  chunks: readonly Chunk[],
  byChunk: readonly (readonly Range[])[],
  firstModel: number,
  into: InstancedDraw[],
): InstancedDraw[] {
  into.length = 0;
  const formations = byChunk[0]?.length ?? 0;
  for (let formation = 0; formation < formations; formation++) {
    let [first, count] = [0, 0];
    for (const chunk of chunks) {
      const range = byChunk[chunk.index]?.[formation];
      if (!range?.count) continue;
      if (count && first + count === range.first) count += range.count;
      else {
        if (count) into.push({ model: firstModel + formation, first, count });
        [first, count] = [range.first, range.count];
      }
    }
    if (count) into.push({ model: firstModel + formation, first, count });
  }
  return into;
}
