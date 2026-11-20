import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLATES } from '../plus/barLayout.ts';
import { Compass, compassCss, SHIP_MARK_COLOURS, UNDER_COMPASS } from '../plus/compass.ts';
import { HALO, TONES } from '../plus/tones.ts';
import type { Action, FighterView } from '../rules/fighters.ts';
import { viewProjection } from '../editor/orbit.ts';
import { blockedBy, clearOf, Hud, type HudFrame, veilOf } from './hud.ts';
import { Words } from './hitWords.ts';
import { fightSheetCss } from './hudSheet.ts';
import { cameraOf } from './plateSight.ts';
import { countWrites, findAll, onFakePage } from './page.test.ts';

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

test('an arrow that would fall on the Arts and weapons stands above them, and on the vitals below them', () => {
  const arms = { left: 24, top: 490, right: 430, bottom: 578 };
  const onIt = { x: 28, y: 520, angle: Math.PI };
  assert.deepEqual(clearOf(onIt, arms, 22), { x: 28, y: 468, angle: Math.PI });
  const below = { x: 150, y: 572, angle: Math.PI / 2 };
  assert.equal(clearOf(below, arms, 22).y, 468, 'one at the foot, toward a foe behind, too');
  const above = { x: 28, y: 300, angle: Math.PI };
  assert.equal(clearOf(above, arms, 22), above);
  const right = { x: 932, y: 520, angle: 0 };
  assert.equal(clearOf(right, arms, 22), right);
  const vitals = { left: 28, top: 14, right: 204, bottom: 88 };
  assert.deepEqual(clearOf({ x: 28, y: 40, angle: Math.PI }, vitals, 22, true), { x: 28, y: 110, angle: Math.PI });
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
  for (const selector of ['.fight-hud .plate .title', '.fight-hud .vital .poise-word'])
    assert.ok(rule(css, selector).includes(HALO), selector);
});

test('the display keeps its stacking to itself, and the plates over figures under its veil', () => {
  const css = fightSheetCss();
  assert.match(rule(css, '.fight-hud'), /isolation: isolate/, 'never over the page’s own windows');
  assert.match(rule(css, '.fight-hud .over'), /isolation: isolate/, 'the plates’ order stays among them');
});

test('with reduced motion asked for, neither the low health nor the empty stamina blinks: each holds its warning', () => {
  const css = fightSheetCss();
  const still = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)', css.indexOf('.fight-hud .vitals')));
  assert.match(still, /\.vital\.low::after \{ animation: none; opacity: 1; \}/, 'the blood frame stands');
  assert.match(still, /\.vital\.stamina\.flash::after \{ animation: none; \}/, 'the white frame stands');
  assert.match(css, /\.vital\.stamina\.flash::after \{ opacity: 1;/);
});

