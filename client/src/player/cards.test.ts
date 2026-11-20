import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PART, type Strip } from '../forge/compose.ts';
import type { ForgeLooks } from '../forge/looks.ts';
import type { ForgeStore } from '../forge/store.ts';
import { type Card, type CardMaker, Cards } from './cards.ts';
import type { ComposeJob } from './composeJob.ts';
import type { Composer } from './composer.ts';
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
  forge.warm(armed, () => ['guard'], 0, 1);
  forge.warm(bare, () => ['guard'], 0, 2);
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

/** A forge kept to `most` cards, let down to `after`, counting the frames it composes and the cards it lets go. */
function countedForge(most: number, after: number) {
  const counts = { composed: 0, destroyed: 0 };
  const counting: CardMaker = {
    card: (pixels, width, height, root): Card => {
      counts.composed += 1;
      return { texture: { destroy: () => (counts.destroyed += 1) } as unknown as GPUTexture, width, height, root };
    },
    glow: () => ({}) as GPUTexture,
  };
  const colours = { skins: { bodies: {} }, hair: { bodies: {} } };
  const forge = new Cards(counting, store, looks, colours, { palette: [], clothing: {}, armour: {} }, { most, after });
  return { forge, counts };
}
/** Dresses told apart by their shirt's dye, each eight frames of the guard (five views, three of them mirrored). */
const dyed = (dye: string): Dress => ({ ...armed, outfit: { ...armed.outfit, dyes: { shirt_long_v: dye } } });
const dresses = ['White', 'Black', 'Red'].map(dyed);
const pumped = async (forge: Cards, times = 40) => {
  for (let pump = 0; pump < times; pump++) {
    forge.pump();
    await settled();
  }
};

test('warming fills the kept frames up to the most and never past, so it lets go of none by itself', async () => {
  const { forge, counts } = countedForge(10, 6);
  dresses.forEach((dress, owner) => forge.warm(dress, () => ['guard'], 0, owner));
  await pumped(forge);
  assert.equal(counts.composed, 10, 'warmed up to the most kept');
  assert.equal(counts.destroyed, 0, 'none let go for warming');
});

test('a warmed frame let go before it was asked for is warmed again once there is room', async () => {
  const { forge, counts } = countedForge(10, 6);
  dresses.forEach((dress, owner) => forge.warm(dress, () => ['guard'], 0, owner));
  await pumped(forge);
  // Another figure's frames asked for push past the most: the least lately asked for, the warmed ones, are let go.
  for (let view = 0; view < VIEWS; view++) forge.card(50, dyed('Blue'), 'guard', view, 0);
  await pumped(forge, 2);
  assert.ok(counts.destroyed > 0, 'frames let go past the most');
  const before = counts.composed;
  // Each figure warms each frame; those whose warmed frames went are warmed again into the room let go.
  dresses.forEach((dress, owner) => forge.warm(dress, () => ['guard'], 0, owner));
  await pumped(forge);
  assert.ok(counts.composed > before, `warmed again (${counts.composed - before} frames)`);
});

test('a dress warmed again asks for its moves only the first time, as a figure warms each frame', () => {
  const forge = new Cards(maker, store, looks, {} as never, {} as never);
  let asked = 0;
  const moves = () => {
    asked += 1;
    return ['guard'];
  };
  for (let frame = 0; frame < 3; frame++) forge.warm(armed, moves, 0, 1);
  forge.warm(bare, moves, 0, 1);
  assert.equal(asked, 2, 'once for each dress');
});

test('a frame shown now is composed ahead of every frame warmed, and asks for the rest of its move with it', async () => {
  const walk = { cell: [1, 2], frames: 3, root: [0, 1] } as const;
  const moving: ForgeLooks = { bodies: { male: { anims: { walk }, layers: { body: ['walk'] } } } };
  const asked: { readonly frame: number; readonly urgent: boolean }[] = [];
  const recording: Composer = {
    compose: (job: ComposeJob, urgent: boolean) => {
      asked.push({ frame: job.frame, urgent });
      return new Promise(() => undefined);
    },
  };
  const colours = { skins: { bodies: {} }, hair: { bodies: {} } };
  const dyes = { palette: [], clothing: {}, armour: {} };
  const forge = new Cards(maker, store, moving, colours, dyes, undefined, recording);
  forge.card(1, bare, 'walk', 0, 1);
  assert.deepEqual(asked, [
    { frame: 1, urgent: true },
    { frame: 2, urgent: true },
    { frame: 0, urgent: true },
  ]);
  asked.length = 0;
  forge.warm(bare, () => ['walk'], 0, 2);
  forge.pump();
  assert.ok(asked.length > 0 && asked.every((each) => !each.urgent), 'warming is never urgent');
});
