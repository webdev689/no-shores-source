import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Shot, onScreen } from '../camera.ts';
import type { StationInfo } from '../nodes.ts';
import welcome from '../../../../content/story/welcome.json' with { type: 'json' };
import { STATIONS } from './plazaForTests.ts';
import { FLY_S, TOUR, StrangerWelcome, framing } from './tour.ts';

const VIEW = { width: 1600, height: 900 };
/** The plaza's stations with the Postmaster's counter in the watch court, seaward of the middle. */
const PLAZA: StationInfo[] = [...STATIONS, { kind: 'mail', keeper: [960, 2012], counter: [961.8, 2012] }];
const GROUND = 30;
const ground = () => GROUND;
/** The player's own view, behind them on the plaza. */
const OWN: Shot = { eye: [1000, 2030, GROUND + 3], yaw: 0, pitch: 0.2, fov: 1, near: 0.1, far: 3000 };
const STEP_S = 1 / 30;

test('the stranger speaks of the world, then names each place in turn, and last bids farewell', () => {
  assert.deepEqual(
    TOUR.map((step) => [step.scene, step.kinds]),
    [
      ['strangerHistory', []],
      ['tourSmiths', ['armorsmith', 'weaponsmith']],
      ['tourMage', ['mage']],
      ['tourVault', ['vault']],
      ['tourTailor', ['tailor']],
      ['tourTack', ['tack']],
      ['tourPost', ['mail']],
      ['tourHarbour', ['harbourmaster']],
      ['tourHall', ['stormcallers', 'lamplighters', 'veiled']],
      ['strangerFarewell', []],
    ],
  );
});

test('every scene of the welcome is one of hers, said in turn, and no other is kept', () => {
  assert.deepEqual(Object.keys(welcome.scenes).sort(), TOUR.map((step) => step.scene).sort());
});

test("each place is framed from above, on the plaza's side of its counters, every one of them in the view", () => {
  for (const step of TOUR.filter((each) => each.kinds.length > 0)) {
    const shot = framing(PLAZA, step.kinds, OWN, ground, step.high);
    assert.ok(shot, step.scene);
    assert.ok(shot.eye[2] >= GROUND + 6, `${step.scene} seen from a height`);
    assert.ok(shot.pitch > 0.2 && shot.pitch < 0.8, `${step.scene} looks down at its counters`);
    for (const kind of step.kinds) {
      const counter = PLAZA.filter((station) => station.kind === kind).map((station) => station.counter);
      const seen = counter.some(([x, y]) => {
        const shown = onScreen(shot, VIEW, [x, y, GROUND + 1]);
        return shown !== null && shown[0] > 0 && shown[0] < VIEW.width && shown[1] > 0 && shown[1] < VIEW.height;
      });
      assert.ok(seen, `${kind} in the view of ${step.scene}`);
    }
  }
  assert.equal(framing(PLAZA, ['chapel of nobody'], OWN, ground), null, 'none where no counter stands');
  // The houses' chapels stand inside the Hall of the Arts: it is seen from high over its roof.
  const hall = TOUR.find((step) => step.scene === 'tourHall');
  assert.equal(hall?.high, true);
  const over = framing(PLAZA, hall?.kinds ?? [], OWN, ground, true);
  assert.ok(over && over.eye[2] >= GROUND + 30, 'high over the Hall');
  const hallMiddle = PLAZA.filter((station) => hall?.kinds.includes(station.kind))[0]?.counter ?? [0, 0];
  const toward = (point: readonly number[]) => Math.hypot((point[0] ?? 0) - OWN.eye[0], (point[1] ?? 0) - OWN.eye[1]);
  assert.ok(over && toward(over.eye) < toward(hallMiddle), "seen from the player's side, clear of its walls");
  // A group is framed round its first counter: another of a kind nearer the player but far from it is passed over.
  const far: StationInfo = { kind: 'weaponsmith', keeper: [1000, 2040], counter: [1000, 2038] };
  const pair = framing([...PLAZA, far], ['armorsmith', 'weaponsmith'], OWN, ground);
  assert.deepEqual(pair, framing(PLAZA, ['armorsmith', 'weaponsmith'], OWN, ground));
});

