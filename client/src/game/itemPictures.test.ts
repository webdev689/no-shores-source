import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PART, type Strip } from '../forge/compose.ts';
import type { ForgeLooks } from '../forge/looks.ts';
import type { ForgeStore } from '../forge/store.ts';
import type { GearItem } from '../network/gearMessages.ts';
import { Cards } from '../player/cards.ts';
import { plainDress } from '../player/dressing.ts';
import { KINDS, WORN } from '../player/gear.ts';
import type { Picture } from '../player/picture.ts';
import { ItemPictures } from './itemPictures.ts';

// A figure one pixel wide and three tall: skin, a fist, skin. A sword held in the fist lies behind it at the grip.
const cell = { cell: [1, 3], frames: 1, root: [0, 2] } as const;
const looks: ForgeLooks = {
  bodies: {
    male: {
      anims: { guard: cell, idle: cell },
      layers: { body: ['guard', 'idle'], sword_iron: ['guard'], shirt_long_v: ['idle'] },
    },
  },
};
const SKIN = [200, 150, 120] as const;
const FIST = [210, 160, 130] as const;
const [BLADE, GRIP, POMMEL] = [[180, 190, 210] as const, [90, 60, 30] as const, [160, 160, 40] as const];
const SHIRT = [128, 128, 128] as const;

/** A strip of one view and one frame, a texel a row: its colour or depth, alpha 0 where `null`. */
function strip(texels: readonly (readonly [number, number, number] | null)[]): Strip {
  const data = new Uint8Array(texels.length * 4);
  texels.forEach((texel, row) => {
    if (texel) data.set([...texel, 255], row * 4);
  });
  return { width: 1, height: texels.length, data };
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
const store = { strip: (path: string) => Promise.resolve(strips[path] ?? null) } as unknown as ForgeStore;
const forge = new Cards(
  { card: () => assert.fail('a page’s picture never asks the scene for a card') },
  store,
  looks,
  { skins: { bodies: {} }, hair: { bodies: {} } },
  { palette: [], clothing: {}, armour: {} },
);
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
