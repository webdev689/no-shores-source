import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import type { Cards } from '../../player/cards.ts';
import type { Shot } from '../camera.ts';
import { blockReach } from '../../player/boom.ts';
import { Epilogue } from './epilogue.ts';
import { HUD_VEIL_S, headOnView, type Stage } from './stage.ts';

const VIEW = { width: 1600, height: 900 };
const STEP_S = 1 / 30;
/** The player arrived at the origin facing north, away from the town's middle 60 m south; the sea lies past y 30. */
const YOU = { x: 0, y: 0, z: 1, facing: 0 };
const BEHIND: Shot = { eye: [0, 4.5, 2.5], yaw: 0, pitch: 0.15, fov: 1, near: 0.1, far: 2000 };
const groundAt = (_east: number, y: number): number => (y > 30 ? -3 : 1);

/** The fake stage's parts a test changes. */
type FakeStage = { screenOpen: boolean; parts: { scene: { groundAt: (east: number, y: number) => number } } };

function epilogueOn(
  play = (scene: string, said: { scene: string; finish: () => void }[]) =>
    new Promise<void>((finish) => said.push({ scene, finish })),
) {
  const said: { scene: string; finish: () => void }[] = [];
  const done: string[] = [];
  const heads: (readonly [number, number] | null)[] = [];
  const stage = {
    parts: {
      overheads: {
        frame: (_seconds: number, map: Map<string, readonly [number, number] | null>) =>
          void heads.push(map.get('stranger') ?? null),
      },
      dialogue: { frame: () => undefined },
      scene: { groundAt },
      landmass: () => ({ plan: { centre: [0, 60] }, nodes: [] }),
    },
    play: (scene: string) => play(scene, said),
    screenOpen: true,
    hush: () => void done.push('hushed'),
    tick: () => undefined,
  } as unknown as Stage;
  const forge = {
    frames: () => 8,
    card: (_id: number, _dress: unknown, anim: string) => ({ anim }),
  } as unknown as Cards;
  const epilogue = new Epilogue(stage, forge);
  epilogue.words = () => epilogue.say('welcome');
  return { epilogue, said, done, heads, stage: stage as unknown as FakeStage };
}

const settled = () => new Promise((resolve) => setImmediate(resolve));

test('the stranger waits behind the veil, and speaks once it is wholly gone, in the view', () => {
  const { epilogue, said, heads } = epilogueOn();
  for (let frames = 0; frames < 90; frames++)
    assert.deepEqual(epilogue.frame(BEHIND, VIEW, STEP_S, 0, YOU, true), [], 'nothing behind the veil');
  assert.equal(said.length, 0);
  let lifted = 0;
  while (said.length === 0) {
    assert.equal(epilogue.frame(BEHIND, VIEW, STEP_S, 0, YOU, false).length, 1, 'she is there as the veil falls');
    lifted += STEP_S;
  }
  assert.ok(lifted >= HUD_VEIL_S, `she spoke ${lifted.toFixed(2)} s after the veil began to fall`);
  assert.equal(said[0]?.scene, 'welcome', 'her words');
  assert.ok(headOnView(heads.at(-1) ?? null, VIEW), 'her head is in the view');
});

test("she waits to speak while the story's black still lies over the game, or the player looks away", () => {
  const { epilogue, said, stage } = epilogueOn();
  stage.screenOpen = false;
  for (let frames = 0; frames < 90; frames++) epilogue.frame(BEHIND, VIEW, STEP_S, 0, YOU, false);
  assert.equal(said.length, 0, 'not over the black');
  stage.screenOpen = true;
  const away: Shot = { ...BEHIND, yaw: Math.PI };
  for (let frames = 0; frames < 90; frames++) epilogue.frame(away, VIEW, STEP_S, 0, YOU, false);
  assert.equal(said.length, 0, 'not out of sight');
  epilogue.frame(BEHIND, VIEW, STEP_S, 0, YOU, false);
  assert.equal(said.length, 1);
});

test('words that cannot be played still let her walk off', async () => {
  const failed = mock.method(console, 'error', () => undefined);
  const { epilogue } = epilogueOn(() => Promise.reject(new Error('no voice')));
  for (let frames = 0; frames < 30; frames++) epilogue.frame(BEHIND, VIEW, STEP_S, 0, YOU, false);
  await settled();
  assert.deepEqual(epilogue.frame(BEHIND, VIEW, STEP_S, 0, YOU, false)[0]?.card, { anim: 'walk' });
  assert.equal(failed.mock.callCount(), 1);
  failed.mock.restore();
});

test("with the sea on her right she stands on the player's left", () => {
  const { epilogue, stage } = epilogueOn();
  stage.parts.scene.groundAt = (east) => (east > 0.5 ? -2 : 1);
  const [stranger] = epilogue.frame(BEHIND, VIEW, STEP_S, 0, YOU, false);
  assert.ok(stranger && stranger.z === 1, 'on dry ground');
});

