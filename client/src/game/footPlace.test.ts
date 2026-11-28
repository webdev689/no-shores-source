import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AccountLink } from '../network/accounts.ts';
import { type FootContext, closedIfThrown, nodeAddress, outpostJoined, rejoinOnGuild } from './footPlace.ts';
import { keepGuild } from './guild/guildHeld.ts';
import type { NodeInfo } from './worldData.ts';

test('a trip that fails after its room joined lets the link go; one that succeeds keeps it', async () => {
  let closed = 0;
  const link = { close: () => closed++ };
  await assert.rejects(
    closedIfThrown(link, () => Promise.reject(new Error('the land failed to come'))),
    /the land failed to come/,
  );
  assert.equal(closed, 1, 'let go as it failed');
  assert.equal(await closedIfThrown(link, () => Promise.resolve('here')), 'here');
  assert.equal(closed, 1, 'kept while it holds');
});

test("a guest lands in the room of the outpost of their companion's guild; anyone else in their own guild's", async () => {
  const listeners: (() => void)[] = [];
  Object.assign(globalThis, { addEventListener: (_type: string, listener: () => void) => listeners.push(listener) });
  const [mine, theirs] = ['0a1b2c3d4e5f60718293a4b5c6d7e8f9', 'ffeeddccbbaa99887766554433221100'];
  const guilds: unknown[] = [{ guild: { key: mine, rank: 2, banner: {} } }];
  keepGuild({
    guild: () => Promise.resolve(guilds.at(-1)),
    outposts: () => Promise.resolve({ outposts: [] }),
  } as unknown as AccountLink);
  const site = { id: 'gull-cove-outpost', kind: 'outpost' } as NodeInfo;
  assert.deepEqual(await outpostJoined(site, theirs), { guild: theirs, own: false });
  assert.deepEqual(await outpostJoined(site, null), { guild: null, own: false }, "a companion's wild site");
  assert.deepEqual(await outpostJoined(site), { guild: mine, own: true });
  assert.deepEqual(await outpostJoined(site, mine), { guild: mine, own: true });
  assert.equal(await outpostJoined({ id: 'saltgrass-downs', kind: 'patrol' } as NodeInfo, theirs), null);
  const context = { rooms: (name: string) => `wss://rooms/${name}` } as unknown as FootContext;
  assert.equal(
    nodeAddress(context, site, 'elite', undefined, theirs),
    `wss://rooms/node-gull-cove-outpost--guild-${theirs}`,
  );
  // Leaving the guild while standing in its outpost's room takes the player to the wild site.
  const rejoined: unknown[] = [];
  const here = { node: site, seas: 'normal' as const, outpost: { rejoins: (key: string | null) => key !== mine } };
  rejoinOnGuild(
    () => here,
    (standing) => rejoined.push(standing.node.id),
  );
  guilds.push({ guild: null });
  for (const listener of listeners) listener();
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(rejoined, ['gull-cove-outpost']);
});

test('launched for a Breach test run, the player joins its zone copy; for a real run, the zone itself', () => {
  const context = { rooms: (name: string) => `wss://rooms/${name}` } as unknown as FootContext;
  const zone = { id: 'saltgrass-downs', kind: 'patrol' } as NodeInfo;
  const launched = (breach: string) => ({ number: -1, x: 0, y: 0, facing: 0, breach });
  const test = 'node-saltgrass-downs--breach-normal--test-ab12cd34';
  assert.equal(
    nodeAddress(context, zone, 'normal', launched(test), null),
    `wss://rooms/node-saltgrass-downs--test-ab12cd34?breach=${encodeURIComponent(test)}`,
  );
  const real = 'node-saltgrass-downs--breach-normal--run-ab12cd34';
  assert.equal(
    nodeAddress(context, zone, 'normal', launched(real), null),
    `wss://rooms/node-saltgrass-downs?breach=${encodeURIComponent(real)}`,
  );
});
