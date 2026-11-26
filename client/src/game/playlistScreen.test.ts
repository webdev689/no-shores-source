import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Child } from '../ui/node.ts';
import type { UiEvent } from '../ui/ui.ts';
import { byId, fakeInterface, nodesOf, wordsIn } from '../ui/uiForTests.ts';
import { FakeEvent, fakeWindow } from './pageForTests.ts';
import { type PlaylistSearch, PlaylistView } from './playlistScreen.ts';
import { SAMPLE_SCREEN } from './playlistShots.ts';
import type { PlaylistEntry } from './playlistWords.ts';

const IDLE: PlaylistSearch = { canFind: true, finding: null, said: null, launching: false, company: false };

/** The sample with a Breach's two tiers after its four, as the room module's plan adds them. */
const WITH_BREACH = {
  ...SAMPLE_SCREEN,
  entries: [
    ...SAMPLE_SCREEN.entries,
    ...(['breach-normal', 'breach-hard'] as const).map((kind, tier) => ({
      ...(SAMPLE_SCREEN.entries[0] as PlaylistEntry),
      kind,
      name: 'The Drowned Vale',
      about: `${tier === 0 ? 'Normal' : 'Hard'} · Foes at level ${tier === 0 ? 26 : 30}`,
      launch: { place: 'gullwing-vale', seas: 'breach' as const, playlist: null, finds: null, breach: tier },
    })),
  ],
};

