import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lookAt } from '../../cinema/rail.ts';
import type { ShipPlace } from '../../ships/shipView.ts';
import { onScreen, type Shot } from '../camera.ts';
import { ACTOR_IDS } from './actors.ts';
import { Brig } from './brig.ts';
import { CREATION_LENS, creationEye, creationShot, helmInShip, YOU_ID } from './helm.ts';
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
    const { eye, look } = creationEye((step * Math.PI) / 4, VIEW.width / VIEW.height);
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

const AT_SEA: ShipPlace = { x: 1200, y: -800, z: 0, heading: 0.7, pitch: 0, roll: 0 };

/** The corners round the figure at the Brig's helm: a body's breadth with sword and shield, feet to the top of the head. */
function figureCorners(): [number, number, number][] {
  const [forward, starboard, up] = helmInShip();
  const corners: [number, number, number][] = [];
  for (const along of [-0.6, 0.6])
    for (const across of [-0.6, 0.6])
      for (const over of [0, 1.9]) corners.push(onDeck(AT_SEA, forward + along, starboard + across, up + over));
  return corners;
}

test('at the helm the whole figure stands in view and clear of the creation window, on any screen', () => {
  for (const aspect of [0.45, 0.6, 0.75, 1, 1.33, 1.78, 2.4]) {
    const size = { width: 1000 * aspect, height: 1000 };
    // The window takes the right from 49% of the width across, or on a screen taller than wide the bottom from 54%.
    const [clearRight, clearBottom] = aspect <= 1 ? [1, 0.54] : [0.49, 1];
    for (const turn of [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 4]) {
      const shot = creationShot(AT_SEA, turn, aspect);
      const points = figureCorners().map((corner) => onScreen(shot, size, corner));
      for (const point of points) {
        assert.ok(point, `aspect ${aspect}, turn ${turn}: a corner is behind the eye`);
        const [x, y] = point;
        assert.ok(x >= 0 && x <= size.width * clearRight, `aspect ${aspect}, turn ${turn}: x ${x.toFixed(0)}`);
        assert.ok(y >= 0 && y <= size.height * clearBottom, `aspect ${aspect}, turn ${turn}: y ${y.toFixed(0)}`);
      }
      const downs = points.map((point) => point?.[1] ?? 0);
      const tall = Math.max(...downs) - Math.min(...downs);
      assert.ok(tall > size.height * 0.3, `aspect ${aspect}: the figure is seen whole, not as a speck`);
    }
  }
});

test("the player's id is their own, never one of the intro's fighters'", () => {
  for (let fighter = 0; fighter < 12; fighter++) assert.notEqual(YOU_ID, ACTOR_IDS + fighter);
});
