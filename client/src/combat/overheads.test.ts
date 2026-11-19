import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MARK_FLOATS } from './marks.ts';
import { CRACKED, overheadMarks } from './overheads.ts';
import { CLEAR, stopOf } from './spellPixels.ts';

const EYE = [0, 10, 1.6] as const;
const FEET = [0, 0, 0] as const;
const placesOf = (out: readonly number[]) =>
  Array.from({ length: out.length / MARK_FLOATS }, (_unused, index) =>
    out.slice(index * MARK_FLOATS, index * MARK_FLOATS + 3),
  );

test('a cracked diamond nine cells across: its edge lit, its middle crossed by the crack', () => {
  assert.deepEqual([CRACKED.width, CRACKED.height], [9, 9]);
  assert.equal(stopOf(CRACKED, 0, 0), CLEAR, 'its corners clear');
  assert.equal(stopOf(CRACKED, 4, 0), 2, 'its top lit');
  assert.equal(stopOf(CRACKED, 4, 4), 2, 'its middle cracked');
});

test('a staggered foe’s three stars circle its head in held eighth-turns; an Exposed one wears its diamond beside it', () => {
  const none: number[] = [];
  overheadMarks(none, FEET, EYE, 0, { staggered: false, exposed: false });
  assert.equal(none.length, 0);
  const stars = (clock: number) => {
    const out: number[] = [];
    overheadMarks(out, FEET, EYE, clock, { staggered: true, exposed: false });
    return placesOf(out);
  };
  const first = stars(0);
  assert.ok(first.length > 0 && first.every((place) => Math.abs((place[2] ?? 0) - 1.85) < 0.2), 'round its head');
  assert.deepEqual(stars(0.1), first, 'held within its step');
  assert.notDeepEqual(stars(0.13), first, 'and on at the next');
  const marked: number[] = [];
  overheadMarks(marked, FEET, EYE, 0, { staggered: false, exposed: true });
  const places = placesOf(marked);
  assert.ok(places.length > 0 && places.every((place) => (place[2] ?? 0) > 1.3), 'by its head');
  assert.ok(
    places.every((place) => (place[0] ?? 0) > 0.2),
    'to the eye’s right, clear of the plate over it',
  );
});
