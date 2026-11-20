import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { ForgeLooks } from '../forge/looks.ts';
import type { ComposeJob } from './composeJob.ts';
import type { ComposeAnswer, ComposeMessage } from './composeWorker.ts';

// The worker runs here as on the page: its messages through the global scope, each strip fetched by its range and
// decoded through a canvas. Each strip here is one texel whose bytes are its path, read back by the stubbed canvas.
const scope = globalThis as unknown as Record<string, unknown>;
let listener: ((event: { data: ComposeMessage }) => void) | null = null;
const answers = new Map<number, ComposeAnswer>();
scope['addEventListener'] = (_type: string, heard: typeof listener) => (listener = heard);
scope['postMessage'] = (answer: ComposeAnswer) => answers.set(answer.id, answer);
const TEXELS: Record<string, readonly number[]> = {
  'forge/layers/male/body_idle.png': [200, 150, 120, 255],
  'forge/layers/male/body_idle_z.png': [0, 50, 1, 255],
  'forge/layers/male/cuirass_idle.png': [90, 90, 99, 255],
  'forge/layers/male/cuirass_idle_z.png': [0, 40, 1, 255],
};
scope['fetch'] = (url: string) =>
  Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new TextEncoder().encode(url).buffer) });
scope['createImageBitmap'] = async (blob: Blob) => ({ width: 1, height: 1, path: await blob.text(), close() {} });
scope['OffscreenCanvas'] = class {
  width = 1;
  height = 1;
  getContext() {
    let path = '';
    return {
      drawImage: (bitmap: { path: string }) => (path = bitmap.path),
      getImageData: () => ({ data: Uint8ClampedArray.from(TEXELS[path] ?? [0, 0, 0, 0]) }),
    };
  }
};
// The worker's turns, a message to itself, here on the test's own loop, so it lets the test end.
scope['MessageChannel'] = class {
  readonly port1: { onmessage: (() => void) | null } = { onmessage: null };
  readonly port2 = { postMessage: () => setImmediate(() => this.port1.onmessage?.()) };
};
await import('./composeWorker.ts');

const cell = { cell: [1, 1], frames: 1, root: [0, 0] } as const;
/** A palette holding the strips' colours, which every frame is snapped to. */
const PALETTE = [
  [0, 0, 0],
  [200, 150, 120],
  [90, 90, 99],
] as const;
const looks: ForgeLooks = {
  bodies: { male: { anims: { idle: cell }, layers: { body: ['idle'], cuirass: ['idle'] } } },
  depth: { base: -3, scale: 10000 },
};
const job: ComposeJob = {
  figure: { body: 'male', race: null, tone: null, hair: null, gear: ['cuirass'] },
  anim: 'idle',
  view: 0,
  frame: 0,
  ramps: {},
  glow: 0,
};
const where = (paths: readonly string[]) =>
  Object.fromEntries(
    paths.map((path) => [path, { url: path, range: `bytes=0-${path.length - 1}`, type: 'image/png' }]),
  );

async function composed(id: number, paths: readonly string[]): Promise<number[]> {
  listener?.({ data: { kind: 'job', id, haste: 'now', job, where: where(paths) } });
  for (let wait = 0; wait < 200 && !answers.has(id); wait++) await new Promise((done) => setTimeout(done, 2));
  return [...(answers.get(id)?.card?.pixels.subarray(0, 3) ?? [])];
}

test('a strip the page said nothing of is not kept as missing: a later job told where it lies draws it', async () => {
  const tables = { kind: 'tables', looks, skins: { bodies: {} }, hair: { bodies: {} }, palette: PALETTE } as const;
  listener?.({ data: tables });
  const all = Object.keys(TEXELS);
  assert.deepEqual(await composed(1, all.slice(0, 2)), [200, 150, 120], 'the cuirass, told of nowhere, is not drawn');
  assert.deepEqual(await composed(2, all), [90, 90, 99], 'told where it lies, the cuirass is drawn over the body');
});
