import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bitten, Meter, PIECE_FALL, PIECE_LEAST, pieceAt, stepLoss } from './meter.ts';
import { findAll, onFakePage, withMotionReduced } from './page.test.ts';

test('a frame’s loss breaks off as a piece only past the least it must take: a blow, never a trickle', () => {
  const full = stepLoss(null, 1, 0);
  const after = (share: number) => stepLoss(full, share, 1 / 60);
  assert.deepEqual(bitten(full, after(0.7), PIECE_LEAST.vital), { left: 0.7, width: 1 - 0.7 }, 'the span bitten out');
  assert.equal(bitten(full, after(0.99), PIECE_LEAST.vital), null, 'a sprint’s trickle breaks nothing off the vitals');
  assert.ok(bitten(full, after(0.99), PIECE_LEAST.foe), 'a foe’s bar breaks off a smaller bite');
  assert.equal(bitten(full, after(0.995), PIECE_LEAST.hull), null, 'and a hull’s a bite of a hundredth or more');
  assert.equal(bitten(null, after(0.5), PIECE_LEAST.foe), null, 'a bar’s first frame has lost nothing');
  assert.equal(bitten(after(0.5), stepLoss(after(0.5), 0.8, 0.1), PIECE_LEAST.foe), null, 'nor a gain');
  assert.deepEqual([PIECE_LEAST.vital, PIECE_LEAST.foe, PIECE_LEAST.hull], [0.015, 0.005, 0.01]);
});

test('a piece falls in hard steps to its turn and on to its end, fading after its turn; its right half falls longer', () => {
  assert.deepEqual(pieceAt(0, 'left'), { x: 0, y: 0, opacity: 1 }, 'whole where it broke off');
  assert.deepEqual(pieceAt(0.01, 'left'), pieceAt(0, 'left'), 'a step is held, never a smooth slide');
  const turn = PIECE_FALL.left.seconds * PIECE_FALL.left.turn;
  assert.deepEqual(pieceAt(turn, 'left'), { x: -1, y: 3, opacity: 1 }, 'whole still at its turn');
  const late = pieceAt(PIECE_FALL.left.seconds - 0.001, 'left');
  assert.ok(late && late.y > 3 && late.y <= 22 && late.opacity < 0.2, `low and nearly gone: ${JSON.stringify(late)}`);
  assert.equal(pieceAt(PIECE_FALL.left.seconds, 'left'), null, 'gone at its end');
  assert.ok(pieceAt(PIECE_FALL.left.seconds, 'right'), 'the right half is still falling');
  assert.equal(pieceAt(PIECE_FALL.right.seconds, 'right'), null);
  let lowest = 0;
  for (let age = 0; age < PIECE_FALL.right.seconds; age += 0.01) {
    const fallen = pieceAt(age, 'right');
    assert.ok(fallen && fallen.y >= lowest, `it only ever falls: ${age}`);
    lowest = fallen.y;
  }
  assert.ok(lowest > 22 && lowest <= 28, `the right half falls farther: ${lowest}`);
});

test('back-to-back bites each break off a piece of their own, the two taken in turn, over the span each took', () =>
  onFakePage((root) => {
    const meter = new Meter(root, 'health', { pieceLeast: PIECE_LEAST.foe });
    const pieces = findAll(root, 'piece');
    assert.equal(pieces.length, 2);
    assert.ok(
      pieces.every((piece) => piece.hidden),
      'nothing falls before a loss',
    );
    meter.set(1, 0);
    meter.set(0.8, 1 / 60);
    meter.set(0.6, 1 / 60);
    assert.deepEqual(
      pieces.map((piece) => [piece.hidden, piece.style['left'], piece.style['width']]),
      [
        [false, '80%', '20%'],
        [false, '60%', '20%'],
      ],
    );
    meter.set(0.5, 1 / 60);
    assert.equal(pieces[0]?.style['left'], '50%', 'a third bite takes the first piece again');
    for (let frame = 0; frame < 60; frame++) meter.set(0.5, 1 / 60);
    assert.ok(
      pieces.every((piece) => piece.hidden),
      'fallen, they are put away',
    );
  }));

test('with reduced motion asked for, no piece falls; the strip still holds where the bar stood', () =>
  onFakePage((root) =>
    withMotionReduced(true, () => {
      const meter = new Meter(root, 'health', { pieceLeast: PIECE_LEAST.foe });
      meter.set(1, 0);
      meter.set(0.5, 1 / 60);
      assert.ok(findAll(root, 'piece').every((piece) => piece.hidden));
      assert.equal(findAll(root, 'lost')[0]?.style['width'], '100%');
    }),
  ));

test('a bar told where its figure last stood loses from there: the first loss after it breaks off a piece', () =>
  onFakePage((root) => {
    const meter = new Meter(root, 'health', { pieceLeast: PIECE_LEAST.foe });
    meter.forget(0.9);
    meter.set(0.6, 1 / 60);
    assert.equal(findAll(root, 'lost')[0]?.style['width'], '90%', 'the strip holds where it stood');
    assert.equal(findAll(root, 'piece')[0]?.style['left'], '60%');
    meter.forget();
    meter.set(0.4, 1 / 60);
    assert.equal(findAll(root, 'lost')[0]?.style['width'], '40%', 'told nothing, its first frame has lost nothing');
  }));
