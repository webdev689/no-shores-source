import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LATTICE_SHADE, latticeLit } from './latticeShade.ts';

// Texels as the published renders hold them (tools/lattice), measured from the Husk's and the Ravager's idles.
const SKIN = [0.52, 0.39, 0.26] as const;
const MANTLE = [0.58, 0.19, 0.19] as const;
const CRYSTAL_TIP = [0.96, 0.5, 0.52] as const;
const NIGHT = [0.08, 0.09, 0.14] as const;
const NOON = [1, 1, 1] as const;

test("at night only the crystal's bright points glow; its skin, cloth and mantle take the dark as the Tithe's do", () => {
  assert.deepEqual(
    latticeLit(SKIN, NIGHT),
    NIGHT.map((part) => part * LATTICE_SHADE.body),
  );
  assert.deepEqual(
    latticeLit(MANTLE, NIGHT),
    NIGHT.map((part) => part * LATTICE_SHADE.body),
  );
  assert.ok(latticeLit(CRYSTAL_TIP, NIGHT).every((part) => part >= LATTICE_SHADE.glowFloor));
});

test('in daylight a Lattice figure is shaded a little darker than a man, its crystal points left as lit', () => {
  assert.ok(latticeLit(SKIN, NOON).every((part) => part < 1));
  assert.deepEqual(latticeLit(CRYSTAL_TIP, NOON), [1, 1, 1]);
});
