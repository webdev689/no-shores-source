import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Shot } from '../camera.ts';
import welcome from '../../../../content/story/welcome.json' with { type: 'json' };
import { facesShot } from './framing.ts';
import { FLY_S, TOUR, StrangerWelcome } from './tour.ts';

const GROUND = 30;
/** The player's own view, behind them on the plaza. */
const OWN: Shot = { eye: [1000, 2030, GROUND + 3], yaw: 0, pitch: 0.2, fov: 1, near: 0.1, far: 3000 };
const STEP_S = 1 / 30;

test('the stranger speaks of the world, then bids farewell, and names no place for the camera to fly to', () => {
  assert.deepEqual(
    TOUR.map((step) => step.scene),
    ['strangerHistory', 'strangerFarewell'],
  );
});

test('every scene of the welcome is one of hers, said in turn, and no other is kept', () => {
  assert.deepEqual(Object.keys(welcome.scenes).sort(), TOUR.map((step) => step.scene).sort());
});

test('her words point at no sight the welcome no longer shows: no stall named, no Aurem given', () => {
  const lines = Object.values(welcome.scenes).flatMap((scene) => scene.map((line) => line.say));
  for (const line of lines) assert.doesNotMatch(line, /Aurem|smith|Mage|Vault|Tailor|Tack|Postmaster|Harbour|Hall/);
  assert.match(lines.at(-1) ?? '', /gift/, 'her farewell sends the player to the keepers and their gifts');
});

/** Her feet and the player's as she speaks. */
const FACES = { stranger: [1000, 2027.8, GROUND] as const, player: [1000, 2030, GROUND] as const };

/** A welcome, each scene it says written down and finished as `finish` is called. */
function welcomeOn() {
  const said: string[] = [];
  const finishes: (() => void)[] = [];
  let heard = 0;
  const welcome = new StrangerWelcome([], {
    play: (scene) => new Promise<void>((finish) => (said.push(scene), finishes.push(finish))),
    heard: () => void (heard += 1),
    faces: () => FACES,
  });
  return { welcome, said, finish: () => finishes.shift()?.(), heard: () => heard };
}

const settled = () => new Promise((resolve) => setImmediate(resolve));
const near = (one: Shot, two: Shot) => Math.hypot(...one.eye.map((each, axis) => each - (two.eye[axis] ?? 0))) < 1e-6;
/** The view after a whole flight's frames. */
function flown(welcome: StrangerWelcome): Shot {
  let shot = welcome.shot(OWN, STEP_S);
  for (let time = STEP_S; time < FLY_S + 0.2; time += STEP_S) shot = welcome.shot(OWN, STEP_S);
  return shot;
}

test("the view comes to the pair face to face, holds there through both scenes, then goes back to the player's own", async () => {
  const { welcome, said, finish, heard } = welcomeOn();
  assert.equal(welcome.holding, false, 'the keys are the player’s until she speaks');
  const run = welcome.run();
  await settled();
  const pair = facesShot(OWN, FACES.stranger, FACES.player, []);
  for (const step of TOUR) {
    assert.equal(said.at(-1), step.scene);
    assert.ok(near(flown(welcome), pair), `${step.scene}: the view held on the pair`);
    assert.ok(welcome.holding, "the player's keys are held while she speaks");
    finish();
    await settled();
  }
  await run;
  assert.equal(heard(), 1, 'her task asked heard once, after her farewell');
  assert.equal(welcome.holding, true, 'the keys held while the view eases back');
  const back = flown(welcome);
  assert.equal(welcome.holding, false, "the keys are the player's again");
  assert.ok(near(back, OWN), "the view is the player's");
});

test('a flight is eased: it leaves slowly, and is half way at half its time', async () => {
  const { welcome } = welcomeOn();
  void welcome.run();
  await settled();
  const pair = facesShot(OWN, FACES.stranger, FACES.player, []);
  const first = welcome.shot(OWN, STEP_S);
  const away = (shot: Shot) => Math.hypot(...shot.eye.map((each, axis) => each - (OWN.eye[axis] ?? 0)));
  const whole = away(pair);
  assert.ok(away(first) < whole * 0.01, 'barely moved after a frame');
  let shot = first;
  for (let time = STEP_S; time < FLY_S / 2 - 1e-9; time += STEP_S) shot = welcome.shot(OWN, STEP_S);
  assert.ok(Math.abs(away(shot) / whole - 0.5) < 0.1, `half way at half the time: ${away(shot) / whole}`);
});

test('with no pair to see the view stays the player’s, and her words are still said', async () => {
  const said: string[] = [];
  const welcome = new StrangerWelcome([], {
    play: (scene) => (said.push(scene), Promise.resolve()),
    heard: () => undefined,
    faces: () => null,
  });
  const run = welcome.run();
  assert.ok(near(flown(welcome), OWN));
  await run;
  assert.deepEqual(
    said,
    TOUR.map((step) => step.scene),
  );
});

test('the player leaving ends the welcome where it is, the keys given back and nothing asked of the room', async () => {
  const { welcome, finish, heard } = welcomeOn();
  const run = welcome.run();
  await settled();
  welcome.end();
  finish();
  await run;
  assert.equal(welcome.holding, false);
  assert.equal(heard(), 0);
  assert.ok(near(welcome.shot(OWN, STEP_S), OWN));
});
