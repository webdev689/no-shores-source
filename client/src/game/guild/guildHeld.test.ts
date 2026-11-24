import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AccountLink } from '../../network/accounts.ts';
import { hexOf } from './bannerLaw.ts';
import { guildHeld, guildRead, keepGuild, ownOutpostColours } from './guildHeld.ts';

Object.assign(globalThis, { addEventListener: () => undefined });

test("the guild kept from the accounts names its rooms' key and flies its banner's colours at its own sites", async () => {
  const banner = { cut: 'swallowtail', cloth: 'navy', device: 'halves', deviceColour: 'gold', sign: 'anchor' };
  const full = { ...banner, signColour: 'salt', ground: 'roundel', groundColour: 'crimson', staff: 'driftwood' };
  const link = {
    guild: () => Promise.resolve({ guild: { key: '0a1b2c3d4e5f60718293a4b5c6d7e8f9', banner: full } }),
    outposts: () => Promise.resolve({ outposts: [{ site: 'gull-cove-outpost' }] }),
  } as unknown as AccountLink;
  assert.equal(ownOutpostColours('gull-cove-outpost'), null, 'before the guild is read');
  keepGuild(link);
  assert.equal((await guildHeld())?.key, '0a1b2c3d4e5f60718293a4b5c6d7e8f9');
  await Promise.resolve();
  assert.deepEqual(ownOutpostColours('gull-cove-outpost'), { cloth: hexOf('navy'), device: hexOf('gold') });
  assert.equal(ownOutpostColours('far-rocks-outpost'), null, "another guild's site, or none, as it is");
});

test('a failed read keeps the last guild and is tried again at the next ask, and a fresh read takes a removal the player did not make', async () => {
  const key = 'ffeeddccbbaa99887766554433221100';
  const answers: unknown[] = ['The accounts are away.', { guild: { key, rank: 1, banner: {} } }, { guild: null }];
  const link = {
    guild: () => Promise.resolve(answers.shift()),
    outposts: () => Promise.resolve({ outposts: [] }),
  } as unknown as AccountLink;
  keepGuild(link);
  const before = await guildHeld();
  assert.equal(before?.key, '0a1b2c3d4e5f60718293a4b5c6d7e8f9', 'a failed read keeps the guild last read');
  assert.deepEqual(await guildHeld(), { key, rank: 1, banner: {}, sites: [] }, 'read again, not kept failed');
  assert.equal((await guildHeld())?.key, key, 'an answer is kept');
  assert.equal(await guildRead(), null, 'removed by an admin, seen at a fresh read');
});
