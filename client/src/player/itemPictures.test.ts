import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PART, type Strip } from '../forge/compose.ts';
import type { DyeTable, Rgb } from '../forge/dyes.ts';
import type { ForgeLooks } from '../forge/looks.ts';
import type { ForgeStore } from '../forge/store.ts';
import type { GearItem } from '../network/gearMessages.ts';
import { Cards, type CardMaker } from './cards.ts';
import { plainDress } from './dressing.ts';
import { HORSE, KINDS, MOUNT_SLOT, WORN } from './gear.ts';
import type { Picture } from './picture.ts';
import { ItemPictures, PICTURES_KEPT } from './itemPictures.ts';

// A figure one pixel wide and three tall: skin, a fist, skin. A sword held in the fist lies behind it at the grip.
const cell = { cell: [1, 3], frames: 1, root: [0, 2] } as const;
const looks: ForgeLooks = {
  bodies: {
    male: {
      anims: { guard: cell, idle: cell },
      layers: {
        body: ['guard', 'idle'],
        sword_iron: ['guard'],
        shirt_long_v: ['idle'],
        shield_buckler_iron: ['guard'],
        dagger_iron: ['guard'],
        dagger_iron_l: ['guard'],
        staff_iron: ['idle'],
      },
    },
  },
  dye: ['staff_iron', 'shirt_long_v'],
  metal: ['staff_iron'],
};
const SKIN = [200, 150, 120] as const;
const FIST = [210, 160, 130] as const;
const [BLADE, GRIP, POMMEL] = [[180, 190, 210] as const, [90, 60, 30] as const, [160, 160, 40] as const];
const SHIRT = [128, 128, 128] as const;

/** A strip of one view and one frame, a texel a row (or `width` a row): its colour or depth, alpha 0 where `null`. */
function strip(texels: readonly (readonly [number, number, number] | null)[], width = 1): Strip {
  const data = new Uint8Array(texels.length * 4);
  texels.forEach((texel, spot) => {
    if (texel) data.set([...texel, 255], spot * 4);
  });
  return { width, height: texels.length / width, data };
}
/** A depth texel: how far it lies, in red and green, and the part it is in blue. */
const lies = (far: number, part: number) => [far >> 8, far & 255, part] as const;

const body = strip([SKIN, FIST, SKIN]);
const bodyDepth = strip([lies(1000, PART.torso), lies(500, PART.armR), lies(1000, PART.torso)]);
const strips: Record<string, Strip> = {
  'forge/layers/male/body_guard.png': body,
  'forge/layers/male/body_guard_z.png': bodyDepth,
  'forge/layers/male/body_idle.png': body,
  'forge/layers/male/body_idle_z.png': bodyDepth,
  'forge/layers/male/sword_iron_guard.png': strip([BLADE, GRIP, POMMEL]),
  'forge/layers/male/sword_iron_guard_z.png': strip([
    lies(400, PART.weapon),
    lies(600, PART.weapon),
    lies(400, PART.weapon),
  ]),
  'forge/layers/male/shirt_long_v_idle.png': strip([SHIRT, null, null]),
  'forge/layers/male/shirt_long_v_idle_z.png': strip([lies(900, PART.torso), null, null]),
};
const scene: CardMaker = {
  card: () => assert.fail('a page’s picture never asks the scene for a card'),
  glow: () => assert.fail('nor for a glow'),
};
/** The forge's cards over the strips above and `art`, the large pictures it publishes, with `dyes` its dyes. */
const forgeOver = (art: Record<string, Strip> = {}, dyes: DyeTable = { palette: [], clothing: {}, armour: {} }) => {
  const store = {
    strip: (path: string) => Promise.resolve(art[path] ?? strips[path] ?? null),
  } as unknown as ForgeStore;
  return new Cards(scene, store, looks, { skins: { bodies: {} }, hair: { bodies: {} } }, dyes);
};
const forge = forgeOver();
const dress = plainDress('human', 0.5);

const item = (kind: string, slot: number): GearItem => ({
  id: 1,
  kind: KINDS.indexOf(kind as (typeof KINDS)[number]),
  rarity: 0,
  level: 1,
  named: null,
  name: 0,
  resource: null,
  breach: false,
  hard: false,
  xp: 0,
  xpMost: 0,
  bought: 0,
  chosen: [],
  bucket: slot,
  at: WORN + slot,
  attack: 0,
  defense: 0,
  prestige: 0,
  columns: [],
  price: 0,
  element: 0,
  source: 0,
});
/** An item's picture once the forge has drawn it. */
const drawn = (pictures: ItemPictures, gear: GearItem) =>
  new Promise<Picture | null>((resolve) => {
    pictures.pictureOf(gear, dress, () => resolve(pictures.pictureOf(gear, dress, () => {})));
  });
