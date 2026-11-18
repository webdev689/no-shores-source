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

/** A speck of the figure the piece leaves showing (a collar's skin, a strand of hair) is any part of what differs that
 *  stands apart from the rest and is smaller than this share of the largest part; it is left out. */
const SPECK = 0.03;

/** The pixels `worn` shows that `bare` does not, the two lined up by their feet, on a clear ground and cropped round
 *  them, less any speck apart from the piece, and, for a piece in one (a weapon or a shield), any part standing away
 *  from its largest (a sheath at the hip beside a sword's blade and grip); null if none differ. A worn piece can widen a frame, so the two need not be the same size. */
export function addedBy(worn: Picture, bare: Picture, onePiece = false): Picture | null {
  const { width, height } = worn;
  const [wornX, wornY] = worn.root ?? [0, 0];
  const [bareX, bareY] = bare.root ?? [0, 0];
  const differs = (column: number, row: number) => {
    const spot = (row * width + column) * 4;
    if (worn.pixels[spot + 3] === 0) return false;
    const [across, down] = [column - wornX + bareX, row - wornY + bareY];
    const outside = across < 0 || down < 0 || across >= bare.width || down >= bare.height;
    if (outside) return true;
    const under = (down * bare.width + across) * 4;
    return [0, 1, 2, 3].some((channel) => worn.pixels[spot + channel] !== bare.pixels[under + channel]);
  };
  const kept = withoutSpecks(width, height, differs, onePiece);
  let [west, north, east, south] = [width, height, -1, -1];
  for (let row = 0; row < height; row++)
    for (let column = 0; column < width; column++)
      if (kept[row * width + column]) {
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
      if (!kept[(north + row) * width + west + column]) continue;
      const from = ((north + row) * width + west + column) * 4;
      pixels.set(worn.pixels.subarray(from, from + 4), (row * cropWidth + column) * 4);
    }
  return { width: cropWidth, height: cropHeight, pixels };
}

/** How near a part must stand to a piece's largest to be the piece's, by the largest's longer side. */
const NEAR = 0.25;

/** Which pixels of a `width` by `height` mask to keep: those `marked`, in parts joined at an edge or a corner, less
 *  every part smaller than `SPECK` of the largest, or, with `nearOnly`, every part that does not touch the largest's
 *  bounds grown by `NEAR` of its longer side. */
function withoutSpecks(
  width: number,
  height: number,
  marked: (column: number, row: number) => boolean,
  nearOnly: boolean,
): Uint8Array {
  const part = new Int32Array(width * height).fill(-1);
  const sizes: number[] = [];
  const bounds: [number, number, number, number][] = [];
  for (let start = 0; start < width * height; start++) {
    if (part[start] !== -1 || !marked(start % width, Math.floor(start / width))) continue;
    const label = sizes.length;
    const stack = [start];
    part[start] = label;
    let size = 0;
    const box: [number, number, number, number] = [width, height, -1, -1];
    while (stack.length > 0) {
      const spot = stack.pop() ?? 0;
      size++;
      const [column, row] = [spot % width, Math.floor(spot / width)];
      [box[0], box[1], box[2], box[3]] = [
        Math.min(box[0], column),
        Math.min(box[1], row),
        Math.max(box[2], column),
        Math.max(box[3], row),
      ];
      for (let down = -1; down <= 1; down++)
        for (let across = -1; across <= 1; across++) {
          const [near, nearRow] = [column + across, row + down];
          if (near < 0 || nearRow < 0 || near >= width || nearRow >= height) continue;
          const next = nearRow * width + near;
          if (part[next] !== -1 || !marked(near, nearRow)) continue;
          part[next] = label;
          stack.push(next);
        }
    }
    sizes.push(size);
    bounds.push(box);
  }
  const largest = Math.max(...sizes, 0);
  const [west, north, east, south] = bounds[sizes.indexOf(largest)] ?? [0, 0, -1, -1];
  const margin = NEAR * Math.max(east - west + 1, south - north + 1);
  const near = (label: number) => {
    const [left, top, right, bottom] = bounds[label] ?? [0, 0, -1, -1];
    return right >= west - margin && left <= east + margin && bottom >= north - margin && top <= south + margin;
  };
  const kept = (label: number) => (sizes[label] ?? 0) >= largest * SPECK && (!nearOnly || near(label));
  return Uint8Array.from(part, (label) => (label >= 0 && kept(label) ? 1 : 0));
}
