import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FighterView } from '../rules/fighters.ts';
import { rankBand, rankMark } from '../rules/roster.ts';
import {
  ALERT_MARK_SECONDS,
  FoeBars,
  type MarkedFoe,
  PHASE_MARKS,
  type PlateViewing,
  alertMark,
  bossBarOf,
  bossInFight,
} from './foeBars.ts';
import { findAll, onFakePage } from './page.test.ts';

const standing: FighterView = {
  x: 0,
  y: 0,
  z: 0,
  facing: 0,
  mode: 'ground',
  crouched: false,
  aim: 0,
  side: 'foes',
  arms: 0,
  health: 600,
  healthMax: 600,
  stamina: 100,
  poise: 0,
  poiseMax: 35,
  target: null,
  action: { kind: 'idle' },
};
const thule = (
  id: number,
  x: number,
  changes: Partial<MarkedFoe> = {},
  view: Partial<FighterView> = {},
): MarkedFoe => ({
  id,
  name: 'Captain Brannoc Thule',
  view: { ...standing, x, ...view },
  rank: 5,
  faction: 'The Grey Tithe',
  phase: 1,
  alert: 2,
  ...changes,
});

test("a foe's bar is red for a Minor, orange for a Major, and yellow for an Elite and a Miniboss", () => {
  assert.deepEqual([1, 2, 3, 4].map(rankBand), ['red', 'orange', 'yellow', 'yellow']);
});

test('an Elite and a Miniboss, one yellow, are told apart by a mark of their own beside the name', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(rankMark), [null, null, 'elite', 'miniboss', null]);
});

test('the alert mark is nothing idle, "?" suspicious or searching, and "!" only for a moment once alert', () => {
  assert.equal(alertMark(0, 0), '');
  assert.equal(alertMark(1, 5), '?');
  assert.equal(alertMark(3, 5), '?');
  assert.equal(alertMark(2, 0), '!');
  assert.equal(alertMark(2, ALERT_MARK_SECONDS - 0.01), '!');
  assert.equal(alertMark(2, ALERT_MARK_SECONDS), '');
});

test('the boss bar marks its health where the phases change, and shows its name, faction and phase', () => {
  assert.deepEqual(PHASE_MARKS, [2 / 3, 1 / 3]);
  const shown = bossBarOf(thule(1, 0, { phase: 2 }, { health: 300 }));
  assert.deepEqual(shown, {
    title: 'Captain Brannoc Thule',
    faction: 'The Grey Tithe',
    share: 0.5,
    phase: 'Phase 2 of 3',
  });
  assert.equal(bossBarOf(thule(1, 0, { phase: 0 })).phase, 'Phase 1 of 3', 'a phase not yet sent is the first');
});

test('the boss in the fight is the nearest living Boss that is alert or has been struck', () => {
  const player = { x: 0, y: 0 };
  const idle = thule(1, 2, { alert: 0 });
  const struck = thule(2, 9, { alert: 0 }, { health: 500 });
  const alert = thule(3, 5);
  const dead = thule(4, 1, {}, { action: { kind: 'dead', elapsed: 10 } });
  const elite = thule(5, 1, { rank: 3 });
  assert.equal(bossInFight([idle, struck, alert, dead, elite], player)?.id, 3);
  assert.equal(bossInFight([idle, struck], player)?.id, 2);
  assert.equal(bossInFight([idle, dead, elite], player), null, 'none: it goes when the boss dies or is not fighting');
});

// The eye at the origin, looking north (+y); each foe stands at its bearing from north, metres off.
const placed = (id: number, degrees: number, metres: number, rank = 2): MarkedFoe => {
  const radians = (degrees * Math.PI) / 180;
  const view = { x: Math.sin(radians) * metres, y: Math.cos(radians) * metres };
  return thule(id, 0, { name: `Foe ${id}`, rank }, view);
};
const LOOKING_NORTH: PlateViewing = {
  camera: { eye: [0, 0, 1.8], forward: [0, 1, 0], focal: 1 / Math.tan(Math.PI / 6) },
  blocked: () => false,
  fought: () => 0,
  locked: null,
};
const nameOf = (plate: unknown) => findAll(plate as HTMLElement, 'name')[0]?.textContent;
/** The plates shown: those out of the cone are kept, hidden, for their foe's next showing. */
const showing = (root: HTMLElement) => findAll(root, 'overhead').filter((plate) => !plate.hidden);

