import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { moduleNumber, moduleParts } from '../city/modules.ts';
import { breachPlanOf, planBlocks, sealOpen, slabStands, spaceAt, spaceSocket, standingBlocks } from './breachPlan.ts';
import { turned } from './breachPlan.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const plan = breachPlanOf(
  new WebAssembly.Module(
    await readFile(MODULE).catch(() => {
      throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
    }),
  ),
);

test("the Drowned Vale's plan reads from the room module, its gate in Gullwing Vale, at Normal and Hard", () => {
  assert.equal(plan.name, 'The Drowned Vale');
  assert.equal(plan.zone, 'gullwing-vale');
  assert.deepEqual(
    plan.tiers.map((tier) => [tier.name, tier.level, tier.opens, tier.revives]),
    [
      ['Normal', 26, 25, null],
      ['Hard', 30, 29, 5],
    ],
  );
  assert.equal(plan.encounters[0]?.outside, true, 'the Waking is fought at the gate');
  assert.ok(
    plan.spaces.every((space) => moduleNumber(space.module) >= 0),
    'every space a module of the manifest',
  );
});

test('a quarter turn clockwise takes east to south, as the rules turn a module', () => {
  assert.deepEqual(turned([1, 0, 2], 1), [-0, 1, 2]);
  assert.deepEqual(turned([1, 2, 0], 2), [-1, -2, 0]);
  assert.deepEqual(turned([1, 2, 0], 3), [2, -1, 0]);
  assert.deepEqual(turned([1, 2, 0], 4), [1, 2, 0]);
});

test("the run's blocks are its spaces' parts, each seal while shut and each slab while it stands", () => {
  const parts = (name: string) => moduleParts(moduleNumber(name)).length;
  const spaces = plan.spaces.reduce((sum, space) => sum + parts(space.module), 0);
  const seals = plan.seals.length * parts('breach-seal');
  const standingAt = (tick: number) => plan.slabs.filter((slab) => slabStands(plan, slab.phase, tick)).length;
  assert.equal(planBlocks(plan, 0, 0).length, spaces + seals + standingAt(0));
  const open = (1 << plan.seals.length) - 1;
  assert.equal(planBlocks(plan, open, 100).length, spaces + standingAt(100), 'every seal open');
  assert.ok(sealOpen(0b10, 1) && !sealOpen(0b10, 0));
  // A slab stands seven seconds of its eleven.
  const stood = Array.from({ length: plan.slabCycle }, (unused, tick) => slabStands(plan, 0, tick)).filter(Boolean);
  assert.equal(stood.length, plan.slabStands);
});

test('a point over a space is in it, and its sockets stand where its module turned puts them', () => {
  const arrival = spaceSocket(plan, 'descent', 'arrival');
  assert.ok(arrival);
  assert.equal(spaceAt(plan, arrival[0], arrival[1])?.key, 'descent');
  assert.equal(spaceAt(plan, 10_000, 10_000), null);
  // The Hall is turned a quarter: its checkpoint, swapped and signed about its middle, still stands in it.
  const checkpoint = spaceSocket(plan, 'hall', 'checkpoint');
  assert.ok(checkpoint);
  assert.equal(spaceAt(plan, checkpoint[0], checkpoint[1])?.key, 'hall');
});

test("the run's blocks are kept as they stand now, in the one array, made anew only as seals or slabs change", () => {
  const changed: [number, number][] = [];
  const { blocks, keep } = standingBlocks(plan, (seals, tick) => void changed.push([seals, tick]));
  const before = blocks;
  assert.deepEqual(blocks, planBlocks(plan, 0, 0));
  keep(0, 0);
  assert.equal(changed.length, 0, 'as it stood');
  keep(0b1, 0);
  assert.deepEqual([blocks, changed], [planBlocks(plan, 0b1, 0), [[0b1, 0]]]);
  const shifts = Array.from({ length: plan.slabCycle }, (unused, tick) => tick).find(
    (tick) => planBlocks(plan, 0b1, tick).length !== planBlocks(plan, 0b1, 0).length,
  );
  assert.ok(shifts !== undefined);
  keep(0b1, shifts);
  assert.deepEqual(blocks, planBlocks(plan, 0b1, shifts), 'a slab gone or come');
  assert.equal(blocks, before, 'the same array, which every reader holds');
});
