import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RARITIES } from '../player/gear.ts';
import { TONES } from '../plus/tones.ts';

/** A colour's relative luminance, as WCAG reckons it. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
  const linear = channels.map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  const [red = 0, green = 0, blue = 0] = linear;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(one: string, other: string): number {
  const [light, dark] = [luminance(one), luminance(other)].sort((a, b) => b - a);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

test("every rarity's name reads at 4.5:1 or better on the kit's presses, at rest and under the pointer", () => {
  for (const ground of [TONES.groundButton, TONES.groundButtonHi]) {
    for (const rarity of RARITIES) {
      const ratio = contrast(rarity.colour, ground);
      assert.ok(ratio >= 4.5, `${rarity.name} on ${ground}: ${ratio.toFixed(2)}:1`);
    }
  }
});
