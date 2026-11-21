import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tipOf } from '../plus/barFrame.ts';
import { PLATES } from '../plus/barLayout.ts';
import { COMPASS, UNDER_COMPASS } from '../plus/compass.ts';
import { barLength, compassWidth, EDGE, hudLayout, VITAL_SIZES } from './hudLayout.ts';

type Box = readonly [left: number, top: number, right: number, bottom: number];

/** The Game's screens from the least to 1440p, and the Test Ground's view between its panels at 960, 1280 and 1920
 *  wide (its panels 220 and 240 wide at the narrowest, 320 and 360 at the widest). */
const SCREENS = [
  [960, 600],
  [1280, 720],
  [1366, 768],
  [1440, 900],
  [1600, 900],
  [1920, 1080],
  [2400, 1300],
  [2560, 1440],
] as const;
const TEST_GROUND = [
  [500, 600],
  [692, 720],
  [1240, 1080],
] as const;
/** The widest word poise says ("Staggered"), at the words' size and the names'; four buffs at once. */
const WORD_PX = { base: 80, wide: 160 };
const BUFFS = 4;

const meets = (one: Box, other: Box) =>
  Math.max(one[0], other[0]) < Math.min(one[2], other[2]) && Math.max(one[1], other[1]) < Math.min(one[3], other[3]);

/** The vitals' pieces in a view, as the sheet lays them at the layout's step and zoom: each bar (a player's health and
 *  stamina 100, poise 40), poise's word beside it, and the buffs' row under them. */
function vitalsOf(width: number, height: number): Record<string, Box> {
  const { wide, zoom, length } = hudLayout(width, height);
  const sizes = wide ? VITAL_SIZES.wide : VITAL_SIZES.base;
  const left = EDGE.side * zoom;
  let top = EDGE.top * zoom;
  const bar = (name: 'health' | 'stamina' | 'poise', most: number): Box => {
    const tall = sizes[name] * zoom;
    const box: Box = [left, top, left + barLength(length, most, 100, sizes[name]) * zoom, top + tall];
    top += tall + sizes.gap * zoom;
    return box;
  };
  const [health, stamina, poise] = [bar('health', 100), bar('stamina', 100), bar('poise', 40)];
  const wordLeft = poise[2] + (tipOf(sizes.poise) + 6) * zoom;
  const lineHeight = (wide ? 22 : 12) * zoom;
  const middle = (poise[1] + poise[3]) / 2;
  const word: Box = wide
    ? [wordLeft, poise[1], wordLeft + WORD_PX.wide, poise[1] + lineHeight]
    : [wordLeft, middle - lineHeight / 2, wordLeft + WORD_PX.base * zoom, middle + lineHeight / 2];
  const icon = (wide ? 36 : 24) * zoom;
  const buffs: Box = [
    left,
    top + 4 * zoom,
    left + (BUFFS * icon + (BUFFS - 1) * 6 * zoom),
    top + 4 * zoom + icon + 4 * zoom,
  ];
  return { health, stamina, poise, word, buffs };
}

/** The compass's strip and the boss bar under it (its plate and its poise's word), as the layout stands them, at its
 *  zoom past 1440p as the corners stand. */
function columnOf(width: number, height: number): Record<string, Box> {
  const { compassTop, zoom } = hudLayout(width, height);
  const strip = compassWidth(width, zoom);
  const boss = Math.min(PLATES.boss.width * zoom, PLATES.boss.share * width);
  const bossTop = compassTop + (UNDER_COMPASS - COMPASS.top) * zoom;
  const stripBottom = compassTop + (COMPASS.height + COMPASS.rule) * zoom;
  return {
    compass: [(width - strip) / 2, compassTop, (width + strip) / 2, stripBottom],
    boss: [(width - boss) / 2, bossTop, (width + boss) / 2, bossTop + (PLATES.boss.height + 18) * zoom],
  };
}

test('at every screen and in the Test Ground’s view, no vital, buff or poise’s word meets the compass or the boss bar', () => {
  for (const [width, height] of [...SCREENS, ...TEST_GROUND]) {
    const vitals = vitalsOf(width, height);
    const column = columnOf(width, height);
    for (const [name, box] of Object.entries(vitals))
      for (const [other, against] of Object.entries(column))
        assert.ok(
          !meets(box, against),
          `${width}×${height}: ${name} ${box.join(',')} meets ${other} ${against.join(',')}`,
        );
    const right = Math.max(...Object.values(vitals).map((box) => box[2]));
    assert.ok(right <= width - EDGE.side, `${width}×${height}: the vitals stay in the view`);
  }
});

test('beside the compass the bars are a quarter of the view and grow with it; past 1440p they stand at twice their size', () => {
  assert.deepEqual(hudLayout(960, 600), { wide: false, zoom: 1, length: 176, stacked: false, compassTop: 18 });
  assert.equal(hudLayout(1280, 720).length, 333);
  assert.deepEqual(hudLayout(1920, 1080), { wide: true, zoom: 1, length: 499, stacked: false, compassTop: 18 });
  assert.deepEqual(hudLayout(2560, 1440), { wide: false, zoom: 2, length: 333, stacked: false, compassTop: 36 });
  assert.equal(hudLayout(2400, 1200).zoom, 1, 'short of 1300 tall, the larger step only');
});

test('in a view too narrow to hold them beside the compass, its column steps down under the vitals and their buffs', () => {
  for (const [width, height] of TEST_GROUND.slice(0, 2)) {
    const layout = hudLayout(width, height);
    assert.equal(layout.stacked, true, `${width}×${height}`);
    const lowest = Math.max(...Object.values(vitalsOf(width, height)).map((box) => box[3]));
    assert.ok(layout.compassTop >= lowest, `${width}×${height}: the compass at ${layout.compassTop}, under ${lowest}`);
  }
  assert.equal(hudLayout(1240, 1080).stacked, false, 'the Test Ground at 1920 holds them side by side');
});

test('each bar is as long as what it holds: stamina as long as health, poise two fifths, never shorter than its points', () => {
  assert.equal(barLength(333, 100, 100, 10), 333);
  assert.equal(barLength(333, 40, 100, 8), 133);
  assert.equal(barLength(20, 40, 100, 8), tipOf(8) * 2 + 8);
  assert.equal(barLength(333, 140, 100, 12), 333, 'never longer than health');
});

test('past 1440p the compass’s column, the boss bar and the target’s plate under it stand at twice their size', () => {
  assert.equal(compassWidth(2560, 2), COMPASS.width * 2);
  assert.equal(compassWidth(1100, 2), COMPASS.share * 1100, 'never past its share of the view');
});
