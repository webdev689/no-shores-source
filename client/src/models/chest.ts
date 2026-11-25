// The chest DFO Online stood in every chest, the owner's model: a base, a lid, a hinge and a latch, each its points in
// the model's own units and the triangles over them, wound so (b - a) x (c - a) points out of it. The model's frame is
// DFO's (x along it, y up, z out of its front, the latch's side, the origin on the floor under the base's middle); a
// chest is laid in the game's, x across, y out of its front, z up. To open, the lid, the hinge and the latch turn
// together about the hinge's line, the lid's top going back, as the model's own opening turns them.
import { cross, minus, unit } from './vector.ts';

type Point = readonly [number, number, number];

export type ChestPart = 'base' | 'lid' | 'hinge' | 'latch';

const PARTS: Readonly<Record<ChestPart, { readonly points: readonly Point[]; readonly triangles: readonly number[] }>> =
  {
    base: {
      points: [
        [-1.2246, 0, -1],
        [-1.2246, 0, 1],
        [-1.5488, 0, 0],
        [1.5488, 0, 0],
        [1.2246, 0, 1],
        [1.2246, 0, -1],
        [1.2246, 1.5601, -1],
        [-1.2246, 1.5601, -1],
        [1.2246, 1.5601, 1],
        [-1.2246, 1.5601, 1],
        [-1.5488, 1.5601, 0],
        [1.5488, 1.5601, 0],
        [0, 0.8892, 0],
      ],
      triangles: [
        0, 1, 2, 1, 3, 4, 3, 0, 5, 1, 0, 3, 6, 0, 7, 6, 5, 0, 1, 8, 9, 1, 4, 8, 2, 9, 10, 2, 1, 9, 4, 11, 8, 4, 3, 11,
        0, 10, 7, 0, 2, 10, 3, 6, 11, 3, 5, 6, 11, 12, 8, 6, 12, 11, 10, 12, 7, 7, 12, 6, 8, 12, 9, 9, 12, 10,
      ],
    },
    lid: {
      points: [
        [-1.5709, 2.4184, 0],
        [1.242, 2.1561, -1.0143],
        [-1.242, 2.1561, -1.0143],
        [1.5709, 2.4184, 0],
        [-1.242, 1.4704, -1.0143],
        [0, 2.1317, 0],
        [-1.5709, 1.4704, 0],
        [1.242, 1.4704, -1.0143],
        [-1.242, 1.4704, 1.0143],
        [1.242, 2.1561, 1.0143],
        [-1.242, 2.1561, 1.0143],
        [1.242, 1.4704, 1.0143],
        [1.5709, 1.4704, 0],
      ],
      triangles: [
        0, 1, 2, 0, 3, 1, 4, 5, 6, 1, 4, 2, 1, 7, 4, 4, 0, 2, 4, 6, 0, 8, 9, 10, 8, 11, 9, 6, 5, 8, 11, 3, 9, 11, 12, 3,
        6, 10, 0, 6, 8, 10, 10, 3, 0, 10, 9, 3, 12, 1, 3, 12, 7, 1, 8, 5, 11, 11, 5, 12, 12, 5, 7, 7, 5, 4,
      ],
    },
    hinge: {
      points: [
        [0.5286, 1.3911, -1.0049],
        [-0.5286, 1.4651, -1.0715],
        [0.5286, 1.4651, -1.0715],
        [-0.5286, 1.3911, -1.0049],
        [-0.5286, 1.5316, -0.9975],
        [-0.5286, 1.4576, -0.931],
        [0.5286, 1.5316, -0.9975],
        [0.5286, 1.4576, -0.931],
      ],
      triangles: [
        0, 1, 2, 0, 3, 1, 3, 4, 1, 3, 5, 4, 5, 6, 4, 5, 7, 6, 7, 2, 6, 7, 0, 2, 3, 7, 5, 3, 0, 7, 4, 2, 1, 4, 6, 2,
      ],
    },
    latch: {
      points: [
        [-0.1672, 1.7926, 1.0142],
        [-0.1835, 1.7763, 1.1023],
        [-0.1672, 1.7926, 1.1023],
        [-0.1835, 1.7763, 1.0142],
        [0.1672, 1.7926, 1.1023],
        [0.1835, 1.7763, 1.0142],
        [0.1672, 1.7926, 1.0142],
        [0.1835, 1.7763, 1.1023],
        [-0.1342, 1.3649, 1.1023],
        [-0.1484, 1.3826, 1.0142],
        [-0.1342, 1.3649, 1.0142],
        [-0.1484, 1.3826, 1.1023],
        [0.1342, 1.3649, 1.0142],
        [0.1484, 1.3826, 1.1023],
        [0.1342, 1.3649, 1.1023],
        [0.1484, 1.3826, 1.0142],
      ],
      triangles: [
        0, 1, 2, 0, 3, 1, 4, 5, 6, 4, 7, 5, 2, 6, 0, 2, 4, 6, 8, 9, 10, 8, 11, 9, 12, 13, 14, 12, 15, 13, 10, 15, 12,
        15, 6, 5, 6, 3, 0, 3, 10, 9, 10, 6, 15, 6, 10, 3, 10, 14, 8, 10, 12, 14, 13, 5, 7, 13, 15, 5, 9, 1, 3, 9, 11, 1,
        14, 11, 8, 11, 2, 1, 2, 7, 4, 7, 14, 13, 14, 2, 11, 2, 14, 7,
      ],
    },
  };