/** A welcome over the plaza, each scene it says written down and finished at once, unless `hold` keeps them. */
function welcomeOn(stations: readonly StationInfo[] = PLAZA) {
  const said: string[] = [];
  const finishes: (() => void)[] = [];
  let gifts = 0;
  const welcome = new StrangerWelcome(stations, ground, {
    play: (scene) => new Promise<void>((finish) => (said.push(scene), finishes.push(finish))),
    gift: () => void (gifts += 1),
  });
  return { welcome, said, finish: () => finishes.shift()?.(), gifts: () => gifts };
}

const settled = () => new Promise((resolve) => setImmediate(resolve));
const near = (one: Shot, two: Shot) => Math.hypot(...one.eye.map((each, axis) => each - (two.eye[axis] ?? 0))) < 1e-6;

test("the camera flies to each place as she names it, holds there while she speaks, and comes back to the player's own view", async () => {
  const { welcome, said, finish, gifts } = welcomeOn();
  assert.equal(welcome.holding, false, 'the keys are the player’s until she speaks');
  const run = welcome.run();
  await settled();
  for (const step of TOUR) {
    assert.equal(said.at(-1), step.scene);
    const framed = step.kinds.length > 0 ? framing(PLAZA, step.kinds, OWN, ground, step.high) : null;
    let shot = welcome.shot(OWN, STEP_S);
    for (let flown = 0; flown < FLY_S + 0.2; flown += STEP_S) shot = welcome.shot(OWN, STEP_S);
    assert.ok(near(shot, framed ?? OWN), `${step.scene}: the view held on ${framed ? 'its place' : 'the player'}`);
    assert.ok(welcome.holding, "the player's keys are held while she speaks");
    finish();
    await settled();
  }
  await run;
  assert.equal(gifts(), 1, 'her gift given once, after her farewell');
  assert.equal(welcome.holding, false, "the keys are the player's again");
  assert.ok(near(welcome.shot(OWN, STEP_S), OWN), "the view is the player's");
});

test('a flight is eased: it leaves slowly, and is half way at half its time', async () => {
  const { welcome, finish } = welcomeOn();
  void welcome.run();
  await settled();
  finish();
  await settled();
  const framed = framing(PLAZA, TOUR[1]?.kinds ?? [], OWN, ground);
  assert.ok(framed);
  const first = welcome.shot(OWN, STEP_S);
  const away = (shot: Shot) => Math.hypot(...shot.eye.map((each, axis) => each - (OWN.eye[axis] ?? 0)));
  const whole = away(framed);
  assert.ok(away(first) < whole * 0.01, 'barely moved after a frame');
  let shot = first;
  for (let flown = STEP_S; flown < FLY_S / 2 - 1e-9; flown += STEP_S) shot = welcome.shot(OWN, STEP_S);
  assert.ok(Math.abs(away(shot) / whole - 0.5) < 0.1, `half way at half the time: ${away(shot) / whole}`);
});

test('a place the plaza lacks is passed over with the view kept where it is, and her words still said', async () => {
  const { welcome, said, finish } = welcomeOn(PLAZA.filter((station) => station.kind !== 'mail'));
  const run = welcome.run();
  for (let step = 0; step < TOUR.length; step++) {
    await settled();
    finish();
  }
  await run;
  assert.deepEqual(
    said,
    TOUR.map((step) => step.scene),
  );
});

test('the player leaving ends the welcome where it is, the keys given back and no gift from the page', async () => {
  const { welcome, finish, gifts } = welcomeOn();
  const run = welcome.run();
  await settled();
  welcome.end();
  finish();
  await run;
  assert.equal(welcome.holding, false);
  assert.equal(gifts(), 0);
  assert.ok(near(welcome.shot(OWN, STEP_S), OWN));
});