test('in a crowd, a plate shows for the foe nearest the crosshair, the locked and the fought; none behind a block or past 60 m', () =>
  onFakePage((root) => {
    const bars = new FoeBars(root, root, root);
    const foes = [
      placed(1, 0, 10),
      placed(2, 45, 10),
      placed(3, -45, 10),
      placed(4, 5, 10),
      placed(5, 2, 70),
      placed(6, -3, 30),
      placed(7, 60, 30),
    ];
    const viewing: PlateViewing = {
      ...LOOKING_NORTH,
      blocked: (_from, to) => to[0] > 0.5 && to[0] < 1,
      fought: (id) => (id === 3 ? 1 : 0),
      locked: 7,
    };
    const spotOf = (view: FighterView) => ({ x: 400 + view.x * 10, y: 300, depth: view.y });
    for (let frame = 0; frame < 12; frame++) bars.update(foes, null, spotOf, viewing, 1 / 60);
    const plates = findAll(root, 'overhead');
    const named = (name: string) => plates.find((plate) => nameOf(plate) === name);
    assert.deepEqual(
      plates.map(nameOf).sort(),
      ['Foe 1', 'Foe 3', 'Foe 7'],
      'off to the side unfought, in the cone but not the nearest, behind a block, or past 60 m: no plate',
    );
    assert.equal(named('Foe 3')?.style['transform'], 'translate(329.3px, 300.0px)', 'the nearest whole, in place');
    assert.match(named('Foe 7')?.style['transform'] ?? '', /scale\(0\.800\)$/, 'smaller farther off');
    assert.deepEqual(
      bars.columns.map(({ left, right }) => Math.round(right - left)).sort((first, second) => first - second),
      [112, 140, 140],
      'the words keep clear of the plates drawn, each as wide as it is drawn, and of no other foe',
    );
  }));

test('a foe fought shows wherever it is, fading as the fight lets it go', () =>
  onFakePage((root) => {
    const bars = new FoeBars(root, root, root);
    let held = 1;
    const viewing: PlateViewing = { ...LOOKING_NORTH, fought: () => held };
    const spotOf = () => ({ x: 400, y: 300, depth: 10 });
    const behind = placed(1, 120, 10);
    bars.update([behind], null, spotOf, viewing, 1 / 60);
    const [plate] = findAll(root, 'overhead');
    assert.equal(plate?.style['opacity'], '', 'whole');
    held = 0.5;
    bars.update([behind], null, spotOf, viewing, 1);
    assert.equal(plate?.style['opacity'], '0.50', 'as the fight holds it');
    held = 0;
    bars.update([behind], null, spotOf, viewing, 1);
    assert.equal(showing(root).length, 0, 'let go: gone');
  }));

test('over a figure a plate is laid at its rank’s width: an Elite’s longer than a Minor’s', () =>
  onFakePage((root) => {
    // Two plates 160 px apart: a Minor's 140 px and an Elite's 176 px stand clear (70 + 88 + a 2 px gap), two Elites'
    // do not, and the farther is lifted over the nearer.
    const viewing: PlateViewing = { ...LOOKING_NORTH, fought: () => 1 };
    const spotOf = (view: FighterView) => ({ x: view.x > 0 ? 560 : 400, y: 300, depth: 10 + view.x });
    const laidOut = (first: number, second: number) => {
      const bars = new FoeBars(root, root, root);
      bars.update([placed(1, 0, 10, first), placed(2, 10, 10, second)], null, spotOf, viewing, Infinity);
      const plates = findAll(root, 'overhead');
      const laid = plates.map((plate) => [plate.dataset['tier'], plate.style['transform']]);
      for (const plate of plates) (plate as unknown as HTMLElement).remove();
      return laid;
    };
    assert.deepEqual(laidOut(1, 3), [
      ['minor', 'translate(400.0px, 300.0px)'],
      ['elite', 'translate(560.0px, 300.0px)'],
    ]);
    const [, lifted] = laidOut(3, 3);
    assert.match(lifted?.[1] ?? '', /^translate\(560\.0px, 27\d\.\dpx\)$/, 'two Elites: the farther lifted clear');
  }));

