import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AbilityState } from '../../combat/abilityBar.ts';
import type { BindId } from '../../player/binds.ts';
import type { FighterView } from '../../rules/fighters.ts';
import { castBetween, CastFreeze, castPrompt, teachable } from './stormTeaching.ts';

const view = (fields: Partial<FighterView>): FighterView =>
  ({
    x: 0,
    y: 0,
    z: 0,
    aim: 0,
    side: 'players',
    health: 100,
    healthMax: 100,
    mode: 'ground',
    action: { kind: 'idle' },
    ...fields,
  }) as FighterView;
const READY: AbilityState = { art: 1, animaShare: 1, tenets: [1, 1], earned: 0b111, recharge: 1 };
const own = view({});
/** A foe `ahead` metres north of the player, who aims north, and `aside` metres east. */
const foe = (ahead: number, aside = 0) => view({ side: 'foes', x: aside, y: -ahead });

test('Arc Lash is taught once a foe stands in its cone and reach; Quicken and Tempest once one is near', () => {
  assert.ok(teachable('arcLash', own, [foe(5)], READY), 'before them, in reach');
  assert.ok(!teachable('arcLash', own, [foe(9)], READY), 'beyond its reach');
  assert.ok(!teachable('arcLash', own, [foe(2, 4)], READY), 'outside its cone');
  assert.ok(!teachable('arcLash', own, [foe(-4)], READY), 'behind them');
  assert.ok(teachable('quicken', own, [foe(-4)], READY), 'near, any way');
  assert.ok(teachable('tempest', own, [foe(10)], READY));
  assert.ok(!teachable('tempest', own, [foe(20)], READY), 'too far off');
  assert.ok(!teachable('quicken', own, [view({ x: 2 })], READY), 'one of the crew is no foe');
  assert.ok(!teachable('arcLash', own, [{ ...foe(5), health: 0 }], READY), 'nor the dead');
});

test('no ability is taught while it is not charged, nor while the player cannot cast', () => {
  const spent = { ...READY, animaShare: 0.4, tenets: [0.2, 0.5] } as AbilityState;
  for (const spell of ['arcLash', 'quicken', 'tempest'] as const) {
    assert.ok(!teachable(spell, own, [foe(3)], spent), `${spell} not charged`);
    assert.ok(!teachable(spell, view({ action: { kind: 'staggered' } as never }), [foe(3)], READY), 'staggered');
    assert.ok(!teachable(spell, view({ mode: 'air' }), [foe(3)], READY), 'in the air');
    assert.ok(!teachable(spell, own, [foe(3)], null), 'no Art');
  }
});

test('a spell cast is read from its charge spent between two frames', () => {
  const after = { ...READY, tenets: [1, 0.01] } as AbilityState;
  assert.deepEqual(castBetween(READY, after), ['arcLash']);
  assert.deepEqual(castBetween(READY, { ...READY, animaShare: 0 } as AbilityState), ['tempest']);
  assert.deepEqual(castBetween(after, after), [], 'spent before, nothing cast now');
  assert.deepEqual(castBetween(null, after), []);
});

test('the fight freezes on each ability until its own key, then plays on while the cast goes out', () => {
  const freeze = new CastFreeze();
  const pressing =
    (key: BindId | null, locked = true) =>
    () => ({ locked, pressed: (bound: BindId) => bound === key });
  const TICK = 1 / 60;
  assert.ok(freeze.frame('arcLash', true, pressing(null), TICK), 'frozen until pressed');
  assert.ok(freeze.frame('arcLash', true, pressing('tenetOne'), TICK), 'another key does not answer it');
  assert.ok(freeze.frame('arcLash', true, pressing('tenetTwo', false), TICK), 'nor its key with the pointer free');
  assert.ok(!freeze.frame('arcLash', true, pressing('tenetTwo'), TICK), 'its key plays on');
  assert.ok(!freeze.frame('arcLash', true, pressing(null), 0.5), 'not again while the cast goes out');
  assert.ok(!freeze.frame('quicken', false, pressing(null), TICK), 'nothing to teach it on');
  assert.ok(freeze.frame('quicken', true, pressing(null), TICK));
  assert.ok(!freeze.frame(null, true, pressing(null), TICK));
});

test('a press that cast nothing (refused, its charge unspent) is asked again at the next chance, until its step ticks', () => {
  const freeze = new CastFreeze();
  const pressing = (key: BindId | null) => () => ({ locked: true, pressed: (bound: BindId) => bound === key });
  freeze.frame('arcLash', true, pressing(null), 0.1);
  assert.ok(!freeze.frame('arcLash', true, pressing('tenetTwo'), 0.1), 'answered');
  assert.ok(!freeze.frame('arcLash', true, pressing(null), 0.5));
  assert.ok(freeze.frame('arcLash', true, pressing(null), 0.6), 'still the lesson a second on: frozen again');
  assert.ok(!freeze.frame('arcLash', false, pressing(null), 0.1), 'but only once it may be taught');
});

test('the prompts name each key as bound now', () => {
  assert.equal(castPrompt('arcLash'), 'Press G to cast Arc Lash');
  assert.equal(castPrompt('quicken'), 'Press Q to cast Quicken');
  assert.equal(castPrompt('tempest'), 'Press R to release Tempest');
});
