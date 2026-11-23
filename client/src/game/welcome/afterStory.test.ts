import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GearAsk, GearState } from '../../network/gearMessages.ts';
import type { QuestState } from '../../network/questMessages.ts';
import { type Shot, onScreen } from '../camera.ts';
import type { Epilogue } from '../prologue/epilogue.ts';
import { AfterStory, heldHud } from './afterStory.ts';
import { SOCIAL } from './plazaForTests.ts';
import { FLY_S, TOUR } from './tour.ts';

const VIEW = { width: 800, height: 600 };
const YOU = { x: 1000, y: 2030, z: 30, facing: Math.PI };
const OWN: Shot = { eye: [1000, 2034, 33], yaw: 0, pitch: 0.2, fov: 1, near: 0.1, far: 3000 };
const settled = () => new Promise((resolve) => setImmediate(resolve));

/** This room's gear for the player: claimed as theirs or not, and on the opening's first task (her gift owed) or past
 *  it. */
const gearOf = (claimed: boolean, owed = true): GearState =>
  ({
    quest: { quest: 1, task: owed ? 0 : 1, counts: [0], done: [], choices: [], at: null, claimed } as QuestState,
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
    leave: () => void (epilogue.done = true),
    frame: () => {
      if (!speaking) {
        speaking = true;
        void epilogue.words().then(() => (epilogue.done = true));
      }
      return [];
    },
  };
  const gifts: string[] = [];
  const after = new AfterStory();
  after.storyEnded(epilogue as unknown as Epilogue);
  const ask = (asked: GearAsk) => void gifts.push(`${asked.kind}:${asked.column ?? ''}`);
  const frame = (node = SOCIAL) =>
    after.frame(OWN, VIEW, 1 / 30, 0, YOU, false, { node, floor: () => 30, gear: gear.now, ask, blocks: [] });
  return { after, said, gifts, frame, finish: () => finishes.shift()?.(), pressed: () => pressed };
}

test('on arriving in Overlook the stranger says her welcome, the keys held and the view hers, then gives her gift', async () => {
  const { after, said, gifts, frame, finish, pressed } = story();
  assert.equal(after.holding, false, 'the keys are the player’s before she speaks');
  frame();
  await settled();
  assert.equal(after.holding, true);
  after.press();
  assert.equal(pressed(), 1, 'Space moves her words on');
  let flown = false;
  for (const step of TOUR) {
    assert.equal(said.at(-1), step.scene);
    let shot = after.shot(OWN, FLY_S);
    shot = after.shot(OWN, FLY_S);
    if (step.kinds.length > 0) flown ||= shot.eye[2] > OWN.eye[2] + 5;
    finish();
    await settled();
  }
  assert.ok(flown, 'the view flew over the plaza');
  frame();
  assert.deepEqual(gifts, ['64:18'], 'asked once, as she bids farewell');
  assert.equal(after.holding, false, "the keys are the player's again");
  assert.deepEqual(after.shot(OWN, FLY_S), OWN, 'the view is theirs');
  await settled();
  frame();
  assert.equal(after.past, true, 'she has gone');
});

test('leaving mid-welcome gives the view and the keys back at once, with no gift', async () => {
  const { after, gifts, frame, finish } = story();
  frame();
  await settled();
  finish();
  await settled();
  after.leave();
  assert.equal(after.holding, false);
  assert.deepEqual(after.shot(OWN, 1 / 30), OWN);
  finish();
  await settled();
  assert.deepEqual(gifts, []);
  assert.equal(after.past, true);
});

test('nothing waits once the story has handed over no last moment', () => {
  const after = new AfterStory();
  after.storyEnded(null);
  assert.equal(after.past, true);
  assert.equal(after.holding, false);
  assert.deepEqual(after.shot(OWN, 1), OWN);
});

test('a gift still owed is asked only once this room holds the player’s own gear with her task waiting', async () => {
  const gear: { now: GearState | null } = { now: null };
  const { after, gifts, frame, finish } = story(gear);
  frame();
  await settled();
  after.leave();
  for (const now of [null, gearOf(false), gearOf(true, false)]) {
    gear.now = now;
    frame();
  }
  assert.deepEqual(gifts, [], 'none before this room’s own word, nor a temporary character’s, nor one past her');
  finish();
  gear.now = gearOf(true);
  frame();
  frame();
  assert.deepEqual(gifts, ['64:18'], 'once, when it is theirs and waits on her');
  frame(SOCIAL);
  const afield = { ...SOCIAL, kind: 'patrol' } as typeof SOCIAL;
  const other = story({ now: gearOf(true) });
  other.after.leave();
  other.frame(afield);
  assert.deepEqual(other.gifts, [], 'only in a social space');
});

test('while she speaks the HUD of the player’s own play is hidden, the dialogue box left to her', () => {
  const shown: string[] = [];
  const hud = {
    hints: (hints: readonly unknown[]) => void shown.push(`hints ${hints.length}`),
    marks: (marks: readonly unknown[]) => void shown.push(`marks ${marks.length}`),
    tasks: { show: (quest: unknown) => void shown.push(`tracker ${String(quest)}`) },
  };
  heldHud(hud, { hideDisplay: () => void shown.push('bars and compass hidden') });
  assert.deepEqual(shown.sort(), ['bars and compass hidden', 'hints 0', 'marks 0', 'tracker null']);
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
