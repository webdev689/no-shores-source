import assert from 'node:assert/strict';
import { test } from 'node:test';
import listed from '../../../content/audio/freesound.json' with { type: 'json' };
import { HORSE_CUES, HorseSounds, type Rider, SNORT_S, STRIDE_M } from './horseSounds.ts';
import type { StepGround } from './worldCues.ts';

const FLAT = { blocks: [] };
const STONE = { blocks: [{ minX: -100, minY: -100, maxX: 100, maxY: 100, top: 0, bottom: -1 }] };

/** Rides `rider` for `seconds` at `speed` metres a second north, a frame at a time, and answers the cues heard. */
function ride(sounds: HorseSounds, rider: Rider, seconds: number, speed: number, ground: StepGround = FLAT): string[] {
  const heard: string[] = [];
  const frame = 1 / 60;
  const x = rider.feet[0];
  let y = rider.feet[1];
  for (let time = 0; time < seconds - 1e-9; time += frame) {
    y -= speed * frame;
    sounds.frame([{ ...rider, feet: [x, y, 0] as const }], frame, ground, (cue) => heard.push(cue));
  }
  return heard;
}

const count = (heard: readonly string[], cue: string) => heard.filter((each) => each === cue).length;

test('a horse is heard a stride at a time at its gait, on the ground under it', () => {
  const sounds = new HorseSounds();
  const rider: Rider = { id: 1, feet: [0, 0, 0], mounted: true, boosting: 0 };
  sounds.frame([rider], 1 / 60, FLAT, () => assert.fail('nothing for one first heard'));
  const walked = ride(sounds, rider, 2, 6);
  assert.ok(Math.abs(count(walked, 'horse.walk.ground') - 12 / STRIDE_M.walk) <= 1, walked.join());
  const galloped = ride(sounds, rider, 2, 12, STONE);
  assert.ok(Math.abs(count(galloped, 'horse.gallop.stone') - 24 / STRIDE_M.gallop) <= 1, galloped.join());
  const boosted = ride(sounds, { ...rider, boosting: 4 }, 2, 9);
  assert.equal(count(boosted, 'horse.boost'), 1, "the boost's start, once");
  assert.ok(count(boosted, 'horse.boost.ground') >= 3, 'boosted hooves, even at a boosted walk');
});

test('a horse is boosted only while its boost runs, however fast it goes', () => {
  const sounds = new HorseSounds();
  const rider: Rider = { id: 3, feet: [0, 0, 0], mounted: true, boosting: 0 };
  sounds.frame([rider], 1 / 60, FLAT, () => undefined);
  const fast = ride(sounds, rider, 2, 18);
  assert.equal(fast.filter((cue) => cue.startsWith('horse.boost')).length, 0, fast.join());
  assert.ok(count(fast, 'horse.gallop.ground') >= 9, 'a gallop');
});

test("on wood, only the wreck's timber, a horse sounds as on stone", () => {
  const sounds = new HorseSounds();
  const rider: Rider = { id: 4, feet: [0, 0, 0], mounted: true, boosting: 0 };
  const timber = { ...STONE, wooden: STONE.blocks };
  sounds.frame([rider], 1 / 60, timber, () => undefined);
  const heard = ride(sounds, rider, 2, 6, timber);
  assert.ok(count(heard, 'horse.walk.stone') >= 6, heard.join());
});

test('mounting whinnies, getting down is heard, a horse standing snorts now and then, and on foot it is silent', () => {
  const sounds = new HorseSounds();
  const heard: string[] = [];
  const hear = (cue: string) => heard.push(cue);
  const standing: Rider = { id: 2, feet: [5, 5, 0], mounted: false, boosting: 0 };
  sounds.frame([standing], 1 / 60, FLAT, hear);
  sounds.frame([{ ...standing, mounted: true }], 1 / 60, FLAT, hear);
  assert.deepEqual(heard, ['horse.mount', 'horse.whinny']);
  heard.length = 0;
  for (let frame = 0; frame < (SNORT_S * 2 + 0.5) * 60; frame++)
    sounds.frame([{ ...standing, mounted: true }], 1 / 60, FLAT, hear);
  assert.deepEqual(heard, ['horse.snort', 'horse.snort']);
  heard.length = 0;
  sounds.frame([standing], 1 / 60, FLAT, hear);
  assert.deepEqual(heard, ['horse.dismount']);
  assert.deepEqual(ride(sounds, standing, 2, 4), [], 'on foot, the footsteps are heard instead');
});

test("the Freesound list searches for every horse's cue, and for no other horse's", () => {
  const searched = listed.cues.map((cue) => cue.id).filter((id) => id.startsWith('horse.'));
  assert.deepEqual(searched.sort(), [...HORSE_CUES].sort());
});
