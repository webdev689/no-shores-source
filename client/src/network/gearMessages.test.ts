import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as flatbuffers from 'flatbuffers';
import { Input } from '../../../generated/messages/ts/overlook/wire.ts';
import { ASKS, DROPPED } from './gearMessages.ts';
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
  assert.equal(gear.prologueDone, false, 'a new character');
  const nothing = { day: 0, cleared: [], week: 0, elite: false, abyss: false, boon: false };
  assert.deepEqual(gear.activity, nothing, 'a character that has done nothing yet');
  assert.equal(gear.bounties?.length, 6, 'the day’s board');
  assert.equal(
    gear.bounties?.some((bounty) => bounty.held),
    false,
    'a new character holds none',
  );
  assert.deepEqual(gear.bounties?.map((bounty) => bounty.pool), [0, 0, 1, 1, 2, 2], 'where each counts');
  assert.ok(gear.bounties?.every((bounty) => bounty.name !== ''), 'each its name');
  assert.deepEqual(gear.quests, [], 'a new character holds no quest');
  assert.equal(gear.bountyXp, 2_500, 'at level 20');
  assert.equal(typeof gear.day, 'number');
  assert.deepEqual([gear.level, gear.answered, gear.answer, gear.atMage, gear.spent], [20, 7, 0, true, [0]]);
  assert.deepEqual([gear.ammo, gear.ammoMost, gear.ammoShare, gear.crates, gear.cratePrice], [0, 0, 0.5, 2, 250]);
  assert.deepEqual(
    gear.drops.map((drop) => [drop.kind, drop.at, drop.from, drop.flying]),
    [[DROPPED.ammoBox, [1, 2, 0], [1, 2, 0], 36]],
  );
  assert.equal(gear.xp, 190_000n);
  assert.equal(gear.resources[4], 3, 'three of the node’s resource');
  // Each stock its own count there: Weapon and Armor Fragments, Weapon and Armor Essence, then Fruit of Dagon, the
  // order the inventory names them in (STOCK_NAMES).
  assert.deepEqual(gear.stocks, [11, 12, 13, 14, 2]);
  assert.equal(gear.items.length, 6);
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

test('where a player stands crosses as the server wrote it, away from Shape and while he is here', async () => {
  // gear_wire_tests.rs writes both: the furnished player at the Test Ground's stall, its Arts mastered, and then
  // pledged to the Lamplighters at rank 3, Arts at levels 3, 1 and 5, the Ember Plate barding worn and 9 Shapes on a
  // Friday noon.
  const away = readFromRoom(await written('gear.bin'));
  const here = readFromRoom(await written('gear_shape.bin'));
  assert.ok(away?.kind === 'gear' && here?.kind === 'gear');
  const fresh = { pledge: 0, reputation: [0, 0, 0], packages: [0, 0, 0], artLevels: [5, 5, 5], artXp: [0, 0, 0] };
  assert.deepEqual(away.standing, { ...fresh, artOwned: [0b11_1111, 0b11_1111, 0b11_1111] }, 'every fragment owned');
  assert.deepEqual(away.cosmetics, [23, 16, 0], 'the start pieces: bare, bay, own colours');
  assert.deepEqual(away.worn, { dye: 0, coat: 16, barding: 23 });
  assert.deepEqual([away.shapes, away.shape], [0, null], 'he is away');
  assert.deepEqual(here.standing, {
    pledge: 2,
    reputation: [5, 35_000, 0],
    packages: [0, 1, 0],
    artLevels: [3, 1, 5],
    artXp: [700, 0, 0],
    artOwned: [0b101, 0, 0b11_1111],
  });
  assert.deepEqual(here.cosmetics, [23, 16, 24, 14, 0], 'Ember Plate bought and the Lamplighters’ gold earned');
  assert.deepEqual(here.worn, { dye: 0, coat: 16, barding: 24 });
  assert.equal(here.cosmeticsSold?.length, 8, 'four the Tailor’s, four the Tack’s');
  assert.equal(here.shapes, 9);
  assert.equal(here.shape?.place, 6);
  assert.deepEqual(
    here.shape?.wares.map((ware) => [ware.id, ware.rarity, ware.price, ware.level]),
    [0, 1, 2, 3, 4, 5].map((id) => [id, id < 4 ? 3 : 4, id < 4 ? 7 : 15, 20]),
    'four Legendary, then two Atheric, numbered by place and priced in Shapes',
  );
  const sold = here.factionWares ?? [];
  assert.equal(sold.length, 21, 'seven pieces of each faction’s');
  const hood = sold.find((ware) => ware.named === 'lamplighters_hood');
  assert.deepEqual([hood?.id, hood?.price, hood?.level], [1, 6_000, 20]);
  assert.equal(
    here.day,
    20_778,
    'the clock’s day that Friday noon, begun at 09:00, which the smiths’ wares are asked by',
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