test('the plates on foot are the sizes the sea draws its own at, a Minor’s bar short and thin, an Elite’s long', () => {
  const css = fightSheetCss();
  const { overhead, boss } = PLATES;
  assert.match(rule(css, '.fight-hud .overhead'), new RegExp(`height: ${overhead.height}px`));
  // Each tier's plate width, its bar's height, and how much of the plate under the name its bar runs.
  const tier = (name: string) => {
    const bar = rule(css, `.fight-hud .overhead[data-tier='${name}'] .meter`);
    return [
      Number(/width: (\d+)px/.exec(rule(css, `.fight-hud .overhead[data-tier='${name}']`))?.[1]),
      Number(/height: (\d+)px/.exec(bar)?.[1]),
      Number(/width: (\d+)%/.exec(bar)?.[1]),
    ];
  };
  assert.deepEqual(tier('major'), [overhead.width, overhead.bar, 100], 'a Major’s, a ship’s size');
  const [[minorWidth, minorBar, minorRun], [eliteWidth, eliteBar]] = [tier('minor'), tier('elite')];
  assert.equal(minorWidth, overhead.width, 'a Minor’s as wide, for its name');
  assert.deepEqual([minorBar, minorRun], [6, 60], 'six pixels, three fifths long, as measured');
  assert.ok((minorRun ?? 100) < 100 && (minorBar ?? 0) < overhead.bar, 'a Minor’s bar short and thin');
  assert.ok((eliteWidth ?? 0) > overhead.width && (eliteBar ?? 0) > overhead.bar, 'an Elite’s long');
  assert.match(rule(css, ".fight-hud .overhead[data-tier='elite'] .third-mark"), /display: block/);
  assert.match(
    rule(css, '.fight-hud .meter .third-mark'),
    /display: none/,
    'no other bar is cut in thirds, the target’s and the boss bar’s neither',
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
  const wall = { minX: -2, minY: 4.8, maxX: 2, maxY: 5.2, top: 4, bottom: 0 };
  assert.equal(blockedBy([wall], [0, 0, 1.7], [0, 10, 1.8]), true);
  assert.equal(blockedBy([wall], [0, 0, 1.7], [6, 10, 1.8]), false, 'a foe beside the wall keeps its plate');
  const lintel = { minX: -2, minY: 9.85, maxX: 2, maxY: 10.5, top: 4, bottom: 0 };
  assert.equal(blockedBy([lintel], [0, 0, 1.7], [0, 10, 1.8]), false, 'a block at the head blinds nothing');
  assert.equal(blockedBy([], [0, 0, 1.7], [0, 10, 1.8]), false);
});

/** A level view from 1.7 m up, as the game's camera makes it: its matrix, where a point `ahead` metres along it and
 *  `aside` across it stands on the ground, a Major foe standing there, and how far down the screen a point is drawn. */
function levelView() {
  const matrix = viewProjection({ targetX: 0, targetY: 0, targetZ: 1.7, yaw: 0, pitch: 0, distance: 0.5 }, 16 / 9);
  const camera = cameraOf(matrix);
  assert.ok(camera);
  const { eye, forward } = camera;
  const placeAt = (ahead: number, aside: number) => ({
    x: eye[0] + forward[0] * ahead - forward[1] * aside,
    y: eye[1] + forward[1] * ahead + forward[0] * aside,
  });
  const foeAt = (id: number, name: string, ahead: number, aside: number) => ({
    id,
    name,
    view: { ...standing, ...placeAt(ahead, aside), side: 'foes' as const },
    rank: 2,
    faction: '',
    phase: 0,
    alert: 0,
  });
  const downAt = (point: readonly [number, number, number]) => {
    const row = (index: number) =>
      (matrix[index] ?? 0) * point[0] +
      (matrix[index + 4] ?? 0) * point[1] +
      (matrix[index + 8] ?? 0) * point[2] +
      (matrix[index + 12] ?? 0);
    return ((1 - row(1) / row(3)) / 2) * 720;
  };
  return { matrix, eye, forward, placeAt, foeAt, downAt };
}

test('the display holds the soft lock’s foe’s plate wherever it stands, and the land hides a plate as a block does', () => {
  const { matrix, eye, forward, placeAt, foeAt } = levelView();
  // A foe 30 degrees aside, out of the cone, and one straight ahead; a ridge 5 m high across the line to the second.
  const foes = [foeAt(2, 'Aside', 10, 10 * Math.tan(Math.PI / 6)), foeAt(3, 'Ahead', 20, 0)];
  const ridge = (x: number, y: number) => {
    const [east, south] = [x - eye[0], y - eye[1]];
    const ahead = east * forward[0] + south * forward[1];
    const aside = Math.abs(south * forward[0] - east * forward[1]);
    return Math.abs(ahead - 10) < 1.5 && aside < 2 ? 5 : 0;
  };
  const platesFor = (lock: number | null, groundAt?: (x: number, y: number) => number | null) =>
    onFakePage((root) => {
      const hud = new Hud(root);
      const frame: HudFrame = {
        own: { ...standing, ...placeAt(0, 0), target: lock },
        foes,
        where: () => [0, 0, 0],
        matrix,
        width: 1280,
        height: 720,
        events: [],
        player: 1,
        firstPerson: false,
        pressed: false,
        lost: null,
        groundAt: groundAt ?? null,
      };
      // Past 6 s, as the lock first took it: only the lock holds the locked foe's plate.
      for (let step = 0; step < 420; step++) hud.update(frame, 1 / 60);
      return findAll(root, 'overhead').map((plate) => findAll(plate as unknown as HTMLElement, 'name')[0]?.textContent);
    });
  assert.deepEqual(platesFor(null), ['Ahead'], 'only the foe at the crosshair');
  assert.deepEqual(platesFor(2).sort(), ['Ahead', 'Aside'], 'the locked foe too, long after the lock took it');
  assert.deepEqual(platesFor(2, ridge), ['Aside'], 'the ridge hides the foe behind it');
});

test('the words of blows keep clear of the plates drawn, never of a foe with none', () =>
  onFakePage((root) => {
    const { matrix, placeAt, foeAt, downAt } = levelView();
    const iron: Action = {
      kind: 'telegraph',
      shape: 'sweep',
      elapsed: 0,
      windup: 40,
      origin: [0, 0, 0],
      bearing: 0,
      ahead: 2,
      iron: true,
      feintAt: null,
    };
    // Two foes 8 m off winding up an iron blow at the player, each told "Dodge!": one at the crosshair, whose plate
    // shows, and one 30 degrees aside, the target plate's, which holds none over its head.
    const winding = (foe: ReturnType<typeof foeAt>) => ({ ...foe, view: { ...foe.view, action: iron, target: 1 } });
    const aside = winding(foeAt(3, 'Aside', 8, 8 * Math.tan(Math.PI / 6)));
    const foes = [winding(foeAt(2, 'Ahead', 8, 0)), aside];
    new Hud(root).update(
      {
        own: { ...standing, ...placeAt(0, 0) },
        foes,
        where: () => [0, 0, 0],
        matrix,
        width: 1280,
        height: 720,
        events: [],
        player: 1,
        firstPerson: false,
        pressed: false,
        lost: null,
        groundAt: null,
      },
      1 / 60,
    );
    const topOf = (element: { readonly style: Record<string, string> } | undefined) =>
      Number(/translate\([\d.-]+px, ([\d.-]+)px\)/.exec(element?.style['transform'] ?? '')?.[1]);
    const plates = findAll(root, 'overhead');
    assert.deepEqual(
      plates.map((plate) => findAll(plate as unknown as HTMLElement, 'name')[0]?.textContent),
      ['Ahead'],
    );
    const [overAhead, overAside] = findAll(root, 'word');
    assert.ok(topOf(overAhead) >= topOf(plates[0]) + 24, 'pushed under the plate drawn');
    const asideFoot = downAt([aside.view.x, aside.view.y, aside.view.z + 1.9]);
    assert.ok(topOf(overAside) < asideFoot, 'over the foe with none, where it was said');
  }));

test('what a vital lost is its own tone, faint; what a foe’s bar lost is pale', () => {
  const css = fightSheetCss();
  assert.match(rule(css, '.fight-hud .vital .lost'), /background: var\(--fill\); opacity: 0\.35/);
  assert.match(rule(css, '.fight-hud .meter .lost'), /opacity: 0\.6/);
});

test('with reduced motion asked for, no piece falls and the poise track does not flash; no sheet moves a word', () => {
  const css = fightSheetCss();
  const still = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(still, /\.meter \.piece \{ display: none !important; \}/);
  assert.match(still, /\.poise-flash \.poise-fill \{ animation: none; \}/);
  assert.doesNotMatch(css, /fight-word/, 'the display steps each word itself, still when asked');
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
    new Words(root).say({ text: '12', tone: 'shield', tags: [], shield: 3 }, [0, 0, 0]);
    assert.equal(findAll(root, 'word', 'shield')[0]?.dataset['element'], '3');
  });
});

