import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EMBLEMS, PLATE_CELLS, SIGN_CELLS, emblemOf, emblemPixels } from './emblemArt.ts';
import { MOTIFS } from './emblemMotifs.ts';

test('every emblem has its sign drawn, at most 16 cells square, in ink and accent only', () => {
  for (const emblem of EMBLEMS) {
    const rows = MOTIFS[emblem.art.motif];
    assert.ok(rows, `${emblem.id}'s sign ${emblem.art.motif} is drawn`);
    assert.ok(rows.length <= 16 && rows.every((row) => row.length === 16 && /^[.#+]+$/.test(row)), emblem.art.motif);
    assert.equal(emblem.art.ground.length, 2, `${emblem.id} falls from one colour to another`);
  }
});

test("a nameplate's left square is its sign's own ground, so the two join without a seam", () => {
  for (const emblem of EMBLEMS) {
    const [sign, plate] = [emblemPixels(emblem, 'sign'), emblemPixels(emblem, 'plate')];
    assert.equal(plate.length, PLATE_CELLS * SIGN_CELLS * 4);
    for (let y = 1; y < SIGN_CELLS - 1; y++)
      for (let x = 1; x < SIGN_CELLS - 1; x++) {
        const cell = (width: number) => (y * width + x) * 4;
        assert.deepEqual(
          [...plate.subarray(cell(PLATE_CELLS), cell(PLATE_CELLS) + 4)],
          [...sign.subarray(cell(SIGN_CELLS), cell(SIGN_CELLS) + 4)],
          `${emblem.id} at ${x}, ${y}`,
        );
      }
  }
});

test('an emblem is found by its number or id, and an unknown one is Overlook’s own', () => {
  assert.equal(emblemOf(0).id, 'overlook');
  assert.equal(emblemOf('captain').name, 'Captain');
  assert.equal(emblemOf('no_such').id, 'overlook');
  assert.equal(emblemOf(null).id, 'overlook');
});

test("the menu's banner is drawn to the width asked for, framed all round, so none of it is cut off", () => {
  const emblem = EMBLEMS[0];
  assert.ok(emblem);
  const cells = 613;
  const banner = emblemPixels(emblem, 'banner', cells);
  assert.equal(banner.length, cells * SIGN_CELLS * 4);
  const right = (y: number) => [...banner.subarray((y * cells + cells - 1) * 4, (y * cells + cells) * 4)];
  const inner = (y: number) => [...banner.subarray((y * cells + cells - 2) * 4, (y * cells + cells - 1) * 4)];
  assert.notDeepEqual(right(SIGN_CELLS / 2), inner(SIGN_CELLS / 2), 'its frame stands at its own end');
});
