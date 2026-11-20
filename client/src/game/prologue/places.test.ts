import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Landmass } from '../landmass.ts';
import { CLEAR_M, stormPlaces } from './places.ts';

/** A landmass made up for the search: a town at the origin with its harbour east, an island's coast 1 km round it,
 *  and, when `blocked`, a second coast straight out past the harbour where the storm would first be laid. */
function landmass(blocked: boolean, more: (x: number, y: number) => boolean = () => false): Landmass {
  const heightAt = (x: number, y: number) => {
    if (Math.hypot(x, y) < 1000) return 10;
    if (blocked && Math.hypot(x - 25_000, y) < 6000) return 5;
    if (more(x, y)) return -3;
    return -200;
  };
  return {
    id: 'made-up',
    view: { leftM: -50_000, topM: -50_000 },
    plan: { centre: [0, 0], harbour: [900, 0] },
    nodes: [],
    outline: [],
    heightAt,
  } as unknown as Landmass;
}

test('the storm lies far out past the harbour in open water, the Brig heading across the swell', () => {
  const places = stormPlaces(landmass(false), 1);
  assert.ok(places.storm[0] > 20_000, 'out past the harbour, east');
  assert.ok(Math.abs(places.storm[1]) < 1, 'straight out');
  assert.equal(places.heading, 2.2);
  // Home is back toward the town, west.
  assert.ok(Math.abs(Math.atan2(Math.sin(places.home + Math.PI / 2), Math.cos(places.home + Math.PI / 2))) < 0.01);
});

test('a coast in the way turns the storm aside until the sea round it is open', () => {
  const places = stormPlaces(landmass(true), 1);
  const [x, y] = places.storm;
  assert.ok(Math.hypot(x - 25_000, y) > 6000 + 3000, 'clear of the other coast by the search radius');
  assert.ok(Math.hypot(x, y) > 20_000, 'still far out');
});

test('a reef too small for a few soundings to find still turns the storm aside', () => {
  // 1.5 km past where the storm would first be laid, between any eight soundings on a ring 3 km out.
  const [firstX] = stormPlaces(landmass(false), 1).storm;
  const reef = (x: number, y: number) => Math.hypot(x - firstX - 1500, y) < 300;
  const [x, y] = stormPlaces(landmass(false, reef), 1).storm;
  assert.ok(Math.hypot(x - firstX - 1500, y) > CLEAR_M + 300, `clear of the reef: ${x}, ${y}`);
});

test('with every turn blocked close in, the storm is laid farther out where the sea is open', () => {
  // Shallows on every bearing out to 27 km.
  const bank = (x: number, y: number) => Math.hypot(x, y) > 1000 && Math.hypot(x, y) < 27_000;
  const [x, y] = stormPlaces(landmass(false, bank), 1).storm;
  assert.ok(Math.hypot(x, y) > 27_000 + CLEAR_M, `out past the bank: ${Math.hypot(x, y)}`);
});