export const CHEST_PARTS = Object.keys(PARTS) as readonly ChestPart[];
/** The parts that turn as it opens. */
const TURNING: ReadonlySet<ChestPart> = new Set(['lid', 'hinge', 'latch']);

/** The hinge's line, along x in the model's units: its height and how far out of the front it lies (behind, so less
 *  than none), found as the line the model's own opening turns its lid about. */
const HINGE = { up: 1.4679, out: -0.9953 } as const;
/** How far the lid swings open, radians: as far as the model opens it. */
export const CHEST_OPEN_RAD = (77.3196 * Math.PI) / 180;

const ALL = Object.values(PARTS).flatMap((part) => part.points);
const extent = (axis: number) => Math.max(...ALL.map((point) => Math.abs(point[axis] ?? 0)));
/** Its whole width and depth (latch to hinge) in its own units, and its height shut. */
const SIZE = { wide: extent(0) * 2, deep: extent(2) * 2, tall: extent(1) } as const;

/** A face of a chest laid in the game's frame in metres, its foot's middle at the origin: its part, its corners and the
 *  way it faces. */
export type ChestFace = {
  readonly part: ChestPart;
  readonly corners: readonly [Point, Point, Point];
  readonly normal: Point;
};

/** How much the model is scaled to stand within `wide` across and `deep` from back to front: as large as both allow,
 *  as DFO fitted it to the box each chest it stood for filled. */
export function chestScale(wide: number, deep: number): number {
  return Math.min(wide / SIZE.wide, deep / SIZE.deep);
}

/** How tall a chest of `scale` stands shut, metres. */
export function chestTall(scale: number): number {
  return SIZE.tall * scale;
}

/** Where the hinge's line crosses a chest of `scale`'s middle, metres. */
export function chestHinge(scale: number): Point {
  return [0, HINGE.out * scale, HINGE.up * scale];
}

/** Every face of a chest of `scale`, its lid swung `lid` radians open. */
export function chestFaces(scale: number, lid = 0): ChestFace[] {
  const [cosine, sine] = [Math.cos(lid), Math.sin(lid)];
  const hinge = chestHinge(scale);
  // The model's (x, up, out) is the game's (x, out, up); the lid's line out turns up and back about the hinge.
  const laid = (point: Point): Point => [point[0] * scale, point[2] * scale, point[1] * scale];
  const turned = ([x, out, up]: Point): Point => [
    x,
    hinge[1] + (out - hinge[1]) * cosine - (up - hinge[2]) * sine,
    hinge[2] + (out - hinge[1]) * sine + (up - hinge[2]) * cosine,
  ];
  const faces: ChestFace[] = [];
  for (const part of CHEST_PARTS) {
    const { points, triangles } = PARTS[part];
    const place = (index: number | undefined): Point => {
      const point = laid(points[index ?? 0] ?? [0, 0, 0]);
      return TURNING.has(part) ? turned(point) : point;
    };
    for (let corner = 0; corner < triangles.length; corner += 3) {
      const corners = [place(triangles[corner]), place(triangles[corner + 1]), place(triangles[corner + 2])] as const;
      // Laying the model's frame in the game's swaps two axes, so the outside is now (c - a) x (b - a).
      const [x, out, up] = unit(cross(minus(corners[2], corners[0]), minus(corners[1], corners[0])));
      faces.push({ part, corners, normal: [x, out, up] });
    }
  }
  return faces;
}
