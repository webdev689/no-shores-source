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
  easedNote,
  easedPace,
  roomWords,
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
  type SailedPace,
  timeText,
  WORLD_PACE,
  paceToAskAgain,
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

test("ships are drawn at the Overworld's scale on the sea's view and at their own on the view near it", () => {
  assert.equal(shownScale(SEA_SCALE, { seaM: 380, shownM: 380, nearM: 35, share: 0 }), SEA_SCALE);
  assert.equal(shownScale(SEA_SCALE, { seaM: 380, shownM: 35, nearM: 35, share: 1 }), 1, 'close in, its own size');
  assert.equal(shownScale(SEA_SCALE, { seaM: 240, shownM: 180, nearM: 180, share: 1 }), 1, 'a near view far off it');
});

test("coming in it grows on the screen by the same ratio each step, from the sea's size to its own", () => {
  for (const [seaM, nearM] of [
    [380, 35],
    [240, 35],
    [240, 180],
  ] as const) {
    const [seaFilled, ownFilled] = [SEA_SCALE / seaM, 1 / nearM];
    let last = seaFilled;
    for (let step = 1; step <= 100; step++) {
      const share = step / 100;
      const shownM = seaM + (nearM - seaM) * share;
      const scale = shownScale(SEA_SCALE, { seaM, shownM, nearM, share });
      const filled = scale / shownM;
      assert.ok(scale >= 1, `${scale} times its size`);
      const even = seaFilled * (ownFilled / seaFilled) ** share;
      assert.ok(Math.abs(filled - Math.max(even, 1 / shownM)) < 1e-12, `${seaM} m: ${filled} at ${share}`);
      // A near view that shows it smaller at its own size than the sea's: it eases to it, never under its size.
      if (ownFilled >= seaFilled) assert.ok(filled > last, `${seaM} m: shrank at ${share}`);
      else assert.ok(filled <= last * (1 + 1e-12), `${seaM} m: grew at ${share}`);
      last = filled;
    }
  }
});

test('down to the helm it grows from the size the sea shows it to its own size at the wheel', () => {
  const ship = { x: 1000, y: 2000, heading: 0.4, scale: 1, heave: 0, pitch: 0, roll: 0 };
  const sea: Shot = { eye: [1150, 2260, 150], yaw: 2.6, pitch: 0.52, fov: 1.13, near: 2, far: 60_000 };
  const helm: Shot = { eye: helmEye(ship), yaw: ship.heading, pitch: HELM.pitch, fov: 1.13, near: 0.3, far: 60_000 };
  const place = [ship.x, ship.y, 0] as const;
  const seaM = pictureAt(sea, place);
  let last = SEA_SCALE / seaM;
  for (let step = 1; step <= 50; step++) {
    const shown = panShot(sea, helm, step / 50);
    const shownM = pictureAt(shown, place);
    const scale = shownScale(SEA_SCALE, { seaM, shownM, nearM: pictureAt(helm, place), share: step / 50 });
    assert.ok(scale / shownM > last, `shrank at ${step / 50}`);
    last = scale / shownM;
  }
  assert.equal(last, 1 / pictureAt(helm, place), 'at the wheel, its own size');
});

test('at the helm the eye stands behind the wheel of the Sloop as it is drawn, riding the swell with it', () => {
  const heading = Math.PI / 2;
  const ship = { x: 1000, y: 2000, heading, pitch: 0, roll: 0 };
  const aft = SLOOP_DECK.helm[1];
  const [x, y, z] = helmEye({ ...ship, scale: 1, heave: 0.25 });
  assert.ok(Math.abs(x - (1000 - aft)) < 1e-9, 'aft of its middle at its helm spot, against its heading east');
  assert.ok(Math.abs(y - 2000) < 1e-9);
  assert.equal(z, HELM.eyeM + 0.25);
  assert.equal(HELM.eyeM, (cellHeight(SLOOP_DECK, ...SLOOP_DECK.helm) ?? NaN) + STANDING_EYE_M, 'a standing eye');
  const [drawnX, , drawnZ] = helmEye({ ...ship, scale: 12, heave: 0 });
  assert.ok(Math.abs(drawnX - (1000 - aft * 12)) < 1e-9, 'on the larger Sloop, its helm further aft');
  assert.equal(drawnZ, HELM.eyeM * 12);
});

