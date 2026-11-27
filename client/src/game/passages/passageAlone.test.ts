// A patrol zone played alone in the page lays its passages' mouths from the node file the page writes, as the
// server's room lays them from the bake's, so a dive begins at a run's sealed door.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { laidNodes, type NodeLayout } from '../../layout/layouts.ts';
import { ASKS, type GearState } from '../../network/gearMessages.ts';
import { LocalRoom } from '../../network/localRoom.ts';
import { inputBytes } from '../../network/messages.ts';
import { nodeText } from '../footGround.ts';
import type { NodeInfo } from '../worldData.ts';
import { INTENT_FLOATS } from '../../rules/fighters.ts';

const MODULE = new URL('../../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const compiled = new WebAssembly.Module(
  await readFile(MODULE).catch(() => {
    throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
  }),
);

/** Flat ground 10 m up, as the land's window of a node reads. */
function flatGround(): string {
  const grid = (value: number) => ({
    width: 4,
    height: 4,
    left_m: -2000,
    top_m: -2000,
    cell_m: 1000,
    first_column: 0,
    first_row: 0,
    data: Array<number>(16).fill(value),
  });
  const layers = { land: grid(10), lake_level: Array<number>(16).fill(0), rivers: [], roads: [], towns: [] };
  return JSON.stringify({ ...layers, coast: grid(5000), across: grid(-50), pads: [], seed: 7 });
}

/** Saltgrass Downs as its layout lays it, in short: a section 400 m square and its three runs, each the run whose
 *  sealed door is one of Saltmere's mouths (content/passages/saltmere.json), its arena 30 m in front of the door. */
const RING: NodeLayout['ring'] = [
  [-200, -200],
  [200, -200],
  [200, 200],
  [-200, 200],
];
const RUNS = [
  { name: 'The Chalk Adit', door: [0, 0] as const, mouth: [0, 30] as const },
  { name: 'The Beacon Stair', door: [100, 0] as const, mouth: [100, 30] as const },
  { name: 'The Tithe Barns', door: [-100, 0] as const, mouth: [-100, 30] as const },
];

function downs(): NodeInfo {
  const laid = { id: 'saltgrass-downs', ring: RING, spawns: [[0, 2]], areas: [], runs: RUNS, sites: [], paths: [] };
  const drawn: NodeInfo = {
    id: 'saltgrass-downs',
    kind: 'patrol',
    name: 'Saltgrass Downs',
    continent: 'continent-1',
    ring: RING,
    spawns: [[0, 2]],
    centre: [0, 0],
  };
  const [node] = laidNodes([drawn], [{ ...laid, props: [], kind: 'patrol' } as unknown as NodeLayout]);
  if (!node) throw new Error('the downs were not laid');
  return node;
}

test('Saltgrass Downs opened alone lays its three mouths, and a dive begins at a run’s sealed door', () => {
  const node = downs();
  assert.deepEqual(
    node.doors?.map((door) => door.name),
    ['The Chalk Adit', 'The Beacon Stair', 'The Tithe Barns'],
    'every run’s sealed door, as the bake’s `doors_of` writes them',
  );
  const text = nodeText(node, [-300, -300, 300, 300], flatGround(), []);
  let gear: GearState | null = null;
  const room = LocalRoom.openNode(compiled, text, () => undefined, false, { gear: (said) => (gear = said) });
  room.pump(0.5);
  const ask = { kind: ASKS.beginDive, column: 0, slot: 1, node: 0 };
  const intent = new Float64Array(INTENT_FLOATS);
  room.send(inputBytes(1, { intent, look: { anim: 'idle', frame: 0, facing: 0 }, arms: 0, seen: 0n, ask }));
  room.pump(0.5);
  const dive = (gear as GearState | null)?.dive;
  assert.ok(dive, `a begin at the door is taken (answer ${(gear as GearState | null)?.answer})`);
  assert.equal(dive.depth, 1, 'the dive stands in the zone behind the mouth');
});
