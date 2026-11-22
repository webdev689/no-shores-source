import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LayoutMarks } from '../terrain/layoutMarks.ts';
import { layoutMarks } from './layoutDrawing.ts';
import { Labels, type Project } from './screenMarks.ts';

const DOWNS: LayoutMarks = {
  id: 'downs',
  kind: 'patrol',
  name: 'Downs',
  ring: [
    [0, 0],
    [1000, 0],
    [1000, 1000],
    [0, 1000],
  ],
  areas: [
    { kind: 'hamlet', name: 'Saltgrass', at: [300, 300], radius: 150 },
    { kind: 'gate', name: '', at: [900, 900], radius: 40, leadsTo: 'burned-mill' },
  ],
  paths: [
    {
      tier: 'track',
      points: [
        [300, 300],
        [900, 900],
      ],
      heights: [5, 6],
    },
    {
      tier: 'footpath',
      points: [
        [300, 300],
        [300, 900],
      ],
      heights: [5, 7],
    },
  ],
  sites: [
    { kind: 'gate', at: [900, 900], radius: 40, holds: 'burned-mill' },
    { kind: 'resource', at: [500, 500], radius: 4, holds: 'brineglass' },
    { kind: 'event', at: [300, 300], radius: 60 },
    { kind: 'foes', at: [300, 300], radius: 60 },
  ],
  runs: [],
};

/** A 2D map `metresPerPixel` metres a pixel. */
const map =
  (metresPerPixel: number): Project =>
  (x, y) => ({ x: x / metresPerPixel, y: y / metresPerPixel });

test('a layout too small on screen draws nothing: its node already shows as a dot or an outline', () => {
  const labels = new Labels();
  const drawn = layoutMarks([DOWNS], map(100), labels);
  assert.deepEqual(drawn, { below: [], dots: [] });
  assert.deepEqual(labels.marks, []);
});

test('close, a layout draws its section ring, its areas, its paths by width and its sites, with names', () => {
  const labels = new Labels();
  const drawn = layoutMarks([DOWNS], map(1), labels);
  const lines = drawn.below.filter((mark) => mark.shape === 'line');
  // Two areas, two paths, the ring, and the event's and the foes' rings round the hamlet's middle, under its name.
  assert.equal(lines.length, 7);
  const widths = lines.flatMap((mark) => (mark.shape === 'line' && mark.casing ? [mark.width] : []));
  assert.deepEqual(widths, [4.5, 2.6], 'a track is drawn wider than a footpath, at their widths in metres');
  assert.equal(drawn.dots.length, 2, 'the gate and the resource');
  const names = labels.marks.flatMap((mark) => (mark.shape === 'label' ? [mark.text] : []));
  assert.ok(names.includes('Saltgrass · hamlet'));
  assert.ok(names.includes('Gate to burned-mill'));
  assert.ok(names.includes('brineglass'));
});

test('from afar a path keeps a width that is seen, a track wider than a footpath', () => {
  const drawn = layoutMarks([DOWNS], map(8), new Labels());
  const widths = drawn.below.flatMap((mark) => (mark.shape === 'line' && mark.casing ? [mark.width] : []));
  assert.deepEqual(widths, [2.5, 1.5]);
});

test('3D: a path stands at its laid heights, and the rest on the ground', () => {
  const asked: (number | undefined)[] = [];
  const project: Project = (x, y, height) => {
    asked.push(height);
    return { x, y };
  };
  layoutMarks([DOWNS], project, new Labels());
  assert.ok(asked.includes(5) && asked.includes(7));
  assert.ok(asked.includes(undefined));
});

test('a run is drawn along its line, its beats as rings and its door as a dot, and named by what it is', () => {
  const run = {
    name: 'The Chalk Adit',
    kind: 'mine',
    place: 'rock',
    line: [
      [200, 200],
      [260, 260],
      [320, 300],
    ] as [number, number][],
    beats: [{ at: [260, 260] as [number, number], radius: 20 }],
    door: [340, 310] as [number, number],
  };
  const labels = new Labels();
  const plain = layoutMarks([DOWNS], map(1), new Labels());
  const drawn = layoutMarks([{ ...DOWNS, runs: [run] }], map(1), labels);
  assert.equal(drawn.below.length, plain.below.length + 2, 'its line and its beat');
  assert.equal(drawn.dots.length, plain.dots.length + 1, 'its door');
  const names = labels.marks.flatMap((mark) => (mark.shape === 'label' ? [mark.text] : []));
  assert.ok(names.includes('The Chalk Adit · mine'));
});
