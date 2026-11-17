import assert from 'node:assert/strict';
import { test } from 'node:test';
import { voyageOf } from '../overworld/voyage.ts';
import { SLOOP_DECK } from '../ships/deck.ts';
import {
  continentToOpen,
  courseAhead,
  declutter,
  DOCK_REACH_M,
  HELM,
  helmEye,
  shownScale,
  landfallOf,
  namesShown,
  OFFSHORE,
  offshore,
  timeText,
} from './seaLaw.ts';

/** Land west of x = 1000, the sea shelving away east of it: 1 m down a metre. */
const shore = (x: number) => (x < 1000 ? 10 : 1000 - x);

test('a ship lies off the harbour, out past the shore to deep water and a stretch beyond', () => {
  const [x, y] = offshore((east) => shore(east), [0, 500], [900, 500]);
  assert.equal(y, 500);
  const deep = 1000 + OFFSHORE.depthM;
  assert.ok(x >= deep + OFFSHORE.clearM && x <= deep + OFFSHORE.clearM + OFFSHORE.stepM, `${x}`);
});

test('with no water that way, the ship lies at the harbour itself', () => {
  assert.deepEqual(
    offshore(() => 50, [0, 0], [100, 0]),
    [100, 0],
  );
});

const square = (west: number, north: number, side: number) =>
  [
    [west, north],
    [west + side, north],
    [west + side, north + side],
    [west, north + side],
  ] as const;

test("another continent opens once the ship is nearer its coast than the open one's, within reach", () => {
  const continents = [
    { id: 'home', outline: square(0, 0, 100_000) },
    { id: 'far', outline: square(300_000, 0, 100_000) },
  ];
  assert.equal(continentToOpen([150_000, 50_000], continents, 'home'), null, 'still nearer home');
  assert.equal(continentToOpen([260_000, 50_000], continents, 'home'), 'far');
  assert.equal(continentToOpen([260_000, 50_000], continents, 'far'), null, 'already open');
  assert.equal(continentToOpen([260_000, 50_000], continents, 'home', 10_000), null, 'out of reach');
});

test('the course still ahead is the route points past where the ship has come', () => {
  const voyage = voyageOf([
    [0, 0],
    [100, 0],
    [100, 100],
  ]);
  assert.deepEqual(courseAhead(voyage, 50), [
    [100, 0],
    [100, 100],
  ]);
  assert.deepEqual(courseAhead(voyage, 200), []);
});

test('time left reads in seconds, then minutes', () => {
  assert.equal(timeText(42.4), '42 s');
  assert.equal(timeText(0.2), '1 s');
  assert.equal(timeText(150), '3 min');
});

test('marks piled on one spot show the nearest, laid last; marks apart all show, farthest first', () => {
  const placed = [
    { id: 'far', x: 100, y: 100 },
    { id: 'apart', x: 300, y: 100 },
    { id: 'near', x: 110, y: 104 },
  ];
  assert.deepEqual(
    declutter(placed, 30).map((mark) => mark.id),
    ['apart', 'near'],
  );
});

test("a name that would print over a nearer mark's is left off; names apart all show", () => {
  const markAt = (id: string, x: number, y: number) => ({ id, name: 'Overlook', x, y, sizePx: 28 });
  const shown = namesShown([markAt('far', 100, 100), markAt('apart', 400, 100), markAt('near', 140, 104)]);
  assert.deepEqual([...shown].sort(), ['apart', 'near']);
});

test('off a coast the ship docks within reach of its harbour and goes ashore elsewhere; out of reach, neither', () => {
  const port = { name: 'Overlook', harbour: [0, 0] as const };
  assert.deepEqual(landfallOf([DOCK_REACH_M - 1, 0], true, port), { kind: 'dock', port: 'Overlook' });
  assert.deepEqual(landfallOf([DOCK_REACH_M + 1, 0], true, port), { kind: 'ashore' });
  assert.deepEqual(landfallOf([100, 0], true, null), { kind: 'ashore' });
  assert.equal(landfallOf([100, 0], false, port), null);
});

test("ships are drawn at the Overworld's scale on the sea's view and shrink to their own size at the helm", () => {
  assert.equal(shownScale(12, 0), 12);
  assert.equal(shownScale(12, 1), 1, 'at the wheel the Sloop is her true size');
  assert.equal(shownScale(12, 0.5), 6.5);
});

test('at the helm the eye stands behind the wheel of the Sloop as she is drawn, riding the swell with her', () => {
  const heading = Math.PI / 2;
  const ship = { x: 1000, y: 2000, heading };
  const aft = SLOOP_DECK.helm[1];
  const [x, y, z] = helmEye(ship, 1, 0.25);
  assert.ok(Math.abs(x - (1000 - aft)) < 1e-9, 'aft of her middle at her helm spot, against her heading east');
  assert.ok(Math.abs(y - 2000) < 1e-9);
  assert.equal(z, HELM.eyeM + 0.25);
  const [drawnX, , drawnZ] = helmEye(ship, 12, 0);
  assert.ok(Math.abs(drawnX - (1000 - aft * 12)) < 1e-9, 'on the larger Sloop, its helm further aft');
  assert.equal(drawnZ, HELM.eyeM * 12);
});
