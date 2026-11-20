import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CaptainAt, FightEvent, FightView } from '../../rules/fightRules.ts';
import type { LandWorker } from '../../terrain/landClient.ts';
import { onScreen } from '../camera.ts';
import { Battle, settledOn, type Wreck } from './battle.ts';
import { Calm } from './calm.ts';
import { creationShot } from './helm.ts';
import { Ram } from './ram.ts';
import { CRY_S, INBOUND_WAY_M_S, inboundAt, Sighted } from './sighted.ts';
import { headOnView, type StoryFrame } from './stage.ts';
import { FROM, GOING, lying, STEP_S, storied, turnBetween, VIEW, viewOf } from './seaStory.test.ts';
import type { Story } from './story.ts';

const HIT: FightEvent = { kind: 'hit', ship: 0, by: 1, zone: 'hull', point: [0, 0, 0] };
const AFLOAT = ['afloat', 'afloat', 'afloat'] as const;

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A land door whose fight begins with three captains afloat and answers each step as `answer` says. */
function door(answer: () => FightView) {
  const begun: { floats?: Float64Array; captains?: readonly CaptainAt[] } = {};
  const land = {
    fightBegin: (floats: Float64Array, _seed: number, _time: number, captains: readonly CaptainAt[]) => {
      Object.assign(begun, { floats, captains });
      return Promise.resolve(viewOf(['afloat', 'afloat', 'afloat']));
    },
    fightStep: () => Promise.resolve(answer()),
    fightEnd: () => Promise.resolve(),
  } as unknown as LandWorker;
  return { land, begun };
}

/** Plays `battle` frame by frame from `from` for `seconds`, the fight's steps answered between frames. */
async function fought(run: ReturnType<typeof storied>['run'], battle: Battle, from: number, seconds: number) {
  const frames: { at: number; frame: StoryFrame }[] = [];
  for (let time = from; time < from + seconds - 1e-9 && !battle.done; time += STEP_S) {
    frames.push(...run(battle, STEP_S, time));
    await settle();
  }
  return frames;
}

test('the sighting starts from the shot the creation last drew, on a tall screen and after a turn', () => {
  const { story, run } = storied();
  const own = story.sailing.frame([story.brig.sailed()], 0, 0, 0, undefined)[0]?.place;
  assert.ok(own);
  const from = creationShot({ ...own, roll: own.roll * 0.25, pitch: own.pitch * 0.25 }, Math.PI / 4, 9 / 16);
  const first = run(new Sighted(story, from), STEP_S)[0]?.frame.shot;
  assert.ok(first);
  const moved = Math.hypot(...([0, 1, 2] as const).map((axis) => first.eye[axis] - from.eye[axis]));
  assert.ok(moved < 0.2, `the eye moved ${moved.toFixed(2)} m`);
  assert.ok(turnBetween(first.yaw, from.yaw) < 0.01 && Math.abs(first.pitch - from.pitch) < 0.01);
  assert.ok(Math.abs(first.fov - from.fov) < 0.01);
});

test("a scene that cannot be played is thrown from its beat's next frame, never left to hang it", async () => {
  const beats: [(story: Story) => Sighted | Calm, number][] = [
    [(story) => new Sighted(story), CRY_S + 0.1],
    [(story) => new Calm(story, FROM, []), 3.5],
  ];
  for (const [make, until] of beats) {
    const { story, run } = storied({ refused: true });
    const beat = make(story);
    run(beat, until);
    await settle();
    assert.throws(() => run(beat, STEP_S, until), /could not be played/, beat.name);
  }
});

test('the fight takes each ship up under the sail and way she was sighted with, and the calm draws her rig on', async () => {
  const { land, begun } = door(() => viewOf(['struck', 'struck', 'sinking']));
  const { story, run } = storied({ land });
  const sighted = new Sighted(story);
  run(sighted, 1);
  const rigs = [story.brig.sailed(), ...sighted.inbound].map((ship) => story.sailing.rigOf(ship, 0, 0));
  const battle = new Battle(story, sighted.inbound);
  const frames = await fought(run, battle, 1, 2);
  assert.ok(begun.floats && (begun.floats[3] ?? 0) > 0 && begun.floats[7] === 2, `${begun.floats?.join()}`);
  assert.ok(begun.captains?.every((captain) => captain.way === INBOUND_WAY_M_S));
  const opening = frames[0]?.frame.ships ?? [];
  rigs.forEach((rig, index) => assert.equal(opening[index]?.rig, rig, `ship ${index} keeps her rig`));
  assert.equal(battle.done, true);
  const calm = new Calm(story, FROM, battle.wrecks ?? []);
  const after = run(calm, STEP_S, 3)[0]?.frame.ships ?? [];
  const last = frames.at(-1)?.frame.ships ?? [];
  assert.equal(after.length, 4);
  after.forEach((ship, index) => assert.equal(ship.rig, last[index]?.rig, `ship ${index} sails on with her rig`));
});

