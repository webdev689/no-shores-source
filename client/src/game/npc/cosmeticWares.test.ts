import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COSMETICS, cosmeticRamp } from '../../forge/cosmetics.ts';
import { GAME_PALETTE } from '../appearance/gamePalette.ts';
import { rowsOf } from './npcWares.ts';
import { state } from '../../network/gearForTests.ts';

const numberOf = (id: string) => COSMETICS.findIndex((each) => each.id === id);

test("a keeper's swatch shows the colours the figure is drawn in, and the Tack's barding tile names its barding", () => {
  const [dyes] = rowsOf('tailor', state({ cosmeticsSold: [numberOf('heather')] }));
  const ramp = cosmeticRamp('heather', GAME_PALETTE) ?? [];
  assert.deepEqual(dyes?.wares[0]?.picture, {
    kind: 'swatch',
    colours: [0, 5, 10, 15].map((step) => `rgb(${(ramp[step] ?? []).join(' ')})`),
  });
  const [mount] = rowsOf('tack', state({ cosmeticsSold: [numberOf('wraith_mist')] }));
  assert.deepEqual(mount?.wares[0]?.picture, { kind: 'barding', barding: 'wraith_mist' });
});
