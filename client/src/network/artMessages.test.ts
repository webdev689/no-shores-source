import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as flatbuffers from 'flatbuffers';
import { Input } from '../../../generated/messages/ts/overlook/wire.ts';
import { SPELLS, spellNumber } from './artMessages.ts';
import { ASKS } from './gearMessages.ts';
import { inputBytes, readFromRoom } from './messages.ts';

/** Bytes the Rust tests wrote (`cargo test -p protocol`). */
const written = async (name: string) =>
  new Uint8Array(
    await readFile(new URL(`../../../target/protocol/${name}`, import.meta.url)).catch(() => {
      throw new Error(`run \`cargo test -p protocol\` first: it writes target/protocol/${name}`);
    }),
  );

test('the Arts in the gear the server wrote read back: Storm worn, every Core empty, the Tenets ready', async () => {
  const gear = readFromRoom(await written('gear.bin'));
  assert.equal(gear?.kind, 'gear');
  if (gear?.kind !== 'gear' || !gear.arts) return assert.fail('no Arts');
  assert.equal(gear.arts.art, 1);
  assert.deepEqual(gear.arts.cores, [
    [null, null, null],
    [null, null, null],
    [null, null, null],
  ]);
  assert.ok(gear.arts.anima > 0 && gear.arts.anima < 0.01, 'a new room’s Anima, charging');
  assert.deepEqual(gear.arts.tenets, [1, 1]);
});

test('every spell in the snapshot the server wrote reads back, a Dawnflare heading on and a bolt seeking', async () => {
  const snapshot = readFromRoom(await written('snapshot.bin'));
  if (snapshot?.kind !== 'snapshot') return assert.fail('no snapshot');
  assert.deepEqual(snapshot.spells, [
    {
      id: 4,
      kind: SPELLS.dawnflare,
      caster: 7,
      art: 2,
      at: [1, -2, 1.1],
      heads: [1, -26, 1.1],
      seeks: null,
      age: 30,
      life: 96,
      radius: 3,
    },
    {
      id: 9,
      kind: SPELLS.bolt,
      caster: 7,
      art: 3,
      at: [0.5, 0, 2],
      heads: null,
      seeks: 12,
      age: 2,
      life: 88,
      radius: 0,
    },
  ]);
});

test('a cast crosses in an input with its aim, and an Art’s asks with the fields the room reads', () => {
  const parts = { intent: new Float64Array(17), look: { anim: 'cast', frame: 0, facing: 0 }, arms: 0, seen: 0n };
  const read = (bytes: Uint8Array) => Input.getRootAsInput(new flatbuffers.ByteBuffer(bytes));
  const aimed = read(inputBytes(1, { ...parts, cast: { spell: SPELLS.duskDaggers, aim: [3, -12.5, 0.25] } }));
  assert.deepEqual([aimed.cast(), Array.from(aimed.castAimArray() ?? [])], [8, [3, -12.5, 0.25]]);
  const plain = read(inputBytes(2, parts));
  assert.deepEqual([plain.cast(), plain.castAimArray()], [0, null]);
  const core = read(inputBytes(3, { ...parts, ask: { kind: ASKS.setCore, column: 2, slot: 1, node: 5 } })).ask();
  assert.deepEqual([core?.kind(), core?.column(), core?.slot(), core?.node()], [41, 2, 1, 5]);
  assert.deepEqual([ASKS.wearArt, ASKS.grantArts], [40, 36]);
  assert.deepEqual([spellNumber(1, 0), spellNumber(2, 2), spellNumber(3, 1)], [1, 6, 8]);
});
