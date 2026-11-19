import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SHIP_SPEED, voyageOf } from '../overworld/voyage.ts';
import { cellHeight, SLOOP_DECK } from '../ships/deck.ts';
import { panShot, type Shot } from './camera.ts';
import {
  continentToOpen,
  courseAhead,
  declutter,
  DOCK_REACH_M,
  followed,
  heldNote,
  HELM,
  helmEye,
  landfallOf,
  namesShown,
  OFFSHORE,
  offshore,
  pictureAt,
  shownScale,
  STANDING_EYE_M,
  timeText,
} from './seaLaw.ts';

/** The Sloop drawn 75 m long on the sea's view. */
const SEA_SCALE = 75 / 18.6775;

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

test("ships are drawn at the Overworld's scale on the sea's view and at their own on the view near her", () => {
  assert.equal(shownScale(SEA_SCALE, { seaM: 380, shownM: 380, nearM: 35, share: 0 }), SEA_SCALE);
  assert.equal(shownScale(SEA_SCALE, { seaM: 380, shownM: 35, nearM: 35, share: 1 }), 1, 'close in, her own size');
  assert.equal(shownScale(SEA_SCALE, { seaM: 240, shownM: 180, nearM: 180, share: 1 }), 1, 'a near view far off her');
});

test('coming in she never shrinks on the screen, nor looms past her size once her size shows her as large', () => {
  for (const [seaM, nearM] of [
    [380, 35],
    [240, 35],
    [240, 180],
  ] as const) {
    const ownSizeFrom = seaM / SEA_SCALE;
    let last = SEA_SCALE / seaM;
    for (let step = 0; step <= 100; step++) {
      const share = step / 100;
      const shownM = seaM + (nearM - seaM) * share;
      const scale = shownScale(SEA_SCALE, { seaM, shownM, nearM, share });
      const filled = scale / shownM;
      assert.ok(scale >= 1 && scale <= SEA_SCALE, `${scale} times her size`);
      if (nearM <= ownSizeFrom) assert.ok(filled >= last * (1 - 1e-12), `${seaM} m: shrank at ${share}`);
      // A near view that shows her smaller at her own size than the sea's: she eases to it, never under her size.
      else assert.ok(filled <= last * (1 + 1e-12) && filled >= 1 / shownM, `${seaM} m: grew at ${share}`);
      if (shownM <= ownSizeFrom) assert.equal(scale, 1, `${shownM} m: her size shows her as large`);
      last = filled;
    }
  }
});

test('down to the helm she is held at the size the sea shows her, then is her own size close by and at the wheel', () => {
  const ship = { x: 1000, y: 2000, heading: 0.4, scale: 1, heave: 0, pitch: 0, roll: 0 };
  const sea: Shot = { eye: [1150, 2260, 150], yaw: 2.6, pitch: 0.52, fov: 1.13, near: 2, far: 60_000 };
  const helm: Shot = { eye: helmEye(ship), yaw: ship.heading, pitch: HELM.pitch, fov: 1.13, near: 0.3, far: 60_000 };
  const her = [ship.x, ship.y, 0] as const;
  const seaM = pictureAt(sea, her);
  let last = SEA_SCALE / seaM;
  for (let step = 0; step <= 50; step++) {
    const shown = panShot(sea, helm, step / 50);
    const shownM = pictureAt(shown, her);
    const scale = shownScale(SEA_SCALE, { seaM, shownM, nearM: pictureAt(helm, her), share: step / 50 });
    assert.ok(scale / shownM >= last * (1 - 1e-12), `shrank at ${step / 50}`);
    if (shownM * SEA_SCALE <= seaM) assert.equal(scale, 1, `looms ${scale} times at ${shownM} m`);
    last = scale / shownM;
  }
});

test('at the helm the eye stands behind the wheel of the Sloop as she is drawn, riding the swell with her', () => {
  const heading = Math.PI / 2;
  const ship = { x: 1000, y: 2000, heading, pitch: 0, roll: 0 };
  const aft = SLOOP_DECK.helm[1];
  const [x, y, z] = helmEye({ ...ship, scale: 1, heave: 0.25 });
  assert.ok(Math.abs(x - (1000 - aft)) < 1e-9, 'aft of her middle at her helm spot, against her heading east');
  assert.ok(Math.abs(y - 2000) < 1e-9);
  assert.equal(z, HELM.eyeM + 0.25);
  assert.equal(HELM.eyeM, (cellHeight(SLOOP_DECK, ...SLOOP_DECK.helm) ?? NaN) + STANDING_EYE_M, 'a standing eye');
  const [drawnX, , drawnZ] = helmEye({ ...ship, scale: 12, heave: 0 });
  assert.ok(Math.abs(drawnX - (1000 - aft * 12)) < 1e-9, 'on the larger Sloop, its helm further aft');
  assert.equal(drawnZ, HELM.eyeM * 12);
});

test("the page sails its ship at the room's pace and draws her to where the room has her, the dial's till then", () => {
  const voyage = voyageOf([
    [0, 0],
    [0, -100_000],
  ]);
  assert.equal(followed(voyage, 1_000, 1, 60, null), 1_000 + SHIP_SPEED * 60, "no word yet: the dial's x60");
  const held = { x: 0, y: -1_000 - SHIP_SPEED, pace: 1 };
  assert.equal(followed(voyage, 1_000, 1, 60, held), 1_000 + SHIP_SPEED, 'held by the room to x1, where it has her');
  const behind = { x: 0, y: -900, pace: 1 };
  const drawn = followed(voyage, 1_000, 0.1, 60, behind);
  assert.ok(drawn < 1_000 && drawn > 900, `drawn back toward the room's place: ${drawn}`);
  assert.equal(heldNote(60, held), ' · Held to ×1: a pirate near');
  assert.equal(heldNote(60, { ...held, pace: 60 }), '', 'sailing at the dial, nothing to say');
  assert.equal(heldNote(60, null), '');
});
