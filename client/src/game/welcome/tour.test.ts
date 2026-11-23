import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Shot } from '../camera.ts';
import type { StationInfo } from '../nodes.ts';
import welcome from '../../../../content/story/welcome.json' with { type: 'json' };
import { STATIONS } from './plazaForTests.ts';
import { counterShot, facesShot, hallShot } from './framing.ts';
import { FLY_S, TOUR, StrangerWelcome, type TourStep } from './tour.ts';

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
      ['tourHall', ['stormcallers', 'veiled', 'lamplighters']],
      ['tourHallStorm', ['stormcallers']],
      ['tourHallVeiled', ['veiled']],
      ['tourHallLamps', ['lamplighters']],
      ['strangerFarewell', []],
    ],
  );
});

test('every scene of the welcome is one of hers, said in turn, and no other is kept', () => {
  assert.deepEqual(Object.keys(welcome.scenes).sort(), TOUR.map((step) => step.scene).sort());
});

/** Her feet and the player's as she bids farewell. */
const FACES = { stranger: [1000, 2027.8, GROUND] as const, player: [1000, 2030, GROUND] as const };
/** Where the camera stands for a step over the plaza, as `framing.ts` has it; null for the player's own view. */
function framed(step: TourStep, stations: readonly StationInfo[] = PLAZA): Shot | null {
  const place = { stations, groundAt: ground, blocks: [] };
  if (step.faces) return facesShot(OWN, FACES.stranger, FACES.player, []);
  if (step.kinds.length === 0) return null;
  return (step.hall ? hallShot : counterShot)(place, step.kinds, OWN);
}

/** A welcome over the plaza, each scene it says written down and finished at once, unless `hold` keeps them. */
function welcomeOn(stations: readonly StationInfo[] = PLAZA) {
  const said: string[] = [];
  const finishes: (() => void)[] = [];
  let gifts = 0;
  const welcome = new StrangerWelcome(
    { stations, groundAt: ground, blocks: [] },
    {
      play: (scene) => new Promise<void>((finish) => (said.push(scene), finishes.push(finish))),
      gift: () => void (gifts += 1),
      faces: () => FACES,
    },
  );
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
    const there = framed(step);
    let shot = welcome.shot(OWN, STEP_S);
    for (let flown = 0; flown < FLY_S + 0.2; flown += STEP_S) shot = welcome.shot(OWN, STEP_S);
    assert.ok(near(shot, there ?? OWN), `${step.scene}: the view held on ${there ? 'its place' : 'the player'}`);
    assert.ok(welcome.holding, "the player's keys are held while she speaks");
    finish();
    await settled();
  }
  await run;
  assert.equal(gifts(), 1, 'her gift given once, after her farewell');
  assert.equal(welcome.holding, true, 'the keys held while the view eases back');
  let shot = welcome.shot(OWN, STEP_S);
  for (let flown = STEP_S; flown < FLY_S + 0.2; flown += STEP_S) shot = welcome.shot(OWN, STEP_S);
  assert.equal(welcome.holding, false, "the keys are the player's again");
  assert.ok(near(shot, OWN), "the view is the player's");
});

test('a flight is eased: it leaves slowly, and is half way at half its time', async () => {
  const { welcome, finish } = welcomeOn();
  void welcome.run();
  await settled();
  finish();
  await settled();
  const smiths = framed(TOUR[1] as TourStep);
  assert.ok(smiths);
  const first = welcome.shot(OWN, STEP_S);
  const away = (shot: Shot) => Math.hypot(...shot.eye.map((each, axis) => each - (OWN.eye[axis] ?? 0)));
  const whole = away(smiths);
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