test('the cone keeps its foe while another stands less than a degree nearer, and gives it up once one does', () =>
  onFakePage((root) => {
    const bars = new FoeBars(root, root, root);
    const spotOf = (view: FighterView) => ({ x: 400 + view.x * 10, y: 300, depth: view.y });
    // Far enough off that neither body stands across the crosshair.
    const shownAt = (first: number, second: number) => {
      bars.update([placed(1, first, 40), placed(2, second, 40)], null, spotOf, LOOKING_NORTH, 1);
      return showing(root).map(nameOf);
    };
    assert.deepEqual(shownAt(2, 2.5), ['Foe 1'], 'the nearest');
    assert.deepEqual(shownAt(2.5, 2), ['Foe 1'], 'another half a degree nearer takes nothing');
    assert.deepEqual(shownAt(3, 1.5), ['Foe 2'], 'another a degree and a half nearer takes it');
  }));

test('with no camera the cone shows no foe, and a foe fought still shows', () =>
  onFakePage((root) => {
    const bars = new FoeBars(root, root, root);
    const viewing: PlateViewing = { ...LOOKING_NORTH, camera: null, fought: (id) => (id === 2 ? 1 : 0) };
    bars.update([placed(1, 0, 10), placed(2, 40, 10)], null, () => ({ x: 400, y: 300, depth: 10 }), viewing, 1);
    assert.deepEqual(findAll(root, 'overhead').map(nameOf), ['Foe 2']);
  }));

test('a Boss nearest the crosshair takes the cone, though its bar stands under the compass and none over its head', () =>
  onFakePage((root) => {
    const bars = new FoeBars(root, root, root);
    const spotOf = (view: FighterView) => ({ x: 400 + view.x * 10, y: 300, depth: view.y });
    const boss = placed(1, 0, 10, 5);
    bars.update([boss, placed(2, 3, 10, 1)], null, spotOf, LOOKING_NORTH, 1);
    assert.deepEqual(findAll(root, 'overhead').map(nameOf), [], 'no plate by the cone: the Boss is nearest');
    assert.equal(bars.boss.root.hidden, false, 'its bar under the compass');
    bars.update([placed(2, 3, 10, 1)], null, spotOf, LOOKING_NORTH, 1);
    assert.deepEqual(findAll(root, 'overhead').map(nameOf), ['Foe 2'], 'with the Boss gone, the Minor is nearest');
  }));

test('the crosshair on a near foe’s chest gives it the plate, over a far one whose head stands nearer the crosshair', () =>
  onFakePage((root) => {
    const bars = new FoeBars(root, root, root);
    // The eye 1.7 m up, looking down at the chest of a foe 6 m off; another stands 36 m off right behind it.
    const length = Math.hypot(6, 0.6);
    const viewing: PlateViewing = {
      ...LOOKING_NORTH,
      camera: { eye: [0, 0, 1.7], forward: [0, 6 / length, -0.6 / length], focal: 1 / Math.tan(Math.PI / 6) },
    };
    const spotOf = (view: FighterView) => ({ x: 400, y: 300 - view.y, depth: view.y });
    bars.update([placed(1, 0, 6), placed(2, 0, 36)], null, spotOf, viewing, 1);
    assert.deepEqual(findAll(root, 'overhead').map(nameOf), ['Foe 1']);
  }));

test('only a foe that can show a plate, or take the cone, has its line tried against the blocks and the land', () =>
  onFakePage((root) => {
    const bars = new FoeBars(root, root, root);
    const tried: number[] = [];
    const viewing: PlateViewing = {
      ...LOOKING_NORTH,
      blocked: (_from, to) => {
        tried.push(Math.round(to[0]));
        return false;
      },
      fought: (id) => (id === 3 ? 1 : 0),
    };
    // One at the crosshair, one fought off to the side, and twenty off to the side and never fought.
    const crowd = Array.from({ length: 20 }, (_unused, index) => placed(10 + index, 30 + index, 20));
    const spotOf = () => ({ x: 400, y: 300, depth: 20 });
    bars.update([placed(1, 0, 20), placed(3, -40, 20), ...crowd], null, spotOf, viewing, 1);
    assert.equal(tried.length, 2, 'two lines tried, not twenty-two');
  }));

