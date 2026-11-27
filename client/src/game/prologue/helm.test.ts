import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lookAt } from '../../cinema/rail.ts';
import { cellHeight } from '../../ships/deck.ts';
import type { ShipPlace } from '../../ships/shipView.ts';
import { onScreen, type Shot } from '../camera.ts';
import { ACTOR_IDS } from './actors.ts';
import { Brig, BRIG_DECK } from './brig.ts';
import { CREATION_LENS, creationEye, creationShot, helmDeck, helmInShip, YOU_ID } from './helm.ts';
import { onDeck } from './sailing.ts';

type View = { readonly width: number; readonly height: number };
const VIEW: View = { width: 1600, height: 900 };
/** The screens the helm is framed for: wide, ultrawide, 4:3, about square either way, and a phone held upright. */
const SCREENS: readonly View[] = [
  VIEW,
  { width: 2560, height: 1080 },
  { width: 1024, height: 768 },
  { width: 1010, height: 1000 },
  { width: 1000, height: 1000 },
  { width: 900, height: 1600 },
];
const PLACE = { x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0 };

/** A standing figure's box on `view`, or null if any of it is behind the eye. */
function figureBox(
  shot: Shot,
  view: View,
  foot: readonly [number, number, number],
  halfWidth: number,
): number[] | null {
  const corners = [
    [-halfWidth, 0],
    [halfWidth, 0],
    [-halfWidth, 1.9],
    [halfWidth, 1.9],
  ].map(([side = 0, up = 0]) => onScreen(shot, view, [foot[0] + side, foot[1], foot[2] + up]));
  if (corners.some((corner) => !corner)) return null;
  const across = corners.map((corner) => corner?.[0] ?? 0);
  const down = corners.map((corner) => corner?.[1] ?? 0);
  return [Math.min(...across), Math.min(...down), Math.max(...across), Math.max(...down)];
}

test('the shot at the helm keeps the crew off the player: none nearer the lens covers them, on any screen', () => {
  const crew = new Brig([0, 0], 0).crew(PLACE);
  const you = onDeck(PLACE, ...helmInShip());
  for (const view of SCREENS) {
    const { eye, look } = creationEye(view.width / view.height);
    const [eyeWorld, lookWorld] = [onDeck(PLACE, ...eye), onDeck(PLACE, ...look)];
    const shot = { ...CREATION_LENS, eye: eyeWorld, ...lookAt(eyeWorld, lookWorld) };
    const player = figureBox(shot, view, you, 0.85);
    assert.ok(player, `the player in view on ${view.width}x${view.height}`);
    const toPlayer = Math.hypot(you[0] - eyeWorld[0], you[1] - eyeWorld[1]);
    for (const hand of crew) {
      if (Math.hypot(hand.x - eyeWorld[0], hand.y - eyeWorld[1]) >= toPlayer) continue;
      const box = figureBox(shot, view, [hand.x, hand.y, hand.z], 0.3);
      if (!box) continue;
      const across = Math.min(box[2] ?? 0, player[2] ?? 0) - Math.max(box[0] ?? 0, player[0] ?? 0);
      const down = Math.min(box[3] ?? 0, player[3] ?? 0) - Math.max(box[1] ?? 0, player[1] ?? 0);
      assert.ok(across <= 0 || down <= 0, `a hand covers the player on ${view.width}x${view.height}`);
    }
  }
});

test('the first shot at the helm has no hand standing close before the lens', () => {
  const crew = new Brig([0, 0], 0).crew(PLACE);
  const { eye, look } = creationEye();
  const [eyeWorld, lookWorld] = [onDeck(PLACE, ...eye), onDeck(PLACE, ...look)];
  const shot = { ...CREATION_LENS, eye: eyeWorld, ...lookAt(eyeWorld, lookWorld) };
  for (const hand of crew) {
    const box = figureBox(shot, VIEW, [hand.x, hand.y, hand.z], 0.3);
    const onView = box && (box[2] ?? 0) > 0 && (box[0] ?? 0) < VIEW.width && (box[3] ?? 0) > 0;
    const near = Math.hypot(hand.x - eyeWorld[0], hand.y - eyeWorld[1]) < 4.5;
    assert.ok(
      !(onView && near),
      `a hand ${Math.hypot(hand.x - eyeWorld[0], hand.y - eyeWorld[1]).toFixed(1)} m before the lens`,
    );
  }
});

