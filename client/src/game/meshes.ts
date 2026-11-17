/** Each vertex of a mesh: its place (x, y, z), its face's normal, its colour (red, green, blue, 0..1), and how much of
 *  its owner's paint it takes instead (0..1). */
export const VERTEX_FLOATS = 10;

export type Vector = readonly [number, number, number];
export type Colour = readonly [number, number, number];

/** A mesh as it is built: flat triangles, each with its own normal. */
export class Builder {
  readonly values: number[] = [];

  triangle(a: Vector, b: Vector, third: Vector, colour: Colour, paint = 0): void {
    const [edgeX, edgeY] = [
      [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      [third[0] - a[0], third[1] - a[1], third[2] - a[2]],
    ] as const;
    const normal = [
      edgeX[1] * edgeY[2] - edgeX[2] * edgeY[1],
      edgeX[2] * edgeY[0] - edgeX[0] * edgeY[2],
      edgeX[0] * edgeY[1] - edgeX[1] * edgeY[0],
    ];
    const length = Math.hypot(...normal);
    if (length < 1e-9) return;
    for (const corner of [a, b, third])
      this.values.push(...corner, ...normal.map((part) => part / length), ...colour, paint);
  }

  /** A four-cornered face, its corners in order round it. */
  quad(a: Vector, b: Vector, third: Vector, fourth: Vector, colour: Colour, paint = 0): void {
    this.triangle(a, b, third, colour, paint);
    this.triangle(a, third, fourth, colour, paint);
  }

  /** A box square to its axes, from its low corner to its high. */
  box(low: Vector, high: Vector, colour: Colour, paint = 0): void {
    const corner = (x: number, y: number, z: number): Vector => [
      x ? high[0] : low[0],
      y ? high[1] : low[1],
      z ? high[2] : low[2],
    ];
    this.quad(corner(0, 0, 1), corner(1, 0, 1), corner(1, 1, 1), corner(0, 1, 1), colour, paint);
    this.quad(corner(0, 0, 0), corner(0, 1, 0), corner(1, 1, 0), corner(1, 0, 0), colour, paint);
    this.quad(corner(0, 0, 0), corner(1, 0, 0), corner(1, 0, 1), corner(0, 0, 1), colour, paint);
    this.quad(corner(1, 1, 0), corner(0, 1, 0), corner(0, 1, 1), corner(1, 1, 1), colour, paint);
    this.quad(corner(0, 1, 0), corner(0, 0, 0), corner(0, 0, 1), corner(0, 1, 1), colour, paint);
    this.quad(corner(1, 0, 0), corner(1, 1, 0), corner(1, 1, 1), corner(1, 0, 1), colour, paint);
  }
}

const HULL: Colour = [0.24, 0.16, 0.1];
const DECK: Colour = [0.6, 0.46, 0.3];
const TIMBER: Colour = [0.36, 0.25, 0.16];
const CANVAS: Colour = [0.93, 0.9, 0.82];
const WHITE: Colour = [1, 1, 1];

/**
 * The hull's stations from stern to bow: where along it (metres, + toward the bow), its half-beam at the deck and at
 * the keel, and the heights of its deck and keel over the waterline. The sheer rises toward both ends and the keel
 * sweeps up into the stem, so it reads as a ship from far above.
 */
const STATIONS: readonly (readonly [number, number, number, number, number])[] = [
  [-14, 3.0, 1.5, 2.9, -1.2],
  [-10, 3.4, 1.8, 2.4, -1.6],
  [-4, 3.6, 1.9, 2.2, -1.7],
  [2, 3.5, 1.7, 2.2, -1.7],
  [8, 2.9, 1.1, 2.4, -1.5],
  [12, 1.9, 0.45, 2.8, -0.9],
  [16, 0, 0, 3.4, 0.6],
];
/** Where the painted band under the rail ends, as a share of the way down from the deck to the keel. */
const BAND = 0.28;

/**
 * Overlook's ship, a small two-sailed trader of our own: its hull in local metres, x to starboard, y toward the bow,
 * z up from the waterline, about 30 m long and 7 m in the beam, its main mast 19 m up. The band under the rail and the
 * pennant take the owner's paint, so each player's ship reads as theirs.
 */
export function shipMesh(): Float32Array {
  const mesh = new Builder();
  const side = (sign: number, [along, deckHalf, keelHalf, deck, keel]: (typeof STATIONS)[number]) => {
    const band: Vector = [sign * (deckHalf + (keelHalf - deckHalf) * BAND), along, deck + (keel - deck) * BAND];
    return { rail: [sign * deckHalf, along, deck] as Vector, band, keel: [sign * keelHalf, along, keel] as Vector };
  };
  for (let i = 0; i + 1 < STATIONS.length; i++) {
    const [aft, fore] = [STATIONS[i], STATIONS[i + 1]];
    if (!aft || !fore) continue;
    for (const sign of [1, -1]) {
      const [from, to] = [side(sign, aft), side(sign, fore)];
      mesh.quad(from.rail, to.rail, to.band, from.band, WHITE, 1);
      mesh.quad(from.band, to.band, to.keel, from.keel, HULL);
    }
    const [aftPort, aftStarboard, forePort, foreStarboard] = [
      side(-1, aft),
      side(1, aft),
      side(-1, fore),
      side(1, fore),
    ];
    mesh.quad(aftPort.keel, aftStarboard.keel, foreStarboard.keel, forePort.keel, HULL);
    mesh.quad(aftPort.rail, forePort.rail, foreStarboard.rail, aftStarboard.rail, DECK);
  }
  const stern = STATIONS[0];
  if (stern) {
    const [port, starboard] = [side(-1, stern), side(1, stern)];
    mesh.quad(port.rail, starboard.rail, starboard.keel, port.keel, HULL);
  }
  // The stern castle, the main mast with its yard, a bowsprit and the forward mast.
  mesh.box([-2.6, -14, 2.4], [2.6, -9.5, 4.4], TIMBER);
  mesh.box([-0.25, 0.75, 2], [0.25, 1.25, 19], TIMBER);
  mesh.box([-5.6, 1.25, 15.6], [5.6, 1.55, 15.9], TIMBER);
  mesh.box([-0.15, 15.5, 3.1], [0.15, 21, 3.4], TIMBER);
  mesh.box([-0.2, 9.8, 2.2], [0.2, 10.2, 13], TIMBER);
  // The main sail, bellied forward on the wind; a jib from the forward mast's head to the bowsprit.
  // Its rows from foot to head: the height, and how far forward it bellies there, deepest across its middle.
  const rows = [
    [6.5, 1],
    [11, 1.4],
    [15.6, 0.8],
  ] as const;
  const sailAt = (across: number, [height, belly]: (typeof rows)[number]): Vector => [
    across,
    1.6 + belly * (1 - (across / 5.4) ** 2),
    height,
  ];
  for (let strip = -3; strip < 3; strip++) {
    const [left, right] = [strip * 1.8, (strip + 1) * 1.8];
    for (let row = 0; row + 1 < rows.length; row++) {
      const [low, high] = [rows[row], rows[row + 1]];
      if (low && high)
        mesh.quad(sailAt(left, low), sailAt(right, low), sailAt(right, high), sailAt(left, high), CANVAS);
    }
  }
  mesh.triangle([0, 10.4, 12.6], [0, 20.6, 3.6], [0, 10.4, 3.2], CANVAS);
  // The pennant at the main mast's head, streaming aft.
  mesh.quad([0, 0.75, 19], [0, -2.6, 18.6], [0, -2.6, 17.8], [0, 0.75, 17.6], WHITE, 1);
  return new Float32Array(mesh.values);
}
