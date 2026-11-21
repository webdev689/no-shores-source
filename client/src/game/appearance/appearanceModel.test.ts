import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COSMETICS } from '../../forge/cosmetics.ts';
import type { GearState } from '../../network/gearMessages.ts';
import { plainDress } from '../../player/dressing.ts';
import { EMBLEMS } from '../emblemArt.ts';
import { appearanceRows, howHad, previewDress, previewedTile } from './appearanceModel.ts';

const number = (id: string) => COSMETICS.findIndex((each) => each.id === id);
const gear = (fields: Partial<GearState>) => fields as GearState;

test('four rows under their headings: every emblem, then every dye, coat and barding of the catalogue', () => {
  const rows = appearanceRows(gear({}));
  assert.deepEqual(
    rows.map((row) => row.heading),
    ['Emblem', 'Dye', 'Coat', 'Barding'],
  );
  assert.equal(rows[0]?.tiles.length, EMBLEMS.length);
  for (const row of rows.slice(1))
    assert.equal(row.tiles.length, COSMETICS.filter((each) => each.kind === row.kind).length, row.heading);
});

test('kept pieces are lit and the one worn of each kind is marked; the rest are dim', () => {
  const rows = appearanceRows(
    gear({
      emblem: 2,
      emblems: [0, 2],
      cosmetics: [number('coral'), number('grey'), number('dawnfire')],
      worn: { dye: number('coral'), coat: number('bay'), barding: number('dawnfire') },
    }),
  );
  const [emblems, dyes, coats, bardings] = rows.map((row) => row.tiles);
  assert.deepEqual(
    emblems?.filter((tile) => tile.kept).map((tile) => tile.number),
    [0, 2],
  );
  assert.equal(emblems?.find((tile) => tile.worn)?.number, 2);
  assert.deepEqual(
    dyes?.filter((tile) => tile.kept).map((tile) => tile.id),
    ['own_colours', 'coral'],
    'the start dye is always kept',
  );
  assert.equal(dyes?.find((tile) => tile.worn)?.id, 'coral');
  assert.equal(coats?.find((tile) => tile.worn)?.id, 'bay');
  assert.equal(bardings?.find((tile) => tile.worn)?.id, 'dawnfire');
  assert.equal(bardings?.find((tile) => tile.id === 'ember_plate')?.kept, false);
  // With no word of what is worn yet, the start pieces are.
  const fresh = appearanceRows(gear({}));
  assert.deepEqual(
    fresh.slice(1).map((row) => row.tiles.find((tile) => tile.worn)?.id),
    ['own_colours', 'bay', 'bare'],
  );
});

test("each card says how its piece is had: the Tailor's, the Tack's, a faction's rank, or from the start", () => {
  assert.equal(howHad({ kind: 'sold', aurem: 1000, level: 1 }, 'dye'), 'Sold by the Tailor.');
  assert.equal(howHad({ kind: 'sold', aurem: 3000, level: 5 }, 'coat'), 'Sold by the Tack from level 5.');
  assert.equal(howHad({ kind: 'sold', aurem: 9000, level: 20 }, 'barding'), 'Sold by the Tack from level 20.');
  assert.equal(howHad({ kind: 'faction', faction: 2, rank: 2 }, 'dye'), "Reach the Lamplighters' second rank.");
  assert.equal(howHad({ kind: 'faction', faction: 3, rank: 2 }, 'dye'), "Reach the Veiled's second rank.");
  assert.equal(howHad({ kind: 'start' }, 'coat'), 'Yours from the start.');
  const rows = appearanceRows(gear({}));
  assert.equal(
    rows[1]?.tiles.find((tile) => tile.id === 'stormcaller_blue')?.how,
    "Reach the Stormcallers' second rank.",
  );
  assert.equal(rows[0]?.tiles[1]?.how, 'Reach level 5.', "an emblem's words say how it is had");
});

test('a hovered dye, coat or barding is worn on the display; a start piece shows the own colours', () => {
  const dress = plainDress('human', 0.3);
  const [, dyes, coats] = appearanceRows(gear({}));
  const coral = dyes?.tiles.find((tile) => tile.id === 'coral') ?? null;
  assert.equal(previewDress(dress, coral).outfit.dye, 'coral');
  const worn = { ...dress, outfit: { ...dress.outfit, coat: 'grey' } };
  assert.equal(previewDress(worn, coats?.tiles[0] ?? null).outfit.coat, null, 'Bay');
  assert.equal(previewDress(dress, null), dress);
});

test('the display previews the tile under the pointer, else the one the keys hold focused, else none', () => {
  const [, dyes] = appearanceRows(gear({}));
  const [first, second] = dyes?.tiles ?? [];
  assert.ok(first && second);
  const tiles = [first, second];
  const only = (wanted: unknown) => (tile: unknown) => tile === wanted;
  assert.equal(previewedTile(tiles, only(second), only(first)), second, 'the pointer before the keys');
  assert.equal(previewedTile(tiles, only(null), only(first)), first, 'the pointer gone, the tile the keys focused');
  assert.equal(previewedTile(tiles, only(null), only(null)), null, 'with neither, the player as they are');
});
