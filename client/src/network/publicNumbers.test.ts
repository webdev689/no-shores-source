import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { GROWTH, MOTION, STORE } from '../city/eventProps.ts';
import { EVENT } from '../combat/cues.ts';
import { CHEST_LIES_S } from '../game/publicLaw.ts';
import { MARK } from './publicMessages.ts';

/** The room's public events' numbers, read from its own source, so the page's copies cannot drift from them. */
const source = (path: string) => readFileSync(new URL(`../../../crates/room/src/${path}`, import.meta.url), 'utf8');
const constant = (text: string, name: string): number => {
  const found = new RegExp(`const ${name}: u(?:8|64) = ([\\d_ *]+);`).exec(text)?.[1];
  assert.ok(found, `${name} is in the room's source`);
  return found.split('*').reduce((product, part) => product * Number(part.trim().replaceAll('_', '')), 1);
};
const camel = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);

test("the page's public event numbers are the room's: each event told, from PublicBegun to ChestOpened", () => {
  const judging = source('judging.rs');
  const told = [...judging.matchAll(/^\s+(\w+) = (\d+),$/gm)].filter((row) => Number(row[2]) >= 15);
  const kinds = told.slice(0, told.findIndex((row) => row[1] === 'ChestOpened') + 1);
  assert.equal(kinds.length, 10);
  for (const [, name = '', number] of kinds) {
    assert.equal(EVENT[camel(name) as keyof typeof EVENT], Number(number), name);
  }
});

test("a mark's kind and state, the growth's rise and sink and a chest's life are the room's", () => {
  const seen = source('public/seen.rs');
  const kinds = { fissure: 'FISSURE', growth: 'GROWTH', store: 'STORE', shard: 'SHARD', carried: 'CARRIED' };
  for (const [page, room] of Object.entries(kinds)) assert.equal(MARK[page as keyof typeof MARK], constant(seen, room));
  assert.equal(MARK.titheTaker, constant(seen, 'TITHE_TAKER'));
  assert.equal(MARK.banner, constant(seen, 'BANNER'));
  assert.equal(MARK.approach, constant(seen, 'APPROACH'));
  assert.deepEqual(GROWTH, {
    rising: constant(seen, 'RISING'),
    standing: constant(seen, 'STANDING'),
    sinking: constant(seen, 'SINKING'),
    broken: constant(seen, 'BROKEN'),
  });
  assert.deepEqual(STORE, { whole: constant(seen, 'WHOLE'), plundered: constant(seen, 'PLUNDERED') });
  const fissure = source('public/fissure.rs');
  assert.equal(MOTION.growthRiseS * 60, constant(fissure, 'GROWTH_RISE'));
  assert.equal(MOTION.growthSinkS * 60, constant(fissure, 'GROWTH_SINK'));
  assert.equal(CHEST_LIES_S * 60, constant(source('drops.rs'), 'DROP_TICKS'));
});
