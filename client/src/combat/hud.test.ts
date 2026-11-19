import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLATES } from '../plus/barLayout.ts';
import { Compass, SHIP_MARK_COLOURS, UNDER_COMPASS } from '../plus/compass.ts';
import { HALO, TONES } from '../plus/tones.ts';
import type { FighterView } from '../rules/fighters.ts';
import { blockedBy, clearOf, veilOf } from './hud.ts';
import { Words } from './hitWords.ts';
import { fightSheetCss } from './hudSheet.ts';
import { findAll, onFakePage } from './page.test.ts';

const standing: FighterView = {
  x: 0,
  y: 0,
  z: 0,
  facing: 0,
  mode: 'ground',
  crouched: false,
  aim: 0,
  side: 'players',
  arms: 0,
  health: 100,
  healthMax: 100,
  stamina: 100,
  poise: 0,
  poiseMax: 35,
  target: null,
  action: { kind: 'idle' },
};
const dead: FighterView = { ...standing, health: 0, action: { kind: 'dead', elapsed: 60 } };

/** The rule the sheet writes for `selector`, as text. */
function rule(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `the sheet has ${selector}`);
  return css.slice(start, css.indexOf('}', start));
}

test('the veil is blood for a death, plain for a link joining again or lost, and none otherwise', () => {
  assert.equal(veilOf({ own: standing, lost: null }), null);
  assert.deepEqual(veilOf({ own: dead, lost: null }), { words: 'You fell. Standing again in 3 s', link: false });
  assert.deepEqual(veilOf({ own: dead, lost: null, rejoining: true }), { words: 'Reconnecting…', link: true });
  assert.deepEqual(veilOf({ own: standing, lost: 'the room closed' }), {
    words: 'The link to the room was lost: the room closed.',
    link: true,
  });
  const css = fightSheetCss();
  assert.match(rule(css, '.fight-hud .veil'), /background: #300a/);
  assert.match(rule(css, '.fight-hud .veil.link'), /background: rgba\(5,7,10,/, 'a lost link is no wound');
});

test('an arrow that would fall on the vitals stands above them on the edge; anywhere else it stays', () => {
  const panel = { left: 24, top: 450, right: 284, bottom: 576 };
  const onIt = { x: 28, y: 520, angle: Math.PI };
  assert.deepEqual(clearOf(onIt, panel, 22), { x: 28, y: 428, angle: Math.PI });
  const below = { x: 150, y: 572, angle: Math.PI / 2 };
  assert.equal(clearOf(below, panel, 22).y, 428, 'one at the foot, toward a foe behind, too');
  const above = { x: 28, y: 300, angle: Math.PI };
  assert.equal(clearOf(above, panel, 22), above);
  const right = { x: 932, y: 520, angle: 0 };
  assert.equal(clearOf(right, panel, 22), right);
});

test('words over the world and the fills carry a hard outline all round, as a ship’s plate strokes its words', () => {
  for (const [across, down] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ])
    assert.ok(HALO.includes(`${across}px ${down}px 0 ${TONES.outline}`), `outlined at ${across}, ${down}`);
  const css = fightSheetCss();
  for (const selector of ['.fight-hud .plate .title', '.fight-hud .vital .label, .fight-hud .vital .number'])
    assert.ok(rule(css, selector).includes(HALO), selector);
});

test('the display keeps its stacking to itself, and the plates over figures under its veil', () => {
  const css = fightSheetCss();
  assert.match(rule(css, '.fight-hud'), /isolation: isolate/, 'never over the page’s own windows');
  assert.match(rule(css, '.fight-hud .over'), /isolation: isolate/, 'the plates’ order stays among them');
});

test('with reduced motion asked for, neither the low health nor the empty stamina blinks', () => {
  const css = fightSheetCss();
  const still = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(still, /\.vital\.low \{ animation: none;/);
  assert.match(still, /\.vital\.stamina\.flash \{ animation: none;/);
});

test('the plates on foot are the sizes the sea draws its own at', () => {
  const css = fightSheetCss();
  const { overhead, boss } = PLATES;
  assert.match(
    rule(css, '.fight-hud .overhead'),
    new RegExp(`width: ${overhead.width}px; height: ${overhead.height}px`),
  );
  assert.match(rule(css, '.fight-hud .boss'), new RegExp(`width: min\\(${boss.width}px, ${boss.share * 100}%\\)`));
  // In a narrow view (the Test Ground's between its panels) the target's plate keeps to the boss bar's share of it.
  assert.match(rule(css, '.fight-hud .target'), new RegExp(`width: min\\(340px, ${boss.share * 100}%\\)`));
});

test('the boss bar and the target’s plate stand in the compass’s column, and a Boss ship’s plate where the boss bar does', () => {
  const css = fightSheetCss();
  for (const selector of ['.fight-hud .boss', '.fight-hud .target']) {
    assert.doesNotMatch(rule(css, selector), /position|top:/, `${selector} is laid by the column, not set apart`);
  }
  assert.equal(PLATES.boss.top, UNDER_COMPASS, 'at sea a Boss ship’s plate stands where the boss bar stands on foot');
});

test('a plate’s line is blocked by a block between the eye and the head, never by one beside it or at the head', () => {
  const wall = { minX: -2, minY: 4.8, maxX: 2, maxY: 5.2, top: 4 };
  assert.equal(blockedBy([wall], [0, 0, 1.7], [0, 10, 1.8]), true);
  assert.equal(blockedBy([wall], [0, 0, 1.7], [6, 10, 1.8]), false, 'a foe beside the wall keeps its plate');
  const lintel = { minX: -2, minY: 9.85, maxX: 2, maxY: 10.5, top: 4 };
  assert.equal(blockedBy([lintel], [0, 0, 1.7], [0, 10, 1.8]), false, 'a block at the head blinds nothing');
  assert.equal(blockedBy([], [0, 0, 1.7], [0, 10, 1.8]), false);
});

test('what a vital lost is its own tone, faint; what a foe’s bar lost is pale', () => {
  const css = fightSheetCss();
  assert.match(rule(css, '.fight-hud .vital .lost'), /background: var\(--fill\); opacity: 0\.35/);
  assert.match(rule(css, '.fight-hud .meter .lost'), /opacity: 0\.6/);
});

test('with reduced motion asked for, no piece falls, no word rises and the poise track does not flash', () => {
  const css = fightSheetCss();
  const still = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(still, /\.meter \.piece \{ display: none !important; \}/);
  assert.match(still, /\.poise-flash \.poise-fill \{ animation: none; \}/);
  assert.match(still, /\.word \.rise, \.fight-hud \.word\.great \.rise \{ animation-name: fight-word-still; \}/);
});

test('the compass turns its points with the view and pools its marks: one no longer wanted is hidden, not removed', () => {
  onFakePage((root) => {
    const compass = new Compass(root);
    const points = findAll(root, 'compass-point');
    assert.deepEqual(
      points.map((point) => point.textContent),
      ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
    );
    assert.deepEqual(
      findAll(root, 'cardinal').map((point) => point.textContent),
      ['N', 'E', 'S', 'W'],
    );
    assert.equal(findAll(root, 'compass-needle').length, 1);
    compass.update(0.02, [0, 0]);
    const shown = points.filter((point) => !point.hidden);
    assert.deepEqual(
      shown.map((point) => [point.textContent, point.style['left']]),
      [
        ['N', '42.0%'],
        ['NE', '92.0%'],
      ],
    );
    compass.update(0.5, [0, 0]);
    assert.deepEqual(
      points.filter((point) => !point.hidden).map((point) => point.textContent),
      ['SE', 'S', 'SW'],
    );
    compass.update(
      0,
      [0, 0],
      [
        { x: 0, y: -300, kind: 'hostile' },
        { x: 300, y: 0, kind: 'ship' },
      ],
    );
    const marks = findAll(root, 'compass-ship');
    assert.deepEqual(
      marks.map((mark) => [mark.hidden, mark.style['left'], mark.style['borderBottomColor']]),
      [
        [false, '50.0%', SHIP_MARK_COLOURS.hostile],
        [false, '100.0%', SHIP_MARK_COLOURS.ship],
      ],
    );
    compass.update(0, [0, 0], [{ x: 0, y: -300, kind: 'struck' }]);
    assert.equal(findAll(root, 'compass-ship').length, 2, 'the pool is kept');
    assert.deepEqual(
      marks.map((mark) => [mark.hidden, mark.style['borderBottomColor']]),
      [
        [false, SHIP_MARK_COLOURS.struck],
        [true, SHIP_MARK_COLOURS.ship],
      ],
    );
    compass.update(
      0,
      [0, 0],
      [
        { x: 0, y: -300, kind: 'hostile' },
        { x: 300, y: 0, kind: 'ship' },
      ],
    );
    assert.equal(marks[1]?.hidden, false, 'and shown again');
  });
});

test('a shield’s ward and the words of what it took are drawn in its element’s colours', () => {
  const css = fightSheetCss();
  assert.ok(rule(css, ".fight-hud .ward[data-element='2']").includes('--ward: #5ccbff'), 'Volt’s blue');
  assert.ok(rule(css, ".fight-hud .word.shield[data-element='1'] .rise").includes('#ff8a3d'), 'Blaze’s orange');
  onFakePage((root) => {
    new Words(root).say({ text: '12', tone: 'shield', tags: [], element: 3 }, [0, 0, 0]);
    assert.equal(findAll(root, 'word', 'shield')[0]?.dataset['element'], '3');
  });
});
