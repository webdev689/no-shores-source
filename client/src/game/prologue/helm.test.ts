import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lookAt } from '../../cinema/rail.ts';
import { onScreen, type Shot } from '../camera.ts';
import { Brig } from './brig.ts';
import { CREATION_LENS, creationEye, helmInShip } from './helm.ts';
import { onDeck } from './sailing.ts';

const VIEW = { width: 1600, height: 900 };
const PLACE = { x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0 };

/** A standing figure's box on the view, or null if any of it is behind the eye. */
function figureBox(shot: Shot, foot: readonly [number, number, number], halfWidth: number): number[] | null {
  const corners = [
    [-halfWidth, 0],
    [halfWidth, 0],
    [-halfWidth, 1.9],
    [halfWidth, 1.9],
  ].map(([side = 0, up = 0]) => onScreen(shot, VIEW, [foot[0] + side, foot[1], foot[2] + up]));
  if (corners.some((corner) => !corner)) return null;
  const across = corners.map((corner) => corner?.[0] ?? 0);
  const down = corners.map((corner) => corner?.[1] ?? 0);
  return [Math.min(...across), Math.min(...down), Math.max(...across), Math.max(...down)];
}

test('the shot at the helm keeps the crew off the player: none nearer the lens covers them at any turn', () => {
  const crew = new Brig([0, 0], 0).crew(PLACE, 0);
  const you = onDeck(PLACE, ...helmInShip());
  for (let step = -4; step <= 4; step++) {
    const { eye, look } = creationEye((step * Math.PI) / 4);
    const [eyeWorld, lookWorld] = [onDeck(PLACE, ...eye), onDeck(PLACE, ...look)];
    const shot = { ...CREATION_LENS, eye: eyeWorld, ...lookAt(eyeWorld, lookWorld) };
    const player = figureBox(shot, you, 0.85);
    assert.ok(player, `the player in view at turn ${step}`);
    const toPlayer = Math.hypot(you[0] - eyeWorld[0], you[1] - eyeWorld[1]);
    for (const hand of crew) {
      if (Math.hypot(hand.x - eyeWorld[0], hand.y - eyeWorld[1]) >= toPlayer) continue;
      const box = figureBox(shot, [hand.x, hand.y, hand.z], 0.3);
      if (!box) continue;
      const across = Math.min(box[2] ?? 0, player[2] ?? 0) - Math.max(box[0] ?? 0, player[0] ?? 0);
      const down = Math.min(box[3] ?? 0, player[3] ?? 0) - Math.max(box[1] ?? 0, player[1] ?? 0);
      assert.ok(across <= 0 || down <= 0, `a hand covers the player at turn ${step}`);
    }
  }
});

test('the first shot at the helm has no hand standing close before the lens', () => {
  const crew = new Brig([0, 0], 0).crew(PLACE, 0);
  const { eye, look } = creationEye(0);
  const [eyeWorld, lookWorld] = [onDeck(PLACE, ...eye), onDeck(PLACE, ...look)];
  const shot = { ...CREATION_LENS, eye: eyeWorld, ...lookAt(eyeWorld, lookWorld) };
  for (const hand of crew) {
    const box = figureBox(shot, [hand.x, hand.y, hand.z], 0.3);
    const onView = box && (box[2] ?? 0) > 0 && (box[0] ?? 0) < VIEW.width && (box[3] ?? 0) > 0;
    const near = Math.hypot(hand.x - eyeWorld[0], hand.y - eyeWorld[1]) < 4.5;
    assert.ok(
      !(onView && near),
      `a hand ${Math.hypot(hand.x - eyeWorld[0], hand.y - eyeWorld[1]).toFixed(1)} m before the lens`,
    );
  }
});
