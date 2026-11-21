import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inkColour, inkVertices, pieces, triangles, VERTEX_FLOATS } from './strokes.ts';

const point = (x: number, y: number) => ({ x, y });

test('a colour reads as the overlays wrote it: #rgb, #rrggbb and #rrggbbaa', () => {
  assert.deepEqual(inkColour('#fff'), [1, 1, 1, 1]);
  assert.deepEqual(inkColour('#000000aa'), [0, 0, 0, 0xaa / 255]);
  assert.deepEqual(inkColour('#ff000080'), [1, 0, 0, 0x80 / 255]);
});

test('a plain line is one segment a joint, butt-ended unless it is round', () => {
  const line = {
    kind: 'stroke',
    runs: [[point(0, 0), point(10, 0), point(10, 10)]],
    colour: '#fff',
    width: 2,
  } as const;
  const segments = pieces(line);
  assert.equal(segments.length, 2);
  assert.deepEqual(
    segments.map((piece) => piece.kind === 'segment' && [piece.startButt, piece.endButt]),
    [
      [true, false],
      [false, true],
    ],
    'only the run’s two ends are cut square; the joint between is round',
  );
  const round = pieces({ ...line, round: true });
  assert.ok(round.every((piece) => piece.kind === 'segment' && !piece.startButt && !piece.endButt));
});

test('a closed run joins its last point back to its first, with no square end', () => {
  const ring = [point(0, 0), point(10, 0), point(10, 10)];
  const segments = pieces({ kind: 'stroke', runs: [ring], closed: true, colour: '#fff', width: 1 });
  assert.equal(segments.length, 3);
  assert.ok(segments.every((piece) => piece.kind === 'segment' && !piece.startButt && !piece.endButt));
});

test('a dashed line is cut into its dashes along the whole run, corners included', () => {
  const line = {
    kind: 'stroke',
    runs: [[point(0, 0), point(10, 0), point(10, 10)]],
    colour: '#fff',
    width: 1,
  } as const;
  const dashes = pieces({ ...line, dash: [6, 4] });
  // On 0-6 along the first side, off to 10, on 10-16 down the second, off to 20.
  assert.deepEqual(
    dashes.map((piece) => piece.kind === 'segment' && [piece.a.x, piece.a.y, piece.b.x, piece.b.y]),
    [
      [0, 0, 6, 0],
      [10, 0, 10, 6],
    ],
  );
  const corner = pieces({ ...line, dash: [14, 2] });
  assert.equal(corner.length, 3, 'a dash round the corner is two segments and the next dash one');
  assert.deepEqual(corner[0]?.kind === 'segment' && [corner[0].startButt, corner[0].endButt], [true, false]);
});

test('a ring is filled with triangles covering its area, concave or not', () => {
  const area = (list: ReturnType<typeof triangles>) =>
    list.reduce(
      (sum, [a, b, third]) => sum + Math.abs((b.x - a.x) * (third.y - a.y) - (third.x - a.x) * (b.y - a.y)) / 2,
      0,
    );
  const square = [point(0, 0), point(10, 0), point(10, 10), point(0, 10)];
  assert.equal(area(triangles(square)), 100);
  const notch = [point(0, 0), point(10, 0), point(10, 10), point(5, 4), point(0, 10)];
  assert.equal(triangles(notch).length, 3);
  assert.equal(area(triangles(notch)), 100 - 30, 'the notch cut in from the bottom is left out');
  assert.equal(area(triangles([...square].reverse())), 100, 'either way round');
});

test('each ink is its own item of vertices, in device pixels moved to the view', () => {
  const { floats, items } = inkVertices(
    [
      { kind: 'disc', x: 10, y: 20, radius: 3, colour: '#ffffff' },
      { kind: 'fill', ring: [point(0, 0), point(4, 0), point(0, 4)], colour: '#ff000080' },
    ],
    2,
    100,
  );
  assert.deepEqual(items, [
    { first: 0, count: 6 },
    { first: 6, count: 3 },
  ]);
  assert.equal(floats.length, 9 * VERTEX_FLOATS);
  // The disc's ends both at its middle, (100 + 10) * 2 by 20 * 2, its half-width the radius in device pixels.
  assert.deepEqual([...floats.subarray(2, 7)], [220, 40, 220, 40, 6]);
  // The fill's first corner, solid (a negative half-width).
  assert.deepEqual([...floats.subarray(6 * VERTEX_FLOATS, 6 * VERTEX_FLOATS + 2)], [200, 0]);
  assert.ok((floats[6 * VERTEX_FLOATS + 6] ?? 0) < 0);
});
