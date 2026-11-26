import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GearAsk, GearState } from '../../network/gearMessages.ts';
import type { QuestState } from '../../network/questMessages.ts';
import { type Shot, onScreen } from '../camera.ts';
import type { Epilogue } from '../prologue/epilogue.ts';
import type { CardAt } from '../../player/cards.ts';
import { IDLE, type InputFrame } from '../../player/input.ts';
import { FIRELIGHT, type LampPlace } from '../../sky/lamps.ts';
import { AfterStory, clearOfEye, heldHud } from './afterStory.ts';
import { SOCIAL } from './plazaForTests.ts';
import { FLY_S, TOUR } from './tour.ts';

const VIEW = { width: 800, height: 600 };
const YOU = { x: 1000, y: 2030, z: 30, facing: Math.PI };
const OWN: Shot = { eye: [1000, 2034, 33], yaw: 0, pitch: 0.2, fov: 1, near: 0.1, far: 3000 };
const settled = () => new Promise((resolve) => setImmediate(resolve));

/** This room's gear for the player: claimed as theirs or not, and on the opening's first task (her task waiting) or
 *  past it. */
const gearOf = (claimed: boolean, waiting = true): GearState =>
  ({
    quest: { quest: 1, task: waiting ? 0 : 1, counts: [0], done: [], choices: [], at: null, claimed } as QuestState,
  }) as GearState;

/** A stranger's last moment that speaks her words as soon as it is framed, saying each scene until `finish`, and is
 *  done once they are said or the place is left; this room's gear as `gear` holds it. */
function story(gear: { now: GearState | null } = { now: gearOf(true) }) {
  const said: string[] = [];
  const finishes: (() => void)[] = [];
  let pressed = 0;
  let speaking = false;
  const epilogue = {
    done: false,
    where: { x: 1001.8, y: 2029, z: 30, facing: 0 },
    goingTo: [1000, 2000] as const,
    words: () => Promise.resolve(),
    say: (scene: string) => new Promise<void>((finish) => (said.push(scene), finishes.push(finish))),
    advance: () => void (pressed += 1),
    lamps: [] as readonly LampPlace[],
    light: (lamps: readonly LampPlace[]) => void (epilogue.lamps = lamps),
    leave: () => void (epilogue.done = true),
    frame: () => {
      if (!speaking) {
        speaking = true;
        void epilogue.words().then(() => (epilogue.done = true));
      }
      return [];
    },
  };
  const asks: string[] = [];
  const after = new AfterStory();
  after.storyEnded(epilogue as unknown as Epilogue);
  const ask = (asked: GearAsk) => void asks.push(`${asked.kind}:${asked.column ?? ''}`);
  const frame = (node = SOCIAL) =>
    after.frame(OWN, VIEW, 1 / 30, 0, YOU, false, { node, floor: () => 30, gear: gear.now, ask, blocks: [] });
  return { after, said, asks, frame, finish: () => finishes.shift()?.(), pressed: () => pressed, epilogue };
}

test('on arriving in Overlook the stranger says her welcome face to face, the keys held, then her task is heard', async () => {
  const { after, said, asks, frame, finish, pressed } = story();
  assert.equal(after.holding, false, 'the keys are the player’s before she speaks');
  frame();
  await settled();
  assert.equal(after.holding, true);
  after.press();
  assert.equal(pressed(), 1, 'Space moves her words on');
  for (const step of TOUR) {
    assert.equal(said.at(-1), step.scene);
    after.shot(OWN, FLY_S);
    const shot = after.shot(OWN, FLY_S);
    const pair = Math.hypot(shot.eye[0] - 1000.9, shot.eye[1] - 2029.5);
    assert.ok(pair > 7 && pair < 11, `${step.scene}: the view on the pair, from their side: ${pair}`);
    finish();
    await settled();
  }
  frame();
  assert.deepEqual(asks, ['64:18'], 'asked once, as she bids farewell');
  assert.equal(after.holding, false, "the keys are the player's again");
  assert.deepEqual(after.shot(OWN, FLY_S), OWN, 'the view is theirs');
  await settled();
  frame();
  assert.equal(after.past, true, 'she has gone');
});

