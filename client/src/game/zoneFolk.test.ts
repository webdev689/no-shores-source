import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ZoneFolk } from './zoneFolk.ts';

type Point = readonly [number, number];

/** A straight path from `from` to `to`, a point every 20 m. */
const line = (from: Point, to: Point): Point[] => {
  const steps = Math.round(Math.hypot(to[0] - from[0], to[1] - from[1]) / 20);
  return Array.from({ length: steps + 1 }, (unused, step) => [
    from[0] + ((to[0] - from[0]) * step) / steps,
    from[1] + ((to[1] - from[1]) * step) / steps,
  ]);
};

/** A hamlet at (0, 0) whose folk walk 100 m round it, two paths crossing at its middle, and a farm no path reaches. */
const HAMLET = { at: [0, 0], radius: 100 } as const;
const FARM = { at: [600, 600], radius: 60 } as const;
const PATHS = [line([-300, 0], [300, 0]), line([0, -300], [0, 300])];

const helmed = (person: { dress: { outfit: { armour: { helm?: string } } } }) => person.dress.outfit.armour.helm;

test('a zone’s folk walk its paths where they live, off its middle, and a place no path reaches holds none', () => {
  const folk = new ZoneFolk([HAMLET, FARM], PATHS);
  const anims = new Set<string>();
  for (let second = 0; second < 1200; second += 2) {
    const people = folk.peopleAt(second);
    assert.ok(people.length >= 4, 'the hamlet holds several');
    for (const person of people) {
      const off = Math.hypot(person.x, person.y);
      assert.ok(off <= HAMLET.radius + 0.1 && off >= 7, `${person.id} walks within the hamlet, off its middle: ${off}`);
      assert.ok(Math.min(Math.abs(person.x), Math.abs(person.y)) <= 1.5, `${person.id} keeps to a path`);
      anims.add(person.anim);
    }
  }
  assert.ok(anims.has('walk') && anims.has('idle'), `they walk and stop: ${[...anims].join(', ')}`);
});

test('no two of a zone’s folk ever walk into each other', () => {
  const folk = new ZoneFolk([HAMLET], PATHS);
  for (let second = 0; second < 1200; second += 0.25) {
    const people = folk.peopleAt(second);
    for (const [nth, one] of people.entries())
      for (const other of people.slice(nth + 1))
        assert.ok(Math.hypot(one.x - other.x, one.y - other.y) > 1, `${one.id} and ${other.id} at ${second} s`);
  }
});

test('each place has one guard of Overlook, helmed, among its townsfolk, the same in every browser', () => {
  const people = new ZoneFolk([HAMLET], PATHS).peopleAt(500);
  assert.equal(people.filter(helmed).length, 1);
  assert.ok(people.length - 1 >= 3, 'townsfolk besides');
  assert.deepEqual(new ZoneFolk([HAMLET], PATHS).peopleAt(500), people);
});