test('an arrow to a threat off the screen stands clear of what the page keeps beside the display, as the game’s hints', () =>
  onFakePage((root) => {
    // The game's hints stand over the left edge's middle, where an arrow to a foe off the left would point.
    const hints = document.createElement('div');
    const box = { left: 28, top: 300, width: 400, height: 120, right: 428, bottom: 420 };
    Object.assign(hints, { getBoundingClientRect: () => box });
    const hud = new Hud(root, null, null, [hints]);
    const foe: FighterView = { ...standing, x: -5, side: 'foes', target: 1, action: { kind: 'draw', elapsed: 3 } };
    hud.update(
      {
        own: standing,
        foes: [{ id: 2, name: 'Runner', view: foe, rank: 0, faction: '', phase: 0, alert: 0 }],
        where: () => [0, 0, 0],
        matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        width: 1280,
        height: 720,
        events: [],
        player: 1,
        firstPerson: false,
        pressed: false,
        lost: null,
        groundAt: null,
      },
      1 / 60,
    );
    const [arrow] = findAll(root, 'arrow');
    const [x = NaN, y = NaN] = (/translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(arrow?.style['transform'] ?? '') ?? [])
      .slice(1)
      .map(Number);
    assert.ok(x < box.right, `the arrow at the left edge (${x})`);
    assert.ok(y <= box.top - 22, `standing above the hints (${y})`);
  }));

