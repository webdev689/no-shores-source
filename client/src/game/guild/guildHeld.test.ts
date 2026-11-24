import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import type { AccountLink } from '../../network/accounts.ts';
import { hexOf } from './bannerLaw.ts';
import { guildLanded, guildRead, keepGuild, ownOutpostColours } from './guildHeld.ts';

Object.assign(globalThis, { addEventListener: () => undefined });

const KEY = '0a1b2c3d4e5f60718293a4b5c6d7e8f9';

test("the guild kept from the accounts names its rooms' key and flies its banner's colours at its own sites", async () => {
  const banner = { cut: 'swallowtail', cloth: 'navy', device: 'halves', deviceColour: 'gold', sign: 'anchor' };
  const full = { ...banner, signColour: 'salt', ground: 'roundel', groundColour: 'crimson', staff: 'driftwood' };
  const link = {
    guild: () => Promise.resolve({ guild: { key: KEY, banner: full } }),
    outposts: () => Promise.resolve({ allowed: 2, outposts: [{ site: 'gull-cove-outpost' }] }),
  } as unknown as AccountLink;
  assert.equal(ownOutpostColours('gull-cove-outpost'), null, 'before the guild is read');
  assert.equal((await keepGuild(link))?.key, KEY);
  await Promise.resolve();
  assert.deepEqual(ownOutpostColours('gull-cove-outpost'), { cloth: hexOf('navy'), device: hexOf('gold') });
  assert.equal(ownOutpostColours('far-rocks-outpost'), null, "another guild's site, or none, as it is");
  assert.equal(guildLanded()?.allowsAnother, true, 'one outpost of the two its level allows');
});

test('a failed read keeps the last guild and is read again when next asked for, a while after', async () => {
  const key = 'ffeeddccbbaa99887766554433221100';
  const answers: unknown[] = ['The accounts are away.', { guild: { key, rank: 1, banner: {} } }, { guild: null }];
  let guilds = 0;
  const link = {
    guild: () => (guilds++, Promise.resolve(answers.shift())),
    outposts: () => Promise.resolve({ allowed: 1, outposts: [] }),
  } as unknown as AccountLink;
  mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  assert.equal((await keepGuild(link))?.key, KEY, 'a failed read keeps the guild last read');
  await Promise.resolve();
  assert.equal(guildLanded()?.key, KEY);
  assert.equal(guilds, 1, 'not read again at once');
  mock.timers.tick(10_000);
  guildLanded();
  assert.equal(guilds, 2, 'read again once a while has passed');
  await new Promise((done) => setImmediate(done));
  assert.equal(guildLanded()?.key, key, 'an answer is kept');
  mock.timers.tick(60_000);
  guildLanded();
  assert.equal(guilds, 2, 'an answered read is not read again');
  mock.timers.reset();
  assert.equal(await guildRead(), null, 'removed by an admin, seen at a fresh read');
});

test("where only the outposts fail to read, the guild's sites are kept", async () => {
  let outposts: () => Promise<unknown> = () =>
    Promise.resolve({ allowed: 2, outposts: [{ site: 'gull-cove-outpost' }] });
  const link = {
    guild: () => Promise.resolve({ guild: { key: KEY, rank: 0, banner: {} } }),
    outposts: () => outposts(),
  } as unknown as AccountLink;
  await keepGuild(link);
  outposts = () => Promise.reject(new Error('lost'));
  mock.timers.enable({ apis: ['Date'], now: 2_000_000 });
  assert.deepEqual((await guildRead())?.sites, ['gull-cove-outpost']);
  await Promise.resolve();
  let asked = 0;
  outposts = () => (asked++, Promise.resolve({ allowed: 3, outposts: [{ site: 'gull-cove-outpost' }] }));
  mock.timers.tick(10_000);
  guildLanded();
  await new Promise((done) => setImmediate(done));
  mock.timers.reset();
  assert.equal(asked, 1, 'and read again a while after, as a failed read is');
  assert.equal(guildLanded()?.allowsAnother, true);
});