test('leaving mid-welcome gives the view and the keys back at once, nothing asked', async () => {
  const { after, asks, frame, finish } = story();
  frame();
  await settled();
  finish();
  await settled();
  after.leave();
  assert.equal(after.holding, false);
  assert.deepEqual(after.shot(OWN, 1 / 30), OWN);
  finish();
  await settled();
  assert.deepEqual(asks, []);
  assert.equal(after.past, true);
});

test('nothing waits once the story has handed over no last moment', () => {
  const after = new AfterStory();
  after.storyEnded(null);
  assert.equal(after.past, true);
  assert.equal(after.holding, false);
  assert.deepEqual(after.shot(OWN, 1), OWN);
});

test('her task still waiting is asked heard only once this room holds the player’s own gear with it waiting', async () => {
  const gear: { now: GearState | null } = { now: null };
  const { after, asks, frame, finish } = story(gear);
  frame();
  await settled();
  after.leave();
  for (const now of [null, gearOf(false), gearOf(true, false)]) {
    gear.now = now;
    frame();
  }
  assert.deepEqual(asks, [], 'none before this room’s own word, nor a temporary character’s, nor one past her');
  finish();
  gear.now = gearOf(true);
  frame();
  frame();
  assert.deepEqual(asks, ['64:18'], 'once, when it is theirs and waits on her');
  frame(SOCIAL);
  const afield = { ...SOCIAL, kind: 'patrol' } as typeof SOCIAL;
  const other = story({ now: gearOf(true) });
  other.after.leave();
  other.frame(afield);
  assert.deepEqual(other.asks, [], 'only in a social space');
});

test('while she speaks the HUD of the player’s own play is hidden, the dialogue box left to her', () => {
  const shown: string[] = [];
  const hud = {
    strip: (strip: null) => void shown.push(`strip ${String(strip)}`),
    marks: (marks: readonly unknown[]) => void shown.push(`marks ${marks.length}`),
    tasks: { show: (quest: unknown) => void shown.push(`tracker ${String(quest)}`) },
  };
  const quiet = { ...hud, quiet: false };
  heldHud(quiet, { hideDisplay: () => void shown.push('bars and compass hidden') }, true);
  assert.deepEqual(shown.sort(), ['bars and compass hidden', 'marks 0', 'strip null', 'tracker null']);
  assert.equal(quiet.quiet, true, 'the use prompt, the toasts and a gate’s offer stand aside');
  shown.length = 0;
  heldHud(quiet, { hideDisplay: () => void shown.push('bars and compass hidden') }, false);
  assert.deepEqual(shown, [], 'once she is done the HUD is the game’s again');
  assert.equal(quiet.quiet, false);
});

test('the player is turned to face her as she speaks face to face, then the way she goes as she walks off, her first seconds of walk in the view over their shoulder', async () => {
  const { after, frame, finish } = story();
  frame();
  await settled();
  after.shot(OWN, 1 / 30);
  const her = after.takeTurn();
  assert.ok(her !== null && Math.abs(her - Math.atan2(1001.8 - YOU.x, YOU.y - 2029)) < 1e-9, 'turned to face her');
  assert.equal(after.takeTurn(), null, 'once as her first lines begin');
  for (let step = 0; step < TOUR.length; step++) {
    finish();
    await settled();
  }
  const yaw = after.takeTurn();
  assert.ok(yaw !== null, 'turned once her farewell is said');
  assert.equal(after.takeTurn(), null, 'once');
  // The arrival as Overlook lays it: the player faces the parapet, south, and the town's middle lies behind them.
  const forward = [Math.sin(yaw), -Math.cos(yaw)] as const;
  const eye = [YOU.x - forward[0] * 4.5, YOU.y - forward[1] * 4.5, YOU.z + 2.5] as const;
  const shoulder: Shot = { eye, yaw, pitch: 0.2, fov: 1, near: 0.1, far: 3000 };
  const [toX, toY] = [1000 - 1001.8, 2000 - 2029];
  const away = Math.hypot(toX, toY);
  for (let seconds = 0; seconds <= 3; seconds += 0.5) {
    const walked = 1.3 * seconds;
    const point = [1001.8 + (toX / away) * walked, 2029 + (toY / away) * walked, 30 + 1] as const;
    const spot = onScreen(shoulder, VIEW, point);
    assert.ok(spot && spot[0] > 0 && spot[0] < VIEW.width && spot[1] > 0 && spot[1] < VIEW.height, `${seconds} s`);
  }
});

