import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOGO_CELLS } from '../../cinema/logo.ts';
import { Screen, SCREEN_Z, TITLE } from '../../cinema/screen.ts';
import { Stack } from '../../ui/stack.ts';
import { fakeInterface, laidOf, wordsOf } from '../../ui/uiForTests.ts';

const byTouch = (touch: boolean) =>
  Object.assign(globalThis, { matchMedia: (query: string) => ({ matches: touch && query === '(pointer: coarse)' }) });

/** A screen on a stack of its own with a clock the test moves. */
function made(touch = false) {
  byTouch(touch);
  const clock = { now: 0 };
  const stack = new Stack();
  const canvas = { style: { touchAction: '' } };
  const screen = new Screen(stack, canvas as never, () => clock.now);
  const { ui } = fakeInterface();
  const laid = () => laidOf(stack.node(ui));
  return { clock, stack, canvas, screen, laid };
}

test('played by touch, the skip is a hold on the view; with keys, a hold on Space', () => {
  for (const [touch, words] of [
    [true, 'HOLD TO SKIP'],
    [false, 'HOLD SPACE TO SKIP'],
  ] as const) {
    const { screen, laid, clock } = made(touch);
    screen.showSkip(0);
    clock.now = 1;
    assert.ok(wordsOf(laid()).includes(words), words);
  }
  const { screen, laid, clock } = made(false);
  screen.showSkip(0, 'A');
  clock.now = 1;
  assert.ok(wordsOf(laid()).includes('HOLD A TO SKIP'), 'the key held for it, as the prologue names it');
  Object.assign(globalThis, { matchMedia: undefined });
});

test("while the screen stands, a touch on the view is the story's, and the blur is the scene's to draw", () => {
  const { screen, canvas } = made();
  assert.equal(canvas.style.touchAction, 'none', 'no drag on the view pans or reloads the page');
  screen.blur(6);
  assert.equal(screen.blurPixels, 6);
  screen.blur(0);
  assert.equal(screen.blurPixels, 0);
  screen.remove();
  assert.equal(canvas.style.touchAction, '');
});

test('the screen stands over every layer and lets the pointer through to the view', () => {
  const { stack, screen, clock } = made();
  const { ui } = fakeInterface();
  screen.fade(1, 0);
  clock.now = 0.1;
  const layer = stack.node(ui).children?.[0];
  const node = layer ? layer.children?.[0] : null;
  assert.ok(node);
  assert.equal(node.float?.z, SCREEN_Z);
  assert.equal(node.through, true);
});

test('a fade eases over its seconds, a flash is whole first and then fades, and the title comes up slow', () => {
  const { screen, laid, clock } = made();
  const veil = () => laid().find((each) => each.node.fill === '#020305' && each.box.height === 720);
  screen.fade(1, 2);
  clock.now = 1;
  const half = veil()?.node.opacity ?? 0;
  assert.ok(half > 0.3 && half < 0.7, `${half}`);
  clock.now = 2;
  assert.equal(veil()?.node.opacity, 1);
  const white = () => laid().find((each) => each.node.fill === '#f4f1ea')?.node.opacity ?? 0;
  screen.flash(1);
  assert.equal(white(), 1, 'whole at once');
  clock.now = 3.1;
  assert.equal(white(), 0);
  screen.showTitle(true);
  clock.now = 3.2;
  const logo = laid().find((each) => each.node.picture?.key === 'logo');
  assert.ok(logo, 'the title is the logo');
  assert.equal(logo.box.width % LOGO_CELLS.width, 0, 'at a whole multiple of its cells');
  assert.ok(
    laid().some((each) => each.node.label === TITLE),
    'and says the name',
  );
});

test('the bars slide in from the edges, and the view darkens as the story asks', () => {
  const { screen, laid, clock } = made();
  screen.bars(true);
  clock.now = 5;
  const bars = laid().filter((each) => each.node.fill === '#020305');
  assert.deepEqual(
    bars.map((each) => [each.box.y, each.box.height]),
    [
      [0, 79],
      [641, 79],
    ],
  );
  screen.darken(0.6);
  const dark = laid().find((each) => each.node.id === 'cinema-dark');
  assert.equal(dark?.node.opacity, 0.6, 'the view darkened as asked');
  assert.equal(dark?.box.width, 1280, 'over the whole view');
  screen.darken(0);
  assert.equal(laid().filter((each) => each.node.id === 'cinema-dark').length, 0, 'clear, none');
});

test('the loading screen stands over the black: the logo and LOADING, told to a screen reader once as it shows', () => {
  const { screen, laid, clock } = made();
  const said: string[] = [];
  Object.assign(globalThis, { document: { ariaNotify: (words: string) => said.push(words) } });
  try {
    screen.fade(1, 0);
    screen.showLoading(true);
    screen.showLoading(true);
    clock.now = 1;
    const shown = laid();
    const black = shown.findIndex((each) => each.node.fill === '#020305' && each.node.opacity === 1);
    const logo = shown.findIndex((each) => each.node.picture?.key === 'logo');
    assert.ok(black >= 0 && logo > black, 'the logo drawn after the black, over it');
    assert.ok(wordsOf(shown).includes('LOADING'));
    assert.deepEqual(said, ['Loading'], 'said once');
    screen.showLoading(false);
    clock.now = 2;
    assert.ok(!laid().some((each) => each.node.picture?.key === 'logo'), 'gone once the scene has come');
  } finally {
    Object.assign(globalThis, { document: undefined });
  }
});
