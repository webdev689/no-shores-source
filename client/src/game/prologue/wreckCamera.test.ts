import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cameraCourse } from './wreckCamera.ts';
import { WRECK_VERTEX_BYTES, type WreckMesh } from './wreckView.ts';

type Point = readonly [number, number, number];
/** The mesh's parts (tools/wreck/export_wreck.py): 0 hull, 1 deck, 2 spar, 3 sail, 4 iron. */
const [DECK, SPAR, SAIL] = [1, 2, 3];

/** A mesh of the wreck's own run from faces, each three corners and its part. */
function meshOf(faces: readonly { readonly corners: readonly Point[]; readonly part: number }[]): WreckMesh {
  const vertices = new ArrayBuffer(faces.length * 3 * WRECK_VERTEX_BYTES);
  const floats = new Float32Array(vertices);
  const bytes = new Uint8Array(vertices);
  faces.forEach(({ corners, part }, face) =>
    corners.forEach((corner, index) => {
      const vertex = face * 3 + index;
      floats.set(corner, (vertex * WRECK_VERTEX_BYTES) / 4);
      bytes[vertex * WRECK_VERTEX_BYTES + 24] = part;
    }),
  );
  const indices = Uint32Array.from({ length: faces.length * 3 }, (_unused, index) => index);
  return { vertices, indices, pieces: new Map([[0, { first: 0, count: indices.length }]]), full: { fire: 1, sky: 1 } };
}

/** A box's two upright sides across x and its top, as faces of `part`. */
function post([west = 0, north = 0, east = 0, south = 0]: readonly number[], low: number, high: number, part: number) {
  return [
    {
      corners: [
        [west, north, low],
        [east, north, low],
        [east, north, high],
      ] as const,
      part,
    },
    {
      corners: [
        [west, south, low],
        [east, south, high],
        [west, south, high],
      ] as const,
      part,
    },
    {
      corners: [
        [west, north, high],
        [east, north, high],
        [east, south, high],
      ] as const,
      part,
    },
  ];
}

// A deck 2 m over the sea, 3 m by 3 m, laid at the world's (100, 200); on it a rail 1 m high, a mast past the
// course's walls, and canvas low over another square.
const DECK_FACES = [
  {
    corners: [
      [0, 0, 2],
      [3, 0, 2],
      [3, 3, 2],
    ] as const,
    part: DECK,
  },
  {
    corners: [
      [0, 0, 2],
      [3, 3, 2],
      [0, 3, 2],
    ] as const,
    part: DECK,
  },
];
const MESH = meshOf([
  ...DECK_FACES,
  ...post([0.3, 0.3, 0.6, 0.6], 2, 3, SPAR),
  ...post([1.5, 1.5, 1.8, 1.8], 2, 20, SPAR),
  {
    corners: [
      [2.4, 0.3, 2.6],
      [2.7, 0.3, 2.6],
      [2.7, 0.6, 2.6],
    ],
    part: SAIL,
  },
]);
const ORIGIN = [100, 200] as const;
const square = (column: number, row: number, top: number) => ({
  minX: 100 + column * 0.3,
  maxX: 100 + (column + 1) * 0.3,
  minY: 200 + row * 0.3,
  maxY: 200 + (row + 1) * 0.3,
  top,
  bottom: 0,
});
// The course as the export lays it: the deck where a body has room, a wall 3.2 m over it where something stands in it.
const COURSE = [square(4, 4, 2), square(1, 1, 5.2), square(5, 5, 5.2), square(8, 1, 5.2)];

test('a wall the course stands over a low rail is lowered for the camera to the rail drawn there', () => {
  const [deck, rail] = cameraCourse(COURSE, MESH, ORIGIN);
  assert.equal(deck?.top, 2, 'the deck is as it is');
  assert.ok(rail && Math.abs(rail.top - 3) < 1e-6, `the rail's top: ${rail?.top}`);
});

test('a mast standing past the wall keeps the wall whole, and canvas is never kept clear of', () => {
  const [, , mast, canvas] = cameraCourse(COURSE, MESH, ORIGIN);
  assert.equal(mast?.top, 5.2, 'the mast stands through it');
  assert.equal(canvas?.top, 2, 'over canvas alone, only the deck under it is drawn');
});

test('nothing drawn under a block leaves it as the course has it', () => {
  const away = square(30, 30, 5.2);
  assert.deepEqual(cameraCourse([away], MESH, ORIGIN), [away]);
  assert.deepEqual(cameraCourse([], MESH, ORIGIN), []);
});
