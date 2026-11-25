import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nodeRoom, runAsk } from '../../../../server/roomNames.ts';
import { DELVE_STYLES, delveBase, delveLaid, delveRoom, gateTier } from './delveRoom.ts';
import { weekOf } from './guildLaw.ts';

const KEY = '0123456789abcdef0123456789abcdef';
const gate = (tier: number, building = 0) => ({ id: 3, kind: 'gate', tier, building, x: 2, y: 2, turn: 0 });

test("the guild dungeon's run is named after its outpost, its tier at Elite or Abyss, then its instance", () => {
  assert.equal(delveRoom(KEY, 'crown-isle', 0, 'abcd1234'), `node-crown-isle--guild-${KEY}--run-abcd1234`);
  assert.equal(delveRoom(KEY, 'crown-isle', 1, 'abcd1234'), `node-crown-isle--guild-${KEY}--elite--run-abcd1234`);
  assert.equal(delveBase(KEY, 'crown-isle', 2), `node-crown-isle--guild-${KEY}--abyss`);
  for (const tier of [0, 1, 2]) {
    const named = nodeRoom(delveRoom(KEY, 'crown-isle', tier, 'abcd1234').slice('node-'.length));
    assert.deepEqual(named, {
      id: 'crown-isle',
      seas: tier,
      dungeon: null,
      run: 'abcd1234',
      playlist: null,
      guild: KEY,
      breach: null,
    });
    // Its ask is the host's, which reads the outpost first (`delveHost.ts`).
    assert.equal(runAsk(delveRoom(KEY, 'crown-isle', tier, 'abcd1234'), 0), null);
  }
});

test("the dungeon is the same all week for a guild, another the next week, and laid in a sea island dungeon's style", () => {
  const week = weekOf(Date.UTC(2026, 10, 24, 10));
  assert.deepEqual(delveLaid(KEY, week), delveLaid(KEY, week));
  assert.notDeepEqual(delveLaid(KEY, week), delveLaid(KEY, week + 1));
  assert.notDeepEqual(delveLaid(KEY, week), delveLaid('f'.repeat(32), week));
  const styles = new Set(Array.from({ length: 60 }, (_unused, nth) => delveLaid(KEY, nth).style));
  assert.deepEqual([...styles].sort(), [...DELVE_STYLES].sort(), 'every style comes up');
  for (let nth = 0; nth < 60; nth += 1) {
    const { seed } = delveLaid(KEY, nth);
    assert.ok(Number.isInteger(seed) && seed >= 0 && seed <= 0xffff_ffff, 'a seed is 32 bits');
  }
});

test("the gate opens its dungeon up to its tier's, and not before it stands at one", () => {
  const plot = (...structures: ReturnType<typeof gate>[]) => ({ structures, decor: [] });
  assert.equal(gateTier(plot()), null);
  assert.equal(gateTier(plot(gate(0, 1))), null, 'a gate first being built opens nothing');
  assert.equal(gateTier(plot(gate(1))), 0);
  assert.equal(gateTier(plot(gate(2, 1))), 1, 'a gate being raised opens at the tier it stands at');
  assert.equal(gateTier(plot(gate(3))), 2);
});
