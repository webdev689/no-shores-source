import assert from 'node:assert/strict';
import { test } from 'node:test';
import { onScreen } from '../camera.ts';
import type { ShipPlace } from '../../ships/shipView.ts';
import { ACTOR_IDS } from './actors.ts';
import { creationShot, helmInShip, YOU_ID } from './helm.ts';
import { onDeck } from './sailing.ts';

const PLACE: ShipPlace = { x: 1200, y: -800, z: 0, heading: 0.7, pitch: 0, roll: 0 };

/** The corners round the figure at her helm: a body's breadth with sword and shield, feet to the top of the head. */
function figureCorners(): [number, number, number][] {
  const [forward, starboard, up] = helmInShip();
  const corners: [number, number, number][] = [];
  for (const along of [-0.6, 0.6])
    for (const across of [-0.6, 0.6])
      for (const over of [0, 1.9]) corners.push(onDeck(PLACE, forward + along, starboard + across, up + over));
  return corners;
}

test('at the helm the whole figure stands in view and clear of the creation window, on any screen', () => {
  for (const aspect of [0.45, 0.6, 0.75, 1, 1.33, 1.78, 2.4]) {
    const size = { width: 1000 * aspect, height: 1000 };
    // The window takes the right from 49% of the width across, or on a screen taller than wide the bottom from 54%.
    const [clearRight, clearBottom] = aspect <= 1 ? [1, 0.54] : [0.49, 1];
    for (const turn of [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 4]) {
      const shot = creationShot(PLACE, turn, aspect);
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
