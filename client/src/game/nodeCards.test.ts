import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Card } from '../player/cards.ts';
import { PX_PER_M } from '../player/figures.ts';
import { loadNodeCards, NODE_WIDTH_M, nodeCardsAt, nodePicturePath } from './nodeCards.ts';

/** Loads every node picture but salvage's, each 128 by 96, the cards made as plain records. */
async function loaded(): Promise<void> {
  const asked: string[] = [];
  const strip = (path: string) => {
    asked.push(path);
    return Promise.resolve(
      path.includes('salvage') ? null : { width: 128, height: 96, data: new Uint8Array(128 * 96 * 4) },
    );
  };
  const make = (pixels: Uint8Array, width: number, height: number, root: readonly [number, number]) =>
    ({ texture: null, width, height, root }) as unknown as Card;
  loadNodeCards(strip, make);
  await new Promise((done) => setTimeout(done, 0));
  assert.equal(asked.length, 8, 'each kind standing and gathered');
  assert.ok(asked.includes(nodePicturePath('timber', true)));
}

test("each resource place stands its kind's picture, standing or gathered as the room has it, feet on the ground", async () => {
  await loaded();
  const places = [
    { at: [10, 20] as const, holds: 'ore' },
    { at: [30, 40] as const, holds: 'herbs' },
    { at: [50, 60] as const, holds: 'salvage' },
    { at: [70, 80] as const, holds: 'amber' },
  ];
  const shown = nodeCardsAt(
    places,
    ([east]) => east === 10,
    (x) => x / 10,
  );
  assert.equal(shown.length, 2, 'none for a picture not come, nor for a kind with none');
  const [ore, herbs] = shown;
  assert.deepEqual([ore?.x, ore?.y, ore?.z], [10, 20, 1]);
  assert.equal(ore?.card.root[1], 96, 'its feet on its bottom row');
  assert.equal(((ore?.scale ?? 0) * (ore?.card.width ?? 0)) / PX_PER_M, NODE_WIDTH_M, 'as wide as its dressing');
  assert.notEqual(ore?.card, herbs?.card);
  const gathered = nodeCardsAt(
    places.slice(0, 1),
    () => false,
    () => 0,
  )[0];
  assert.ok(gathered && gathered.card !== ore?.card, 'a node gathered shows its picture gathered');
});
