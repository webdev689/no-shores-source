import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FighterView } from '../rules/fighters.ts';
import {
  ALERT_MARK_SECONDS,
  type MarkedFoe,
  PHASE_MARKS,
  alertMark,
  barColour,
  bossBarOf,
  bossInFight,
} from './foeBars.ts';

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
  assert.deepEqual([1, 2, 3, 4].map(barColour), ['red', 'orange', 'yellow', 'yellow']);
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
