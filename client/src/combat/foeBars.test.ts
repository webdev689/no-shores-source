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

test('in a crowd, plates show near the crosshair and for the foes fought; none behind a block, none past 60 m', () =>
  onFakePage((root) => {
    const bars = new FoeBars(root, root, root);
    // The eye at the origin, looking north (+y); each foe stands at its bearing from north, metres off.
    const placed = (id: number, degrees: number, metres: number): MarkedFoe => {
      const radians = (degrees * Math.PI) / 180;
      const view = { x: Math.sin(radians) * metres, y: Math.cos(radians) * metres };
      return thule(id, 0, { name: `Foe ${id}`, rank: 2 }, view);
    };
    const foes = [placed(1, 0, 10), placed(2, 45, 10), placed(3, -45, 10), placed(4, 5, 10), placed(5, 2, 70)];
    const foes2 = [...foes, placed(6, -3, 30)];
    const viewing: PlateViewing = {
      camera: { eye: [0, 0, 1.8], forward: [0, 1, 0], focal: 1 / Math.tan(Math.PI / 6) },
      blocked: (_from, to) => to[0] > 0.5 && to[0] < 1,
      fought: (id) => id === 3,
    };
    const spotOf = (view: FighterView) => ({ x: 400 + view.x * 10, y: 300, depth: view.y });
    for (let frame = 0; frame < 12; frame++) bars.update(foes2, null, spotOf, viewing, 1 / 60);
    const plates = findAll(root, 'overhead');
    const named = (name: string) =>
      plates.find((plate) => findAll(plate as unknown as HTMLElement, 'name')[0]?.textContent === name);
    assert.deepEqual(
      plates.map((plate) => findAll(plate as unknown as HTMLElement, 'name')[0]?.textContent).sort(),
      ['Foe 1', 'Foe 3', 'Foe 6'],
      'off to the side unfought, behind a block, or past 60 m: no plate',
    );
    assert.equal(named('Foe 3')?.style['transform'], 'translate(329.3px, 300.0px)', 'the nearest whole, in place');
    assert.match(named('Foe 6')?.style['transform'] ?? '', /scale\(0\.750\)$/, 'smaller farther off');
  }));

test('a plate leaving the cone fades out over a quarter of a second, then is gone', () =>
  onFakePage((root) => {
    const bars = new FoeBars(root, root, root);
    const viewing: PlateViewing = {
      camera: { eye: [0, 0, 1.8], forward: [0, 1, 0], focal: 1 / Math.tan(Math.PI / 6) },
      blocked: () => false,
      fought: () => false,
    };
    const spotOf = () => ({ x: 400, y: 300, depth: 10 });
    const ahead = thule(1, 0, { rank: 2 }, { y: 10 });
    bars.update([ahead], null, spotOf, viewing, 1 / 60);
    const [plate] = findAll(root, 'overhead');
    assert.equal(plate?.style['opacity'], '', 'whole');
    const aside = thule(1, 10, { rank: 2 }, { y: 0 });
    bars.update([aside], null, spotOf, viewing, 0.125);
    assert.equal(plate?.style['opacity'], '0.50', 'half way out');
    bars.update([aside], null, spotOf, viewing, 0.125);
    assert.equal(findAll(root, 'overhead').length, 0);
  }));

test("a companion's plate is drawn in the players' colour, by their own name", () =>
  onFakePage((root) => {
    const bars = new FoeBars(root, root, root);
    const viewing: PlateViewing = {
      camera: { eye: [0, 0, 1.8], forward: [0, 1, 0], focal: 1 / Math.tan(Math.PI / 6) },
      blocked: () => false,
      fought: () => false,
    };
    const mate = thule(1, 0, { name: 'Cass Brine', rank: 2, ally: true }, { y: 5, side: 'players' });
    const brute = thule(2, 0, { name: 'Brute', rank: 2 }, { y: 6 });
    for (let frame = 0; frame < 12; frame++)
      bars.update([mate, brute], null, () => ({ x: 400, y: 300, depth: 5 }), viewing, 1 / 60);
    const bands = findAll(root, 'overhead').map((plate) => [
      findAll(plate as unknown as HTMLElement, 'name')[0]?.textContent,
      (plate as unknown as HTMLElement).dataset['band'],
    ]);
    assert.deepEqual(bands.sort(), [
      ['Brute', 'orange'],
      ['Cass Brine', 'ally'],
    ]);
  }));
