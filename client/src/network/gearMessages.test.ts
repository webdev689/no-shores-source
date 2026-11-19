import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as flatbuffers from 'flatbuffers';
import { Input } from '../../../generated/messages/ts/overlook/wire.ts';
import { ASKS } from './gearMessages.ts';
import { inputBytes, readFromRoom } from './messages.ts';

const written = async (name: string) =>
  new Uint8Array(
    await readFile(new URL(`../../../target/protocol/${name}`, import.meta.url)).catch(() => {
      throw new Error(`${name} is not written: run \`cargo test -p protocol\``);
    }),
  );

test('a players own gear the server wrote reads back whole, every column spelled out', async () => {
  // gear_wire_tests.rs writes it: level 20 by XP, Harbourwarden worn, Goldgrass Seed gathered at the stall's node, an
  // Atheric Vestige for the head carried, and five asks answered.
  const gear = readFromRoom(await written('gear.bin'));
  assert.equal(gear?.kind, 'gear');
  if (gear?.kind !== 'gear') return;
  assert.deepEqual([gear.level, gear.answered, gear.answer, gear.atReader, gear.spent], [20, 5, 0, true, [0]]);
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