/** The screen drawn on a page `width` by `height`, its presses written down. */
function standing(width = 1600, height = 900, search: PlaylistSearch = IDLE, shown = SAMPLE_SCREEN) {
  const { window } = fakeWindow();
  const pressed: string[] = [];
  const view = new PlaylistView({
    launch: (entry) => void pressed.push(`launch ${entry.kind}`),
    find: (entry) => void pressed.push(`find ${entry.kind}`),
    stop: () => void pressed.push('stop'),
    close: () => void pressed.push('close'),
  });
  view.show(shown, search);
  const { ui, step } = fakeInterface(width, height);
  let built: Child = null;
  const frame = (events: UiEvent[] = [], seconds?: number) =>
    step(() => ({ width: 'grow', height: 'grow', children: [(built = view.layer(ui))] }), events, seconds);
  frame();
  // A second past opening, so the crests have risen into place.
  frame([], 1);
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

test('a crest lit long under the pointer is swept again as a click chooses it', () => {
  const screen = standing();
  screen.over('playlist-tile-1');
  screen.frame([], 1);
  screen.click('playlist-tile-1');
  screen.frame();
  assert.equal(screen.view.entry?.kind, 'abyss');
  const sheens = screen.ui.laid.filter((each) => each.node.picture?.key.startsWith('playlist sheen') === true);
  assert.equal(sheens.length, 1, 'the light sweeps it as it is chosen');
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
  for (const company of [false, true]) {
    const breach = standing(1600, 900, { ...IDLE, company }, WITH_BREACH);
    breach.click('playlist-tile-4');
    breach.frame();
    assert.equal(breach.view.entry?.kind, 'breach-normal');
    const label = byId(breach.built(), 'playlist-launch')?.label;
    assert.equal(label, company ? 'Go with your company' : 'Launch', 'a Breach is never gone alone');
  }
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

test('on the chart each crest stands on its dial, laid under the crests; stacked, no dials', () => {
  const chart = byId(standing(1600, 900).built(), 'playlist-chart');
  const laid = (chart?.children ?? []).filter((child) => !!child);
  const dials = laid.flatMap((child, place) => (child.picture?.key.startsWith('playlist dial') ? [place] : []));
  const crests = laid.flatMap((child, place) => (child.id?.startsWith('playlist-tile-') ? [place] : []));
  assert.equal(dials.length, SAMPLE_SCREEN.entries.length, 'one each');
  const spots = laid.flatMap((child) => (child.id?.startsWith('playlist-tile-') ? [child.float?.at] : []));
  assert.deepEqual(
    dials.map((place) => laid[place]?.float?.at),
    spots,
    'each on its crest’s spot',
  );
  assert.ok(Math.max(...dials) < Math.min(...crests), 'under the crests and their words');
  const stacked = nodesOf(standing(800, 900).built()).filter((node) => node.picture?.key.startsWith('playlist dial'));
  assert.equal(stacked.length, 0);
});

test('no two crests overlap, side by side or stacked', () => {
  for (const [width, height] of [
    [1600, 900],
    [1024, 600],
    [1000, 700],
    [800, 600],
    [390, 844],
  ] as const) {
    const screen = standing(width, height, IDLE, WITH_BREACH);
    const boxes = [0, 1, 2, 3, 4, 5].map((place) => screen.ui.boxOf(`playlist-tile-${place}`));
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

test('scrolled, a crest’s dot, padlock and their marks stay inside the list, never over the head', () => {
  const screen = standing(390, 844);
  screen.ui.scrollBy('playlist-body', 400);
  screen.frame();
  screen.frame();
  const body = screen.ui.boxOf('playlist-body');
  assert.ok(body);
  const marks = screen.ui.laid.filter((each) =>
    /^(playlist waiting|playlist ripple|journal icon locked)/.test(each.node.picture?.key ?? ''),
  );
  const kinds = new Set(marks.map(({ node }) => /^(playlist \w+|journal icon locked)/.exec(node.picture?.key ?? '')?.[1]));
  assert.deepEqual([...kinds].sort(), ['journal icon locked', 'playlist ripple', 'playlist waiting']);
  for (const { clip, node } of marks)
    assert.ok(clip.y >= body.y - 0.5, `${node.picture?.key} clipped at ${clip.y}, the list at ${body.y}`);
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

test('up and down go between a playlist and the week’s dungeon under it', () => {
  const screen = standing();
  screen.key('ArrowDown');
  screen.frame();
  assert.equal(screen.view.entry?.kind, 'week-elite');
  screen.key('ArrowRight');
  screen.frame();
  screen.key('ArrowUp');
  screen.frame();
  assert.equal(screen.view.entry?.kind, 'abyss');
  const breach = standing(1600, 900, IDLE, WITH_BREACH);
  for (const key of ['ArrowLeft', 'ArrowLeft', 'ArrowDown']) breach.key(key);
  breach.frame();
  assert.equal(breach.view.entry?.kind, 'breach-hard', "a Breach's Normal over its Hard");
});

test('a shut entry’s crest wears its padlock and no dot, though its reward waits', () => {
  const screen = standing();
  const shut = SAMPLE_SCREEN.entries[2];
  assert.ok(shut?.shut && shut.rewards.some((reward) => reward.taken === false), 'shut, its reward waiting');
  const keys = nodesOf(byId(screen.built(), 'playlist-tile-2')).map((node) => node.picture?.key ?? '');
  assert.ok(keys.some((key) => key.includes('locked')));
  assert.ok(!keys.some((key) => key.startsWith('playlist waiting')));
  const open = nodesOf(byId(screen.built(), 'playlist-tile-1')).map((node) => node.picture?.key ?? '');
  assert.ok(
    open.some((key) => key.startsWith('playlist waiting')),
    'an open one’s waiting reward shows its dot',
  );
});

test('only the chosen crest’s rule is drawn', () => {
  const screen = standing();
  const fill = (place: number) => byId(screen.built(), `playlist-tile-${place}-rule`)?.fill;
  assert.notEqual(fill(0), 'rgba(0,0,0,0)');
  for (const place of [1, 2, 3]) assert.equal(fill(place), 'rgba(0,0,0,0)', `crest ${place}`);
});

test('Page Down scrolls the card most of a view, and the thumb is as tall as the share it shows', () => {
  const screen = standing(390, 480);
  screen.click('playlist-tile-3');
  screen.frame();
  screen.frame();
  const list = 'playlist-body';
  const [room, held] = [screen.ui.boxOf(list), screen.ui.boxOf(`${list}-held`)];
  const [thumb, track] = [screen.ui.boxOf(`${list}-thumb`), screen.ui.boxOf(`${list}-track`)];
  assert.ok(room && held && thumb && track);
  const share = (thumb.height / track.height) * 100;
  assert.ok(Math.abs(share - (room.height / held.height) * 100) <= 1, `${share}% shown`);
  const before = held.y;
  screen.key('PageDown');
  screen.frame();
  screen.frame();
  const moved = before - (screen.ui.boxOf(`${list}-held`)?.y ?? before);
  const step = Math.round(room.height * 0.8);
  assert.ok(held.height - room.height > step, `${held.height - room.height} px below, more than a page's ${step}`);
  assert.equal(moved, step);
});
