import assert from 'node:assert/strict';
import { test } from 'node:test';
import factions from '../../../../content/gear/factions.json' with { type: 'json' };
import { COSMETICS, cosmeticRamp, factionRamp } from '../../forge/cosmetics.ts';
import { LIGHTNESS_TOLERANCE, PaletteSnap, type Rgb, oklab } from '../../forge/dyes.ts';
import { GAME_PALETTE } from './gamePalette.ts';

const PALETTE = GAME_PALETTE.map((colour) => colour.join());

/** Every dye's and every faction colour's ramp, by its name. */
const COLOURS: readonly (readonly [string, readonly Rgb[]])[] = [
  ...COSMETICS.filter((each) => each.kind === 'dye' && each.look.length).map(
    (each) => [each.id, cosmeticRamp(each.id, GAME_PALETTE) ?? []] as const,
  ),
  ...factions.factions.map((faction) => [faction.gear.colour, factionRamp(faction.key, GAME_PALETTE) ?? []] as const),
];

test("each dye and faction colour is drawn on the game's palette, as the composer's snap leaves it", () => {
  const snap = new PaletteSnap(GAME_PALETTE);
  for (const [name, ramp] of [...COLOURS, ['grey', cosmeticRamp('grey', GAME_PALETTE) ?? []] as const]) {
    assert.equal(ramp.length, 16, name);
    assert.ok(
      ramp.every((colour) => PALETTE.slice(1).includes(colour.join())),
      `${name} is all palette colours`,
    );
    const pixels = Uint8Array.from(ramp.flatMap((colour) => [...colour, 255]));
    snap.snap(pixels);
    assert.deepEqual(
      [...pixels],
      ramp.flatMap((colour) => [...colour, 255]),
      `${name} snaps to itself`,
    );
  }
});

test('each dye and faction colour stays its own on the palette: ten steps at least, and far from every other', () => {
  const labs = new Map(COLOURS.map(([name, ramp]) => [name, ramp.map((colour) => oklab(...colour))]));
  for (const [name, ramp] of COLOURS) {
    assert.ok(new Set(ramp.map((colour) => colour.join())).size >= 10, `${name} keeps ten distinct steps`);
    for (const [other] of COLOURS) {
      if (other === name) continue;
      const [mine, theirs] = [labs.get(name) ?? [], labs.get(other) ?? []];
      const mean =
        mine.reduce(
          (sum, step, place) => sum + Math.hypot(...step.map((value, axis) => value - (theirs[place]?.[axis] ?? 0))),
          0,
        ) / 16;
      assert.ok(mean >= 0.06, `${name} and ${other} are ${mean.toFixed(3)} apart`);
    }
  }
});

test("each dye's, coat's and faction colour's light rises step by step, and a white ends at the palette's lightest", () => {
  const coats = COSMETICS.filter((each) => each.kind === 'coat' && each.look.length).map(
    (each) => [each.id, cosmeticRamp(each.id, GAME_PALETTE) ?? []] as const,
  );
  for (const [name, ramp] of [...COLOURS, ...coats]) {
    assert.equal(ramp.length, 16, name);
    const lights = ramp.map((colour) => oklab(...colour)[0]);
    lights.forEach((light, step) =>
      assert.ok(
        step === 0 || light >= (lights[step - 1] ?? 0) - LIGHTNESS_TOLERANCE,
        `${name} darkens at step ${step}`,
      ),
    );
  }
  const neutrals = GAME_PALETTE.slice(1).filter((colour) => Math.max(...colour) - Math.min(...colour) <= 12);
  const lightest = neutrals.reduce((most, colour) => (oklab(...colour)[0] > oklab(...most)[0] ? colour : most));
  for (const white of ['brine_white', 'white']) {
    const ramp = cosmeticRamp(white, GAME_PALETTE) ?? [];
    assert.deepEqual(ramp[15], lightest, `${white} ends at the lightest neutral`);
    assert.ok(new Set(ramp.slice(10).map((colour) => colour.join())).size >= 3, `${white}'s lit third is shaded`);
  }
});
