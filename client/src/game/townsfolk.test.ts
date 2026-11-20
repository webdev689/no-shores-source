import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KEEPERS } from './keepers.ts';
import { type Plaza, Townsfolk, inPlaza, plazaFrameOf, plazaOf, plazaPoint, shapeSpot } from './townsfolk.ts';
import { POSTS, SOCIAL } from './welcome/plazaForTests.ts';

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
  const people = new Townsfolk(PLAZA, 7).peopleAt(0);
  assert.equal(people.length, PLAZA.stations.length, 'a plaza with no ways has its keepers alone');
  const [reader] = people;
  assert.deepEqual([reader?.x, reader?.y, reader?.anim], [960.8, 1946.6, 'idle']);
  assert.ok(Math.abs(Math.abs(reader?.facing ?? 0) - Math.PI) < 1e-9, 'facing south, to the counter');
  assert.equal(reader?.dress.outfit.garments[0], 'plain_robes_hooded');
});

test('the townsfolk keep their routines on the ways after the keepers, dressed the same each visit', () => {
  const plaza = plazaOf(SOCIAL);
  const [folk, again] = [new Townsfolk(plaza, 11), new Townsfolk(plaza, 11)];
  const keepers = plaza.stations.length;
  assert.ok(folk.townsfolk >= POSTS.filter((post) => post.keep === 'kept').length + 14);
  const moves = new Set<string>();
  for (let second = 5_000_000; second < 5_000_600; second += 5) {
    const people = folk.peopleAt(second);
    assert.equal(people.length, keepers + folk.townsfolk);
    assert.deepEqual(people, again.peopleAt(second), 'the same in another browser');
    for (const person of people.slice(keepers)) moves.add(person.anim);
  }
  for (const move of ['walk', 'smith', 'sweep', 'play_lute', 'dance', 'juggle', 'hold', 'idle', 'gesture'])
    assert.ok(moves.has(move), `someone at ${move}`);
  const ids = folk.peopleAt(0).map((person) => person.id);
  assert.deepEqual(ids, [...ids.keys()], 'each with their own number');
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
  const people = new Townsfolk({ ...PLAZA, stations }, 7).peopleAt(0);
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
  const folk = new Townsfolk({ ...plazaOf(SOCIAL), stations: PLAZA.stations }, 7);
  const away = folk.peopleAt(0, { away: new Set(['mage']) });
  assert.equal(away.length, PLAZA.stations.length - 1 + folk.townsfolk);
  assert.ok(!away.some((person) => person.dress === KEEPERS.mage.dress));
  const spot = [1095, 2002.5] as const;
  const here = folk.peopleAt(0, { shape: spot });
  const shape = here.at(-1);
  assert.equal(here.length, PLAZA.stations.length + folk.townsfolk + 1);
  assert.deepEqual([shape?.x, shape?.y, shape?.anim], [1095, 2002.5, 'idle']);
  assert.equal(shape?.dress, KEEPERS.shape.dress);
  assert.ok(Math.abs((shape?.facing ?? 0) + Math.PI / 2) < 0.05, 'facing west, to the middle');
  assert.equal(folk.peopleAt(0).length, PLAZA.stations.length + folk.townsfolk, 'gone when the room says he left');
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
