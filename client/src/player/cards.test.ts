import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PART, type Strip } from '../forge/compose.ts';
import type { ForgeLooks } from '../forge/looks.ts';
import type { ForgeStore } from '../forge/store.ts';
import { type Card, type CardMaker, Cards } from './cards.ts';
import type { ComposeJob } from './composeJob.ts';
import type { Haste } from './composeQueue.ts';
import type { Composer } from './composer.ts';
import { type Dress, plainDress } from './dressing.ts';
import { standIns } from '../standIns.ts';

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

test('a move with no horse in it keeps one frame whatever the coat and barding, so a new coat composes none again', async () => {
  const { forge, counts } = countedForge(40, 30);
  const horsed = (coat: string | null, barding: string | null): Dress => ({
    ...armed,
    outfit: { ...armed.outfit, coat, barding },
  });
  forge.card(1, horsed(null, null), 'guard', 0, 0);
  await pumped(forge, 2);
  const once = counts.composed;
  forge.card(1, horsed('grey', 'ember_plate'), 'guard', 0, 0);
  await pumped(forge, 2);
  assert.equal(counts.composed, once, 'the guard draws no horse: the frame kept serves');
});

test('a frame shown now is composed ahead of every frame warmed, and asks for the rest of its move with it', async () => {
  const walk = { cell: [1, 2], frames: 3, root: [0, 1] } as const;
  const moving: ForgeLooks = { bodies: { male: { anims: { walk }, layers: { body: ['walk'] } } } };
  const asked: { readonly frame: number; readonly haste: Haste }[] = [];
  const hurried: string[] = [];
  const recording: Composer = {
    offPage: true,
    compose: (_key: string, job: ComposeJob, haste: Haste) => {
      asked.push({ frame: job.frame, haste });
      return new Promise(() => undefined);
    },
    hurry: (key: string) => hurried.push(key),
    prefetch: () => undefined,
  };
  const colours = { skins: { bodies: {} }, hair: { bodies: {} } };
  const dyes = { palette: [], clothing: {}, armour: {} };
  const forge = new Cards(maker, store, moving, colours, dyes, undefined, recording);
  standIns();
  forge.card(1, bare, 'walk', 0, 1);
  assert.deepEqual(standIns(), ['figures'], 'a figure with no frame of its own stands in');
  assert.deepEqual(asked, [
    { frame: 1, haste: 'now' },
    { frame: 2, haste: 'ahead' },
    { frame: 0, haste: 'ahead' },
  ]);
  forge.card(1, bare, 'walk', 0, 2);
  assert.deepEqual(standIns(), ['figures'], 'and goes on standing in while its frame is under way');
  assert.equal(asked.length, 3, 'a frame under way is not asked for again, nor its move');
  assert.equal(hurried.length, 1, 'the next frame, shown, is hurried');
  asked.length = 0;
  forge.warm(bare, () => ['walk'], 0, 2);
  forge.pump();
  assert.ok(asked.length > 0 && asked.every((each) => each.haste === 'later'), 'warming waits for every frame shown');
});

test('a frame that failed is asked for again only after a while, not each tick with its whole move', async () => {
  const walk = { cell: [1, 2], frames: 4, root: [0, 1] } as const;
  const moving: ForgeLooks = { bodies: { male: { anims: { walk }, layers: { body: ['walk'] } } } };
  let asked = 0;
  const failing: Composer = {
    offPage: false,
    compose: () => {
      asked += 1;
      return Promise.reject(new Error('no strip'));
    },
    hurry: () => undefined,
    prefetch: () => undefined,
  };
  const colours = { skins: { bodies: {} }, hair: { bodies: {} } };
  const dyes = { palette: [], clothing: {}, armour: {} };
  const forge = new Cards(maker, store, moving, colours, dyes, undefined, failing);
  forge.card(1, bare, 'walk', 0, 0);
  assert.equal(asked, 4, 'the frame shown and the rest of its move');
  await settled();
  assert.equal(forge.failure, 'no strip');
  standIns();
  for (let tick = 0; tick < 10; tick++) {
    forge.card(1, bare, 'walk', 0, tick % 4);
    forge.pump();
  }
  assert.equal(asked, 4, 'none asked for again within the wait');
  assert.deepEqual(standIns(), [], 'a frame that failed holds up no veil while it waits');
});