test('each wreck goes on from the pose the fight left her in, into the calm and on into the ram', async () => {
  const { land } = door(() => viewOf(['struck', 'struck', 'sinking']));
  const { story, run } = storied({ land });
  const battle = new Battle(story, inboundAt(story.brig));
  const last = (await fought(run, battle, 0, 2)).at(-1)?.frame.ships ?? [];
  const calm = new Calm(story, FROM, battle.wrecks ?? []);
  const calmFrames = run(calm, 3, 2);
  const first = calmFrames[0]?.frame.ships ?? [];
  for (const index of [1, 2, 3]) {
    const [was, now] = [last[index]?.place, first[index]?.place];
    assert.ok(was && now && Math.abs(was.z - now.z) < 0.05, `wreck ${index}: ${was?.z} then ${now?.z}`);
    assert.ok(Math.abs(was.roll - now.roll) < 0.01 && Math.abs(was.pitch - now.pitch) < 0.01, `wreck ${index}`);
  }
  assert.ok((first[3]?.place.roll ?? 0) < 0, 'she lists to port, as the rules list her');
  const calmLast = calmFrames.at(-1)?.frame.ships ?? [];
  const ramFirst = run(new Ram(story, calm.wrecks), STEP_S, 5)[0]?.frame.ships ?? [];
  assert.equal(ramFirst.length, 5, 'the Brig, the Frigate and the three wrecks');
  for (const index of [1, 2, 3]) {
    const [was, now] = [calmLast[index]?.place, ramFirst[index + 1]?.place];
    assert.ok(was && now && Math.abs(was.z - now.z) < 0.05 && was.x === now.x, `wreck ${index} stays where she lies`);
  }
});

test('a wreck going down settles on as the rules sink her, and is gone once under; a struck one lies as she was', () => {
  const [under, trim, list] = GOING.sunk_founder;
  const going: Wreck = {
    ship: { ...lying('going', 0, 0, 0), founder: [under * 0.25, trim * 0.5, list * 0.5] },
    going: { sunk: GOING.sunk_founder, inS: 11 },
  };
  const later = settledOn(going, 5.5)?.ship.founder;
  assert.ok(later);
  for (const [axis, expected] of [under * 0.75 ** 2, trim * 0.75, list * 0.75].entries()) {
    assert.ok(Math.abs((later[axis] ?? 0) - expected) < 1e-9, `${axis}: ${later[axis]} for ${expected}`);
  }
  assert.equal(settledOn(going, 11), null);
  const struck: Wreck = { ship: lying('struck', 0, 0, 0), going: null };
  assert.equal(settledOn(struck, 100), struck);
});

test('a cry waits for its speaker to come on the view, and one whose moment passes unseen is not spent', async () => {
  const events: FightEvent[] = [];
  const { story, said, run } = storied({ land: door(() => viewOf(AFLOAT, events.splice(0))).land });
  const battle = new Battle(story, inboundAt(story.brig));
  await fought(run, battle, 0, 0.5);
  // Aiming out over her starboard side, as a player laying a broadside does.
  battle.fighting?.drag(314, 0);
  battle.fighting?.aim(true);
  events.push(HIT);
  const aimed = (await fought(run, battle, 0.5, 1)).at(-1)?.frame;
  const bosun = aimed?.heads?.get('bosun');
  assert.ok(aimed && bosun && !headOnView(onScreen(aimed.shot, VIEW, bosun), VIEW), 'the aim looks away from him');
  assert.ok(!said.some((each) => each.scene === 'hitTaken'), 'not said while he is off the view');
  battle.fighting?.aim(false);
  await fought(run, battle, 1.5, 1);
  assert.ok(
    said.some((each) => each.scene === 'hitTaken'),
    'said once he is back on it',
  );
});

test('a cry whose speaker stays off the view is let go, and the next of its kind is said', async () => {
  const events: FightEvent[] = [];
  const { story, said, run } = storied({ land: door(() => viewOf(AFLOAT, events.splice(0))).land });
  const battle = new Battle(story, inboundAt(story.brig));
  await fought(run, battle, 0, 0.5);
  // Aiming out over her starboard side, as a player laying a broadside does.
  battle.fighting?.drag(314, 0);
  battle.fighting?.aim(true);
  events.push(HIT);
  await fought(run, battle, 0.5, 3.5);
  battle.fighting?.aim(false);
  await fought(run, battle, 4, 1);
  assert.ok(!said.some((each) => each.scene === 'hitTaken'), 'the first, unseen, is let go');
  events.push(HIT);
  await fought(run, battle, 5, 0.5);
  assert.ok(
    said.some((each) => each.scene === 'hitTaken'),
    'the next is heard, no gap spent on the first',
  );
});
