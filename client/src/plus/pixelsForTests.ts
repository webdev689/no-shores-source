// Reads a picture the kit draws back into its pixels, for the tests: its size, each pixel's tone by "x,y", and the SVG.

/** A pixel picture's data URL as its size, its pixels by "x,y" and its SVG's text. */
export function pixelsOf(url: string) {
  const svg = decodeURIComponent(url.replace('data:image/svg+xml,', ''));
  const size = /width='(\d+)' height='(\d+)'/.exec(svg);
  const pixels = new Map<string, string>();
  for (const [, x, y, fill] of svg.matchAll(/<rect x='(\d+)' y='(\d+)' width='1' height='1' fill='([^']+)'\/>/g))
    pixels.set(`${x},${y}`, fill ?? '');
  return { width: Number(size?.[1]), height: Number(size?.[2]), pixels, svg };
}
