import assert from 'node:assert/strict';
import { test } from 'node:test';
import listed from '../../../../../content/audio/freesound.json' with { type: 'json' };
import type { FightEvent, FightView } from '../../../rules/fightRules.ts';
import { seaFightCue } from './seaFight.ts';

/** A fight of the player's Sloop and two captains, as far as its sounds read it. */
const VIEW = {
  player: { ship: [100, 200, 0] },
  captain: { ship: [400, 200, 0] },
  others: [{ ship: [700, 260, 0] }],
} as unknown as FightView;

const EVENTS: readonly FightEvent[] = [
  { kind: 'muzzle', ship: 0, point: [101, 203, 3], launch: [0, 1, 0] },
  { kind: 'hit', ship: 1, by: 0, zone: 'hull', point: [398, 201, 2] },
  { kind: 'hit', ship: 1, by: 0, zone: 'rig', point: [400, 200, 14] },
  { kind: 'splash', point: [250, 180, 0] },
  { kind: 'state', ship: 2, state: 'sinking' },
  { kind: 'state', ship: 1, state: 'struck' },
  { kind: 'run-out', side: 'port' },
];

test('a gun fired, a ball striking, a ball falling in the sea and a ship going down are each heard where they happen', () => {
  assert.deepEqual(
    EVENTS.map((event) => seaFightCue(event, VIEW)),
    [
      { cue: 'sea.cannon.fire', at: [101, 203, 3] },
      { cue: 'sea.ball.hull', at: [398, 201, 2] },
      { cue: 'sea.ball.hull', at: [400, 200, 14] },
      { cue: 'sea.ball.splash', at: [250, 180, 0] },
      { cue: 'sea.ship.break', at: [700, 260, 1] },
      null,
      null,
    ],
  );
});

test('every sea fight cue the Freesound list searches for is one the fight plays', () => {
  const played = new Set(EVENTS.map((event) => seaFightCue(event, VIEW)?.cue).filter(Boolean));
  const searched = listed.cues.map((cue) => cue.id).filter((id) => id.startsWith('sea.'));
  assert.deepEqual([...searched].sort(), [...played].sort());
});