test('she walks into the town on dry ground and is let go once out of sight', async () => {
  const { epilogue, said, done } = epilogueOn();
  while (said.length === 0) epilogue.frame(BEHIND, VIEW, STEP_S, 0, YOU, false);
  said[0]?.finish();
  await settled();
  const cards = epilogue.frame(BEHIND, VIEW, STEP_S, 0, YOU, false);
  assert.deepEqual(cards[0]?.card, { anim: 'walk' });
  // Turned to watch her, the player keeps her in sight: she walks on south, toward the town's middle.
  const watching: Shot = { eye: [0, -6, 2.5], yaw: Math.PI, pitch: 0.05, fov: 1, near: 0.1, far: 2000 };
  for (let frames = 0; frames < 900; frames++) epilogue.frame(watching, VIEW, STEP_S, 0, YOU, false);
  assert.equal(epilogue.done, false, 'not let go while seen');
  const near = epilogue.frame(watching, VIEW, STEP_S, 0, YOU, false)[0];
  assert.ok(near && near.z === 1, 'on the dry ground');
  assert.deepEqual(near.card, { anim: 'idle' }, 'the sea before her, she stands at its edge');
  // Looked away from, she is gone, and nothing she said stays.
  assert.deepEqual(epilogue.frame(BEHIND, VIEW, STEP_S, 0, YOU, false), []);
  assert.equal(epilogue.done, true);
  assert.deepEqual(done, ['hushed']);
});

test('leaving the place ends it, words and all; before any arrival there is nothing to leave', () => {
  const { epilogue, said, done } = epilogueOn();
  epilogue.leave();
  assert.equal(epilogue.done, false, 'the arrival itself is no leaving');
  while (said.length === 0) epilogue.frame(BEHIND, VIEW, STEP_S, 0, YOU, false);
  epilogue.leave();
  assert.equal(epilogue.done, true);
  assert.deepEqual(done, ['hushed']);
  assert.deepEqual(epilogue.frame(BEHIND, VIEW, STEP_S, 0, YOU, false), [], 'nothing of her comes back');
});

/** Her words said, and the frames after them until she sets off. */
async function walkingOff() {
  const made = epilogueOn();
  while (made.said.length === 0) made.epilogue.frame(BEHIND, VIEW, STEP_S, 0, YOU, false);
  made.said[0]?.finish();
  await settled();
  return made;
}

test('she is kept while any of her is on the view, though her head has left it', async () => {
  const { epilogue } = await walkingOff();
  // Close behind her and looking down at her feet, as the player who walks up to her does: her head is past the
  // view's top, her body fills it.
  for (let frames = 0; frames < 60; frames++) {
    const [stranger] = epilogue.frame(BEHIND, VIEW, STEP_S, 0, YOU, false);
    if (!stranger) break;
    const close: Shot = {
      eye: [stranger.x, stranger.y - 0.8, 1.6 + stranger.z],
      yaw: Math.PI,
      pitch: 0.9,
      fov: 1,
      near: 0.1,
      far: 2000,
    };
    epilogue.frame(close, VIEW, STEP_S, 0, YOU, false);
  }
  assert.equal(epilogue.done, false, 'not let go with her body in plain view');
  // Her card stands 0.35 m from her toward the eye (figures.ts); the eye goes to her own place, inside her figure.
  const [card] = epilogue.frame(BEHIND, VIEW, STEP_S, 0, YOU, false);
  const [x, y] = [card?.x ?? 0, card?.y ?? 0];
  const toEye = Math.hypot(BEHIND.eye[0] - x, BEHIND.eye[1] - y);
  const herAt = [x - ((BEHIND.eye[0] - x) / toEye) * 0.35, y - ((BEHIND.eye[1] - y) / toEye) * 0.35] as const;
  epilogue.frame({ ...BEHIND, eye: [herAt[0], herAt[1] + 0.02, 1.5 + (card?.z ?? 0)] }, VIEW, STEP_S, 0, YOU, false);
  assert.equal(epilogue.done, false, 'not let go while the eye passes through her');
});

test("she is let go in the end though she stands in sight, held at the water or at the town's middle", async () => {
  for (const centre of [
    [0, 60],
    [0, -1],
  ]) {
    const { epilogue, stage, done } = await walkingOff();
    (stage.parts as unknown as { landmass: () => unknown }).landmass = () => ({ plan: { centre }, nodes: [] });
    const watching: Shot = { eye: [0, -8, 2.5], yaw: Math.PI, pitch: 0.05, fov: 1, near: 0.1, far: 2000 };
    let frames = 0;
    while (!epilogue.done && frames < 30 * 120) {
      epilogue.frame(watching, VIEW, STEP_S, 0, YOU, false);
      frames++;
    }
    assert.equal(epilogue.done, true, `let go though seen, the middle at ${centre.join(', ')}`);
    assert.deepEqual(done, ['hushed']);
  }
});

test('a parapet before the player puts her at their side, on their own floor and in clear sight of them', () => {
  const { epilogue, stage } = epilogueOn();
  // A wall 1.5 m ahead and a drop of 20 m past it, as the arrival over Overlook's parapet faces.
  stage.parts.scene.groundAt = (_east, y) => (y < -1.5 ? -19 : 1);
  const wall = { minX: -10, maxX: 10, minY: -1.9, maxY: -1.5, bottom: 1, top: 2.2 };
  epilogue.clear = (from, to) =>
    blockReach(from, to, [wall], 0.05) >= Math.hypot(...from.map((each, axis) => each - (to[axis] ?? 0))) - 1e-6;
  const [stranger] = epilogue.frame(BEHIND, VIEW, STEP_S, 0, YOU, false);
  assert.ok(stranger, 'she stands');
  assert.equal(stranger.z, 1, "on the player's own floor, not down past the wall");
  assert.ok(stranger.y > -1.5, 'on their side of it');
});
