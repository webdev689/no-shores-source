// The held map's painting (public/art/held-map.png) as the first-person forge reads it (specs/HELDMAP.json): sampled
// at its own grid, and its texels told glove from parchment. Pure: reference.mjs reads the file, tests make their own.

/**
 * The held map's painting (public/art/held-map.png): 6 a glove, 7 the parchment, 0 clear. A glove is dark and dull
 * (its leather is olive; the parchment's burnt rim is as dark but saturated) and reaches the picture's foot, where the
 * forearms run off it; a dark, dull speck on the sheet is a stain.
 * @param {{width: number, height: number, data: Uint8Array}} img RGBA, rows top first
 */
export function heldClasses(img) {
  const { width: w, height: h, data } = img;
  const on = (i) => data[i * 4 + 3] >= 128;
  const dark = new Uint8Array(w * h);
  let foot = 0;
  for (let i = 0; i < w * h; i++) {
    if (!on(i)) continue;
    foot = Math.max(foot, Math.floor(i / w));
    const [r, g, b] = data.subarray(i * 4, i * 4 + 3);
    const hi = Math.max(r, g, b), lo = Math.min(r, g, b);
    dark[i] = (r + g + b) / 3 < 125 && (hi - lo) / Math.max(hi, 1) < 0.58 ? 1 : 0;
  }
  const glove = new Uint8Array(w * h), seen = new Uint8Array(w * h);
  for (let s = 0; s < w * h; s++) {   // each dark piece, kept if it reaches the foot's band
    if (!dark[s] || seen[s]) continue;
    const piece = [s];
    seen[s] = 1;
    let low = 0;
    for (let k = 0; k < piece.length; k++) {
      const i = piece[k], x = i % w, y = (i - x) / w;
      low = Math.max(low, y);
      for (const [xx, yy] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        const j = yy * w + xx;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && dark[j] && !seen[j]) { seen[j] = 1; piece.push(j); }
      }
    }
    if (low >= foot - Math.round(0.1 * h)) for (const i of piece) glove[i] = 1;
  }
  for (let pass = 0; pass < 2; pass++) {   // a highlight or a stitch on the glove, mostly ringed by it, is the glove's
    const was = glove.slice();
    for (let i = 0; i < w * h; i++) {
      const x = i % w, y = (i - x) / w;
      if (was[i] || !on(i) || x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
      if (was[i - 1] + was[i + 1] + was[i - w] + was[i + w] >= 3) glove[i] = 1;
    }
  }
  return Uint8Array.from({ length: w * h }, (_, i) => (!on(i) ? 0 : glove[i] ? 6 : 7));
}

/** A picture sampled at its own grid: a painting drawn `grid` times its size, read a texel a block, at its middle. */
export function gridded(img, grid) {
  if (!grid || grid === 1) return img;
  const w = Math.floor(img.width / grid), h = Math.floor(img.height / grid), data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const at = ((y * grid + (grid >> 1)) * img.width + x * grid + (grid >> 1)) * 4;
      data.set(img.data.subarray(at, at + 4), (y * w + x) * 4);
    }
  }
  return { width: w, height: h, data };
}
