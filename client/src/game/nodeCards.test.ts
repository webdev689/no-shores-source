import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { Card } from '../player/cards.ts';
import { PX_PER_M } from '../player/figures.ts';
import { loadNodeCards, NODE_WIDTH_M, nodeCardsAt, nodePicturePath } from './nodeCards.ts';

/** Loads every node picture but Sunstone's, each 128 by 96, the cards made as plain records. */
async function loaded(): Promise<void> {
  const asked: string[] = [];
  const strip = (path: string) => {
    asked.push(path);
    return Promise.resolve(
      path.includes('sunstone') ? null : { width: 128, height: 96, data: new Uint8Array(128 * 96 * 4) },
    );
  };
  const make = (pixels: Uint8Array, width: number, height: number, root: readonly [number, number]) =>
    ({ texture: null, width, height, root }) as unknown as Card;
  loadNodeCards(strip, make);
  await new Promise((done) => setTimeout(done, 0));
  assert.equal(asked.length, 18, 'each resource standing and gathered');
  assert.ok(asked.includes(nodePicturePath('bog_pearl', true)));
}

test("each node stands its island resource's picture where the room stands it, gathered where the player gathered it, feet on the ground", async () => {
  await loaded();
  const places = [
    { at: [10, 20] as const, holds: 'brineglass' },
    { at: [30, 40] as const, holds: 'brineglass' },
    { at: [50, 60] as const, holds: 'sunstone' },
    { at: [70, 80] as const, holds: 'amber' },
    { at: [90, 99] as const, holds: 'brineglass' },
  ];
  const gear = { nodes: [0, 2, 3].map((index) => ({ index, x: 0, y: 0, resource: 0 })), spent: [1] };
  const shown = nodeCardsAt(places, gear, (x) => x / 10);
  assert.equal(shown.length, 3, 'none for a picture not come, nor a resource no island has');
  const [standing, gathered, resting] = shown;
  assert.deepEqual([standing?.x, standing?.y, standing?.z], [10, 20, 1]);
  assert.equal(standing?.card.root[1], 96, 'its feet on its bottom row');
  assert.equal(
    ((standing?.scale ?? 0) * (standing?.card.width ?? 0)) / PX_PER_M,
    NODE_WIDTH_M.brineglass,
    'at one scale',
  );
  assert.equal(gathered?.x, 30, 'gathered this turn');
  assert.ok(resting?.x === 90 && resting.card === gathered?.card, 'resting its turn, it looks spent until it returns');
  const whole = nodeCardsAt(places.slice(1, 2), { nodes: [{ index: 0, x: 0, y: 0, resource: 0 }], spent: [] }, () => 0);
  assert.ok(whole[0] && whole[0].card !== gathered?.card, 'a node gathered shows its picture gathered');
  assert.deepEqual(
    nodeCardsAt(places, null, () => 0),
    [],
    'none before the room says',
  );
  assert.deepEqual(
    nodeCardsAt(places, { nodes: [], spent: [] }, () => 0),
    [],
    'none where the room stands no node',
  );
});

test('each resource stands 1.2 m to each unit of the span the forge renders its pictures at', async () => {
  const rows = JSON.parse(
    await readFile(
      new URL('../../../tools/forge/tools/sprite-forge/specs/pictures/nodes.json', import.meta.url),
      'utf8',
    ),
  ) as { pictures: Record<string, { span: number }> };
  for (const [resource, width] of Object.entries(NODE_WIDTH_M)) {
    const [standing, spent] = [rows.pictures[`nodes/${resource}`], rows.pictures[`nodes/${resource}-spent`]];
    assert.equal(width, Math.round((standing?.span ?? 0) * 1.2 * 100) / 100, resource);
    assert.equal(spent?.span, standing?.span, `${resource}: its two pictures at one scale`);
  }
});
