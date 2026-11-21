import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Places } from './marks.ts';
import type { Project } from './screenMarks.ts';
import type { LandView } from '../rules/landRules.ts';
import { fitOrbit } from './orbit.ts';
import { groundProjector, siteInks, siteMarks } from './siteDrawing.ts';

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
  assert.ok(downs?.shape === 'section' && !downs.whole && !downs.closed);
  assert.deepEqual(
    downs.runs,
    [
      [
        { x: 6000, y: 5500 },
        { x: 6000, y: 5000 },
      ],
    ],
    'the edge back to the first point is kept',
  );
  const { inks } = siteInks(marks);
  const drawn = inks.filter((ink) => ink.kind !== 'stroke' || ink.colour === '#5cc96b');
  assert.ok(
    !drawn.some((ink) => ink.kind === 'fill' && ink.colour.startsWith('#5cc96b')),
    'a ring cut short is not filled',
  );
});

test('the marks are drawn in order: each section filled under its edge, each dot ringed, the names apart', () => {
  const { inks, labels } = siteInks(siteMarks(places, flat(2)));
  const kinds = inks.map((ink) => ink.kind);
  assert.deepEqual(kinds.slice(0, 5), ['stroke', 'fill', 'stroke', 'fill', 'stroke'], 'the wall, then each section');
  assert.deepEqual(kinds.slice(5), ['disc', 'ring', 'disc', 'ring', 'disc', 'ring']);
  assert.equal(inks[1]?.colour, '#5cc96b30', 'a section is washed in its colour');
  assert.deepEqual(
    labels.map((label) => [label.text, label.anchor]),
    [
      ['Overlook', 'middle'],
      ['Downs', 'middle'],
      ['Maw', 'middle'],
    ],
  );
});

test('no name is laid over a box kept clear, such as the 3D scale cues', () => {
  const marks = siteMarks(places, flat(2), [], [{ left: 4900, top: 4900, right: 5100, bottom: 5100 }]);
  const names = marks.flatMap((mark) => (mark.shape === 'label' ? [mark.text] : []));
  assert.deepEqual(names, ['Downs', 'Maw']);
});

test('3D: a point far off the screen is not drawn, so no line runs out to it', () => {
  const view = {
    leftM: 0,
    topM: 0,
    cellM: 1000,
    width: 2,
    height: 2,
    heights: new Float32Array(4),
  } as unknown as LandView;
  const orbit = fitOrbit(2000, 2000, 1);
  const project = groundProjector(view, orbit, { width: 800, height: 800 }, 1);
  assert.ok(project(1000, 1000), 'the target is drawn');
  // Sideways along the screen, at the target's depth: a hundred kilometres is screens away.
  assert.equal(project(1000 + 100_000 * Math.cos(orbit.yaw), 1000 + 100_000 * Math.sin(orbit.yaw)), null);
});