const texels = (picture: Picture | null) =>
  picture
    ? Array.from({ length: picture.width * picture.height }, (unused, spot) => [
        ...picture.pixels.slice(spot * 4, spot * 4 + 3),
      ])
    : [];

test(
  'a weapon in hand is drawn whole: its grip under the fist, and nothing of the fist',
  { timeout: 5000 },
  async () => {
    const sword = await drawn(new ItemPictures(forge), item('sword', 0));
    assert.deepEqual([sword?.width, sword?.height], [1, 3]);
    assert.deepEqual(texels(sword), [[...BLADE], [...GRIP], [...POMMEL]]);
  },
);

test('armour is what it adds to the bare figure', { timeout: 5000 }, async () => {
  const shirt = await drawn(new ItemPictures(forge), item('torso', 3));
  assert.deepEqual(texels(shirt), [[...SHIRT]], 'the shirt over the skin, not the skin or the fist');
});

/** A blade ten texels long and two tall, as the forge draws it large and level; a buckler four by four. */
const LARGE_BLADE = strip(
  Array.from({ length: 20 }, (unused, spot) => (spot % 10 < 3 ? GRIP : BLADE)),
  10,
);
const LARGE_BUCKLER = strip(
  Array.from({ length: 16 }, () => POMMEL),
  4,
);

test('a loadout the forge draws large is its large picture, level; else the cut-out of the figure', async () => {
  const large = forgeOver({ '@art/weapons/sword_iron.png': LARGE_BLADE });
  const sword = await drawn(new ItemPictures(large), item('sword', 0));
  assert.deepEqual([sword?.width, sword?.height, sword?.level], [10, 2, true]);
  assert.deepEqual(texels(sword).slice(2, 4), [[...GRIP], [...BLADE]], 'its grip at its left, its blade to the right');
  const shirt = await drawn(new ItemPictures(large), item('torso', 3));
  assert.deepEqual(texels(shirt), [[...SHIRT]], 'armour is never a weapon’s large picture');
});

test('a large picture that fails to load gives way to the figure’s cut-out', async () => {
  const store = {
    strip: (path: string) =>
      path.startsWith('@art/weapons/')
        ? Promise.reject(new Error('the pack did not come'))
        : Promise.resolve(strips[path] ?? null),
  } as unknown as ForgeStore;
  const failing = new Cards(
    scene,
    store,
    looks,
    { skins: { bodies: {} }, hair: { bodies: {} } },
    { palette: [], clothing: {}, armour: {} },
  );
  const sword = await drawn(new ItemPictures(failing), item('sword', 0));
  assert.deepEqual([sword?.level, texels(sword).length], [undefined, 3], 'the figure’s three texels of sword');
});

test('a loadout in both hands is one picture, the left hand’s smaller behind the right’s at its left', async () => {
  const both = { '@art/weapons/sword_iron.png': LARGE_BLADE, '@art/weapons/shield_buckler_iron.png': LARGE_BUCKLER };
  const loadout = await drawn(new ItemPictures(forgeOver(both)), item('sword_and_shield', 0));
  assert.deepEqual([loadout?.width, loadout?.height, loadout?.level], [10, 3, true], 'the buckler shrunk to three');
  assert.deepEqual(
    texels(loadout).slice(1, 4),
    [[...POMMEL], [...POMMEL], [...POMMEL]],
    'above the blade, at its left',
  );
  assert.deepEqual(texels(loadout)[10 + 1], [...GRIP], 'and behind it');
  // A pair's left hand holds its twin (`dagger_iron_l`), drawn as its right hand's.
  const daggers = await drawn(
    new ItemPictures(forgeOver({ '@art/weapons/dagger_iron.png': LARGE_BLADE })),
    item('double_daggers', 0),
  );
  assert.deepEqual([daggers?.width, daggers?.height], [12, 3], 'the second, eight long, stands out two past its left');
  // With the buckler not drawn large, the whole loadout is the figure's cut-out, never half of each.
  const half = await drawn(
    new ItemPictures(forgeOver({ '@art/weapons/sword_iron.png': LARGE_BLADE })),
    item('sword_and_shield', 0),
  );
  assert.deepEqual([half?.level, texels(half)[0]], [undefined, [...BLADE]]);
});

