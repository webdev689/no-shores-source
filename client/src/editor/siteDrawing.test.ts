import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Places } from './marks.ts';
import { type Project, siteMarks } from './siteDrawing.ts';

const places: Places = {
  city: { id: 'overlook', name: 'Overlook', centre: [10_000, 10_000], motif: 'beacon' },
  nodes: [
    {
      id: 'downs',
      kind: 'patrol',
      name: 'Downs',
      ring: [
        [12_000, 10_000],
        [13_000, 10_000],
        [13_000, 11_000],
        [12_000, 11_000],
      ],
      spawns: [[12_500, 10_500]],
    },
    {
      id: 'maw',
      kind: 'boss',
      name: 'Maw',
      ring: [
        [12_100, 10_100],
        [12_300, 10_100],
        [12_300, 10_300],
      ],
      spawns: [[12_200, 10_150]],
    },
  ],
};

/** A flat map `metresPerPixel` metres a pixel, its origin at the world's. */
const flat =
  (metresPerPixel: number): Project =>
  (x, y) => ({ x: x / metresPerPixel, y: y / metresPerPixel });

const shapes = (project: Project) => siteMarks(places, project).map((mark) => mark.shape);
const labels = (project: Project) =>
  siteMarks(places, project).flatMap((mark) => (mark.shape === 'label' ? [mark.text] : []));

test('close up: the wall, each section in its colour, the spawns and every name', () => {
  const marks = siteMarks(places, flat(2));
  assert.deepEqual(shapes(flat(2)), ['wall', 'section', 'section', 'dot', 'dot', 'dot', 'label', 'label', 'label']);
  assert.ok(marks.some((mark) => mark.shape === 'section' && mark.colour === '#e5484d' && mark.whole));
  assert.deepEqual(labels(flat(2)), ['Overlook', 'Downs', 'Maw']);
});

test('far out: nodes too small to see are dots, and names that would cover another are left out', () => {
  assert.deepEqual(shapes(flat(2000)), ['dot', 'dot', 'dot', 'label']);
  assert.deepEqual(labels(flat(2000)), ['Overlook']);
});

test('a ring that runs behind the camera is drawn in pieces and not filled', () => {
  const behindEast: Project = (x, y) => (x > 12_900 ? null : { x: x / 2, y: y / 2 });
  const marks = siteMarks(places, behindEast);
  const downs = marks.find((mark) => mark.shape === 'section' && mark.colour === '#5cc96b');
  assert.ok(downs?.shape === 'section' && !downs.whole && !downs.path.endsWith('Z'));
  assert.equal(downs.path, 'M6000.0,5500.0L6000.0,5000.0', 'the edge back to the first point is kept');
});
