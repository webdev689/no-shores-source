// Pictures for the page from the forge's figures: a figure's frame as plain pixels, and an item's own picture, the
// pixels its layers add to the figure, cropped round them. So an item is drawn as the forge draws it worn, its icon
// and its large picture alike, with no art apart from the forge's.

/** A picture as plain pixels, four bytes each (red, green, blue, alpha), a row at a time. */
export interface Picture {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
}

/** The pixels `worn` shows that `bare` does not, on a clear ground and cropped round them; null if none differ or
 *  the two are not the same size. */
export function addedBy(worn: Picture, bare: Picture): Picture | null {
  if (worn.width !== bare.width || worn.height !== bare.height) return null;
  const { width, height } = worn;
  let [west, north, east, south] = [width, height, -1, -1];
  const differs = (spot: number) =>
    worn.pixels[spot + 3] !== 0 &&
    (worn.pixels[spot] !== bare.pixels[spot] ||
      worn.pixels[spot + 1] !== bare.pixels[spot + 1] ||
      worn.pixels[spot + 2] !== bare.pixels[spot + 2] ||
      worn.pixels[spot + 3] !== bare.pixels[spot + 3]);
  for (let row = 0; row < height; row++)
    for (let column = 0; column < width; column++)
      if (differs((row * width + column) * 4)) {
        west = Math.min(west, column);
        east = Math.max(east, column);
        north = Math.min(north, row);
        south = Math.max(south, row);
      }
  if (east < 0) return null;
  const [cropWidth, cropHeight] = [east - west + 1, south - north + 1];
  const pixels = new Uint8ClampedArray(cropWidth * cropHeight * 4);
  for (let row = 0; row < cropHeight; row++)
    for (let column = 0; column < cropWidth; column++) {
      const from = ((north + row) * width + west + column) * 4;
      if (!differs(from)) continue;
      pixels.set(worn.pixels.subarray(from, from + 4), (row * cropWidth + column) * 4);
    }
  return { width: cropWidth, height: cropHeight, pixels };
}
