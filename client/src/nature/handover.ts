// The hand-over between a plant's near mesh and its far quad, as natureShader.ts works it out on the GPU (its
// placed_of and coverage): kept here too so the split is tested.

const smooth = (from: number, to: number, value: number) => {
  const share = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return share * share * (3 - 2 * share);
};

/** The near mesh's share of a plant `acrossM` from the eye across the ground: all of it short of the band, none
 *  past its range; the far quad takes the rest. */
export function nearShare(acrossM: number, nearM: number, bandM: number): number {
  return 1 - smooth(nearM - bandM, nearM, acrossM);
}

/** The samples (of four, as bits) a share of a pixel covers: dithered over two pixels, starting at a sample that
 *  turns with the pixel. The far quad takes the samples the near mesh leaves. */
export function coverage(share: number, x: number, y: number, turn: number): number {
  const dither = [0.125, 0.625, 0.875, 0.375];
  const count = Math.min(4, Math.max(0, Math.floor(share * 4 + (dither[(x & 1) + 2 * (y & 1)] ?? 0))));
  const run = (1 << count) - 1;
  const start = (x + 3 * y + turn) & 3;
  return ((run << start) | (run >> (4 - start))) & 15;
}
