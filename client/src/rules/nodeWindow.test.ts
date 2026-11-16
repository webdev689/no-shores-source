import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { startLand } from './landRules.ts';
import { type Body, type Controls, floatsOf, startMovementRules } from './movementRules.ts';
import { type Rect, standOnNode } from './nodeGround.ts';

const built = (name: string) =>
  readFile(new URL(`../../../target/wasm32-unknown-unknown/release/${name}.wasm`, import.meta.url)).catch(() => {
    throw new Error(`${name}.wasm is not built: run \`npm run wasm\` first`);
  });
const content = (path: string) => readFile(new URL(`../../../content/world/${path}`, import.meta.url), 'utf8');

/** The room crate's agreement test holds the same fingerprint, nodes, rects and scripts (crates/room/tests/agree_node.rs). */
const NODE_RUN_HASH = '3f6ba6a4a278aa62';

/** Ticks, then forward, sideways, yaw, run, and jump on the first tick only. */
type Phase = readonly [number, number, number, number, boolean, boolean];

const RUNS: readonly { node: string; bounds: Rect; script: readonly Phase[] }[] = [
  {
    node: 'mistfall-social',
    bounds: [489_772, 2_270_352, 490_228, 2_270_668],
    script: [
      [900, 1, 0, 0, true, false],
      [60, 1, 0, 0, false, true],
      [120, 1, 0, 0, false, false],
      [60, 1, 0, 0, false, true],
      [300, 1, 0, Math.PI / 2, true, false],
    ],
  },
  {
    node: 'emerald-tangle',
    bounds: [489_111, 2_279_145, 490_942, 2_280_864],
    script: [
      [600, 1, 0, 0, true, false],
      [600, 1, 0, Math.PI / 2, true, false],
      [60, 1, 0, Math.PI / 2, false, true],
      [600, 1, 0.3, Math.PI * 1.25, false, false],
    ],
  },
];

/** FNV-1a over each number's little-endian bits, body after body, as the movement crate takes it. */
function fingerprint(bodies: readonly Body[]): string {
  const bytes = new DataView(new ArrayBuffer(8));
  let hash = 0xcbf2_9ce4_8422_2325n;
  for (const value of bodies.flatMap(floatsOf)) {
    bytes.setFloat64(0, value, true);
    for (let index = 0; index < 8; index++)
      hash = ((hash ^ BigInt(bytes.getUint8(index))) * 0x0100_0000_01b3n) & 0xffff_ffff_ffff_ffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

test('the runs over two nodes’ windows, cut by the land’s door, move to the room’s fingerprint', async () => {
  const [land, movement] = await Promise.all([
    built('land_wasm').then(startLand),
    built('movement_wasm').then(startMovementRules),
  ]);
  const editsText = await content('land/continent-6.json');
  land.open(await content('layout.json'), 'continent-6', editsText, true);
  const nodes = (JSON.parse(editsText) as { nodes: { id: string; spawns: [number, number][] }[] }).nodes;
  const plan = JSON.parse(land.cityPlan() ?? 'null') as { id: string; social: { spawns: [number, number][] } } | null;
  const spawnOf = (node: string) =>
    node === `${plan?.id}-social` ? plan?.social.spawns[0] : nodes.find((each) => each.id === node)?.spawns[0];
  const bodies: Body[] = [];
  for (const { node, bounds, script } of RUNS) {
    assert.equal(standOnNode(land, movement, bounds), true, `${node}'s window`);
    const [x, y] = spawnOf(node) ?? [0, 0];
    let body = movement.standing(x, y);
    bodies.push(body);
    for (const [ticks, forward, sideways, yaw, run, jump] of script)
      for (let tick = 0; tick < ticks; tick++) {
        const controls: Controls = {
          forward,
          sideways,
          yaw,
          run,
          jump: jump && tick === 0,
          crouch: false,
          mounted: false,
        };
        body = movement.step(body, controls);
        bodies.push(body);
      }
  }
  assert.equal(fingerprint(bodies), NODE_RUN_HASH);
  assert.equal(movement.setGround(null), false, 'null is open ground again');
  assert.equal(movement.standing(489_940, 2_270_558).z, 0);
});
