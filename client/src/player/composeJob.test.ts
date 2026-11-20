import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Strip } from '../forge/compose.ts';
import type { ForgeLooks } from '../forge/looks.ts';
import { type ComposeJob, composeCard, stripsOf } from './composeJob.ts';

const cell = { cell: [1, 1], frames: 1, root: [0, 0] } as const;
const looks: ForgeLooks = {
  bodies: {
    male: {
      anims: { idle: cell, walk: cell },
      layers: {
        body: ['idle', 'walk'],
        helm_mages: ['idle', 'walk'],
        boots_mages: ['idle', 'walk'],
        shield_kite_elven: ['guard'],
      },
    },
  },
  dye: ['helm_mages', 'boots_mages', 'shield_kite_elven'],
  depth: { base: -3, scale: 10000 },
};
const texel = (rgb: readonly number[]): Strip => ({ width: 1, height: 1, data: Uint8Array.of(...rgb, 255) });
const ramp = Array.from({ length: 16 }, (_unused, step) => [step * 16, 0, 0] as const);
const job = (anim: string, gear: readonly string[]): ComposeJob => ({
  figure: { body: 'male', race: null, tone: null, hair: null, gear },
  anim,
  view: 0,
  frame: 0,
  ramps: { helm_mages: ramp, boots_mages: ramp },
  whole: ['helm_mages', 'boots_mages'],
  glow: 0,
});
const colours = { skins: { bodies: {} }, hair: { bodies: {} } };

/** Any strip asked for, one texel on the torso, the helm nearest: standing, the helm dark and the boots light; walking,
 *  brighter than either. */
function reader(asked: string[]) {
  return (path: string) => {
    asked.push(path);
    if (path.endsWith('_z.png')) return Promise.resolve(texel([0, path.includes('helm') ? 10 : 20, 1]));
    const light = path.includes('_walk') ? 200 : path.includes('helm') ? 40 : 120;
    return Promise.resolve(texel([light, light, light]));
  };
}

test('a frame is composed from no strip but those its job names, so a worker is told where each lies', async () => {
  for (const anim of ['walk', 'idle']) {
    const asked: string[] = [];
    await composeCard(job(anim, ['helm_mages', 'boots_mages']), looks, colours, reader(asked));
    const named = new Set(stripsOf(job(anim, ['helm_mages', 'boots_mages']), looks));
    for (const path of asked) assert.ok(named.has(path), `${anim} reads ${path}, which its job names`);
  }
});

test('a covered piece takes one shade in every move and with whatever else of its set is worn', async () => {
  const shade = async (anim: string, gear: readonly string[]) => [
    ...((await composeCard(job(anim, gear), looks, colours, reader([])))?.pixels.subarray(0, 3) ?? []),
  ];
  const standing = await shade('idle', ['helm_mages']);
  assert.deepEqual(await shade('idle', ['boots_mages', 'helm_mages']), standing, 'with its boots on');
  // Its walk is drawn brighter than its standing move; the shade is laid by the set's light as it stands.
  const walking = await shade('walk', ['helm_mages']);
  assert.ok((walking[0] ?? 0) > (standing[0] ?? 0), 'a brighter texel takes a brighter step');
  assert.deepEqual(await shade('walk', ['boots_mages', 'helm_mages']), walking);
});
