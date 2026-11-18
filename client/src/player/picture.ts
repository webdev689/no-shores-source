// Pictures for the page from the forge's figures: a figure's frame as plain pixels, and an item's own picture, the
// pixels its layers add to the figure, cropped round them. So an item is drawn as the forge draws it worn, its icon
// and its large picture alike, with no art apart from the forge's.

/** A picture as plain pixels, four bytes each (red, green, blue, alpha), a row at a time. */
export interface Picture {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
  /** Where the figure's feet stand on it, so two frames of one figure line up; its top left when it has none. */
  readonly root?: readonly [number, number];
}

/** The pixels `worn` shows that `bare` does not, the two lined up by their feet, on a clear ground and cropped round
 *  them; null if none differ. A worn piece can widen a frame, so the two need not be the same size. */
export function addedBy(worn: Picture, bare: Picture): Picture | null {
  const { width, height } = worn;
  const [wornX, wornY] = worn.root ?? [0, 0];
  const [bareX, bareY] = bare.root ?? [0, 0];
  let [west, north, east, south] = [width, height, -1, -1];
  const differs = (column: number, row: number) => {
    const spot = (row * width + column) * 4;
    if (worn.pixels[spot + 3] === 0) return false;
    const [across, down] = [column - wornX + bareX, row - wornY + bareY];
    const outside = across < 0 || down < 0 || across >= bare.width || down >= bare.height;
    if (outside) return true;
    const under = (down * bare.width + across) * 4;
    return [0, 1, 2, 3].some((channel) => worn.pixels[spot + channel] !== bare.pixels[under + channel]);
  };
  for (let row = 0; row < height; row++)
    for (let column = 0; column < width; column++)
      if (differs(column, row)) {
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
      if (!differs(west + column, north + row)) continue;
      const from = ((north + row) * width + west + column) * 4;
      pixels.set(worn.pixels.subarray(from, from + 4), (row * cropWidth + column) * 4);
    }
  return { width: cropWidth, height: cropHeight, pixels };
}
