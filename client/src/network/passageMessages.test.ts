import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as flatbuffers from 'flatbuffers';
import {
  Gear,
  GearAthericBounty,
  GearDive,
  GearHaul,
  GearIslandLamps,
  GearVestige,
  Input,
  PassageSeen,
  Snapshot,
} from '../../../generated/messages/ts/overlook/wire.ts';
import { ASKS, gearOf } from './gearMessages.ts';
import { inputBytes } from './messages.ts';
import { passageSeenOf } from './passageMessages.ts';

test('a dive, its haul, the lamps lit on each island and the Atheric bounties read back from the gear', () => {
  const builder = new flatbuffers.Builder(256);
  const vestige = GearVestige.createGearVestige(builder, 0, 3, 2, 31, false, 0);
  const vestiges = GearHaul.createVestigesVector(builder, [vestige]);
  const stocks = GearHaul.createStocksVector(builder, [2, 0, 1, 0]);
  const resources = GearHaul.createResourcesVector(builder, [0, 4]);
  const lantern = builder.createString('lanternfall');
  GearHaul.startGearHaul(builder);
  GearHaul.addVestiges(builder, vestiges);
  GearHaul.addStocks(builder, stocks);
  GearHaul.addResources(builder, resources);
  GearHaul.addLantern(builder, lantern);
  const haul = GearHaul.endGearHaul(builder);
  const island = builder.createString('saltmere');
  GearDive.startGearDive(builder);
  GearDive.addIsland(builder, island);
  GearDive.addWeek(builder, 2921);
  GearDive.addZone(builder, 14);
  GearDive.addDepth(builder, 6);
  GearDive.addLamp(builder, 5);
  GearDive.addRoute(builder, 1);
  GearDive.addMouth(builder, 2);
  GearDive.addDone(builder, true);
  GearDive.addHomeward(builder, true);
  GearDive.addHaul(builder, haul);
  const dive = GearDive.endGearDive(builder);
  const lit = GearIslandLamps.createLampsVector(builder, [1, 2]);
  const lamps = GearIslandLamps.createGearIslandLamps(builder, builder.createString('saltmere'), lit, true);
  const islandLamps = Gear.createIslandLampsVector(builder, [lamps]);
  const bounty = GearAthericBounty.createGearAthericBounty(builder, builder.createString('lanternfall'), 2, 37, false);
  const bounties = Gear.createAthericBountiesVector(builder, [bounty]);
  Gear.startGear(builder);
  Gear.addDive(builder, dive);
  Gear.addIslandLamps(builder, islandLamps);
  Gear.addAthericBounties(builder, bounties);
  builder.finish(Gear.endGear(builder));
  const read = gearOf(Gear.getRootAsGear(new flatbuffers.ByteBuffer(builder.asUint8Array())));
  assert.deepEqual(read.dive, {
    island: 'saltmere',
    week: 2921,
    zone: 14,
    depth: 6,
    lamp: 5,
    route: 1,
    mouth: 2,
    done: true,
    haul: {
      vestiges: [{ rarity: 3, slot: 2, level: 31 }],
      items: [],
      stocks: [2, 0, 1, 0],
      resources: [0, 4],
      lantern: 'lanternfall',
    },
    homeward: true,
  });
  assert.deepEqual(read.islandLamps, [{ island: 'saltmere', lamps: [1, 2], dayLamp: true }]);
  assert.deepEqual(read.athericBounties, [{ id: 'lanternfall', step: 2, count: 37, finished: false }]);
  const bare = new flatbuffers.Builder(16);
  Gear.startGear(bare);
  bare.finish(Gear.endGear(bare));
  const none = gearOf(Gear.getRootAsGear(new flatbuffers.ByteBuffer(bare.asUint8Array())));
  assert.deepEqual([none.dive, none.islandLamps, none.athericBounties], [null, [], []], 'out of any passage');
});

test('a passage zone’s deal reads back from the snapshot, a hold under way by its target and none as null', () => {
  const seen = (holding: number) => {
    const builder = new flatbuffers.Builder(64);
    const deal = builder.createString('kindle');
    const passage = PassageSeen.createPassageSeen(
      builder,
      deal,
      false,
      0b101,
      0,
      0,
      12.5,
      2,
      false,
      false,
      holding,
      0.4,
    );
    Snapshot.startSnapshot(builder);
    Snapshot.addPassage(builder, passage);
    builder.finish(Snapshot.endSnapshot(builder));
    return passageSeenOf(Snapshot.getRootAsSnapshot(new flatbuffers.ByteBuffer(builder.asUint8Array())));
  };
  assert.deepEqual(seen(1), {
    deal: 'kindle',
    done: false,
    lit: 0b101,
    broken: 0,
    held: 0,
    left: 12.5,
    wave: 2,
    open: false,
    lampLit: false,
    holding: { target: 1, share: 0.4 },
  });
  assert.equal(seen(254)?.holding, null, 'no hold under way');
  const bare = new flatbuffers.Builder(16);
  Snapshot.startSnapshot(bare);
  bare.finish(Snapshot.endSnapshot(bare));
  assert.equal(passageSeenOf(Snapshot.getRootAsSnapshot(new flatbuffers.ByteBuffer(bare.asUint8Array()))), null);
});

test('the passages’ asks cross as the rules number them: begin by mouth, route and lamp', () => {
  assert.deepEqual([ASKS.goOn, ASKS.kindle, ASKS.lightLamp, ASKS.goHome, ASKS.beginDive], [81, 82, 83, 84, 85]);
  const bytes = inputBytes(1, {
    intent: new Float64Array(18),
    look: { anim: 'idle', frame: 0, facing: 0 },
    arms: 0,
    seen: 0n,
    ask: { kind: ASKS.beginDive, column: 2, slot: 1, node: 10 },
  });
  const ask = Input.getRootAsInput(new flatbuffers.ByteBuffer(bytes)).ask();
  assert.deepEqual([ask?.kind(), ask?.column(), ask?.slot(), ask?.node()], [85, 2, 1, 10]);
});
