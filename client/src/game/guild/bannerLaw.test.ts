import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Banner, PARTS, SIGNS, bannerFrom, bannerOfName, bannerRefusal, choicesOf, nameOf } from './bannerLaw.ts';
import { signRows } from './guildSigns.ts';

const NAVY: Banner = {
  cut: 'square',
  cloth: 'navy',
  device: 'plain',
  deviceColour: 'navy',
  sign: 'anchor',
  signColour: 'salt',
  ground: 'none',
  groundColour: 'pitch',
  staff: 'driftwood',
};

test('a banner drawn from any name keeps the law, and the same name draws the same banner', () => {
  for (const name of ['Salt Kings', 'Brine Wolves', 'The Drowned', 'X', 'Zzz Top', 'Tequila Mockingbirds']) {
    assert.equal(bannerRefusal(bannerOfName(name), 1), null, name);
    assert.deepEqual(bannerOfName(name), bannerOfName(name.toUpperCase()), 'the name read whatever its case');
  }
  assert.notDeepEqual(bannerOfName('Salt Kings'), bannerOfName('Brine Wolves'));
});

test('a plain device may share the cloth colour, as it shows none', () => {
  assert.equal(bannerRefusal(NAVY, 1), null);
  assert.equal(bannerRefusal({ ...NAVY, device: 'halves' }, 1), 'Give the device a colour unlike the cloth.');
});

test("a staff opens at its level, so a new guild's banner hangs on driftwood alone", () => {
  assert.equal(bannerRefusal({ ...NAVY, staff: 'oak' }, 1), 'Your guild has not yet earned that staff.');
  assert.equal(bannerRefusal({ ...NAVY, staff: 'oak' }, 2), null);
  assert.equal(bannerRefusal({ ...NAVY, staff: 'gilded' }, 10), null);
});

test('only a whole banner of known parts is read from what is sent', () => {
  assert.deepEqual(bannerFrom({ ...NAVY, extra: 'ignored' }), NAVY);
  assert.equal(bannerFrom({ ...NAVY, cut: 3 }), null);
  assert.equal(bannerFrom('banner'), null);
  assert.equal(bannerRefusal({ ...NAVY, cloth: 'chartreuse' }, 1), 'That banner has a part we do not know.');
});

test('every sign the banners offer is drawn, no wider or taller than sixteen cells', () => {
  for (const sign of SIGNS) {
    const rows = signRows(sign);
    assert.ok(rows.length > 0 && rows.length <= 16, `${sign} has rows`);
    assert.ok(
      rows.every((row) => row.length <= 16 && /^[.#+]+$/.test(row)),
      `${sign} is cells of #, + and . alone`,
    );
  }
});

test('each part offers its own list, and a choice reads in plain words', () => {
  assert.deepEqual(
    PARTS.map((part) => choicesOf(part).length > 1),
    new Array(PARTS.length).fill(true),
  );
  assert.equal(nameOf('sign', 'broken_shield'), 'Broken shield');
  assert.equal(nameOf('cut', 'three-tails'), 'Three Tails');
  assert.equal(nameOf('cloth', 'sea-green'), 'Sea Green');
});
