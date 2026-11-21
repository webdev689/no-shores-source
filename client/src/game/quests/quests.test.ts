import assert from 'node:assert/strict';
import { test } from 'node:test';
import cast from '../../../../content/story/cast.json' with { type: 'json' };
import houses from '../../../../content/story/houses.json' with { type: 'json' };
import { ASKS, type GearAsk, type GearState } from '../../network/gearMessages.ts';
import { standing, state } from '../../network/gearForTests.ts';
import type { Cards } from '../../player/cards.ts';
import { type Line, castOf, scenesOf } from '../../speech/cast.ts';
import type { Shot } from '../camera.ts';
import { useAt } from '../footGear.ts';
import { OPEN_AT } from '../gearScreen.ts';
import type { StationInfo } from '../nodes.ts';
import { Quests } from './quests.ts';
import { BEGUN_KEY, SETTLE_MS } from './questWatch.ts';

const CAST = castOf(cast);
const SCENES = scenesOf(houses, CAST);
const STORM = 2;

/** A character on quest `quest` at task `task` with its goals' counts, pledged to `pledge`, each quest done by `done`,
 *  and where its goal stands. */
function gear(
  quest: number,
  task: number,
  more: { counts?: number[]; pledge?: number; done?: number[]; where?: [number, number, number] } = {},
): GearState {
  const { counts = [], pledge = 0, done = [0, 0, 0, 0], where = null } = more;
  return state({
    standing: standing({ pledge }),
    quest: { quest, task, counts, done, choices: [0, 0, 0], at: where },
  });
}

/** The roads with a dialogue box that says each scene's first line and holds it until `finish`, on a clock `now`. */
function roads() {
  const said: string[] = [];
  const kept = new Map<string, string>();
  let finish: () => void = () => undefined;
  let now = 0;
  const voice = {
    play: (lines: readonly Line[]) => {
      said.push(lines[0]?.say ?? '');
      return new Promise<void>((resolve) => (finish = resolve));
    },
    frame: () => undefined,
  };
  const keeping = { getItem: (key: string) => kept.get(key) ?? null, setItem: kept.set.bind(kept) };
  // A forge whose every figure has a card, named for its move.
  const forge = { frames: () => 4, card: (id: number, _dress: unknown, anim: string) => ({ id, anim }) };
  const quests = new Quests(
    { cast: CAST, scenes: SCENES, kept: keeping, account: () => 'arlo-fan', forge: forge as unknown as Cards },
    () => voice,
    () => now,
  );
  /** A frame, past the story and the welcome unless said, its scenes' ends let through. */
  const frame = async (past = true, held = false) => {
    quests.frame(0.1, past, held);
    await Promise.resolve();
  };
  return { quests, said, kept, frame, finish: () => finish(), clock: (millis: number) => (now = millis) };
}

/** The first line of `scene`, as the box says it. */
const opening = (scene: string): string => SCENES[scene]?.[0]?.say ?? '';

test('within reach of a counter a talk goal names, E speaks with its keeper: asks the room and says the scene once', async () => {
  const { quests, said, frame, finish } = roads();
  quests.hear(gear(1, 0, { counts: [0, 1, 0] }));
  await frame();
  const asked: GearAsk[] = [];
  const ask = (each: GearAsk) => void asked.push(each);
  assert.equal(quests.speak('stormcallers', ask)?.words, 'Speak with Arlo Kestrel');
  assert.equal(quests.speak('veiled', ask)?.words, 'Speak with Sable');
  assert.equal(quests.speak('lamplighters', ask), null, 'Elder Maren Hale heard already');
  assert.equal(quests.speak('mage', ask), null, 'no goal names the Mage');
  quests.speak('stormcallers', ask)?.run();
  await frame();
  assert.deepEqual(asked, [{ kind: ASKS.speakWith, column: 1 }]);
  assert.deepEqual(said, [opening('houseStorm')]);
  finish();
  await frame();
  quests.speak('stormcallers', ask)?.run();
  await frame();
  await frame();
  assert.equal(asked.length, 2, 'asked again, the room not having answered');
  assert.deepEqual(said, [opening('houseStorm')], 'but said once');
});

test('the talk offer stands where the counter would open; elsewhere the counter opens as before', () => {
  const { quests } = roads();
  quests.hear(gear(1, 0));
  quests.frame(0, true, false);
  const HALL: StationInfo[] = [
    { kind: 'stormcallers', keeper: [0, -2], counter: [0, 0] },
    { kind: 'mage', keeper: [40, -2], counter: [40, 0] },
  ];
  const asked: GearAsk[] = [];
  const speak = (counter: string, ask: (asked: GearAsk) => void) => quests.speak(counter, ask);
  const keeper = useAt(0.5, 0, { stations: HALL }, null, (each) => asked.push(each), speak);
  assert.equal(keeper?.words, 'Speak with Arlo Kestrel');
  keeper?.run();
  assert.deepEqual(asked, [{ kind: ASKS.speakWith, column: 1 }]);
  const opened: unknown[] = [];
  // The page's event, as the menu hears it, without a page.
  Object.assign(globalThis, { dispatchEvent: (event: CustomEvent) => opened.push([event.type, event.detail]) });
  const mage = useAt(40, 0.5, { stations: HALL }, null, () => undefined, speak);
  assert.equal(mage?.words, 'The Mage');
  mage?.run();
  assert.deepEqual(opened, [[OPEN_AT, { view: 'mage' }]]);
});

