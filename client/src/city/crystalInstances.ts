// A ruin's crystal formations laid out as model instances, the way the city's GPU draws them: the great ones in one
// run a formation, drawn at every distance; the middle distance's a formation at a time and a chunk at a time, so the
// view draws only the chunks within `MIDDLE_M`, each formation's chunks joined into as few draws as run.
import { type Chunk, type Range, runs as runsOf } from './cityBuild.ts';
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

/** The crystal's instances: their bytes, the great formations' draws, and each chunk's middle-distance runs (by
 *  formation, as `middle[chunk][formation]`). */
export type CrystalInstances = {
  readonly bytes: ArrayBuffer;
  readonly great: readonly InstancedDraw[];
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

/** Lays the great and middle-distance formations out: the great by formation, the middle by formation then chunk. */
export function crystalInstances(
  great: readonly CrystalPlace[],
  middle: readonly { readonly chunk: number; readonly place: CrystalPlace }[],
  origin: readonly number[],
  firstModel: number,
  formations: number,
  chunkCount: number,
): CrystalInstances {
  const greatSorted = [...great].sort((a, b) => a.formation - b.formation);
  const middleSorted = [...middle].sort((a, b) => a.place.formation - b.place.formation || a.chunk - b.chunk);
  const bytes = new ArrayBuffer(Math.max(1, greatSorted.length + middleSorted.length) * MODEL_INSTANCE_BYTES);
  writeInstances(greatSorted, origin, bytes);
  writeInstances(
    middleSorted.map((each) => each.place),
    origin,
    bytes,
    greatSorted.length,
  );
  const draws = drawsByFormation(greatSorted, firstModel);
  const ranges = Array.from({ length: chunkCount }, () =>
    Array.from({ length: formations }, (): Range => ({ first: 0, count: 0 })),
  );
  middleSorted.forEach(({ chunk, place }, index) => {
    const range = ranges[chunk][place.formation];
    if (range.count === 0) range.first = greatSorted.length + index;
    range.count++;
  });
  return { bytes, great: draws, middle: ranges };
}

/** The middle distance's instance runs to draw for some chunks seen from `eye` (from the city's middle): those of
 *  the chunks within `MIDDLE_M`, a formation's chunks joined where their runs meet. */
export function middleDraws(
  chunks: readonly Chunk[],
  middle: readonly (readonly Range[])[],
  eye: readonly number[],
  firstModel: number,
): InstancedDraw[] {
  const near = chunks.filter((chunk) => {
    const low = [0, 1, 2].map((axis) => chunk.middlesLow[axis] - eye[axis]);
    const high = [0, 1, 2].map((axis) => chunk.middlesHigh[axis] - eye[axis]);
    return boxReach(low, high).nearest < MIDDLE_M;
  });

  const draws: InstancedDraw[] = [];
  const formations = middle[0]?.length ?? 0;
  for (let formation = 0; formation < formations; formation++) {
    const runs = runsOf(near.map((chunk) => middle[chunk.index]?.[formation] ?? { first: 0, count: 0 }));
    for (const run of runs) draws.push({ model: firstModel + formation, first: run.first, count: run.count });
  }
  return draws;
}