test("warming goes at the page's pace whenever the frames are composed on it", () => {
  let offPage = true;
  let started = 0;
  const composer: Composer = {
    get offPage() {
      return offPage;
    },
    compose: () => {
      started += 1;
      return new Promise(() => undefined);
    },
    hurry: () => undefined,
    prefetch: () => undefined,
  };
  const colours = { skins: { bodies: {} }, hair: { bodies: {} } };
  const dyes = { palette: [], clothing: {}, armour: {} };
  const walk = { cell: [1, 2], frames: 8, root: [0, 1] } as const;
  const moving: ForgeLooks = { bodies: { male: { anims: { walk }, layers: { body: ['walk'] } } } };
  const forge = new Cards(maker, store, moving, colours, dyes, undefined, composer);
  forge.warm(bare, () => ['walk'], 0, 1);
  forge.pump();
  assert.equal(started, 4, 'four a tick off the page');
  offPage = false;
  started = 0;
  forge.pump();
  assert.equal(started, 2, 'two a tick once the worker is gone');
});

test('warming a new dress fetches every strip its moves draw, as drawn and as mirrored, once', () => {
  const fetchedNow: string[][] = [];
  const composer: Composer = {
    offPage: true,
    compose: () => new Promise(() => undefined),
    hurry: () => undefined,
    prefetch: (paths) => fetchedNow.push([...paths]),
  };
  const colours = { skins: { bodies: {} }, hair: { bodies: {} } };
  const forge = new Cards(maker, store, looks, colours, { palette: [], clothing: {}, armour: {} }, undefined, composer);
  forge.warm(armed, () => ['guard'], 0, 1);
  forge.warm(armed, () => ['guard'], 0, 1);
  assert.equal(fetchedNow.length, 1, 'once for the dress');
  const layers = (fetchedNow[0] ?? []).map((path) => path.replace('forge/layers/male/', '')).sort();
  assert.ok(layers.includes('body_guard.png') && layers.includes('body_guard_z.png'), layers.join());
  assert.ok(layers.includes('sword_iron_guard.png'), 'the sword in its own fist');
  assert.ok(layers.includes('sword_iron_l_guard.png'), 'and in the other, as a mirrored view draws it');
});

test('a dye counts only on a figure with a layer that takes it, and a page picture goes through the composer', () => {
  const jobs: ComposeJob[] = [];
  const recording: Composer = {
    offPage: true,
    compose: (_key: string, job: ComposeJob) => {
      jobs.push(job);
      return new Promise(() => undefined);
    },
    hurry: () => undefined,
    prefetch: () => undefined,
  };
  const colours = { skins: { bodies: {} }, hair: { bodies: {} } };
  const dyes = { palette: [], clothing: {}, armour: {} };
  const coral = { ...armed, outfit: { ...armed.outfit, dye: 'coral' } };
  const undyed = new Cards(maker, store, looks, colours, dyes, undefined, recording);
  undyed.card(1, armed, 'guard', 0, 0);
  undyed.card(2, coral, 'guard', 0, 0);
  assert.equal(jobs.length, 1, 'nothing worn takes the dye, so the frame is the same one');
  const dyeable = new Cards(maker, store, { ...looks, dye: ['sword_iron'] }, colours, dyes, undefined, recording);
  dyeable.card(1, armed, 'guard', 0, 0);
  dyeable.card(2, coral, 'guard', 0, 0);
  assert.equal(jobs.length, 3, 'a dyed layer is drawn in it');
  void undyed.picture(armed, 'guard', 0, 0, 'sword_iron');
  assert.deepEqual(jobs.at(-1)?.alone, ['sword_iron'], 'the layer drawn by itself rides the job');
});

test('a dye worn reaches the composer with the armour it covers whole', () => {
  const looks: ForgeLooks = {
    bodies: {
      male: {
        anims: { idle: { cell: [1, 2], frames: 1, root: [0, 1] } },
        layers: { body: ['idle'], cuirass_iron: ['idle'] },
      },
    },
    dye: ['cuirass_iron'],
    metal: ['cuirass_iron'],
  };
  const jobs: ComposeJob[] = [];
  const recording: Composer = {
    offPage: true,
    compose: (_key: string, job: ComposeJob) => {
      jobs.push(job);
      return new Promise(() => undefined);
    },
    hurry: () => undefined,
    prefetch: () => undefined,
  };
  const colours = { skins: { bodies: {} }, hair: { bodies: {} } };
  const dyes = { palette: [], clothing: {}, armour: {} };
  const forge = new Cards(maker, store, looks, colours, dyes, undefined, recording);
  const dyed: Dress = { ...bare, outfit: { ...bare.outfit, armour: { cuirass: 'iron' }, garments: [], dye: 'coral' } };
  forge.card(1, dyed, 'idle', 0, 0);
  assert.deepEqual(jobs[0]?.whole, ['cuirass_iron']);
  forge.card(2, { ...dyed, outfit: { ...dyed.outfit, dye: null } }, 'idle', 0, 0);
  assert.deepEqual(jobs[1]?.whole, [], 'own colours cover nothing');
});