test("while she speaks the figures are drawn for the tour's own eye, and none stands within reach of it", async () => {
  const { after, frame } = story();
  assert.equal(after.seen, null, 'the player’s own eye before she speaks');
  frame();
  await settled();
  const shot = after.shot(OWN, 1 / 30);
  assert.deepEqual(after.seen, shot, "the tour's shot, the one last shown");
  const card = (x: number, y: number) => ({ x, y, z: 30 }) as unknown as CardAt;
  const [near, far] = [card(shot.eye[0] + 3, shot.eye[1]), card(shot.eye[0] + 6, shot.eye[1])];
  assert.deepEqual(clearOfEye([near, far], shot.eye), [far], 'a walker 3 m from the eye is not drawn; one 6 m off is');
  const own = card(shot.eye[0] + 1, shot.eye[1]);
  assert.deepEqual(clearOfEye([own, near, far], shot.eye, own), [own, far], 'the player is drawn however near');
});

test('the lamp over the pair goes out when the place is left mid-welcome', async () => {
  const { after, frame, epilogue } = story();
  const lit = (): readonly LampPlace[] => epilogue.lamps;
  frame();
  await settled();
  frame();
  assert.equal(lit().length, 1, 'lit while she speaks');
  after.leave();
  frame();
  frame();
  assert.deepEqual(lit(), [], 'out once the place is left');
});

test('while she speaks no key the player presses acts; before and after, every one does', async () => {
  const { after, frame, finish } = story();
  const pressed = { held: () => true, pressed: () => true } as unknown as InputFrame;
  assert.equal(after.heard(pressed), pressed, 'before she speaks');
  frame();
  await settled();
  assert.equal(after.heard(pressed), IDLE, 'held while she speaks');
  for (let step = 0; step < TOUR.length; step++) {
    finish();
    await settled();
  }
  for (let flown = 0; flown < FLY_S + 0.2; flown += 1 / 30) after.shot(OWN, 1 / 30);
  frame();
  assert.equal(after.heard(pressed), pressed, 'the keys are theirs again');
});

test('while she speaks a soft warm lamp hangs over the pair, as a lantern of the town, gone once the welcome ends', async () => {
  const { after, frame, finish, epilogue } = story();
  // Read through a call: an assertion on the list itself would narrow its type for the rest of the test.
  const lit = (): readonly LampPlace[] => epilogue.lamps;
  assert.deepEqual(lit(), [], 'none before she speaks');
  frame();
  await settled();
  frame();
  const [lamp] = lit();
  assert.ok(lamp && lit().length === 1, 'one lamp while she speaks');
  // Her feet (1001.8, 2029, 30) and the player's (1000, 2030, 30): over their middle, a lantern's height.
  assert.deepEqual(lamp.at, [1000.9, 2029.5, 32.6]);
  assert.equal(lamp.reachM, 8);
  assert.deepEqual(
    lamp.light,
    FIRELIGHT.map((part) => part * 0.7),
  );
  for (let step = 0; step < TOUR.length; step++) {
    finish();
    await settled();
  }
  for (let flown = 0; flown < FLY_S + 0.2; flown += 1 / 30) after.shot(OWN, 1 / 30);
  frame();
  assert.deepEqual(lit(), [], 'gone once the keys are the player’s again');
});
