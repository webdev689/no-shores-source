import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLATES } from '../plus/barLayout.ts';
import { TONES } from '../plus/tones.ts';
import type { FighterView } from '../rules/fighters.ts';
import { clearOf, veilOf } from './hud.ts';
import { fightSheetCss, HALO } from './hudSheet.ts';

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
});
