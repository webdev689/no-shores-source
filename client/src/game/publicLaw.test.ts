import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HEROIC, MARK, PUBLIC_KIND, PUBLIC_PHASE, type PublicEvent } from '../network/publicMessages.ts';
import { askedPlay, askedPublic, bannerOf, clockOf, compassOf, minuteShift, questOf, ringOf } from './publicLaw.ts';

const fissure = (more: Partial<PublicEvent> = {}): PublicEvent => ({
  kind: PUBLIC_KIND.fissure,
  phase: PUBLIC_PHASE.running,
  ground: [100, 200, 5],
  radius: 25,
  ticksLeft: 7 * 3600 + 42 * 60,
  nextKind: PUBLIC_KIND.raid,
  nextGround: [400, 500, 3],
  nextTicks: 12 * 3600,
  stage: 1,
  stages: 2,
  progress: 5,
  needed: 14,
  heroic: HEROIC.notYet,
  heroicTicks: 0,
  bonus: true,
  marks: [],
  ...more,
});
const raid = (more: Partial<PublicEvent> = {}): PublicEvent =>
  fissure({ kind: PUBLIC_KIND.raid, stage: 2, stages: 3, progress: 730, needed: 1000, ...more });

test('a clock reads minutes and seconds, rounded up, never below nothing', () => {
  assert.equal(clockOf(7 * 3600 + 42 * 60), '7:42');
  assert.equal(clockOf(61), '0:02');
  assert.equal(clockOf(-5), '0:00');
});

test('the Fissure running: its name, place, countdown, shards, bonus; the growth while its window is open', () => {
  const shown = bannerOf(fissure(), 'saltgrass-downs');
  assert.ok(shown);
  assert.equal(shown.title, 'The Fissure');
  assert.equal(shown.place, 'The High Downs');
  assert.equal(shown.clock, '7:42');
  assert.deepEqual(shown.bar, { share: 5 / 14, label: '5 / 14 shards' });
  assert.equal(shown.heroic, null);
  assert.deepEqual(shown.bonus, { text: 'Bonus: seal it with half the time left', state: 'holds' });
  const offered = bannerOf(fissure({ heroic: HEROIC.offered, heroicTicks: 30 * 60 }), 'saltgrass-downs');
  assert.deepEqual(offered?.heroic, { text: 'Break the growth', clock: '0:30', met: false });
  const warden = bannerOf(fissure({ stage: 2, heroic: HEROIC.met }), 'saltgrass-downs');
  assert.equal(warden?.objective, 'Kill the Warden of the Fissure');
  assert.equal(warden?.tone, 'heroic');
  assert.deepEqual(warden?.heroic, { text: 'Heroic', clock: '', met: true });
});

test('the raid running: its wave, the stores standing as its bar, the tithe-taker while his window is open', () => {
  const shown = bannerOf(raid({ heroic: HEROIC.offered, heroicTicks: 50 * 60 }), 'driftwood-moors');
  assert.equal(shown?.title, 'The Grey Tithe Raid');
  assert.equal(shown?.place, 'Moorend');
  assert.equal(shown?.objective, 'Hold the stores: wave 2 of 3');
  assert.deepEqual(shown?.bar, { share: 0.73, label: 'Stores 73%' });
  assert.equal(shown?.heroic?.text, 'Kill the tithe-taker');
  const marrow = bannerOf(raid({ stage: 4, stages: 4, heroic: HEROIC.met }), 'driftwood-moors');
  assert.equal(marrow?.objective, 'Break Reeve Ancel Marrow, the Tithe’s Hand');
  const lost = bannerOf(raid({ bonus: false }), 'driftwood-moors');
  assert.equal(lost?.bonus?.state, 'lost');
});

