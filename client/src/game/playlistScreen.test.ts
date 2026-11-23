import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Child } from '../ui/node.ts';
import type { UiEvent } from '../ui/ui.ts';
import { byId, fakeInterface, nodesOf, wordsIn } from '../ui/uiForTests.ts';
import { FakeEvent, fakePage } from './pageForTests.ts';
import { type PlaylistSearch, PlaylistView } from './playlistScreen.ts';
import { SAMPLE_SCREEN } from './playlistShots.ts';

const IDLE: PlaylistSearch = { canFind: true, finding: null, said: null, launching: false, company: false };

/** The screen drawn on a page `width` by `height`, its presses written down. */
function standing(width = 1600, height = 900, search: PlaylistSearch = IDLE) {
  const { window } = fakePage();
  const pressed: string[] = [];
  const view = new PlaylistView({
    launch: (entry) => void pressed.push(`launch ${entry.kind}`),
    find: (entry) => void pressed.push(`find ${entry.kind}`),
    stop: () => void pressed.push('stop'),
    close: () => void pressed.push('close'),
  });
  view.show(SAMPLE_SCREEN, search);
  const { ui, step } = fakeInterface(width, height);
  let built: Child = null;
  const frame = (events: UiEvent[] = []) =>
    step(() => ({ width: 'grow', height: 'grow', children: [(built = view.layer(ui))] }), events);
  frame();
  frame();
  const centre = (id: string) => {
    const box = ui.boxOf(id);
    assert.ok(box, id);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  return {
    view,
    ui,
    frame,
    pressed,
    built: () => built,
    key: (key: string) => window.dispatchEvent(new FakeEvent('keydown', { key })),
    over: (id: string) => frame([{ kind: 'pointer', ...centre(id) }]),
    click: (id: string) => {
      const spot = centre(id);
      frame([
        { kind: 'pointer', ...spot },
        { kind: 'down', ...spot, button: 0 },
        { kind: 'up', ...spot, button: 0 },
      ]);
    },
  };
}

test('the pointer over a crest only lights it; a click, or Enter on it, chooses it, and the arrows hold their choice', () => {
  const screen = standing();
  screen.key('ArrowRight');
  screen.frame();
  screen.frame();
  assert.equal(screen.view.entry?.kind, 'abyss', 'the arrows choose');
  screen.over('playlist-tile-2');
  screen.frame();
  assert.equal(screen.view.entry?.kind, 'abyss', 'the pointer passing over the week’s Elite chooses nothing');
  screen.click('playlist-tile-3');
  screen.frame();
  assert.equal(screen.view.entry?.kind, 'week-abyss', 'a click chooses');
  // The focus given to a crest by no key (as a screen reader or a click elsewhere leaves it) chooses nothing until
  // Enter presses it.
  screen.ui.focusOn('playlist-tile-1');
  screen.frame();
  assert.equal(screen.view.entry?.kind, 'week-abyss');
  screen.frame([{ kind: 'key', key: 'Enter' }]);
  assert.equal(screen.view.entry?.kind, 'abyss', 'Enter on the focused crest chooses it');
});

test('the pad: its cross moves the focus over the crests and the card follows; B closes', () => {
  const screen = standing();
  assert.equal(screen.ui.focusedId, 'playlist-tile-0');
  screen.frame([{ kind: 'pad', button: 'right' }]);
  screen.frame();
  assert.equal(screen.ui.focusedId, 'playlist-tile-1');
  assert.equal(screen.view.entry?.kind, 'abyss', 'the card follows the focus');
  assert.ok(wordsIn(screen.built()).includes('ABYSS PLAYLIST'));
  screen.frame([{ kind: 'pad', button: 'back' }]);
  assert.deepEqual(screen.pressed, ['close']);
});

test('Find a Company is the primary press of a matched entry; Launch goes alone or with the company', () => {
  const alone = standing();
  assert.equal(byId(alone.built(), 'playlist-find')?.role, 'primary');
  assert.equal(byId(alone.built(), 'playlist-launch')?.role, 'button');
  assert.equal(byId(alone.built(), 'playlist-launch')?.label, 'Go alone');
  const together = standing(1600, 900, { ...IDLE, company: true });
  assert.equal(byId(together.built(), 'playlist-launch')?.label, 'Go with your company');
  const signedOut = standing(1600, 900, { ...IDLE, canFind: false });
  assert.equal(byId(signedOut.built(), 'playlist-find'), undefined);
  assert.equal(byId(signedOut.built(), 'playlist-launch')?.role, 'primary', 'with no search, Launch leads');
});

test('a shut entry says why in neutral ink with a padlock, on its crest and beside the resting Launch', () => {
  const screen = standing();
  screen.click('playlist-tile-2');
  screen.frame();
  const words = wordsIn(screen.built());
  assert.ok(words.includes('Opens at level 24 · You are 22'), 'its footer');
  assert.deepEqual(
    wordsIn(byId(screen.built(), 'playlist-tile-2')).slice(-2),
    ['Opens at level 24', 'You are 22'],
    'its crest, a part a line',
  );
  assert.ok(words.includes('This dungeon opens at level 24.'), 'its card, in its gate’s words');
  assert.ok(words.includes('Once a week: a Legendary Vestige and Essence.'), 'its reward kept on its card');
  assert.equal(byId(screen.built(), 'playlist-launch')?.disabled, true);
  const padlocks = nodesOf(screen.built()).filter((node) => node.picture?.key.includes('locked'));
  assert.equal(padlocks.length, 4, 'a padlock on each shut crest, on its card and in the footer');
});

test('as a search starts and ends, the focus goes to the press that takes the other’s place', () => {
  const screen = standing();
  screen.view.show(SAMPLE_SCREEN, { ...IDLE, finding: 'Finding a company · 0:00' });
  screen.frame();
  screen.frame();
  assert.equal(screen.ui.focusedId, 'playlist-stop');
  screen.view.show(SAMPLE_SCREEN, { ...IDLE, said: 'The search stopped. Try again.' });
  screen.frame();
  screen.frame();
  assert.equal(screen.ui.focusedId, 'playlist-find');
});

test('while Launch asks the server it says Launching…, with no search’s wait or Stop finding', () => {
  const screen = standing(1600, 900, { ...IDLE, finding: 'Launching…', launching: true });
  const words = wordsIn(screen.built());
  assert.ok(words.includes('Launching…'));
  assert.ok(!words.includes('A run starts with four, or with fewer after a minute.'));
  assert.equal(byId(screen.built(), 'playlist-stop'), undefined);
  screen.key('f');
  assert.deepEqual(screen.pressed, [], 'F stops no search');
  const finding = standing(1600, 900, { ...IDLE, finding: 'Finding a company · 0:05' });
  assert.ok(wordsIn(finding.built()).includes('A run starts with four, or with fewer after a minute.'));
});

test('the footer and the card stay on the screen at every size, searching or not', () => {
  const sizes = [
    [1600, 900],
    [1280, 720],
    [1024, 600],
    [1000, 700],
    [800, 600],
    [390, 844],
  ] as const;
  for (const [width, height] of sizes)
    for (const finding of [null, 'Finding a company · 0:23']) {
      const screen = standing(width, height, { ...IDLE, finding });
      // The Abyss Playlist's card, the fullest.
      screen.view.show(SAMPLE_SCREEN, { ...IDLE });
      screen.key('ArrowRight');
      screen.view.show(SAMPLE_SCREEN, { ...IDLE, finding });
      screen.frame();
      screen.frame();
      for (const id of finding
        ? ['playlist-stop', 'playlist-close']
        : ['playlist-launch', 'playlist-find', 'playlist-close']) {
        const box = screen.ui.boxOf(id);
        assert.ok(box, `${id} at ${width}x${height}`);
        assert.ok(box.x >= 0 && box.x + box.width <= width, `${id} across at ${width}x${height}`);
        assert.ok(box.y >= 0 && box.y + box.height <= height, `${id} down at ${width}x${height}`);
      }
      for (let place = 0; place < 4; place += 1) {
        const crest = screen.ui.boxOf(`playlist-tile-${place}`);
        assert.ok(crest && crest.x >= 0 && crest.x + crest.width <= width, `crest ${place} at ${width}x${height}`);
      }
      const narrow = width < 1100;
      assert.equal(
        wordsIn(screen.built()).includes('A run starts with four, or with fewer after a minute.'),
        finding !== null && !narrow,
        `the wait's line at ${width}x${height}`,
      );
    }
});

test('no two crests overlap, side by side or stacked', () => {
  for (const [width, height] of [
    [1600, 900],
    [1024, 600],
    [1000, 700],
    [800, 600],
    [390, 844],
  ] as const) {
    const screen = standing(width, height);
    const boxes = [0, 1, 2, 3].map((place) => screen.ui.boxOf(`playlist-tile-${place}`));
    boxes.forEach((one, place) =>
      boxes.slice(place + 1).forEach((other) => {
        assert.ok(one && other);
        const apart =
          one.x + one.width <= other.x ||
          other.x + other.width <= one.x ||
          one.y + one.height <= other.y ||
          other.y + other.height <= one.y;
        assert.ok(apart, `crests at ${width}x${height}`);
      }),
    );
  }
});

test('the chosen crest’s rule is as wide as its name, not its line beneath', () => {
  for (const [width, height] of [
    [1600, 900],
    [390, 844],
  ] as const) {
    const screen = standing(width, height);
    screen.click('playlist-tile-3');
    screen.frame();
    const [rule, crest] = [screen.ui.boxOf('playlist-tile-3-rule'), screen.ui.boxOf('playlist-tile-3')];
    assert.ok(rule && crest);
    assert.ok(rule.width < crest.width - 20, `${rule.width} of ${crest.width} at ${width}x${height}`);
  }
});

test('the chart is drawn again only at 64-pixel steps of the screen, not each pixel of a resize', () => {
  const keyAt = (width: number, height: number) =>
    byId(standing(width, height).built(), 'playlist-chart')?.picture?.key;
  assert.equal(keyAt(1600, 900), keyAt(1610, 905));
  assert.notEqual(keyAt(1600, 900), keyAt(1700, 900));
});

test('a playlist’s weekly shows its three marks and “2 of 3”, and nothing else beside them', () => {
  // At 1280 by 720 the card's words are at their first size, where a mark is six pixels tall.
  const screen = standing(1280, 720);
  assert.ok(wordsIn(screen.built()).includes('2 of 3'));
  const marks = nodesOf(byId(screen.built(), 'playlist-card')).filter((node) => node.height === 6);
  assert.equal(marks.length, 3, 'three marks and nothing else six pixels tall');
});

test('no line under a crest ends or starts with a separator, at any size', () => {
  for (const [width, height] of [
    [1600, 900],
    [1024, 600],
    [390, 844],
  ] as const) {
    const screen = standing(width, height);
    for (let place = 0; place < 4; place += 1)
      for (const said of wordsIn(byId(screen.built(), `playlist-tile-${place}`)))
        assert.ok(!said.includes('·'), `"${said}" at ${width}x${height}: a part a line, no separator to wrap on`);
    assert.ok(wordsIn(screen.built()).includes('Foes at level 22'), 'a part a line');
  }
});

test('a shut entry’s Launch is drawn dim and pressing it, by click or E, does nothing', () => {
  const screen = standing();
  screen.click('playlist-tile-3');
  screen.frame();
  const launch = byId(screen.built(), 'playlist-launch');
  assert.equal(launch?.disabled, true);
  assert.ok((launch?.opacity ?? 1) < 0.5, 'dim, its key cap with it');
  assert.equal(screen.ui.stateOf('playlist-launch', true), 'disabled', 'no hover');
  screen.click('playlist-launch');
  screen.key('e');
  screen.frame();
  assert.deepEqual(screen.pressed, []);
});

test('while a search or a launch runs, Launch is not offered', () => {
  for (const search of [
    { ...IDLE, finding: 'Finding a company · 0:05' },
    { ...IDLE, finding: 'Launching…', launching: true },
  ]) {
    const screen = standing(1600, 900, search);
    assert.equal(byId(screen.built(), 'playlist-launch'), undefined, search.finding);
    screen.key('e');
    assert.deepEqual(screen.pressed, [], 'E launches nothing');
  }
});

test('the card scrolls to its end by Page Down and the right stick, its bar’s thumb going there and its fade gone', () => {
  for (const [width, height, list] of [
    [390, 844, 'playlist-body'],
    [1024, 600, 'playlist-card-column'],
  ] as const) {
    const screen = standing(width, height);
    // The Abyss Dungeon of the week's card, the longest.
    screen.click('playlist-tile-3');
    screen.frame();
    screen.frame();
    const [track, thumb] = [`${list}-track`, `${list}-thumb`];
    assert.ok(screen.ui.boxOf(`${list}-fade`), `more below at ${width}x${height}`);
    assert.equal(screen.ui.boxOf(thumb)?.y, screen.ui.boxOf(track)?.y, 'the thumb at the top');
    screen.frame([{ kind: 'stick', x: 0, y: 0, scroll: 1 }]);
    screen.frame();
    screen.frame([{ kind: 'stick', x: 0, y: 0, scroll: 0 }]);
    const stuck = screen.ui.boxOf(thumb)?.y ?? 0;
    assert.ok(stuck > (screen.ui.boxOf(track)?.y ?? 0), `the right stick scrolls it at ${width}x${height}`);
    for (let page = 0; page < 12; page += 1) {
      screen.key('PageDown');
      screen.frame();
    }
    screen.frame();
    const [end, bar] = [screen.ui.boxOf(thumb), screen.ui.boxOf(track)];
    assert.ok(end && bar && Math.abs(end.y + end.height - (bar.y + bar.height)) <= 1, 'the thumb at the foot');
    assert.equal(screen.ui.boxOf(`${list}-fade`), null, 'no fade with nothing below');
    screen.key('PageUp');
    screen.frame();
    screen.frame();
    assert.ok(screen.ui.boxOf(`${list}-fade`), 'a page back up, more below again');
  }
});

test('the right stick scrolls the list once a frame, under the focus, never again on top', () => {
  const screen = standing(390, 844);
  assert.equal(screen.ui.focusedId, 'playlist-tile-0', 'the focus inside the stacked list');
  // Scrolled a little, so its crest is cut at the list's top though its middle is still in it.
  screen.ui.scrollBy('playlist-body', 20);
  screen.frame();
  screen.frame();
  const before = screen.ui.boxOf('playlist-body-held')?.y ?? 0;
  let stuck = 0;
  for (const scroll of [1, 0]) {
    screen.frame([{ kind: 'stick', x: 0, y: 0, scroll }]);
    stuck += screen.ui.stickScroll;
  }
  screen.frame();
  const moved = before - (screen.ui.boxOf('playlist-body-held')?.y ?? 0);
  assert.ok(stuck > 0 && moved > 0, 'it scrolled');
  assert.ok(Math.abs(moved - stuck) <= 1, `moved ${moved} for a stick of ${stuck}`);
});
