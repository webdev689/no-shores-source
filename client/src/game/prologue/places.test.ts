import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Landmass } from '../landmass.ts';
import { stormPlaces } from './places.ts';

/** A landmass made up for the search: a town at the origin with its harbour east, an island's coast 1 km round it,
 *  and, when `blocked`, a second coast straight out past the harbour where the storm would first be laid. */
function landmass(blocked: boolean): Landmass {
  const heightAt = (x: number, y: number) => {
    if (Math.hypot(x, y) < 1000) return 10;
    if (blocked && Math.hypot(x - 25_000, y) < 6000) return 5;
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
