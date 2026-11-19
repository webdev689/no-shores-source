import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Cards } from '../../player/cards.ts';
import type { Shot } from '../camera.ts';
import { Epilogue } from './epilogue.ts';
import { HUD_VEIL_S, headOnView, type Stage } from './stage.ts';

const VIEW = { width: 1600, height: 900 };
const STEP_S = 1 / 30;
/** The player arrived at the origin facing north, away from the town's middle 60 m south; the sea lies past y 30. */
const YOU = { x: 0, y: 0, z: 1, facing: 0 };
const BEHIND: Shot = { eye: [0, 4.5, 2.5], yaw: 0, pitch: 0.15, fov: 1, near: 0.1, far: 2000 };
const groundAt = (_east: number, y: number) => (y > 30 ? -3 : 1);

function epilogueOn() {
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
    play: (scene: string) => new Promise<void>((finish) => said.push({ scene, finish })),
    hush: () => void done.push('hushed'),
  } as unknown as Stage;
  const forge = {
    frames: () => 8,
    card: (_id: number, _dress: unknown, anim: string) => ({ anim }),
  } as unknown as Cards;
  return { epilogue: new Epilogue(stage, forge), said, done, heads };
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
  assert.equal(said[0]?.scene, 'arrived');
  assert.ok(headOnView(heads.at(-1) ?? null, VIEW), 'her head is in the view');
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
