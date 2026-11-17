// The dungeons' three sets in each climate: rubble or brick strips, flagstones, framed slabs, cobbles.
import { frame } from '../frames.ts';
import type { Job, RecipeContext } from '../recipe.ts';
import { blocks, fleck, mottle, rubble } from '../stone.ts';
import { Surface } from '../surface.ts';
import { cracks, drips } from '../weathering.ts';
import { kitMats } from './thingMats.ts';

/** The dungeons' three sets, by climate: their stones. */
const DUNGEON_STONE: Readonly<Record<number, readonly [string, string]>> = {
  0: ['sandstone', 'brickTan'],
  100: ['stone', 'stoneDark'],
  300: ['rubbleWarm', 'stone'],
  400: ['stoneGreen', 'stoneDark'],
};

/** A record of the dungeons' three sets: rubble or brick strips, flagstones, framed slabs, cobbles. */
export function paintDungeon(ctx: RecipeContext): Job {
  const { archive, record, width, height, seed } = ctx;
  const set = archive % 100;
  const [stoneName, secondName] = DUNGEON_STONE[archive - set] ?? DUNGEON_STONE[300];
  const mats = kitMats(stoneName, secondName, 'flagstone', 'slime', 'moss');
  const index = mats.index;
  const stone = index[stoneName];
  const second = index[secondName];
  const surf = new Surface(width, height);
  const strip = height <= 32;
  const cobbles = (base: number): void =>
    rubble(surf, {
      material: second,
      mortar: index.black,
      across: 6,
      down: 3,
      dome: 1,
      gap: 1,
      seed,
      base,
      toneVar: set === 23 ? 0.05 : 0.08,
      mortarTone: 0.5,
      relief: 0.6,
      bevel: 2.5,
    });
  if (set === 22) {
    if (strip && record <= 1) {
      blocks(surf, {
        material: stone,
        mortar: index.black,
        rows: 3,
        widths: [14, 26],
        bond: 'random',
        gap: 1.6,
        bevel: 2,
        rough: 3,
        seed,
        base: 0.58,
        relief: 1.4,
        amp: 0.35,
        mortarTone: 0.5,
        toneVar: 0.22,
        round: 2,
        fine: 0.05,
      });
      fleck(surf, { from: stone, to: second, share: 0.45, size: 1.6, seed });
    } else if (record === 2)
      rubble(surf, {
        material: index.flagstone,
        mortar: index.black,
        across: 4,
        down: 4,
        flat: true,
        gap: 0.7,
        bevel: 0.6,
        relief: 0.3,
        seed,
        base: 0.5,
        toneVar: 0.06,
        mortarTone: 0.1,
      });
    else {
      mottle(surf, { material: second, base: 0.5, amp: 0.15, cells: 6, fine: 0.05, texel: 0.2, bump: 0.3, seed });
      frame(surf, 3, { material: index.wood, base: 0.45 });
    }
  } else if (set === 23) {
    if (strip && record <= 1) {
      blocks(surf, {
        material: second,
        mortar: index.mortar,
        rows: 4,
        widths: [16, 22],
        gap: 1,
        bevel: 1,
        seed,
        base: 0.55,
        relief: 0.8,
        amp: 0.3,
        toneVar: 0.16,
        mortarTone: 0.4,
      });
      drips(surf, { material: index.slime, count: 6, len: 3, seed });
    } else if (strip) cobbles(0.6);
    else if (record === 2)
      blocks(surf, {
        material: second,
        mortar: index.black,
        rows: 4,
        widths: [20, 30],
        gap: 1,
        bevel: 1,
        seed,
        base: 0.35,
        relief: 0.6,
        toneVar: 0.12,
      });
    else {
      mottle(surf, { material: second, base: 0.4, amp: 0.15, cells: 6, fine: 0.05, texel: 0.2, seed });
      frame(surf, 3, { material: index.woodDark, base: 0.4 });
    }
  } else if (strip && record <= 1)
    blocks(surf, {
      material: second,
      mortar: index.black,
      rows: 5,
      widths: [7, 11],
      gap: 1,
      bevel: 0.6,
      seed,
      base: 0.5,
      relief: 0.5,
      toneVar: 0.15,
      mortarTone: 0.3,
    });
  else if (strip) cobbles(0.45);
  else if (record === 2) {
    rubble(surf, {
      material: second,
      mortar: stone,
      across: 4,
      down: 4,
      flat: true,
      gap: 0.9,
      bevel: 0.6,
      relief: 0.4,
      seed,
      base: 0.5,
      toneVar: 0.06,
      mortarTone: 0.6,
    });
    cracks(surf, { count: 3, seed });
  } else
    blocks(surf, {
      material: second,
      mortar: index.black,
      rows: 4,
      widths: [14, 22],
      gap: 1,
      bevel: 1,
      seed,
      base: 0.45,
      relief: 0.8,
      toneVar: 0.15,
    });
  return { surf, mats, finish: { strength: 0.7 } };
}
