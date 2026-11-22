import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GLYPHS, isGlyph, paintGlyph } from './landGlyphs.ts';
import { recorder } from './painterForTests.ts';

test('every glyph paints something, within its room, and restores what it set', () => {
  for (const glyph of GLYPHS) {
    const { painter, calls, depth } = recorder();
    paintGlyph(painter, glyph);
    const drawn = calls.filter((call) => ['fill', 'stroke', 'fillRect', 'strokeRect'].includes(call.name));
    assert.ok(drawn.length > 0, `${glyph} draws`);
    assert.equal(depth(), 0, `${glyph} restores`);
    const reach = calls
      .filter((call) => call.name === 'moveTo' || call.name === 'lineTo')
      .flatMap((call) => call.args as number[]);
    assert.ok(Math.max(0, ...reach.map(Math.abs)) <= 9.5, `${glyph} keeps within its room`);
  }
});

test("each keeper's coin is their sign's board, and no two of a colour carry the same device", () => {
  const coinOf = (glyph: (typeof GLYPHS)[number]) => {
    const { painter, calls } = recorder();
    paintGlyph(painter, glyph);
    return calls.find((call) => call.name === 'fill')?.fillStyle;
  };
  // The Mage's and the Weaponsmith's boards are black, the vaults' and the Armorsmith's crimson.
  assert.equal(coinOf('mage'), coinOf('weaponsmith'));
  assert.equal(coinOf('vault'), coinOf('armorsmith'));
  assert.notEqual(coinOf('mage'), coinOf('vault'));
  assert.notEqual(coinOf('stormcallers'), coinOf('veiled'));
});

test('a station or a site names its glyph only where one is drawn for it', () => {
  assert.ok(isGlyph('harbourmaster') && isGlyph('chandler') && isGlyph('resource'));
  assert.ok(!isGlyph('shape') && !isGlyph('ore'), "a node is its island's resource, not a kind of its own");
});
