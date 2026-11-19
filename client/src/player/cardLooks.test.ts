import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CARD_LOOK_FLOATS, FLASH, STATUS_WGSL, cardLookValues } from './cardLooks.ts';
import type { CardAt } from './cards.ts';

const card = { texture: {} as GPUTexture, width: 62, height: 124, root: [31, 124] as const };
const plain: CardAt = { card, x: 0, y: 0, z: 0, flip: false };

test('a card’s look is its statuses, its look and its tint, in the order the shader reads them', () => {
  assert.deepEqual(cardLookValues(plain, 3), [0, 0, 3, 0, 0, 0, 0, FLASH.off, 1, 1, 1, 0]);
  const struck: CardAt = {
    ...plain,
    veiled: true,
    exposed: true,
    charged: true,
    jitter: -1,
    dissolve: { share: 0.5, look: 2 },
    flash: { stage: FLASH.outline, colour: [1, 0.16, 0.1] },
  };
  const values = cardLookValues(struck, 7);
  assert.equal(values.length, CARD_LOOK_FLOATS);
  assert.deepEqual(values, [1, 1, 7, 0.5, 1, 2, -1, FLASH.outline, 1, 0.16, 0.1, 0]);
});

test('drawn as its smear, a card takes the smear’s colour and no flash', () => {
  const smeared: CardAt = {
    ...plain,
    flash: { stage: FLASH.whole, colour: [1, 1, 1] },
    smear: { across: 4, up: 0, colour: [0.2, 0.4, 0.6] },
  };
  assert.deepEqual(cardLookValues(smeared, 0, true).slice(7), [FLASH.off, 0.2, 0.4, 0.6, 1]);
  assert.deepEqual(cardLookValues(smeared, 0).slice(7), [FLASH.whole, 1, 1, 1, 0], 'the card itself flashes');
});

test('the card’s shader is whole', () => {
  for (const name of ['fn card_texel(', 'fn card_shade(', 'fn status_dissolve(', 'fn status_arc('])
    assert.ok(STATUS_WGSL.includes(name), name);
  assert.equal(STATUS_WGSL.split('{').length, STATUS_WGSL.split('}').length);
  assert.ok(!/NaN|undefined|\$\{/.test(STATUS_WGSL));
});
