import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as flatbuffers from 'flatbuffers';
import { Gear, GearColumn, GearOfficer, GearShip, Input } from '../../../generated/messages/ts/overlook/wire.ts';
import { ASKS, DROPPED, gearOf } from './gearMessages.ts';
import { inputBytes, readFromRoom } from './messages.ts';

const written = async (name: string) =>
  new Uint8Array(
    await readFile(new URL(`../../../target/protocol/${name}`, import.meta.url)).catch(() => {
      throw new Error(`${name} is not written: run \`cargo test -p protocol\``);
    }),
  );

test('a players own gear the server wrote reads back whole, every column spelled out', async () => {
  // gear_wire_tests.rs writes it: level 20 by XP, Harbourwarden worn, Goldgrass Seed gathered at the stall's node, an
  // Atheric Vestige for the head carried, two Ammo crates and half the ammunition, seven asks answered, and an Ammo box
  // lying.
  const gear = readFromRoom(await written('gear.bin'));
  assert.equal(gear?.kind, 'gear');
  if (gear?.kind !== 'gear') return;
  assert.deepEqual([gear.level, gear.answered, gear.answer, gear.atReader, gear.spent], [20, 7, 0, true, [0]]);
  assert.deepEqual([gear.ammo, gear.ammoMost, gear.ammoShare, gear.crates, gear.cratePrice], [0, 0, 0.5, 2, 250]);
  assert.deepEqual(
    gear.drops.map((drop) => [drop.kind, drop.at, drop.from, drop.flying]),
    [[DROPPED.ammoBox, [1, 2, 0], [1, 2, 0], 36]],
  );
  assert.equal(gear.xp, 190_000n);
  assert.equal(gear.resources[4], 3, 'three of the node’s resource');
  assert.equal(gear.items.length, 10, 'six pieces and the four modules every ship is built with');
  const sword = gear.items.find((item) => item.named === 'harbourwarden');
  assert.ok(sword);
  assert.deepEqual([sword.at, sword.attack, sword.rarity, sword.level, sword.xpMost], [2, 248, 3, 20, 90_000]);
  assert.deepEqual(
    sword.columns.map((column) => column.kind),
    [1, 0, 3, 0, 2, 3, 0, 0, 0],
  );
  assert.deepEqual(sword.columns[0]?.traits, ['light_grip', 'weighted', 'keen_edge']);
  assert.deepEqual([sword.columns[8]?.essence, sword.columns[8]?.aurem, sword.columns[1]?.resource], [6, 1_500, 10]);
  assert.equal(sword.resource, 0, 'Brineglass, the first island’s');
  assert.deepEqual(
    gear.vestiges.map((vestige) => [vestige.rarity, vestige.slot, vestige.vaulted]),
    [[4, 2, false]],
  );
});

test('an ask crosses into an input with every field it names', () => {
  const ask = { kind: ASKS.buy, item: 7, column: 6, node: 1 } as const;
  const bytes = inputBytes(3, {
    intent: new Float64Array(16),
    look: { anim: 'idle', frame: 0, facing: 0 },
    arms: 0,
    seen: 0n,
    spawn: { type: 14, rank: 2, shield: 1 },
    spawnLevel: 12,
    ask,
  });
  const input = Input.getRootAsInput(new flatbuffers.ByteBuffer(bytes));
  const read = input.ask();
  assert.deepEqual([read?.kind(), read?.item(), read?.column(), read?.node()], [ASKS.buy, 7, 6, 1]);
  assert.deepEqual([input.spawn(), input.spawnType(), input.spawnLevel()], [1 << 4, 14, 12], 'its shield above');
  const named = Input.getRootAsInput(
    new flatbuffers.ByteBuffer(
      inputBytes(4, {
        intent: new Float64Array(16),
        look: { anim: 'idle', frame: 0, facing: 0 },
        arms: 0,
        seen: 0n,
        ask: { kind: ASKS.grantNamed, named: 'gullwing' },
      }),
    ),
  );
  assert.equal(named.ask()?.named(), 'gullwing');
  const none = Input.getRootAsInput(
    new flatbuffers.ByteBuffer(
      inputBytes(5, {
        intent: new Float64Array(16),
        look: { anim: 'idle', frame: 0, facing: 0 },
        arms: 0,
        seen: 0n,
      }),
    ),
  );
  assert.equal(none.ask(), null, 'an input that asks nothing carries no ask');
});

