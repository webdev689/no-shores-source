import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EVENT } from '../combat/cues.ts';
import { type EncounterSeen, SEAL_KIND, SEAL_STATE } from '../network/encounterMessages.ts';
import type { FightEvent } from '../network/messages.ts';
import type { EncounterLayout } from './dungeonLayout.ts';
import { ENCOUNTER_SOUNDS, EncounterCues } from './encounterCues.ts';
import { FLASH_S } from './encounterLaw.ts';

const plan = {
  seals: [],
  anchors: [
    [1, 2, 0],
    [3, 4, 0],
    [5, 6, 0],
  ],
  reach: { rune: 0.9, plate: 1, relic: 3, anchor: 1, light: 1.25, slam: 4 },
} as unknown as EncounterLayout;

const seen = (more: Partial<EncounterSeen> = {}): EncounterSeen => ({
  seals: [],
  woken: true,
  boss: 7,
  ward: 0,
  wardsBroken: 1,
  anchors: [0, 0, 0],
  reckoningTicks: 0,
  reckoningAt: 0,
  fury: 0,
  furyTicks: 0,
  slamTicks: 0,
  ...more,
});

const bodies = (seconds: number) => ({
  player: 9,
  feet: [0, 0, 0] as const,
  where: () => [8, 8, 0] as const,
  seconds,
});
const event = (kind: number, defender = 9) => ({ kind, defender }) as FightEvent;

test('a Reckoning ticks each of its last three seconds once, then booms at its light and flashes', () => {
  const cues = new EncounterCues();
  const ticks = [240, 200, 179, 150, 120, 119, 61, 60, 30, 1].map(
    (left) => cues.frame(plan, seen({ reckoningTicks: left, reckoningAt: 1 }), [], bodies(0)).ui,
  );
  assert.equal(ticks.flat().filter((cue) => cue === 'tab').length, 3, 'three ticks');
  const landed = cues.frame(plan, seen(), [event(EVENT.reckoningLanded)], bodies(10));
  assert.deepEqual(landed.sounds, [{ cue: ENCOUNTER_SOUNDS.reckoning, at: [3, 4, 0] }]);
  assert.deepEqual(landed.flash, { at: 1, share: 1 });
  assert.equal(cues.frame(plan, seen(), [], bodies(10 + FLASH_S + 0.01)).flash, null, 'the flash over');
});

test("the Boss's slam, a ward rising and the drowned floor's harm on the player each sound where they happen", () => {
  const cues = new EncounterCues();
  const heard = cues.frame(
    plan,
    seen(),
    [event(EVENT.bossSlammed), event(EVENT.wardRaised), event(EVENT.drowned), event(EVENT.drowned, 3)],
    bodies(0),
  );
  assert.deepEqual(heard.sounds, [
    { cue: ENCOUNTER_SOUNDS.slam, at: [8, 8, 0] },
    { cue: ENCOUNTER_SOUNDS.ward, at: [8, 8, 0] },
    { cue: ENCOUNTER_SOUNDS.drowned, at: [0, 0, 0] },
  ]);
});

test('a relic falling past three tenths is refused once, and again only after it stood over them', () => {
  const cues = new EncounterCues();
  const relic = (strength: number) => {
    const seal = { kind: SEAL_KIND.holdfast, state: SEAL_STATE.running, progress: 0, marks: [1], relic: strength };
    return cues.frame(plan, seen({ seals: [seal] }), [], bodies(0)).ui;
  };
  assert.deepEqual([0.5, 0.31, 0.3, 0.2, 0.1].map(relic).flat(), ['refused']);
  assert.deepEqual([0.4, 0.29].map(relic).flat(), ['refused']);
});
