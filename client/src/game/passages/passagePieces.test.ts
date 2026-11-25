import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PassagePiece } from '../../rules/passageRules.ts';
import { COLD, LIT, PIECE_FLOATS, pieceMesh, pieceModule, piecesBoxes, UNTOUCHED } from './passagePieces.ts';

const piece = (kind: PassagePiece['kind'], facing = 0, number = 0): PassagePiece => ({
  module: `passage.${kind}`,
  kind,
  number,
  at: [10, 20, 5],
  facing,
});

test('a mouth stands its iron leaf while shut and none once open; the way in is always shut', () => {
  assert.equal(piecesBoxes(piece('mouth'), UNTOUCHED).length, 4);
  assert.equal(piecesBoxes(piece('mouth', 0, 1), { ...UNTOUCHED, openMouths: [1] }).length, 3);
  assert.equal(piecesBoxes(piece('mouth', 0, 0), { ...UNTOUCHED, openMouths: [1] }).length, 4);
  assert.equal(piecesBoxes(piece('way-in'), { ...UNTOUCHED, openMouths: [0] }).length, 4);
});

test('the lamp’s light is gold and gives light when lit, grey and dark when cold; a dead lamp likewise', () => {
  const light = (lit: boolean) => piecesBoxes(piece('lamp'), { ...UNTOUCHED, lampLit: lit })[1];
  assert.deepEqual([light(true)?.colour, light(true)?.glows], [LIT, true]);
  assert.deepEqual([light(false)?.colour, light(false)?.glows], [COLD, false]);
  assert.equal(piecesBoxes(piece('lamp'), UNTOUCHED).length, 7, 'a plinth, its light and five standing stones');
  const kindle = piecesBoxes(piece('kindle', 0, 2), { ...UNTOUCHED, kindled: [2] })[1];
  assert.equal(kindle?.colour, LIT);
  assert.deepEqual(piecesBoxes(piece('node'), UNTOUCHED), [], 'a node is the game’s own');
});

test('a piece’s boxes stand at its foot, turned to its facing, every face lit from outside', () => {
  const mesh = pieceMesh([piece('reliquary', Math.PI / 2)], UNTOUCHED);
  const easts: number[] = [];
  const souths: number[] = [];
  const heights: number[] = [];
  for (let first = 0; first < mesh.vertices.length; first += PIECE_FLOATS) {
    easts.push(mesh.vertices[first] ?? NaN);
    souths.push(mesh.vertices[first + 1] ?? NaN);
    heights.push(mesh.vertices[first + 2] ?? NaN);
  }
  // Turned a quarter to face east, its 1.4 m width runs north to south.
  assert.ok(Math.abs(Math.max(...souths) - Math.min(...souths) - 1.44) < 1e-5);
  assert.ok(Math.abs(Math.max(...easts) - Math.min(...easts) - 0.94) < 1e-5);
  assert.ok(Math.abs(Math.min(...heights) - 5) < 1e-6 && Math.abs(Math.max(...heights) - 5.9) < 1e-5);
  // Each face's normal points away from its box's middle: the reliquary's two boxes share their middle's x and y.
  for (let first = 0; first < mesh.indices.length; first += 6) {
    const vertex = mesh.indices[first] ?? 0;
    const start = vertex * PIECE_FLOATS;
    const [x, y, normalX, normalY] = [0, 1, 3, 4].map((offset) => mesh.vertices[start + offset] ?? NaN);
    if (normalX === 0 && normalY === 0) continue;
    assert.ok(((x ?? 0) - 10) * (normalX ?? 0) + ((y ?? 0) - 20) * (normalY ?? 0) > 0, `face ${first / 6}`);
  }
  assert.equal(mesh.indices.length, 2 * 36);
});

test('a piece turns clockwise from north: facing east, the lamp’s first stone, north of it at rest, stands east', () => {
  const lamp: PassagePiece = { ...piece('lamp'), at: [0, 0, 0], facing: Math.PI / 2 };
  const mesh = pieceMesh([lamp], UNTOUCHED);
  // The plinth's 24 corners and its light's 24 come first; the first stone's follow.
  const stone = 48 * PIECE_FLOATS;
  const easts = Array.from({ length: 24 }, (unused, corner) => mesh.vertices[stone + corner * PIECE_FLOATS] ?? NaN);
  const souths = Array.from(
    { length: 24 },
    (unused, corner) => mesh.vertices[stone + corner * PIECE_FLOATS + 1] ?? NaN,
  );
  const middle = (values: number[]) => (Math.max(...values) + Math.min(...values)) / 2;
  assert.ok(
    Math.abs(middle(easts) - 3.5) < 1e-5 && Math.abs(middle(souths)) < 1e-5,
    `${middle(easts)}, ${middle(souths)}`,
  );
});

test('in the islands’ kit each piece stands as its module as the deal stands: open, broken, opened', () => {
  assert.equal(pieceModule(piece('mouth', 0, 1), UNTOUCHED, false), 'passage.mouth.shut');
  assert.equal(pieceModule(piece('mouth', 0, 1), { ...UNTOUCHED, openMouths: [1] }, false), 'passage.mouth.open');
  assert.equal(pieceModule(piece('post', 0, 2), { ...UNTOUCHED, broken: [2] }, false), 'passage.tally-post.broken');
  assert.equal(pieceModule(piece('reliquary'), UNTOUCHED, true), 'passage.reliquary.open');
  assert.equal(pieceModule(piece('lamp'), UNTOUCHED, false), 'passage.lamp');
  assert.equal(pieceModule(piece('node'), UNTOUCHED, false), null);
});

test('drawn over the kit’s modules, only the lamps’ lights stand: the lamp’s one box of its seven', () => {
  const faces = (lightsOnly: boolean) => pieceMesh([piece('lamp')], UNTOUCHED, lightsOnly).indices.length / 6;
  assert.equal(faces(true), 6);
  assert.equal(faces(false), 42);
});
