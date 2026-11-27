import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { GLOW_PAD, GLOW_WGSL } from '../elementGlow.ts';
import { PART, type Strip } from '../forge/compose.ts';
import type { ForgeLooks } from '../forge/looks.ts';
import type { ForgeStore } from '../forge/store.ts';
import { type Card, type CardMaker, Cards } from './cards.ts';
import { plainDress } from './dressing.ts';
import { glowQuad } from './glowCards.ts';

test('a glowing quad grows by the reach and keeps its feet', () => {
  const card = { texture: {} as GPUTexture, width: 20, height: 40, root: [10, 40] as const };
  const quad = glowQuad(card, 0.025);
  assert.equal(quad.width, (20 + 2 * GLOW_PAD) * 0.025);
  assert.equal(quad.height, (40 + 2 * GLOW_PAD) * 0.025);
  assert.deepEqual(quad.root, [(10 + GLOW_PAD) * 0.025, (40 + GLOW_PAD) * 0.025]);
});

/** The shaders' own `glow_texel`, run as JavaScript on one axis: each of its sums works axis by axis. */
const glowTexel: (at: number, size: number) => number = (() => {
  const wgsl = /fn glow_texel\(at: vec2f, size: vec2f\) -> vec2f \{\s*return ([^;]+);\s*\}/.exec(GLOW_WGSL);
  assert.ok(wgsl, "the shader's glow_texel");
  const body = (wgsl[1] ?? '').replace(/vec2f\(([^)]*)\)/g, '($1)');
  const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
  return runInNewContext(`(at, size) => ${body}`, { clamp, floor: Math.floor });
})();

test('an edge pixel shaded from outside its quad reads the field inside it, never a box round the figure', () => {
  // Multisampling shades a pixel the quad's edge crosses from the pixel's middle, a hair outside the quad.
  for (const share of [-0.004, -1e-6, 0, 0.5, 1, 1.004]) {
    const texel = glowTexel(share, 40);
    assert.ok(texel >= 0 && texel <= 39 && Number.isInteger(texel), `${share} reads texel ${texel}`);
  }
  assert.equal(glowTexel(0.5, 40), 20);
});

// A figure one pixel wide and two tall, holding a sword drawn over its lower pixel.
const cell = { cell: [1, 2], frames: 1, root: [0, 1] } as const;
const looks: ForgeLooks = {
  bodies: { male: { anims: { guard: cell }, layers: { body: ['guard'], sword_iron: ['guard'] } } },
};
function strip(texels: readonly (readonly [number, number, number] | null)[]): Strip {
  const data = new Uint8Array(texels.length * 4);
  texels.forEach((texel, row) => {
    if (texel) data.set([...texel, 255], row * 4);
  });
  return { width: 1, height: texels.length, data };
}
const strips: Record<string, Strip> = {
  'forge/layers/male/body_guard.png': strip([
    [200, 150, 120],
    [200, 150, 120],
  ]),
  'forge/layers/male/body_guard_z.png': strip([
    [3, 232, PART.torso],
    [3, 232, PART.torso],
  ]),
  'forge/layers/male/sword_iron_guard.png': strip([null, [180, 190, 210]]),
  'forge/layers/male/sword_iron_guard_z.png': strip([null, [1, 244, PART.weapon]]),
};
const store = { strip: (path: string) => Promise.resolve(strips[path] ?? null) } as unknown as ForgeStore;
const plain = plainDress('human', 0.5);
const armed = { ...plain, outfit: { ...plain.outfit, right: 'sword_iron', drawn: true } };
const dyes = { palette: [], clothing: {}, armour: {} };
const settled = () => new Promise((resolve) => setImmediate(resolve));

test("a glowing card's field goes with its card", async () => {
  let fields = 0;
  const destroyed: string[] = [];
  const texture = (name: string) => ({ destroy: () => destroyed.push(name) }) as unknown as GPUTexture;
  const maker: CardMaker = {
    card: (pixels, width, height, root): Card => ({ texture: texture('card'), width, height, root }),
    glow: () => {
      fields++;
      return texture('field');
    },
  };
  const forge = new Cards(maker, store, looks, { skins: { bodies: {} }, hair: { bodies: {} } }, dyes);
  forge.card(1, armed, 'guard', 0, 0, false, 2);
  await settled();
  const card = forge.card(1, armed, 'guard', 0, 0, false, 2);
  assert.equal(fields, 1, 'its field is made once, with the card');
  assert.equal(card?.glow?.look, 2);
  forge.card(1, armed, 'guard', 0, 0, false, 0);
  await settled();
  assert.equal(forge.card(1, armed, 'guard', 0, 0, false, 0)?.glow, undefined, 'a plain card is kept apart');
  // Past the most kept, the least lately asked for goes first: the glowing card, its field with it.
  for (let frame = 1; frame <= 4000; frame++) forge.card(2, armed, 'guard', 0, frame);
  await settled();
  destroyed.length = 0;
  forge.pump();
  assert.deepEqual(destroyed.slice(0, 2), ['card', 'field']);
});
