import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as flatbuffers from 'flatbuffers';
import { Gear } from '../../../generated/messages/ts/overlook/wire/gear.ts';
import { findsOf } from './findMessages.ts';

test('the gear message reads back each chest from five numbers and each container from eight', () => {
  const builder = new flatbuffers.Builder(128);
  const chests = Gear.createChestsVector(builder, [7, 10, 20, 1.5, Math.PI, 8, 30, 40, 0, 0]);
  const searchables = Gear.createSearchablesVector(builder, [9, 0, 20, 1, 21, 0, 1.8, 41003]);
  Gear.startGear(builder);
  Gear.addChests(builder, chests);
  Gear.addSearchables(builder, searchables);
  builder.finish(Gear.endGear(builder));
  const read = findsOf(Gear.getRootAsGear(new flatbuffers.ByteBuffer(builder.asUint8Array())));
  assert.deepEqual(read.chests, [
    { number: 7, at: [10, 20, 1.5], facing: Math.PI },
    { number: 8, at: [30, 40, 0], facing: 0 },
  ]);
  assert.deepEqual(read.searchables, [{ number: 9, box: [0, 20, 1, 21], foot: 0, top: 1.8, model: 41003 }]);
});

test('a gear message with no finds reads as none', () => {
  const builder = new flatbuffers.Builder(16);
  Gear.startGear(builder);
  builder.finish(Gear.endGear(builder));
  const read = findsOf(Gear.getRootAsGear(new flatbuffers.ByteBuffer(builder.asUint8Array())));
  assert.deepEqual(read, { chests: [], searchables: [] });
});
