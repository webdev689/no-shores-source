import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PlayerPlate } from '../network/plateMessages.ts';
import { TONES } from '../plus/tones.ts';
import type { Node } from '../ui/node.ts';
import { type PlatedPlayer, SOCIAL_REACH_M, aimedPlayer, levelInk, plateNode } from './playerPlates.ts';

const plate = (more: Partial<PlayerPlate> = {}): PlayerPlate => ({
  player: 7,
  name: 'Mariner',
  level: 6,
  menu: false,
  ...more,
});
const placed = (id: number, x: number, more: Partial<PlayerPlate> = {}, company = false): PlatedPlayer => ({
  id,
  feet: [x, 0, 0],
  plate: plate({ player: id, ...more }),
  company,
});
/** A camera at the origin's west, 1.6 m up, looking east along the ground. */
const camera = { eye: [-3, 0, 1.6] as const, forward: [1, 0, 0] as const, focal: 1.7 };

test('the square shows the level, gold for the levels past 20 that Prestige raises', () => {
  assert.deepEqual(
    [6, 20, 21, 30].map((level) => levelInk(level)),
    [TONES.word, TONES.word, TONES.brassHi, TONES.brassHi],
  );
  const words = (node: Node): string[] =>
    [node.text?.words, ...(node.children ?? []).flatMap((child) => (child ? words(child) : []))].filter(
      (each): each is string => typeof each === 'string',
    );
  assert.deepEqual(words(plateNode(placed(1, 2, { level: 27 }), 1)), ['27', 'Mariner']);
  const rewritten = { ...placed(1, 2, { level: 27 }), marked: true };
  assert.deepEqual(words(plateNode(rewritten, 1)), ['27', 'Mariner', 'Rewritten'], "a Breach's mark after the name");
});

test('the player under the crosshair within reach is aimed at, the nearest of several, never a guest', () => {
  const own = [-2, 0, 0] as const;
  assert.equal(aimedPlayer([placed(1, 2), placed(2, 3)], camera, own)?.id, 1, 'the nearest the eye');
  assert.equal(aimedPlayer([placed(1, 2, { name: '' })], camera, own), null, 'a guest has no name to be asked by');
  assert.equal(aimedPlayer([placed(1, 2, { name: '' }), placed(2, 3)], camera, own), null, 'nor may one be aimed past');
  assert.equal(aimedPlayer([placed(1, own[0] + SOCIAL_REACH_M + 0.5)], camera, own), null, 'past reach');
  const aside: PlatedPlayer = { ...placed(1, 2), feet: [2, 4, 0] };
  assert.equal(aimedPlayer([aside], camera, own), null, 'off the crosshair');
  assert.equal(aimedPlayer([placed(1, 2)], null, own), null, 'no camera, no aim');
});

test('a plate is green for the company and blue for anyone else, and a menu open shows the bubble', () => {
  const square = (node: ReturnType<typeof plateNode>) => node.children?.[0];
  const other = square(plateNode(placed(1, 0), 1));
  const company = square(plateNode(placed(1, 0, {}, true), 1));
  assert.ok(other && company && other.fill !== company.fill);
  assert.ok(other && !other.picture && company && !company.picture);
  const busy = square(plateNode(placed(1, 0, { menu: true }), 1));
  assert.ok(busy && busy.picture, "three dots in a speech bubble in the square's place");
  assert.equal(plateNode(placed(1, 0, { name: '' }), 1).children?.[1], false, 'a guest shows no name');
});
