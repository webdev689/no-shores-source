import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GunLooks, TONGUE_SPRITE, flashFrame, puffOf } from './gunLooks.ts';
import { MARK_FLOATS } from './marks.ts';
import { POWDER, SMOKE } from './markSprites.ts';
import { CLEAR } from './spellPixels.ts';

const FRAME = 1 / 60;
const muzzle = [0, 0, 1.3] as const;

/** The mesh's vertices by kind: powder-lit, smoke, and light added to the ground. */
function kinds(mesh: readonly number[]) {
  const found = { powder: 0, smoke: 0, light: 0, widest: 0 };
  for (let start = 0; start < mesh.length; start += MARK_FLOATS) {
    const colour = mesh.slice(start + 3, start + 6);
    const matches = (stop: readonly number[]) =>
      stop.every((part, index) => Math.abs(part - (colour[index] ?? 0)) < 1e-9);
    if ((mesh[start + 6] ?? 0) < 0) found.light++;
    else if (POWDER.some(matches)) {
      found.powder++;
      found.widest = Math.max(found.widest, Math.abs(mesh[start + 1] ?? 0));
    } else if (SMOKE.some(matches)) found.smoke++;
  }
  return found;
}

function shotAt(seconds: number, eye: readonly [number, number, number], heavy = false) {
  const guns = new GunLooks();
  guns.fire(muzzle, [0, -5, 0], heavy);
  // The frame it is fired in shows its first frame.
  guns.update(FRAME);
  for (let left = seconds; left > 1e-9; left -= FRAME) guns.update(Math.min(FRAME, left));
  const out: number[] = [];
  guns.mesh(out, eye);
  return { mesh: out, guns };
}

test('a shot flashes in held frames: a star and lit ground, then tongues of flame, then sparks, then smoke alone', () => {
  const eye = [4, 3, 1.6] as const;
  const [star, tongues, sparks, smoke] = [0, 1, 2, 6].map((frame) => kinds(shotAt(frame * FRAME, eye).mesh));
  assert.ok(star && tongues && sparks && smoke);
  assert.ok(star.powder > 0 && star.light > 0, 'frame 1: a star of fire, the ground lit under it');
  assert.ok(tongues.powder > star.powder / 2 && tongues.light > 0, 'frame 2: flame along the barrel, still lit');
  assert.ok(sparks.powder > 0 && sparks.light === 0, 'frames 3 and 4: sparks, the light gone');
  assert.ok(smoke.powder === 0 && smoke.smoke > 0, 'then smoke alone');
  assert.deepEqual(
    [0, 0.5, 1, 2.9].map((frame) => flashFrame(frame * FRAME)),
    [0, 0, 1, 2],
  );
});

test("a thunderlock's flash is bigger than a pistolet's, and in first person both are held to a share of the view", () => {
  const far = [6, 0, 1.6] as const;
  const light = kinds(shotAt(0, far).mesh).widest;
  const heavy = kinds(shotAt(0, far, true).mesh).widest;
  assert.ok(heavy > light * 1.3, `${heavy} against ${light}`);
  const close = [0.55, 0, 1.3] as const;
  assert.ok(kinds(shotAt(0, close, true).mesh).widest < 0.1, 'an arm’s length off, a star a tenth of a metre across');
});

test('the smoke thins in four dithered steps and is gone after 1.2 s; none is laid right at the eye', () => {
  const kept = [0, 1, 2, 3].map((step) => [...puffOf(5, step, 1).cells].filter((cell) => cell !== CLEAR).length);
  assert.ok(
    kept.every((count, step) => step === 0 || count < (kept[step - 1] ?? 0)),
    `${kept}`,
  );
  assert.ok(shotAt(1.19, [5, 0, 2]).guns.showing);
  assert.ok(!shotAt(1.21, [5, 0, 2]).guns.showing);
  assert.equal(kinds(shotAt(0.3, [0, -0.6, 1.5]).mesh).smoke, 0, 'smoke at the eye would blind it');
});

test('the tongues run from the muzzle along the barrel, white-hot at the root', () => {
  const root = TONGUE_SPRITE.cells[(TONGUE_SPRITE.height - 1) * TONGUE_SPRITE.width + (TONGUE_SPRITE.width - 1) / 2];
  assert.equal(root, 3);
  const tip = TONGUE_SPRITE.cells[(TONGUE_SPRITE.width - 1) / 2];
  assert.ok(tip !== undefined && tip < 3);
});
