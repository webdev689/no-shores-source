import assert from 'node:assert/strict';
import { test } from 'node:test';
import { delveLaid, delveRoom } from '../client/src/game/guild/delveRoom.ts';
import { weekOf } from '../client/src/game/guild/guildLaw.ts';
import { delveAsk } from './delveHost.ts';
import { delveInstance } from './roomNames.ts';

const KEY = '0a1b2c3d4e5f60718293a4b5c6d7e8f9';
const OUTPOST = `node-oakfast-landing--guild-${KEY}`;
/** A Friday's 09:00 UTC, as a Unix minute. */
const MINUTE = 29_919_420;
const SITE = JSON.stringify({
  id: 'oakfast-landing',
  continent: 'continent-4',
  outpost: { plot: [0, 0], level: 1, muster: [0, 0] },
});
/** A run's instance laid for the week of MINUTE, or `back` weeks before it. */
const laidFor = (back = 0) => delveInstance(weekOf(MINUTE * 60_000) - back, 'abcd1234');
const gate = (tier: number) => ({ id: 2, kind: 'gate', tier, building: 0, x: 2, y: 2, turn: 0 });

/** The ask for a run's room, the outpost's gate at `tier` (none for null), the site's file `site`. */
function asked(room: string, tier: number | null, site: string | null = SITE) {
  const read: string[] = [];
  const outpost = (name: string) => {
    read.push(name);
    return Promise.resolve(tier === null ? null : { plot: { structures: [gate(tier)], decor: [] } });
  };
  const nodeText = (id: string) => Promise.resolve(id === 'oakfast-landing' ? site : null);
  return { ask: delveAsk(room, MINUTE, outpost, nodeText), read };
}

test('a guild dungeon’s run opens as the week’s sea island dungeon of its guild, in its site’s continent', async () => {
  const { ask, read } = asked(delveRoom(KEY, 'oakfast-landing', 1, laidFor()), 2);
  const { seed, style } = delveLaid(KEY, weekOf(MINUTE * 60_000));
  assert.deepEqual(JSON.parse((await ask) ?? 'null'), {
    dungeon: { seed, style, continent: 'continent-4' },
    tier: 1,
    minute: MINUTE,
    guild: KEY,
  });
  assert.deepEqual(read, [OUTPOST], 'its outpost read');
});

test('it opens only while its guild’s gate stands at its tier or higher, on an outpost’s site', async () => {
  const run = (tier: number) => delveRoom(KEY, 'oakfast-landing', tier, laidFor());
  assert.notEqual(await asked(run(2), 3).ask, null, 'at the gate’s own tier');
  assert.notEqual(await asked(run(0), 3).ask, null, 'or lower');
  assert.equal(await asked(run(2), 2).ask, null, 'never higher');
  assert.equal(await asked(run(0), 0).ask, null, 'a gate first being built');
  assert.equal(await asked(run(0), null).ask, null, 'no outpost');
  assert.equal(await asked(run(0), 1, JSON.stringify({ id: 'oakfast-landing', continent: 'continent-4' })).ask, null);
  assert.equal(await asked(run(0), 1, null).ask, null, 'no site');
  assert.equal(await asked(OUTPOST, 3).ask, null, 'the outpost itself is no run');
  assert.equal(await asked('node-oakfast-landing--run-abcd1234', 3).ask, null, 'nor a run of no guild');
});

test('a run is laid for the week its name carries: last week’s for one opened before the turn, never an older one', async () => {
  const run = (back: number) => delveRoom(KEY, 'oakfast-landing', 1, laidFor(back));
  const { seed, style } = delveLaid(KEY, weekOf(MINUTE * 60_000) - 1);
  assert.deepEqual(JSON.parse((await asked(run(1), 2).ask) ?? 'null').dungeon, {
    seed,
    style,
    continent: 'continent-4',
  });
  assert.equal(await asked(run(2), 2).ask, null, 'two weeks back');
  assert.equal(await asked(run(-1), 2).ask, null, 'a week not yet come');
});
