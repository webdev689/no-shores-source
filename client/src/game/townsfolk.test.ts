import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KEEPERS } from './keepers.ts';
import { type Plaza, Townsfolk, WALKERS, inPlaza, plazaFrameOf, plazaPoint, shapeSpot } from './townsfolk.ts';

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
    { kind: 'mage', keeper: [960.8, 1946.6], counter: [960.8, 1948.4] },
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

test('with every arcade staffed, no one walks onto the portico’s steps going to a counter or back', () => {
  const columns = [-105, -90, -75, -60, -45, -39, 39, 45, 60, 75, 90, 105];
  const stations = columns.map((across) => ({
    kind: 'smith',
    keeper: [1000 + across, 1946.6] as const,
    counter: [1000 + across, 1948.4] as const,
  }));
  for (const seed of [3, 5, 8]) {
    const folk = new Townsfolk({ ...PLAZA, stations }, seed);
    let served = 0;
    for (let tick = 0; tick < 60 * 900; tick += 15) {
      for (const person of folk.step(0.25).slice(stations.length)) {
        const [toward, across] = [person.y - 2000, person.x - 1000];
        assert.ok(!(toward < -42 && Math.abs(across) < 26), `on the portico: ${across}, ${toward}`);
        if (toward < -48) served += 1;
      }
    }
    assert.ok(served > 0, 'and customers still reach the counters');
  }
});

test('each keeper who deals with a player wears their own dress at their counter; the harbourmaster as before', () => {
  const stations = [
    ...PLAZA.stations,
    ...(['lamplighters', 'stormcallers', 'chandler'] as const).map((kind, index) => ({
      kind,
      keeper: [1060 + index * 14, 1946.6] as const,
      counter: [1060 + index * 14, 1948.4] as const,
    })),
  ];
  const people = new Townsfolk({ ...PLAZA, stations }, 7).step(0);
  const keeperAt = (kind: string) => people[stations.findIndex((station) => station.kind === kind)];
  assert.deepEqual(keeperAt('mage')?.dress, KEEPERS.mage.dress);
  assert.deepEqual(keeperAt('vault')?.dress, KEEPERS.vault.dress);
  assert.deepEqual(keeperAt('lamplighters')?.dress, KEEPERS.lamplighters.dress, 'Elder Maren Hale keeps her counter');
  assert.deepEqual([keeperAt('lamplighters')?.x, keeperAt('lamplighters')?.y], [1060, 1946.6]);
  assert.deepEqual(keeperAt('stormcallers')?.dress, KEEPERS.stormcallers.dress);
  assert.equal(keeperAt('harbourmaster')?.dress.outfit.dyes.formal_cloak, 'Blue');
  assert.ok(keeperAt('chandler')?.dress, 'the chandler is dressed as townsfolk are');
});

test('a keeper away from their counter is not drawn there; Shape stands at his spot facing the middle, then goes', () => {
  const folk = new Townsfolk(PLAZA, 7);
  const away = folk.step(0, { away: new Set(['mage']) });
  assert.equal(away.length, PLAZA.stations.length - 1 + WALKERS);
  assert.ok(!away.some((person) => person.dress === KEEPERS.mage.dress));
  const spot = [1095, 2002.5] as const;
  const here = folk.step(0, { shape: spot });
  const shape = here.at(-1);
  assert.equal(here.length, PLAZA.stations.length + WALKERS + 1);
  assert.deepEqual([shape?.x, shape?.y, shape?.walking], [1095, 2002.5, false]);
  assert.equal(shape?.dress, KEEPERS.shape.dress);
  assert.ok(Math.abs((shape?.facing ?? 0) + Math.PI / 2) < 0.05, 'facing west, to the middle');
  assert.equal(folk.step(0).length, PLAZA.stations.length + WALKERS, 'gone when the room says he left');
});

test("Shape's spot is the visitor spot his week's place indexes, and none while he is away", () => {
  const spots = [
    [1, 2],
    [3, 4],
  ] as const;
  assert.deepEqual(shapeSpot({ place: 1 }, spots), [3, 4]);
  assert.equal(shapeSpot(null, spots), null);
  assert.equal(shapeSpot(undefined, spots), null);
  assert.equal(shapeSpot({ place: 9 }, spots), null, 'a place the plaza does not have');
});

test('the plaza frame finds the sea from the spawns and maps its points both ways', () => {
  const frame = plazaFrameOf(PLAZA);
  assert.deepEqual(frame, { middle: [1000, 2000], seaward: [0, 1] });
  const point = plazaPoint(frame, -38, 20);
  assert.deepEqual(point, [980, 1962]);
  assert.deepEqual(inPlaza(frame, point), { toward: -38, across: 20 });
});
