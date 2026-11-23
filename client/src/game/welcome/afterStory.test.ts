import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Shot } from '../camera.ts';
import type { Epilogue } from '../prologue/epilogue.ts';
import { AfterStory } from './afterStory.ts';
import { SOCIAL } from './plazaForTests.ts';
import { FLY_S, TOUR } from './tour.ts';

const VIEW = { width: 800, height: 600 };
const YOU = { x: 1000, y: 2030, z: 30, facing: 0 };
const OWN: Shot = { eye: [1000, 2034, 33], yaw: 0, pitch: 0.2, fov: 1, near: 0.1, far: 3000 };
const settled = () => new Promise((resolve) => setImmediate(resolve));

/** A stranger's last moment that speaks her words as soon as it is framed, saying each scene until `finish`, and is
 *  done once they are said or the place is left. */
function story() {
  const said: string[] = [];
  const finishes: (() => void)[] = [];
  let pressed = 0;
  let speaking = false;
  const epilogue = {
    done: false,
    words: () => Promise.resolve(),
    say: (scene: string) => new Promise<void>((finish) => (said.push(scene), finishes.push(finish))),
    advance: () => void (pressed += 1),
    leave: () => void (epilogue.done = true),
    frame: () => {
      if (!speaking) {
        speaking = true;
        void epilogue.words().then(() => (epilogue.done = true));
      }
      return [];
    },
  };
  const gifts: string[] = [];
  const after = new AfterStory();
  after.storyEnded(epilogue as unknown as Epilogue);
  const here = { node: SOCIAL, floor: () => 30, gift: () => void gifts.push('gift') };
  const frame = (node = SOCIAL) => after.frame(OWN, VIEW, 1 / 30, 0, YOU, false, { ...here, node });
  return { after, said, gifts, frame, finish: () => finishes.shift()?.(), pressed: () => pressed };
}

test('on arriving in Overlook the stranger says her welcome, the keys held and the view hers, then gives her gift', async () => {
  const { after, said, gifts, frame, finish, pressed } = story();
  assert.equal(after.holding, false, 'the keys are the player’s before she speaks');
  frame();
  await settled();
  assert.equal(after.holding, true);
  after.press();
  assert.equal(pressed(), 1, 'Space moves her words on');
  let flown = false;
  for (const step of TOUR) {
    assert.equal(said.at(-1), step.scene);
    let shot = after.shot(OWN, FLY_S);
    shot = after.shot(OWN, FLY_S);
    if (step.kinds.length > 0) flown ||= shot.eye[2] > OWN.eye[2] + 5;
    finish();
    await settled();
  }
  assert.ok(flown, 'the view flew over the plaza');
  assert.deepEqual(gifts, ['gift'], 'given once, as she bids farewell');
  assert.equal(after.holding, false, "the keys are the player's again");
  assert.deepEqual(after.shot(OWN, FLY_S), OWN, 'the view is theirs');
  await settled();
  frame();
  assert.equal(after.past, true, 'she has gone');
});

test('leaving mid-welcome gives the view and the keys back at once, with no gift', async () => {
  const { after, gifts, frame, finish } = story();
  frame();
  await settled();
  finish();
  await settled();
  after.leave();
  assert.equal(after.holding, false);
  assert.deepEqual(after.shot(OWN, 1 / 30), OWN);
  finish();
  await settled();
  assert.deepEqual(gifts, []);
  assert.equal(after.past, true);
});

test('nothing waits once the story has handed over no last moment', () => {
  const after = new AfterStory();
  after.storyEnded(null);
  assert.equal(after.past, true);
  assert.equal(after.holding, false);
  assert.deepEqual(after.shot(OWN, 1), OWN);
});