test("lines are said one scene after another: a keeper's scene, then what the room's word begins", async () => {
  const { quests, said, frame, finish, clock } = roads();
  quests.hear(gear(1, 0, { counts: [1, 1, 0] }));
  await frame();
  clock(SETTLE_MS + 1);
  quests.speak('veiled', () => undefined)?.run();
  quests.hear(gear(1, 1));
  await frame();
  quests.hear(gear(STORM, 0, { pledge: 1, done: [1, 0, 0, 0] }));
  await frame();
  assert.deepEqual(said, [opening('houseVeil')], 'the road waits for her words');
  finish();
  await frame();
  await frame();
  assert.deepEqual(said, [opening('houseVeil'), opening('stormBegin')]);
});

test('no scene starts while a screen holds the view; a begin said is kept in the browser for the account', async () => {
  const { quests, said, frame, clock, kept } = roads();
  quests.hear(gear(1, 0));
  await frame(false);
  clock(SETTLE_MS + 1);
  await frame(true, true);
  assert.deepEqual(said, [], 'the welcome given, but the menu is up');
  await frame();
  assert.deepEqual(said, [opening('houseBegin')]);
  assert.equal(kept.get(`${BEGUN_KEY}.arlo-fan`), 'house');
});

test('nothing shows until the story and the welcome are past: no tracker, offer, mark or node', async () => {
  const { quests, frame } = roads();
  quests.hear(gear(STORM, 0, { pledge: 1, where: [100, 0, 30] }));
  await frame(false);
  const tracked = () => quests.tracked;
  assert.equal(tracked(), null);
  assert.equal(
    quests.speak('stormcallers', () => undefined),
    null,
  );
  assert.deepEqual([quests.nodes, quests.goalAt], [[], null]);
  await frame();
  assert.equal(tracked()?.task, 'Climb to the Old Beacon');
  assert.deepEqual([quests.nodes, quests.goalAt], [['saltgrass-downs'], [100, 0]]);
});

test("the HUD marks where the task's next goal stands, named for it with its distance; held at the edge behind", async () => {
  const { quests, frame } = roads();
  quests.hear(gear(STORM, 0, { pledge: 1, where: [100, 0, 30] }));
  await frame();
  const east: Shot = { eye: [0, 0, 2], yaw: Math.PI / 2, pitch: 0, fov: 1, near: 0.1, far: 900 };
  const view = { width: 1280, height: 720 };
  const [mark] = quests.marks(east, view, [0, 0], () => 0);
  assert.ok(mark);
  assert.deepEqual(
    [mark.kind, mark.name, mark.note, mark.arrowDegrees],
    ['quest', 'The Old Beacon, on the Saltgrass Downs', '100 m', null],
  );
  assert.ok(Math.abs(mark.x - 640) < 1, 'dead ahead');
  const [behind] = quests.marks({ ...east, yaw: -Math.PI / 2 }, view, [0, 0], () => 0);
  assert.ok(behind && behind.arrowDegrees !== null, 'held at the edge, pointing the way');
  quests.hear(null);
  assert.deepEqual(
    quests.marks(east, view, [0, 0], () => 0),
    [],
    'a room just joined, which has not said it yet',
  );
  assert.equal(quests.tracked?.task, 'Climb to the Old Beacon', 'the road shown all the same');
  quests.hear(gear(STORM, 0, { pledge: 1 }));
  await frame();
  assert.deepEqual(
    quests.marks(east, view, [0, 0], () => 0),
    [],
    'none here',
  );
});

test("a road's gift is toasted for a while", async () => {
  const { quests, frame, clock } = roads();
  const earned = (bits: number) =>
    state({
      ...gear(STORM, 2, { pledge: 1 }),
      arts: { art: 1, cores: [], anima: 0, tenets: [0, 0], earned: [bits, 0, 0] },
    });
  quests.hear(earned(0));
  await frame();
  clock(SETTLE_MS + 1);
  quests.hear(earned(1));
  await frame();
  assert.deepEqual(quests.toasts, ['Storm Art earned: Tempest']);
  clock(SETTLE_MS + 5000);
  await frame();
  assert.deepEqual(quests.toasts, []);
});

test("a step's figures and its ward stand in the room the player is in, none from a room that has not said them", async () => {
  const { quests, frame } = roads();
  const wren = 23;
  const walking = (figureState: number) =>
    state({
      ...gear(4, 0, { pledge: 3 }),
      quest: {
        ...gear(4, 0).quest!,
        figures: [{ look: wren, x: 3, y: 4, z: 1, facing: 0, state: figureState }],
      },
    });
  quests.hear(walking(1));
  await frame();
  const cards = quests.cards([0, 0, 2], 0, () => 0);
  assert.deepEqual(
    cards.map((each) => (each.card as unknown as { anim: string }).anim),
    ['walk'],
    'Wren walks',
  );
  quests.hear(walking(3));
  assert.deepEqual(
    quests.cards([0, 0, 2], 0, () => 0).map((each) => (each.card as unknown as { anim: string }).anim),
    ['idle'],
    'arrived',
  );
  quests.hear(null);
  assert.deepEqual(
    quests.cards([0, 0, 2], 0, () => 0),
    [],
    'a room just joined',
  );
  const holding = state({
    ...gear(2, 2, { pledge: 1 }),
    quest: { ...gear(2, 2).quest!, ward: { x: 1, y: 2, health: 0.5 } },
  });
  quests.hear(holding);
  assert.equal(quests.wardPlate(() => 0)?.name, 'The storm-glass');
  quests.hear(null);
  assert.equal(
    quests.wardPlate(() => 0),
    null,
  );
});
