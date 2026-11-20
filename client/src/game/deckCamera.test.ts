import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAMERA, cameraOrbit, rayHit } from '../player/playerCamera.ts';
import { cellHeight, HULL_DECKS, railSpot } from '../ships/deck.ts';
import { HULL_NAMES } from '../ships/hulls.ts';
import { deckCameraBlocks, sideBoxes, sparBoxes } from '../ships/spars.ts';

type Point = readonly [number, number, number];

/** A body's eye over her planks, metres: the movement rules' standing eye, near enough for the camera's line. */
const EYE_M = 1.6;
const THIRD = { firstPerson: false, distance: CAMERA.back, shown: CAMERA.back };

/** The third-person eye for a boarder whose head is at `head`, looking along `yaw`, kept clear of `blocks` (her
 *  spars and sides, `deckCameraBlocks`). */
function eyeFor(head: Point, yaw: number, pitch: number, blocks: ReturnType<typeof deckCameraBlocks>): Point {
  const orbit = cameraOrbit(head, yaw, pitch, THIRD, blocks);
  const forward = [Math.cos(pitch) * Math.sin(yaw), -Math.cos(pitch) * Math.cos(yaw), -Math.sin(pitch)];
  return [orbit.targetX - (forward[0] ?? 0), orbit.targetY - (forward[1] ?? 0), orbit.targetZ - (forward[2] ?? 0)];
}

test('every hull’s masts stand on her middle line from her deck up, and her booms and yards over a body’s head', () => {
  for (const [hull, name] of HULL_NAMES.entries()) {
    const boxes = sparBoxes(hull);
    const masts = boxes.filter((box) => box.bottom === undefined);
    assert.ok(masts.length > 0 && masts.every((box) => box.minX < 0 && box.maxX > 0 && box.top > 10), name);
    const deck = HULL_DECKS[hull];
    assert.ok(deck);
    for (const spar of boxes.filter((box) => box.bottom !== undefined)) {
      const plank = cellHeight(deck, (spar.minX + spar.maxX) / 2, (spar.minY + spar.maxY) / 2) ?? 0;
      assert.ok((spar.bottom ?? 0) > plank + 1.8, `${name}: a spar clears a standing body (${spar.bottom})`);
    }
  }
});

test('from where boarders come aboard and along a walk the length of her deck, no mast, spar or side of hers stands between the camera and the boarder, so it stays inboard', () => {
  for (const [hull, name] of HULL_NAMES.entries()) {
    const deck = HULL_DECKS[hull];
    assert.ok(deck);
    const boxes = deckCameraBlocks(hull);
    const sides = sideBoxes(deck);
    const [north, south] = [deck.north + 0.5, deck.north + deck.cell * deck.rows - 0.5];
    // Her hull, masts and spars are the same either side of her middle line, so one side stands for both.
    for (const side of [1]) {
      const [railX] = railSpot(deck, side);
      for (const x of [railX, 0]) {
        for (let y = north; y <= south; y += 1) {
          const floor = cellHeight(deck, x, y);
          if (floor === null) continue;
          const head: Point = [x, y, floor + EYE_M];
          // A head inside a mast (her deck room lets a body through it) has no line to keep.
          if (rayHit(head, head, boxes) < 1) continue;
          for (const yaw of [0, Math.PI, Math.PI / 2, -Math.PI / 2])
            for (const pitch of [0.15, -0.2, 0.6]) {
              const eye = eyeFor(head, yaw, pitch, boxes);
              assert.ok(rayHit(eye, head, boxes) >= 1, `${name} at ${x}, ${y} looking ${yaw}, ${pitch}: ${eye}`);
              const inboard = rayHit(head, eye, sides) >= 1;
              assert.ok(inboard, `${name} at ${x}, ${y} looking ${yaw}: the eye ${eye} past her side`);
            }
        }
      }
    }
  }
});

test('at her rail where a boarder comes aboard, looking at her crew forward, her spars fill under a sixth of the view', () => {
  for (const [hull, name] of HULL_NAMES.entries()) {
    const deck = HULL_DECKS[hull];
    assert.ok(deck);
    const boxes = sparBoxes(hull);
    for (const side of [1, -1]) {
      const [x, y] = railSpot(deck, side);
      const head: Point = [x, y, (cellHeight(deck, x, y) ?? 0) + EYE_M];
      const pitch = 0.15;
      const eye = eyeFor(head, 0, pitch, deckCameraBlocks(hull));
      // Rays through a 50 degree tall picture, 16:9, each 30 m long: the share that meets a spar or a mast.
      const [rows, columns, half] = [18, 32, (25 * Math.PI) / 180];
      let met = 0;
      for (let row = 0; row < rows; row += 1)
        for (let column = 0; column < columns; column += 1) {
          const up = Math.tan(half) * (1 - (2 * (row + 0.5)) / rows);
          const right = Math.tan(half) * (16 / 9) * ((2 * (column + 0.5)) / columns - 1);
          const look = pitch - Math.atan(up);
          const yaw = Math.atan(right / Math.hypot(1, up));
          const far: Point = [
            eye[0] + 30 * Math.cos(look) * Math.sin(yaw),
            eye[1] - 30 * Math.cos(look) * Math.cos(yaw),
            eye[2] - 30 * Math.sin(look),
          ];
          if (rayHit(eye, far, boxes) < 1) met += 1;
        }
      assert.ok(
        met / (rows * columns) < 1 / 6,
        `${name} on side ${side}: ${((100 * met) / (rows * columns)).toFixed(1)}%`,
      );
    }
  }
});
