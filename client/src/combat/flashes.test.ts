import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FightEvent } from '../network/messages.ts';
import { EVENT } from './cues.ts';
import { FLASH_SECONDS, Flashes } from './flashes.ts';

const blow = (kind: number, defender: number, amount: number): FightEvent => ({
  tick: 0n,
  kind,
  striker: 40,
  defender,
  how: 1,
  amount,
  stroke: 0,
});

test('a fighter harmed by a blow flashes at once and fades out over a tenth of a second', () => {
  const flashes = new Flashes();
  flashes.update([blow(EVENT.hit, 1, 14)], 0);
  assert.equal(flashes.shareOf(1), 1);
  flashes.update([], FLASH_SECONDS / 2);
  assert.equal(flashes.shareOf(1), 0.5);
  flashes.update([], FLASH_SECONDS);
  assert.equal(flashes.shareOf(1), 0);
});

test('a blow that does no harm, or harms another, flashes no one', () => {
  const flashes = new Flashes();
  flashes.update([blow(EVENT.parried, 1, 0), blow(EVENT.hit, 2, 9)], 0);
  assert.equal(flashes.shareOf(1), 0);
  assert.equal(flashes.shareOf(2), 1);
});
