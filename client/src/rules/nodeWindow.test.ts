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

/** The room crate's agreement test holds the same fingerprint, nodes, rects, starts and scripts
 *  (crates/room/tests/agree_node.rs). */
const NODE_RUN_HASH = '96e3ed21fb564a4b';

/** Ticks, then forward, sideways, yaw, run, and jump on the first tick only. */
type Phase = readonly [number, number, number, number, boolean, boolean];

/** Where the run over a whaleback of the Saltgrass Downs starts, and the bearing it runs on, across the whaleback. */
const OVER_A_WHALEBACK = { from: [2_807_147, 1_208_048], bearing: 1.87 } as const;

/** Each run starts at `from`, or at its node's first spawn where none is given. */
const RUNS: readonly {
  continent: string;
  node: string;
  bounds: Rect;
  from?: readonly [number, number];
  script: readonly Phase[];
}[] = [
  {
    continent: 'continent-6',
    node: 'mistfall-social',
    bounds: [489_770, 2_270_350, 490_230, 2_270_670],
    script: [
      [900, 1, 0, 0, true, false],
      [60, 1, 0, 0, false, true],
      [120, 1, 0, 0, false, false],
      [60, 1, 0, 0, false, true],
      [300, 1, 0, Math.PI / 2, true, false],
    ],
  },
  {
    continent: 'continent-6',
    node: 'emerald-tangle',
    bounds: [489_191, 2_279_225, 490_895.5, 2_280_142],
    script: [
      [600, 1, 0, 0, true, false],
      [600, 1, 0, Math.PI / 2, true, false],
      [60, 1, 0, Math.PI / 2, false, true],
      [600, 1, 0.3, Math.PI * 1.25, false, false],
    ],
  },
  {
    continent: 'continent-1',
    node: 'saltgrass-downs',
    bounds: [2_806_396.5, 1_206_371.5, 2_807_981.5, 1_208_301],
    script: [
      [900, 1, 0, Math.PI * 1.5, true, false],
      [600, 1, 0, 0, true, false],
      [60, 1, 0, 0, false, true],
      [900, 1, 0.2, Math.PI / 2, true, false],
    ],
  },
  {
    continent: 'continent-1',
    node: 'saltgrass-downs',
    bounds: [2_806_396.5, 1_206_371.5, 2_807_981.5, 1_208_301],
    from: OVER_A_WHALEBACK.from,
    script: [[600, 1, 0, OVER_A_WHALEBACK.bearing, true, false]],
  },
];

/** The RMB index and the layouts' builders as the land's worker is given them (terrain/landTexts.ts), from the
 *  repository's files: continent 1's zones are laid out with them, the rainforest's here without. */
async function builders(): Promise<{ rmbText: string; buildersText: string }> {
  const rmbText = await content('rmb/index.json');
  const index = JSON.parse(rmbText) as { blocks: readonly (readonly [string, string, ...unknown[]])[] };
  const files = [...new Set(index.blocks.map((row) => row[1]))].sort();
  const forged = (name: string) => readFile(new URL(`../../../content/forged/${name}`, import.meta.url), 'utf8');
  const [blockFiles, buildings, props, briefs] = await Promise.all([
    Promise.all(files.map((file) => content(`rmb/${file}`))),
    forged('buildings.json'),
    forged('props.json'),
    content('briefs.json'),
  ]);
  const buildersText = `"rmbBlocks":[${blockFiles.join(',')}],"forged":{"buildings":${buildings},"props":${props}},"briefs":${briefs}`;
  return { rmbText, buildersText };
}

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

test('the runs over three nodes’ windows, cut by the land’s door, move to the room’s fingerprint', async () => {
  const [land, movement] = await Promise.all([
    built('land_wasm').then(startLand),
    built('movement_wasm').then(startMovementRules),
  ]);
  const texts = await builders();
  let opened = '';
  let spawnOf = (_node: string): [number, number] | undefined => undefined;
  // A drawn node's spawns are its layout's, as the room's file and the game take them.
  const open = async (continent: string) => {
    const editsText = await content(`land/${continent}.json`);
    const laidOut = continent === 'continent-1';
    land.open(
      await content('layout.json'),
      continent,
      editsText,
      true,
      laidOut ? texts.rmbText : null,
      laidOut ? texts.buildersText : null,
    );
    const laid = JSON.parse(land.layouts()) as { id: string; spawns: [number, number][] }[];
    const plan = JSON.parse(land.cityPlan() ?? 'null') as { id: string; social: { spawns: [number, number][] } } | null;
    spawnOf = (node) =>
      node === `${plan?.id}-social` ? plan?.social.spawns[0] : laid.find((each) => each.id === node)?.spawns[0];
    opened = continent;
  };
  const bodies: Body[] = [];
  for (const { continent, node, bounds, from, script } of RUNS) {
    if (continent !== opened) await open(continent);
    assert.equal(standOnNode(land, movement, bounds), true, `${node}'s window`);
    const [x, y] = from ?? spawnOf(node) ?? [0, 0];
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