test('a staff’s large picture takes its metal’s ramp on its greys, as the figure’s layer does', async () => {
  const ramp: Rgb[] = Array.from({ length: 16 }, (unused, step) => [step * 10, step * 5, 0] as const);
  const dyes = { palette: [], clothing: {}, armour: { Iron: ramp } };
  const grey = [136, 136, 136] as const;
  const staff = strip([grey, GRIP, grey, POMMEL], 4);
  const pictures = new ItemPictures(forgeOver({ '@art/weapons/staff_iron.png': staff }, dyes));
  const drawnStaff = await drawn(pictures, item('staff', 0));
  assert.deepEqual(texels(drawnStaff), [[...(ramp[8] ?? [])], [...GRIP], [...(ramp[8] ?? [])], [...POMMEL]]);
});

test('a piece of clothing the forge draws large is its large picture, upright and dyed as its layer; else the cut-out', async () => {
  const ramp: Rgb[] = Array.from({ length: 16 }, (unused, step) => [step * 10, 0, step * 5] as const);
  const dyes = { palette: [], clothing: { White: ramp }, armour: {} };
  const grey = [136, 136, 136] as const;
  // A shirt three texels wide and five tall, much taller than wide, its collar a band of leather.
  const shirt = strip([GRIP, GRIP, GRIP, ...Array.from({ length: 12 }, () => grey)], 3);
  const pictures = new ItemPictures(forgeOver({ '@art/armour/male/shirt_long_v.png': shirt }, dyes));
  const drawnShirt = await drawn(pictures, item('torso', 3));
  assert.deepEqual([drawnShirt?.width, drawnShirt?.height, drawnShirt?.upright], [3, 5, true]);
  assert.deepEqual(texels(drawnShirt).slice(2, 4), [[...GRIP], [...(ramp[8] ?? [])]], 'its greys on its dye, as worn');
  // On a body the forge draws no large picture for, the shirt is what it adds to the figure.
  const cutOut = await drawn(new ItemPictures(forgeOver({}, dyes)), item('torso', 3));
  assert.deepEqual([cutOut?.upright, texels(cutOut)], [undefined, [[...(ramp[8] ?? [])]]]);
});

test('pictures past the most kept are let go, those asked for least lately first', { timeout: 20000 }, async () => {
  const pictures = new ItemPictures(forge);
  const sword = item('sword', 0);
  const wornBy = (body: number) => plainDress('human', body / (PICTURES_KEPT + 2));
  const draw = (body: number) =>
    new Promise<void>((done) => {
      if (pictures.pictureOf(sword, wornBy(body), done)) done();
    });
  for (let body = 0; body <= PICTURES_KEPT; body++) {
    await draw(body);
    // The first is shown all along, so it is asked for after each.
    pictures.pictureOf(sword, wornBy(0), () => {});
  }
  assert.ok(
    pictures.pictureOf(sword, wornBy(0), () => {}),
    'the one shown all along is kept',
  );
  assert.equal(
    pictures.pictureOf(sword, wornBy(1), () => {}),
    null,
    'the one asked for least lately was let go',
  );
});

test('a horse is drawn as its own layer in its coat, from the side, standing, on the body asked', async () => {
  const asked: unknown[][] = [];
  const horseForge = {
    picture: (...args: unknown[]) => {
      asked.push(args);
      return Promise.resolve({ width: 1, height: 1, pixels: new Uint8ClampedArray([1, 2, 3, 255]) });
    },
    wardrobe: () => assert.fail('a horse needs no wardrobe'),
  } as unknown as Cards;
  const pictures = new ItemPictures(horseForge);
  const body = plainDress('human', 0.3);
  const chestnut = { ...item('sword', 0), kind: HORSE, name: 1, bucket: MOUNT_SLOT };
  await new Promise<void>((done) => pictures.pictureOf(chestnut, body, done));
  const [dress, anim, view, , alone] = asked[0] ?? [];
  assert.deepEqual([anim, view, alone], ['horseidle', 2, 'horse']);
  assert.equal((dress as typeof body).outfit.coat, 'chestnut');
  assert.equal((dress as typeof body).outfit.barding, null, 'its tile shows the horse, never a barding');
  assert.ok(
    pictures.pictureOf(chestnut, body, () => {}),
    'kept once drawn',
  );
});
