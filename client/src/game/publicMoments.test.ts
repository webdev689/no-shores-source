import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EVENT } from '../combat/cues.ts';
import { HEROIC, MARK, PUBLIC_KIND, type PublicEvent } from '../network/publicMessages.ts';
import { PublicMoments } from './publicMoments.ts';

const running = (more: Partial<PublicEvent> = {}): PublicEvent => ({
  kind: PUBLIC_KIND.raid,
  phase: 1,
  ground: [50, 50, 2],
  radius: 30,
  ticksLeft: 3600,
  nextKind: 1,
  nextGround: [0, 0, 0],
  nextTicks: 0,
  stage: 1,
  stages: 3,
  progress: 1000,
  needed: 1000,
  heroic: 0,
  heroicTicks: 0,
  bonus: true,
  marks: [],
  nextWaveTicks: 0,
  ...more,
});
const happened = (kind: number) => ({ tick: 1n, kind, how: 0, striker: 0, defender: 0, amount: 0, stroke: 0 });
const none = () => null;

test('the last ten seconds tick once a second, and not before', () => {
  const moments = new PublicMoments();
  const ticks: boolean[] = [];
  // The room's ticks left, a frame a twentieth of a second apart.
  for (let left = 12 * 60; left >= 8 * 60; left -= 3)
    ticks.push(moments.frame(running({ ticksLeft: left }), [], [0, 0, 0], none, [], 0, 0).tick);
  assert.equal(ticks.filter(Boolean).length, 3, 'at 10, 9 and 8 seconds left');
  const first = ticks.indexOf(true);
  assert.equal(12 * 60 - first * 3, 10 * 60, 'first as ten seconds are left');
});

test('a raid won is heard with a bright shimmer, failed with a crash, both at its ground; a Fissure won trembles', () => {
  const won = new PublicMoments();
  won.frame(running(), [], [0, 0, 0], none, [], 0, 0);
  assert.deepEqual(won.frame(running({ phase: 2 }), [happened(EVENT.publicWon)], [0, 0, 0], none, [], 1, 1).sounds, [
    { cue: 'story.flash', at: [50, 50, 2] },
  ]);
  const failed = new PublicMoments();
  failed.frame(running(), [], [0, 0, 0], none, [], 0, 0);
  assert.deepEqual(
    failed.frame(running({ phase: 3 }), [happened(EVENT.publicFailed)], [0, 0, 0], none, [], 1, 1).sounds,
    [{ cue: 'story.crash', at: [50, 50, 2] }],
  );
  const sealed = new PublicMoments();
  const crack = { kind: MARK.fissure, id: 1, at: [50, 50, 2] as const, health: 1, state: 1 };
  const fissure = running({ kind: PUBLIC_KIND.fissure, marks: [crack] });
  sealed.frame(fissure, [], [50, 50, 2], none, [], 0, 0);
  assert.ok(sealed.frame(fissure, [happened(EVENT.publicWon)], [50, 50, 2], none, [], 1, 1).tremor > 0);
});

test('the heroic chance opens: its call for its first seconds, heard at its target', () => {
  const moments = new PublicMoments();
  const growth = { kind: MARK.growth, id: 9, at: [5, 6, 1] as const, health: 1, state: 1 };
  const fissure = (heroic: number) => running({ kind: PUBLIC_KIND.fissure, heroic, marks: [growth] });
  moments.frame(fissure(HEROIC.notYet), [], [0, 0, 0], none, [], 0, 0);
  const opened = moments.frame(fissure(HEROIC.offered), [], [0, 0, 0], none, [], 1, 1);
  assert.equal(opened.beat, 'chance');
  assert.deepEqual(opened.sounds, [{ cue: 'cast.charge', at: [5, 6, 1] }]);
  assert.ok(opened.call);
  assert.equal(moments.frame(fissure(HEROIC.offered), [], [0, 0, 0], none, [], 7, 7).call, null, 'gone after');
});

test('a chest coming thumps in where it lies, and lies its two minutes on the wall’s time', () => {
  const moments = new PublicMoments();
  const chest = { id: 5, at: [1, 0, 0] as const, tier: 1, opened: null };
  moments.frame(running({ phase: 2 }), [], [0, 0, 0], none, [], 0, 0);
  const come = moments.frame(running({ phase: 2 }), [], [0, 0, 0], none, [chest], 0.1, 1);
  assert.deepEqual(come.sounds, [{ cue: 'drop.land', at: [1, 0, 0] }]);
  // The frame clock capped (0.1 s a frame), the wall's 12 s on.
  const later = moments.frame(running({ phase: 2 }), [], [0, 0, 0], none, [chest], 0.2, 13);
  assert.equal(later.chestsLeft.get(5), 108);
  assert.deepEqual(later.sounds, [], 'thumped once');
});
