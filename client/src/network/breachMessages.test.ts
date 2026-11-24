import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as flatbuffers from 'flatbuffers';
import { BreachInside } from '../../../generated/messages/ts/overlook/wire/breach-inside.ts';
import { BreachSeen } from '../../../generated/messages/ts/overlook/wire/breach-seen.ts';
import { Snapshot } from '../../../generated/messages/ts/overlook/wire/snapshot.ts';
import { STONE, breachOf } from './breachMessages.ts';

/** A snapshot holding a Breach built as `build` lays it, or none. */
function snapshotWith(build?: (builder: flatbuffers.Builder) => flatbuffers.Offset): Snapshot {
  const builder = new flatbuffers.Builder(256);
  const breach = build?.(builder);
  Snapshot.startSnapshot(builder);
  Snapshot.addTick(builder, 7n);
  if (breach !== undefined) Snapshot.addBreach(builder, breach);
  builder.finish(Snapshot.endSnapshot(builder));
  return Snapshot.getRootAsSnapshot(new flatbuffers.ByteBuffer(builder.asUint8Array()));
}

test('a room with no Breach sends none', () => {
  assert.equal(breachOf(snapshotWith()), null);
});

test("a run's Breach reads whole: the Lodestone borne, a raising in pairs, shares out of a thousand", () => {
  const read = breachOf(
    snapshotWith((builder) => {
      const phases = BreachSeen.createPhasesVector(builder, [2, 1, 0]);
      const stoneAt = BreachSeen.createStoneAtVector(builder, [4, -76.5, 50]);
      const marked = BreachSeen.createMarkedVector(builder, [3]);
      const markTicks = BreachSeen.createMarkTicksVector(builder, [240]);
      const raising = BreachSeen.createRaisingVector(builder, [5, 9]);
      const raised = BreachSeen.createRaisedVector(builder, [500]);
      BreachSeen.startBreachSeen(builder);
      BreachSeen.addTier(builder, 1);
      BreachSeen.addPhases(builder, phases);
      BreachSeen.addSeals(builder, 0b11);
      BreachSeen.addRevives(builder, 4);
      BreachSeen.addStone(builder, STONE.borne);
      BreachSeen.addBearer(builder, 9);
      BreachSeen.addStoneAt(builder, stoneAt);
      BreachSeen.addCharge(builder, 250);
      BreachSeen.addMarked(builder, marked);
      BreachSeen.addMarkTicks(builder, markTicks);
      BreachSeen.addRaising(builder, raising);
      BreachSeen.addRaised(builder, raised);
      BreachSeen.addEncounter(builder, 2);
      BreachSeen.addMarkedDesk(builder, -1);
      BreachSeen.addAwayShore(builder, -1);
      return BreachSeen.endBreachSeen(builder);
    }),
  );
  assert.ok(read);
  assert.deepEqual([read.gate, read.tier, read.phases, read.seals, read.revives], [false, 1, [2, 1, 0], 3, 4]);
  assert.deepEqual([read.stone, read.bearer, read.stoneAt, read.charge], [STONE.borne, 9, [4, -76.5, 50], 0.25]);
  assert.deepEqual(read.marked, [{ player: 3, ticks: 240 }]);
  assert.deepEqual(read.raising, [{ raiser: 5, raised: 9, share: 0.5 }]);
  assert.deepEqual([read.encounter, read.markedDesk, read.awayShore], [2, -1, -1]);
});

test("a gate's Breach reads its Waking, who it is open to and the companies inside", () => {
  const read = breachOf(
    snapshotWith((builder) => {
      const inside = [BreachInside.createBreachInside(builder, builder.createString('Ada'), 1, 3)];
      const insideVector = BreachSeen.createInsideVector(builder, inside);
      const openTo = BreachSeen.createOpenToVector(builder, [4, 6]);
      BreachSeen.startBreachSeen(builder);
      BreachSeen.addGate(builder, true);
      BreachSeen.addHeldBy(builder, true);
      BreachSeen.addFill(builder, 640);
      BreachSeen.addClaims(builder, 0b101);
      BreachSeen.addOpenTo(builder, openTo);
      BreachSeen.addInside(builder, insideVector);
      return BreachSeen.endBreachSeen(builder);
    }),
  );
  assert.ok(read);
  assert.deepEqual([read.gate, read.heldBy, read.fill, read.claims, read.openTo], [true, true, 0.64, 5, [4, 6]]);
  assert.deepEqual(read.inside, [{ name: 'Ada', tier: 1, encounter: 3 }]);
  assert.equal(read.revives, -1, 'none counted unless said');
});