test("the page sails its ship at the room's pace and draws it to where the room has it, its own till then", () => {
  const voyage = voyageOf([
    [0, 0],
    [0, -100_000],
  ]);
  assert.equal(followed(voyage, 1_000, 1, 60, null), 1_000 + SHIP_SPEED * 60, 'no word yet: its own ×60');
  const held = { x: 0, y: -1_000 - SHIP_SPEED, pace: 1 };
  assert.equal(followed(voyage, 1_000, 1, 60, held), 1_000 + SHIP_SPEED, 'held by the room to x1, where it has it');
  const behind = { x: 0, y: -900, pace: 1 };
  const drawn = followed(voyage, 1_000, 0.1, 60, behind);
  assert.ok(drawn < 1_000 && drawn > 900, `drawn back toward the room's place: ${drawn}`);
  assert.equal(heldNote(60, held), ' · Held to ×1: a hostile ship near');
  assert.equal(heldNote(60, { ...held, pace: 60 }), '', 'sailing at its own pace, nothing to say');
  assert.equal(heldNote(60, null), '');
  const torn = { x: 0, y: -1_000 - SHIP_SPEED * 0.6, pace: 1 };
  const sailedOn = followed(voyage, 1_000, 1, 60, torn, null, 0.6);
  assert.ok(Math.abs(sailedOn - (1_000 + SHIP_SPEED * 0.6)) < 1e-9, `at the way its canvas leaves: ${sailedOn}`);
});

test("the pace eases down DFO's ladder from the pace set to the world's own time, and back up to it", () => {
  const down: number[] = [];
  for (let pace: SailedPace = 100; pace !== WORLD_PACE;) down.push((pace = easedPace(pace, 100, true)));
  assert.deepEqual(down, [60, 40, 30, 20, 10, 5, 1]);
  const up: number[] = [];
  for (let pace: SailedPace = WORLD_PACE; pace !== 30;) up.push((pace = easedPace(pace, 30, false)));
  assert.deepEqual(up, [5, 10, 20, 30], 'back up no further than the pace set');
  assert.equal(easedPace(30, 30, false), 30, 'at the pace set, it stays');
  assert.equal(easedPace(WORLD_PACE, 30, true), WORLD_PACE, "at the world's own time, it stays");
  assert.equal(easedNote(WORLD_PACE, 60), ' · Sailing at true speed while you watch close.');
  assert.equal(easedNote(60, 60), '');
});

test("at the world's own time, with no word from the room, it sails at its true speed", () => {
  const voyage = voyageOf([
    [0, 0],
    [0, -10_000],
  ]);
  assert.equal(followed(voyage, 1_000, 1, WORLD_PACE, null), 1_000 + SHIP_SPEED, '12 m a second');
  const easing = followed(voyage, 1_000, 1, WORLD_PACE, null, 40);
  assert.equal(easing, 1_000 + SHIP_SPEED * 40, 'until the room takes the eased course, at the pace it sails it at');
  assert.equal(heldNote(WORLD_PACE, { x: 0, y: 0, pace: WORLD_PACE }), '', 'eased for the view, not held by a hostile');
});

test('the page asks a pace again where the room sails it otherwise, but not where a hostile ship holds it', () => {
  const room = (pace: number) => ({ x: 0, y: 0, pace });
  const reach = 1_642.8;
  assert.equal(paceToAskAgain(1, null, [], reach), false, 'no word yet');
  assert.equal(paceToAskAgain(1, room(0), [], reach), false, 'at rest');
  assert.equal(paceToAskAgain(1, room(1), [], reach), false, 'they agree');
  assert.equal(paceToAskAgain(1, room(5), [], reach), true, 'a step down refused');
  assert.equal(paceToAskAgain(60, room(40), [], reach), true, 'a step up refused, no hostile ship near');
  assert.equal(paceToAskAgain(60, room(5), [{ x: 1_500, y: 0 }], reach), false, 'held by a hostile ship near');
  assert.equal(paceToAskAgain(1, room(5), [{ x: 1_500, y: 0 }], reach), true, 'faster than asked is never a hold');
  assert.equal(paceToAskAgain(60, room(40), [{ x: reach + 1, y: 0 }], reach), true, 'one past the hold’s reach');
  assert.equal(paceToAskAgain(60, room(5), [{ x: 1_500, y: 0 }], 1_000), true, 'the reach is the rules’');
});

test('the sea’s note speaks of its room only when the link is lost or being joined again, never of a player number', () => {
  assert.equal(roomWords({ rejoining: false }, false), '');
  assert.equal(roomWords({ rejoining: true }, false), ' · Reconnecting…');
  assert.equal(roomWords(null, true), ' · The sea room was lost: sailing on alone');
  assert.equal(roomWords(null, false), '');
});