test('the result: won with its chest tier, or failed and why; the next event once it is over', () => {
  const won = bannerOf(fissure({ phase: PUBLIC_PHASE.won, heroic: HEROIC.met, ticksLeft: 600 }), 'gullwing-vale');
  assert.equal(won?.tone, 'won');
  assert.equal(won?.kicker, 'Event complete');
  assert.equal(won?.objective, 'Your chest waits at the ground: heroic, with the bonus');
  assert.equal(won?.clock, '');
  const plain = bannerOf(raid({ phase: PUBLIC_PHASE.won, bonus: false, heroic: HEROIC.missed }), 'gullwing-vale');
  assert.equal(plain?.objective, 'Your chest waits at the ground');
  const fell = bannerOf(raid({ phase: PUBLIC_PHASE.failed, progress: 0 }), 'gullwing-vale');
  assert.equal(fell?.tone, 'failed');
  assert.equal(fell?.objective, 'Every store fell');
  const timed = bannerOf(fissure({ phase: PUBLIC_PHASE.failed }), 'gullwing-vale');
  assert.equal(timed?.objective, 'Time ran out: the Lattice sank back into the earth');
  const next = bannerOf(
    fissure({ kind: PUBLIC_KIND.none, phase: PUBLIC_PHASE.waiting, nextTicks: 4 * 3600 + 10 }),
    'gullwing-vale',
  );
  assert.equal(next?.tone, 'next');
  assert.equal(next?.title, 'The Grey Tithe Raid');
  assert.equal(next?.place, 'Gullwing');
  assert.equal(next?.clock, 'in 5 min');
  assert.equal(bannerOf(fissure({ kind: 0, phase: 0, nextTicks: 30 * 60 }), 'gullwing-vale')?.clock, 'in 1 min');
  assert.equal(bannerOf(fissure({ kind: 0, phase: 0, nextKind: 0 }), 'gullwing-vale'), null);
});

test('the tracker: the steps of the task now, each counting what is left', () => {
  const quest = questOf(fissure({ heroic: HEROIC.offered }), 'saltgrass-downs');
  assert.equal(quest?.name, 'The Fissure');
  assert.deepEqual(
    quest?.steps.map((step) => [step.text, step.count, step.done ?? false]),
    [
      ['Carry shards to the fissure', 9, false],
      ['Heroic: break the growth', undefined, false],
      ['Bonus: seal it with half the time left', undefined, false],
    ],
  );
  const stores = [1, 2, 1].map((state, id) => ({ kind: MARK.store, id, at: [0, 0, 0] as const, health: 1, state }));
  const held = questOf(raid({ heroic: HEROIC.met, bonus: false, marks: stores }), 'saltgrass-downs');
  assert.deepEqual(
    held?.steps.map((step) => [step.text, step.count, step.done ?? false]),
    [
      ['Break wave 2 of 3', undefined, false],
      ['Keep a store standing', 2, false],
      ['Heroic: kill the tithe-taker', undefined, true],
    ],
  );
  assert.equal(questOf(fissure({ phase: PUBLIC_PHASE.won }), 'saltgrass-downs'), null);
});

test('the compass marks the ground (the next one between events) and the heroic mark while its window is open', () => {
  const growth = { kind: MARK.growth, id: 9, at: [120, 210, 5] as const, health: 1, state: 2 };
  assert.deepEqual(compassOf(fissure({ heroic: HEROIC.offered, marks: [growth] })), [
    { x: 100, y: 200, kind: 'event' },
    { x: 120, y: 210, kind: 'heroic' },
  ]);
  assert.deepEqual(compassOf(fissure({ marks: [growth] })), [{ x: 100, y: 200, kind: 'event' }]);
  assert.deepEqual(compassOf(fissure({ kind: 0, phase: 0 })), [{ x: 400, y: 500, kind: 'event' }]);
  assert.deepEqual(ringOf(fissure()), { at: [100, 200, 5], radius: 25 });
  assert.equal(ringOf(fissure({ phase: PUBLIC_PHASE.won })), null);
});

test('the dev address asks for an event, and the minute that starts it at once in its zone', () => {
  assert.equal(askedPublic('?at=gullwing-vale&public=raid'), 'raid');
  assert.equal(askedPublic('?public=other'), null);
  // The Downs (place 0) run the Fissure in even slots: minute 0, 30, 60...; the Vale (place 1) the raid in slots
  // 0, 2, 4 from minute 5 (crates/room/src/public/mod.rs schedule).
  assert.equal(minuteShift('saltgrass-downs', 'fissure', 31), 29);
  assert.equal(minuteShift('saltgrass-downs', 'raid', 31), 14);
  assert.equal(minuteShift('gullwing-vale', 'raid', 5), 0);
  assert.equal(minuteShift('gullwing-vale', 'fissure', 5), 15);
  assert.equal(minuteShift('overlook-social', 'raid', 5), null);
});

test("the dev address's play: ticks a frame, bots, and the heroic task left alone only when asked", () => {
  assert.deepEqual(askedPlay('?at=gullwing-vale&public=raid&speed=12&bots=3'), { speed: 12, bots: 3, heroic: true });
  assert.deepEqual(askedPlay('?bots=2&heroic=0'), { speed: 0, bots: 2, heroic: false });
  assert.deepEqual(askedPlay('?speed=999&bots=-4'), { speed: 64, bots: 0, heroic: true });
  assert.equal(askedPlay('?public=fissure&speed=x'), null);
});