test('a settled display writes nothing more to the page and reads no layout, with a threat’s arrow at the edge', () =>
  onFakePage((root) => {
    const hud = new Hud(root);
    const statuses = { crit: 0, expose: 0, charge: 0, haste: 600, linked: 0, veiled: 300, chargeImmune: 0 };
    const own: FighterView = { ...standing, health: 60, stamina: 50, ammo: 7, statuses };
    // A foe off the view's right edge drawing on the player: an arrow points at it.
    const foe: FighterView = { ...standing, x: 5, side: 'foes', target: 1, action: { kind: 'draw', elapsed: 3 } };
    const frame: HudFrame = {
      own,
      foes: [{ id: 2, name: 'Runner', view: foe, rank: 0, faction: '', phase: 0, alert: 0 }],
      where: () => [0, 0, 0],
      matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      width: 1280,
      height: 720,
      events: [],
      player: 1,
      firstPerson: false,
      pressed: false,
      lost: null,
      groundAt: null,
      ammo: 7,
      ammoMost: 24,
      crosshair: { charge: null },
    };
    for (let step = 0; step < 300; step++) hud.update(frame, 1 / 60);
    assert.equal(findAll(root, 'arrow').length, 1, 'the arrow shows');
    assert.equal(findAll(root, 'status').length, 2, 'two buffs show');
    const counted = countWrites(root);
    for (let step = 0; step < 3; step++) hud.update(frame, 1 / 60);
    // The plates over figures and the boss bar too: a foe standing still in a still view writes nothing.
    assert.deepEqual(counted.writes, [], 'nothing written that did not change');
    assert.equal(counted.reads, 0, 'no layout read');
    // A taller view moves the Arts and weapons, which stand from its foot, without changing their size or step.
    hud.update({ ...frame, height: 800 }, 1 / 60);
    assert.ok(counted.reads > 0, 'where the corners stand is read again');
  }));

test('every word the display stands still on the screen is a whole step of the face’s 11 px grid, so it draws sharp', () => {
  const css = fightSheetCss() + compassCss();
  const sizes = [...css.matchAll(/([^{}]*)\{[^}]*font-size: ([\d.]+)px/g)].map(([, selector, size]) => ({
    selector: (selector ?? '').trim().split('\n').at(-1) ?? '',
    size: Number(size),
  }));
  // A plate over a figure is scaled with its distance, so no size of its own is sharp.
  const still = sizes.filter(({ selector }) => !selector.includes('.overhead'));
  assert.ok(still.length > 20, 'the sheet’s words were read');
  assert.deepEqual(
    still.filter(({ size }) => size % 11 !== 0),
    [],
  );
});

test('a screen reader is not told the shots beside the crosshair, or the compass’s letters, twice or out of order', () =>
  onFakePage((root) => {
    new Hud(root);
    const hidden = (name: string) => (findAll(root, name)[0] as unknown as Record<string, unknown>)['ariaHidden'];
    assert.equal(hidden('ammo'), 'true', 'the weapon’s row says its shots');
    assert.equal(hidden('compass'), 'true');
  }));

test('a resize across the display’s steps lays its corners again each way, and the narrow view stacks them', () =>
  onFakePage((root) => {
    const hud = new Hud(root);
    const frame = (width: number, height: number): HudFrame => ({
      own: standing,
      foes: [],
      where: () => null,
      matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      width,
      height,
      events: [],
      player: 1,
      firstPerson: false,
      pressed: false,
      lost: null,
      groundAt: null,
    });
    const laid = (width: number, height: number) => {
      hud.update(frame(width, height), 1 / 60);
      const classes = ['wide', 'double', 'stacked'].filter((name) => root.classList.contains(name));
      return [classes, findAll(root, 'vital', 'health')[0]?.style['width']];
    };
    assert.deepEqual(laid(1280, 720), [[], '333px']);
    assert.deepEqual(laid(1920, 1080), [['wide'], '499px']);
    assert.deepEqual(laid(2560, 1440), [['double'], '333px']);
    assert.deepEqual(laid(692, 720), [['stacked'], '346px'], 'the Test Ground’s view between its panels');
    assert.deepEqual(laid(1280, 720), [[], '333px'], 'and back');
    assert.match(
      fightSheetCss(),
      /\.fight-hud\.stacked \.arms \{ flex-direction: column-reverse;/,
      'the weapons over the Arts',
    );
  }));
