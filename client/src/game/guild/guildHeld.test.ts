import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AccountLink } from '../../network/accounts.ts';
import { hexOf } from './bannerLaw.ts';
import { guildHeld, keepGuild, ownOutpostColours } from './guildHeld.ts';

Object.assign(globalThis, { addEventListener: () => undefined });

test("the guild kept from the accounts names its rooms' key and flies its banner's colours at its own sites", async () => {
  const banner = { cut: 'swallowtail', cloth: 'navy', device: 'halves', deviceColour: 'gold', sign: 'anchor' };
  const full = { ...banner, signColour: 'salt', ground: 'roundel', groundColour: 'crimson', staff: 'driftwood' };
  const link = {
    guild: () => Promise.resolve({ guild: { key: 'a1b2c3d4', banner: full } }),
    outposts: () => Promise.resolve({ outposts: [{ site: 'gull-cove-outpost' }] }),
  } as unknown as AccountLink;
  assert.equal(ownOutpostColours('gull-cove-outpost'), null, 'before the guild is read');
  keepGuild(link);
  assert.equal((await guildHeld())?.key, 'a1b2c3d4');
  await Promise.resolve();
  assert.deepEqual(ownOutpostColours('gull-cove-outpost'), { cloth: hexOf('navy'), device: hexOf('gold') });
  assert.equal(ownOutpostColours('far-rocks-outpost'), null, "another guild's site, or none, as it is");
});
