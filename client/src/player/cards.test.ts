import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PART, type Strip } from '../forge/compose.ts';
import type { ForgeLooks } from '../forge/looks.ts';
import type { ForgeStore } from '../forge/store.ts';
import { type Card, type CardMaker, Cards } from './cards.ts';
import { type Dress, plainDress } from './dressing.ts';

// A figure one pixel wide and two tall in each of the forge's five views, holding a sword in either fist.
const cell = { cell: [1, 2], frames: 1, root: [0, 1] } as const;
const looks: ForgeLooks = {
  bodies: {
    male: {
      anims: { guard: cell },
      layers: { body: ['guard'], sword_iron: ['guard'], sword_iron_l: ['guard'] },
    },
  },
};
const VIEWS = 5;
const column = (texel: readonly [number, number, number]): Strip => {
  const data = new Uint8Array(2 * VIEWS * 4);
  for (let row = 0; row < 2 * VIEWS; row++) data.set([...texel, 255], row * 4);
  return { width: 1, height: 2 * VIEWS, data };
};
const strips: Record<string, Strip> = {};
for (const layer of ['body', 'sword_iron', 'sword_iron_l']) {
  strips[`forge/layers/male/${layer}_guard.png`] = column([200, 150, 120]);
  strips[`forge/layers/male/${layer}_guard_z.png`] = column([3, 232, layer === 'body' ? PART.torso : PART.weapon]);
}
const store = { strip: (path: string) => Promise.resolve(strips[path] ?? null) } as unknown as ForgeStore;
const maker: CardMaker = {
  card: (pixels, width, height, root): Card => ({ texture: {} as GPUTexture, width, height, root }),
  glow: () => ({}) as GPUTexture,
};
const plain = plainDress('human', 0.5);
const armed = { ...plain, outfit: { ...plain.outfit, right: 'sword_iron', drawn: true } };
const bare = { ...plain, outfit: { ...plain.outfit, right: null, drawn: false } };
const settled = () => new Promise((resolve) => setImmediate(resolve));

test("one figure's warming leaves another's queued, and warms each view as drawn and as mirrored", async () => {
  const forge = new Cards(
    maker,
    store,
    looks,
    { skins: { bodies: {} }, hair: { bodies: {} } },
    {
      palette: [],
      clothing: {},
      armour: {},
    },
  );
  forge.warm(armed, ['guard'], 0, 1);
  forge.warm(bare, ['guard'], 0, 2);
  for (let pump = 0; pump < 40; pump++) {
    forge.pump();
    await settled();
  }
  // Each asked for the first time by a figure with no last card: composed already, or nothing to show.
  let asker = 100;
  const ready = (dress: Dress, view: number, flip = false) =>
    forge.card(asker++, dress, 'guard', view, 0, flip) !== null;
  for (let view = 0; view < VIEWS; view++) {
    assert.ok(ready(armed, view), `the first figure's view ${view}`);
    assert.ok(ready(bare, view), `the second figure's view ${view}`);
  }
  for (const view of [1, 2, 3]) assert.ok(ready(armed, view, true), `view ${view} mirrored`);
});