test("the ship's part of the gear message reads back: her power, materials, hands, officers and offers", () => {
  const builder = new flatbuffers.Builder(256);
  const traits = GearColumn.createTraitsVector(builder, [builder.createString('steady_hand')]);
  const column = GearColumn.createGearColumn(builder, 3, traits, 400, 900, 0, 2, 0);
  const officer = (id: number, duty: number, wage: number) =>
    GearOfficer.createGearOfficer(
      builder,
      id,
      1,
      2,
      3,
      4,
      duty,
      12,
      0.5,
      300,
      2_000,
      0.8,
      1,
      GearOfficer.createChosenVector(builder, [0]),
      GearOfficer.createColumnsVector(builder, [column]),
      wage,
    );
  const officers = GearShip.createOfficersVector(builder, [officer(5, 1, 0)]);
  const offers = GearShip.createOffersVector(builder, [officer(0, 0, 4_000)]);
  const ship = GearShip.createGearShip(
    builder,
    9_000n,
    6,
    12,
    80,
    140,
    0.25,
    1_200,
    GearShip.createStocksVector(builder, [10, 20, 30, 4]),
    18,
    24,
    officers,
    offers,
    GearShip.createTrimVector(builder, [1, 2]),
    2,
  );
  Gear.startGear(builder);
  Gear.addShip(builder, ship);
  builder.finish(Gear.endGear(builder));
  const read = gearOf(Gear.getRootAsGear(new flatbuffers.ByteBuffer(builder.asUint8Array()))).ship;
  assert.ok(read);
  assert.deepEqual(
    [read.xp, read.level, read.prestige, read.attack, read.defense, read.toNext, read.toNextNeeds],
    [9_000n, 6, 12, 80, 140, 0.25, 1_200],
  );
  assert.deepEqual(
    [read.stocks, read.hands, read.handsMost, read.trim, read.pledge],
    [[10, 20, 30, 4], 18, 24, [1, 2], 2],
  );
  const [kept] = read.officers;
  assert.deepEqual(
    [kept?.id, kept?.post, kept?.grade, kept?.given, kept?.family, kept?.duty, kept?.level, kept?.toNext],
    [5, 1, 2, 3, 4, 1, 12, 0.5],
  );
  assert.deepEqual(
    [kept?.trained, kept?.trainedMost, kept?.strength, kept?.bought, kept?.chosen],
    [300, 2_000, 0.8, 1, [0]],
  );
  assert.deepEqual(kept?.columns, [
    { kind: 3, traits: ['steady_hand'], xp: 400, aurem: 900, fragments: 0, essence: 2, resource: 0 },
  ]);
  assert.deepEqual(
    read.offers.map((each) => [each.id, each.wage]),
    [[0, 4_000]],
  );
  const bare = new flatbuffers.Builder(16);
  Gear.startGear(bare);
  bare.finish(Gear.endGear(bare));
  assert.equal(gearOf(Gear.getRootAsGear(new flatbuffers.ByteBuffer(bare.asUint8Array()))).ship, null, 'none sent');
});

test("the ship's and crew's asks carry the numbers the protocol reads them by", async () => {
  const wire = await readFile(new URL('../../../crates/protocol/src/gear_wire.rs', import.meta.url), 'utf8');
  const number = (name: string) => Number(new RegExp(`pub const ${name}: u8 = (\\d+);`).exec(wire)?.[1]);
  assert.deepEqual(
    [ASKS.infuse, ASKS.recruit, ASKS.station, ASKS.dismiss, ASKS.train, ASKS.chooseOfficer],
    ['INFUSE', 'RECRUIT', 'STATION', 'DISMISS', 'TRAIN', 'CHOOSE_OFFICER'].map(number),
  );
});
