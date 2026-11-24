import assert from 'node:assert/strict';
import { test } from 'node:test';
import factions from '../../../content/gear/factions.json' with { type: 'json' };
import { OUTLINE } from '../combat/dropPictures.ts';
import { bountyFaceNode, bountyFacePixels, posterEmblem } from './bountyFaces.ts';
import { SIGN_CELLS, emblemOf, emblemPixels } from './emblemArt.ts';

const colourAt = (pixels: Uint8ClampedArray, x: number, y: number) => {
  const start = (y * SIGN_CELLS + x) * 4;
  return `#${[0, 1, 2].map((channel) => (pixels[start + channel] ?? 0).toString(16).padStart(2, '0')).join('')}`;
};

test('a faction’s bounties wear its own emblem, and the town’s a writ on slate, each face 24 cells square', () => {
  for (const faction of factions.factions) {
    assert.deepEqual(bountyFacePixels(faction.id), emblemPixels(emblemOf(faction.emblem), 'sign'), faction.name);
  }
  const town = bountyFacePixels(0);
  assert.equal(town.length, SIGN_CELLS * SIGN_CELLS * 4);
  const tones = new Set(
    Array.from({ length: SIGN_CELLS * SIGN_CELLS }, (unused, cell) =>
      colourAt(town, cell % SIGN_CELLS, Math.floor(cell / SIGN_CELLS)),
    ),
  );
  for (const [tone, what] of [
    [OUTLINE, 'outlined, as the gear glyphs are'],
    ['#4a3b2a', 'its lines inked'],
    ['#d8553c', 'its red seal'],
    ['#f1e6c8', 'its paper'],
  ] as const)
    assert.ok(tones.has(tone), what);
  const faces = [0, ...factions.factions.map((faction) => faction.id)].map((id) => bountyFacePixels(id).join());
  assert.equal(new Set(faces).size, 4, 'the town and each faction apart at a glance');
});

test('every bounty of one kind wears the same face, and a faction not in the file the town’s', () => {
  assert.equal(bountyFaceNode(2, 48).picture?.key, bountyFaceNode(2, 72).picture?.key, 'one picture at any size');
  assert.equal(bountyFaceNode(9, 48).picture?.key, bountyFaceNode(0, 48).picture?.key);
  assert.equal(posterEmblem(9).id, 'town-bounty');
  assert.deepEqual(bountyFaceNode(0, 48).picture?.pixel, { width: 24, height: 24 }, 'laid at whole cells');
});