const AT_SEA: ShipPlace = { x: 1200, y: -800, z: 0, heading: 0.7, pitch: 0, roll: 0 };
/** The Brig level, and pitched and rolled either way as in a heavy swell (storm.test's riding fixture). */
const SWELLS: readonly ShipPlace[] = [
  AT_SEA,
  { ...AT_SEA, pitch: 0.09, roll: -0.12 },
  { ...AT_SEA, pitch: -0.09, roll: 0.12 },
];

/** The corners round the figure at the Brig's helm: a body's breadth with sword and shield, feet to the top of the
 *  head. */
function figureCorners(place: ShipPlace): [number, number, number][] {
  const [forward, starboard, up] = helmInShip();
  const corners: [number, number, number][] = [];
  for (const along of [-0.6, 0.6])
    for (const across of [-0.6, 0.6])
      for (const over of [0, 1.9]) corners.push(onDeck(place, forward + along, starboard + across, up + over));
  return corners;
}

test('at the helm the whole figure stands in view and clear of the creation window, on any screen, level or rolled', () => {
  for (const aspect of [0.45, 0.6, 0.75, 1, 1.01, 1.33, 1.78, 2.37, 2.4]) {
    const size = { width: 1000 * aspect, height: 1000 };
    // The window takes the right from 49% of the width across, or on a screen taller than wide the bottom from 54%.
    const [clearRight, clearBottom] = aspect <= 1 ? [1, 0.54] : [0.49, 1];
    for (const place of SWELLS) {
      const shot = creationShot(helmDeck(place), aspect);
      const points = figureCorners(place).map((corner) => onScreen(shot, size, corner));
      const where = `aspect ${aspect}, roll ${place.roll}`;
      for (const point of points) {
        assert.ok(point, `${where}: a corner is behind the eye`);
        const [x, y] = point;
        assert.ok(x >= 0 && x <= size.width * clearRight, `${where}: x ${x.toFixed(0)}`);
        assert.ok(y >= 0 && y <= size.height * clearBottom, `${where}: y ${y.toFixed(0)}`);
      }
      const downs = points.map((point) => point?.[1] ?? 0);
      const tall = Math.max(...downs) - Math.min(...downs);
      assert.ok(tall > size.height * 0.3, `${where}: the figure is seen whole, not as a speck`);
    }
  }
});

/** A point in the world in the Brig's own frame at `place`: metres to its bow, to its starboard, up from its
 *  waterline, as `onDeck` lays it. */
function inBrig(place: ShipPlace, [x, y, z]: readonly number[]): [number, number, number] {
  const [east, south] = [(x ?? 0) - place.x, (y ?? 0) - place.y];
  const [sin, cos] = [Math.sin(place.heading), Math.cos(place.heading)];
  const [along, across] = [sin * east - cos * south, cos * east + sin * south];
  return [along, across, (z ?? 0) - place.z - (along * Math.sin(place.pitch) - across * Math.sin(place.roll))];
}

test("the Brig's bulwark never hides the figure at the helm from the creation camera, on any screen, level or rolled", () => {
  const [forward, starboard, up] = helmInShip();
  for (const view of SCREENS)
    for (const place of SWELLS) {
      // The camera rides only a quarter of the roll, so against the deck its eye rises and falls with it.
      const eye = inBrig(place, onDeck(helmDeck(place), ...creationEye(view.width / view.height).eye));
      for (const over of [0.1, 0.9, 1.8])
        for (let share = 0.05; share <= 0.95; share += 0.01) {
          const along = forward + (eye[0] - forward) * share;
          const across = starboard + (eye[1] - starboard) * share;
          const height = up + over + (eye[2] - up - over) * share;
          const deck = cellHeight(BRIG_DECK, across, -along);
          assert.ok(
            deck === null || deck < height - 0.05,
            `${view.width}x${view.height}, roll ${place.roll}: the deck ${deck?.toFixed(2)} m over the sight of the figure ${over} m up`,
          );
        }
    }
});

test("the player's id is their own, never one of the intro's fighters'", () => {
  for (let fighter = 0; fighter < 12; fighter++) assert.notEqual(YOU_ID, ACTOR_IDS + fighter);
});
