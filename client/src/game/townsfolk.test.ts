import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Plaza, Townsfolk, WALKERS } from './townsfolk.ts';

/** A plaza 260 m across and 120 m deep, its middle at (1000, 2000), the sea to the south (+y). */
const PLAZA: Plaza = {
  bounds: [870, 1940, 1130, 2060],
  spawns: [
    [940, 2056],
    [980, 2056],
    [1020, 2056],
    [1060, 2056],
  ],
  stations: [
    { kind: 'reader', keeper: [960.8, 1946.6], counter: [960.8, 1948.4] },
    { kind: 'vault', keeper: [946.5, 1946.6], counter: [946.5, 1948.4] },
    { kind: 'harbourmaster', keeper: [1039.2, 1946.6], counter: [1039.2, 1948.4] },
  ],
};

test('a keeper stands behind each counter, facing the plaza across it', () => {
  const people = new Townsfolk(PLAZA, 7).step(0);
  assert.equal(people.length, PLAZA.stations.length + WALKERS);
  const [reader] = people;
  assert.deepEqual([reader?.x, reader?.y, reader?.walking], [960.8, 1946.6, false]);
  assert.ok(Math.abs(Math.abs(reader?.facing ?? 0) - Math.PI) < 1e-9, 'facing south, to the counter');
  assert.equal(reader?.dress.outfit.garments[0], 'plain_robes_hooded');
});

test('the townsfolk walk the open lanes and stop at the stations and the parapet, the same for the same seed', () => {
  const folk = new Townsfolk(PLAZA, 11);
  const again = new Townsfolk(PLAZA, 11);
  const counters = new Set<number>();
  let looked = false;
  for (let tick = 0; tick < 60 * 600; tick += 15) {
    const people = folk.step(0.25).slice(PLAZA.stations.length);
    assert.deepEqual(people, again.step(0.25).slice(PLAZA.stations.length));
    for (const person of people) {
      const [toward, across] = [person.y - 2000, person.x - 1000];
      assert.ok(Math.abs(across) <= 112 && toward >= -49 && toward <= 53, `inside the plaza: ${across}, ${toward}`);
      assert.ok(Math.hypot(toward, across) > 9, 'never on the obelisk’s plinth');
      for (const brazier of [-95, -45, 45, 95]) assert.ok(Math.hypot(toward, across - brazier) > 1, 'past braziers');
      if (toward < -48) counters.add(Math.round(across));
      if (toward > 50) looked = true;
    }
  }
  assert.ok(counters.size >= 2, 'customers come to the counters');
  assert.ok(looked, 'someone looks out over the city');
});