test('a foe long behind a wall shows no plate as the view comes onto it, not for a moment, nor takes the cone', () =>
  onFakePage((root) => {
    const bars = new FoeBars(root, root, root);
    // Foe 1 stands behind a wall; Foe 2, 3 degrees off the crosshair, in the open, holds the cone.
    let hidden = placed(1, 40, 10);
    const viewing: PlateViewing = {
      ...LOOKING_NORTH,
      blocked: (_from, to) => Math.abs(to[0] - hidden.view.x) < 0.01 && Math.abs(to[1] - hidden.view.y) < 0.01,
    };
    const spotOf = (view: FighterView) => ({ x: 400 + view.x * 10, y: 300, depth: view.y });
    for (let frame = 0; frame < 60; frame++) bars.update([hidden, placed(2, 3, 10)], null, spotOf, viewing, 1 / 60);
    // The view comes round onto it: now it stands nearest the crosshair, still behind the wall.
    hidden = placed(1, 0, 10);
    bars.update([hidden, placed(2, 3, 10)], null, spotOf, viewing, 1 / 60);
    assert.deepEqual(findAll(root, 'overhead').map(nameOf), ['Foe 2']);
  }));

test('a plate leaving the cone fades out over a quarter of a second, then is gone', () =>
  onFakePage((root) => {
    const bars = new FoeBars(root, root, root);
    const viewing = LOOKING_NORTH;
    const spotOf = () => ({ x: 400, y: 300, depth: 10 });
    const ahead = thule(1, 0, { rank: 2 }, { y: 10 });
    bars.update([ahead], null, spotOf, viewing, 1 / 60);
    const [plate] = findAll(root, 'overhead');
    assert.equal(plate?.style['opacity'], '', 'whole');
    const aside = thule(1, 10, { rank: 2 }, { y: 0 });
    bars.update([aside], null, spotOf, viewing, 0.125);
    assert.equal(plate?.style['opacity'], '0.50', 'half way out');
    bars.update([aside], null, spotOf, viewing, 0.125);
    assert.equal(showing(root).length, 0);
    // Back in the cone, the same plate shows again, not one made anew.
    bars.update([ahead], null, spotOf, viewing, 1);
    assert.deepEqual([findAll(root, 'overhead').length, showing(root)[0]], [1, plate]);
    // Fallen, its plate is let go.
    const fallen = thule(1, 0, { rank: 2 }, { y: 10, action: { kind: 'dead', elapsed: 0 } });
    bars.update([fallen], null, spotOf, viewing, 1 / 60);
    assert.equal(findAll(root, 'overhead').length, 0);
  }));

test('the crosshair on a near foe takes the plate from one behind it on the line, and the next lifts nothing', () =>
  onFakePage((root) => {
    const bars = new FoeBars(root, root, root);
    const spotOf = (view: FighterView) => ({ x: 400 + view.x * 10, y: 300, depth: view.y });
    // A near foe a quarter metre off the line, its body across the crosshair; a far one dead on the line behind it.
    const near = thule(1, 0, { name: 'Near', rank: 2 }, { x: 0.25, y: 8 });
    const far = thule(2, 0, { name: 'Far', rank: 2 }, { x: 0, y: 30 });
    for (let frame = 0; frame < 30; frame++) bars.update([near, far], null, spotOf, LOOKING_NORTH, 1 / 60);
    assert.deepEqual(showing(root).map(nameOf), ['Near'], 'the body the crosshair meets first');
    // The view moves on to the far one alone: it takes the plate where it stands, lifted over nothing fading out.
    const aside = thule(1, 0, { name: 'Near', rank: 2 }, { x: 3, y: 8 });
    bars.update([aside, far], null, spotOf, LOOKING_NORTH, 1 / 60);
    const farPlate = showing(root).find((plate) => nameOf(plate) === 'Far');
    assert.match(
      farPlate?.style['transform'] ?? '',
      /^translate\(400\.0px, 300\.0px\)/,
      'not lifted over the plate going',
    );
  }));
