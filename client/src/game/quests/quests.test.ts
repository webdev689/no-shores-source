import assert from 'node:assert/strict';
import { test } from 'node:test';
import cast from '../../../../content/story/cast.json' with { type: 'json' };
import houses from '../../../../content/story/houses.json' with { type: 'json' };
import type { GearState } from '../../network/gearMessages.ts';
import { standing, state } from '../../network/gearForTests.ts';
import type { QuestState } from '../../network/questMessages.ts';
import type { Cards } from '../../player/cards.ts';
import { type Line, castOf, scenesOf } from '../../speech/cast.ts';
import type { Shot } from '../camera.ts';
import { useAt } from '../footGear.ts';
import { OPEN_AT } from '../gearScreen.ts';
import type { StationInfo } from '../nodes.ts';
import { hush, screenOpened } from '../npc/npcSpeech.ts';
import type { Notice } from '../obtained.ts';
import { COUNTERS, QUESTS } from './questBook.ts';
import { SPEAKERS } from './questLooks.ts';
import { Quests } from './quests.ts';
import { BEGUN_KEY } from './questWatch.ts';

const CAST = castOf(cast);
const SCENES = scenesOf(houses, CAST);
const questOf = (id: string): number => QUESTS.findIndex((quest) => quest.id === id) + 1;
const [STORM, LAMP, VEIL] = [questOf('stormcallers'), questOf('lamplighters'), questOf('veiled')];
/** The opening's tasks by id: the houses heard. */
const taskOf = (id: string): number => QUESTS[0]?.tasks.findIndex((task) => task.id === id) ?? -1;
const HEAR = taskOf('hear-three-houses');
/** The first task of a road whose goals hold one of `kind`, and that goal. */
function stepOf(quest: number, kind: string) {
  const task = QUESTS[quest - 1]?.tasks.findIndex((each) => each.goals.some((goal) => goal.kind === kind)) ?? -1;
  const goal = QUESTS[quest - 1]?.tasks[task]?.goals.find((each) => each.kind === kind);
  assert.ok(task >= 0 && goal, `a ${kind} step on road ${quest}`);
  return { task, goal };
}

/** A character on quest `quest` at task `task` with its goals' counts, pledged to `pledge`, each quest done by `done`,
 *  and more of the word. */
function gear(
  quest: number,
  task: number,
  more: { counts?: number[]; pledge?: number; done?: number[] } & Partial<QuestState> = {},
): GearState {
  const { counts = [], pledge = 0, done = [0, 0, 0, 0], ...rest } = more;
  return state({
    standing: standing({ pledge }),
    quest: { quest, task, counts, done, choices: [0, 0, 0], at: null, ...rest },
  });
}

/** The roads with a dialogue box that says each scene's first line and holds it until `finish`, on a clock `now`, and
 *  a forge whose every figure has a card named for its move, warming each dress it is asked to. */
function roads() {
  const said: string[] = [];
  const kept = new Map<string, string>();
  const warmed: string[][] = [];
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
  const forge = {
    frames: () => 4,
    card: (id: number, _dress: unknown, anim: string) => ({ id, anim }),
    warm: (_dress: unknown, moves: () => readonly string[]) => void warmed.push([...moves()]),
  };
  const noticed: Notice[] = [];
  const parts = {
    cast: CAST,
    scenes: SCENES,
    kept: keeping,
    account: () => 'arlo-fan',
    forge: forge as unknown as Cards,
  };
  const quests = new Quests(
    { ...parts, notify: (...notices: readonly Notice[]) => void noticed.push(...notices) },
    () => voice,
    () => now,
  );
  /** A frame, past the story and the welcome unless said, its scenes' ends let through. */
  const frame = async (past = true, held = false) => {
    quests.frame(0.1, past, held);
    await Promise.resolve();
  };
  return {
    quests,
    said,
    kept,
    warmed,
    noticed,
    frame,
    finish: () => finish(),
    clock: (millis: number) => (now = millis),
  };
}

/** The first line of `scene`, as the box says it. */
const opening = (scene: string | undefined): string => SCENES[scene ?? '']?.[0]?.say ?? '';
/** What each card drawn shows its figure doing, and how far east it stands: seen from far to the south, so a card's
 *  step toward the eye moves it north and south alone. */
const drawn = (quests: Quests) =>
  quests
    .cards([0, 100_000, 2], 0, () => 0)
    .map((each) => {
      const { anim } = each.card as unknown as { anim: string };
      return [anim, Math.round(each.x * 10) / 10];
    });

test("within reach of a counter a talk goal names, E opens its keeper's screen; the scene is said there as it is met", async () => {
  const { quests, said, frame } = roads();
  const goals = QUESTS[0]?.tasks[HEAR]?.goals ?? [];
  quests.hear(gear(1, HEAR, { counts: [0, 1, 0] }));
  await frame();
  assert.equal(quests.speak('stormcallers')?.words, 'Speak with Arlo Kestrel');
  assert.equal(quests.speak('veiled')?.words, 'Speak with Sable');
  assert.equal(quests.speak('lamplighters'), null, 'Elder Maren Hale heard already');
  assert.equal(quests.speak('mage'), null, 'no goal names the Mage');
  const opened: unknown[] = [];
  Object.assign(globalThis, { dispatchEvent: (event: CustomEvent) => opened.push([event.type, event.detail]) });
  quests.speak('stormcallers')?.run();
  assert.deepEqual(opened, [[OPEN_AT, { view: 'stormcallers' }]], 'his screen, where the word is asked');
  const holder = globalThis as unknown as Record<string, unknown>;
  const wasFrame = holder['requestAnimationFrame'];
  holder['requestAnimationFrame'] = () => 0;
  try {
    screenOpened('stormcallers');
    quests.hear(gear(1, HEAR, { counts: [1, 1, 0] }));
    await frame(true, true);
    assert.deepEqual(said, [], 'met with his screen up: said in it, not the box');
    hush();
    await frame(true, true);
    quests.hear(gear(1, HEAR, { counts: [1, 1, 1] }));
    await frame(true, true);
    assert.deepEqual(said, [], 'with no screen to say it in, it waits for the box');
    await frame(true, false);
    assert.deepEqual(said, [opening(goals[2]?.scene)], 'said once the screen is gone');
  } finally {
    holder['requestAnimationFrame'] = wasFrame;
  }
});

test('a keeper a talk goal names has something for the player, once the story and the welcome are past', async () => {
  const { quests, frame } = roads();
  quests.hear(gear(1, HEAR, { counts: [0, 1, 0] }));
  await frame(false);
  assert.equal(quests.wants('stormcallers'), false, 'not before the welcome is past');
  await frame();
  assert.deepEqual(
    ['stormcallers', 'veiled', 'lamplighters', 'mage', 'mail'].map((counter) => quests.wants(counter)),
    [true, true, false, false, false],
    'the two still to speak with; not one heard already, nor one no goal names',
  );
  quests.hear(gear(1, HEAR, { counts: [1, 1, 1] }));
  await frame();
  assert.equal(quests.wants('stormcallers'), false, 'spoken with');
});

test('a smith whose ware is to be bought is lit', async () => {
  // No task of the file asks a purchase now the keepers give the opening's gear: a task of buy goals, made here.
  const opening = QUESTS[0] as unknown as { tasks: unknown[] };
  const goals = [
    { kind: 'buy', slot: 'melee', text: 'A Melee weapon' },
    { kind: 'buy', slot: 'head', text: 'Head armour' },
  ];
  opening.tasks.push({ id: 'buy-here', task: 'Buy here', goals });
  try {
    await smithLit();
  } finally {
    opening.tasks.pop();
  }
});

async function smithLit() {
  const { quests, frame } = roads();
  quests.hear(gear(1, taskOf('buy-here')));
  await frame();
  assert.deepEqual(
    ['weaponsmith', 'armorsmith', 'mage'].map((counter) => quests.wants(counter)),
    [true, true, false],
    'the two smiths, for the wares the task asks',
  );
  assert.equal(quests.speak('weaponsmith'), null, 'their counter opens as before, to buy');
}

test('the talk offer stands where the counter would open; elsewhere the counter opens as before', () => {
  const { quests } = roads();
  quests.hear(gear(1, HEAR));
  quests.frame(0, true, false);
  const HALL: StationInfo[] = [
    { kind: 'stormcallers', keeper: [0, -2], counter: [0, 0] },
    { kind: 'mage', keeper: [40, -2], counter: [40, 0] },
  ];
  const speak = (counter: string) => quests.speak(counter);
  const opened: unknown[] = [];
  // The page's event, as the menu hears it, without a page.
  Object.assign(globalThis, { dispatchEvent: (event: CustomEvent) => opened.push([event.type, event.detail]) });
  const keeper = useAt(0.5, 0, { stations: HALL }, null, () => undefined, speak);
  assert.equal(keeper?.words, 'Speak with Arlo Kestrel');
  keeper?.run();
  const mage = useAt(40, 0.5, { stations: HALL }, null, () => undefined, speak);
  assert.equal(mage?.words, 'The Mage');
  mage?.run();
  assert.deepEqual(opened, [
    [OPEN_AT, { view: 'stormcallers' }],
    [OPEN_AT, { view: 'mage' }],
  ]);
});

test('a keeper offering the quest walked is spoken with to acquire it, and lit until it is', async () => {
  const { quests, frame } = roads();
  quests.hear(gear(1, 1, { offered: COUNTERS.weaponsmith ?? 0 }));
  await frame();
  assert.equal(quests.speak('weaponsmith')?.words, 'Speak with The Weaponsmith');
  assert.equal(quests.wants('weaponsmith'), true);
  assert.equal(quests.wants('armorsmith'), false, 'nothing else counts before it is acquired');
  assert.equal(quests.tracked?.task, 'Acquire it');
});

test("lines are said one scene after another: a keeper's scene, then what the room's word begins", async () => {
  const { quests, said, frame, finish } = roads();
  const goals = QUESTS[0]?.tasks[HEAR]?.goals ?? [];
  quests.hear(gear(1, HEAR, { counts: [1, 1, 0] }));
  await frame();
  quests.hear(gear(1, HEAR + 1));
  await frame();
  quests.hear(gear(STORM, 0, { pledge: 1, done: [1, 0, 0, 0] }));
  await frame();
  assert.deepEqual(said, [opening(goals[2]?.scene)], 'the road waits for her words');
  finish();
  await frame();
  await frame();
  assert.deepEqual(said, [opening(goals[2]?.scene), opening(QUESTS[STORM - 1]?.begin)]);
});

test("a moment's line is said once while it waits or is said: a step failed twice in a breath", async () => {
  const { quests, said, frame, finish } = roads();
  const { task, goal } = stepOf(VEIL, 'unseen');
  const seen = (fails: number) => quests.hear(gear(VEIL, task, { pledge: 3, fails: [fails] }));
  seen(0);
  await frame();
  seen(1);
  await frame();
  seen(2);
  await frame();
  assert.deepEqual(said, [opening(goal.seen)]);
  finish();
  await frame();
  await frame();
  assert.deepEqual(said, [opening(goal.seen)], 'not said again for the second, which came while it was said');
  seen(3);
  await frame();
  assert.deepEqual(said, [opening(goal.seen), opening(goal.seen)], 'a third, later, is its own moment');
});

test('no scene starts while a screen holds the view; a begin said is kept in the browser for the account', async () => {
  const { quests, said, frame, kept } = roads();
  quests.hear(gear(1, 0));
  await frame(false);
  await frame(true, true);
  assert.deepEqual(said, [], 'the welcome given, but the menu is up');
  await frame();
  assert.deepEqual(said, [opening(QUESTS[0]?.begin)]);
  assert.equal(kept.get(`${BEGUN_KEY}.arlo-fan`), QUESTS[0]?.id);
});

test("nothing shows, says or marks from a room's starting character, nor until the story and the welcome are past", async () => {
  const { quests, said, frame } = roads();
  const where = [100, 0, 30] as [number, number, number];
  quests.hear(gear(LAMP, 3, { pledge: 2, at: where }));
  await frame(false);
  const tracked = () => quests.tracked;
  assert.equal(tracked(), null);
  assert.equal(quests.speak('stormcallers'), null);
  assert.deepEqual([quests.nodes, quests.goalAt], [[], null]);
  await frame();
  assert.equal(tracked()?.task, QUESTS[LAMP - 1]?.tasks[3]?.task);
  assert.deepEqual(quests.goalAt, [100, 0]);
  // A room joined later holds its starting character first: none of it shows.
  quests.hear(gear(1, 0, { claimed: false, at: [5, 5, 10] }));
  await frame();
  assert.equal(tracked()?.task, QUESTS[LAMP - 1]?.tasks[3]?.task, 'the player’s own road all the same');
  assert.equal(quests.goalAt, null, 'nothing marked');
  assert.deepEqual(said, [], 'nothing said');
});

test("the HUD marks where the task's next goal stands in the node the player is in, named for it with its distance", async () => {
  const { quests, frame } = roads();
  const { task, goal } = stepOf(LAMP, 'escort');
  quests.hear(gear(LAMP, task, { pledge: 2, at: [100, 0, 30] }));
  await frame();
  const east: Shot = { eye: [0, 0, 2], yaw: Math.PI / 2, pitch: 0, fov: 1, near: 0.1, far: 900 };
  const view = { width: 1280, height: 720 };
  const zone = (id: string, landing: readonly [number, number]) =>
    ({ id, kind: 'patrol', name: id, continent: 'continent-1', ring: [], spawns: [landing], centre: landing }) as const;
  const there = zone(goal.node ?? '', [0, 900]);
  const chart = { nodes: [there, zone('elsewhere', [0, 0])], layouts: [] };
  const afoot = (node: typeof there) => ({ on: 'land', node, at: [0, 0], marked: null, foes: [] }) as const;
  quests.guide(afoot(there), chart);
  const [mark] = quests.marks(east, view, [0, 0], () => 0);
  assert.ok(mark);
  assert.deepEqual([mark.kind, mark.name, mark.note, mark.arrowDegrees], ['quest', goal.text, '100 m', null]);
  assert.ok(Math.abs(mark.x - 640) < 1, 'dead ahead, where the room marks it');
  const [behind] = quests.marks({ ...east, yaw: -Math.PI / 2 }, view, [0, 0], () => 0);
  assert.ok(behind && behind.arrowDegrees !== null, 'held at the edge, pointing the way');
  quests.guide(afoot(zone('elsewhere', [0, 0])), chart);
  const [away] = quests.marks(east, view, [0, 0], () => 0);
  assert.ok(away && away.name === goal.text && away.note === '900 m', 'from another zone, the way to its landing');
  quests.hear(null);
  quests.guide(afoot(there), chart);
  assert.deepEqual(
    quests.marks(east, view, [0, 0], () => 0),
    [],
    'a room just joined, and no place of its own known',
  );
});

test("a road's gift is noticed at the foot of the screen", async () => {
  const { quests, frame, noticed } = roads();
  const earned = (bits: number) =>
    state({
      ...gear(STORM, 2, { pledge: 1 }),
      arts: { art: 1, cores: [], anima: 0, tenets: [0, 0], earned: [bits, 0, 0] },
    });
  quests.hear(earned(0));
  await frame();
  quests.hear(earned(1));
  await frame();
  assert.deepEqual(
    noticed.map((notice) => notice.title),
    ['Storm Art earned'],
  );
});

test("a step's figures glide between the room's words, warmed to ride and stand; an arrived one stands where it is", async () => {
  const { quests, frame, clock, warmed } = roads();
  const { task } = stepOf(VEIL, 'escort');
  const wren = SPEAKERS.indexOf('wren') + 1;
  const walkingAt = (x: number, figureState: number) =>
    gear(VEIL, task, { pledge: 3, figures: [{ look: wren, x, y: 4, z: 1, facing: 0.5, state: figureState }] });
  clock(0);
  quests.hear(walkingAt(0, 1));
  await frame();
  assert.deepEqual(drawn(quests), [['horsegallop', 0]]);
  clock(100);
  quests.hear(walkingAt(2, 1));
  assert.deepEqual(drawn(quests), [['horsegallop', 0]], 'the newest word comes: it sets off toward it');
  clock(150);
  assert.deepEqual(drawn(quests), [['horsegallop', 1]], 'half the time the last two words took');
  assert.deepEqual(
    quests.riders.map((rider) => [rider.feet[0], rider.mounted]),
    [[1, true]],
    'its hooves heard where it is drawn',
  );
  clock(200);
  assert.deepEqual(drawn(quests), [['horsegallop', 2]], 'there');
  clock(250);
  assert.deepEqual(drawn(quests), [['horsegallop', 2]], 'and waits for the next word there');
  clock(300);
  quests.hear(walkingAt(40, 3));
  assert.deepEqual(drawn(quests), [['horseidle', 40]], 'one set down far off is not walked there; arrived, it stands');
  assert.ok(warmed.every((moves) => moves.includes('horsegallop') && moves.includes('horseidle')) && warmed.length > 0);
  quests.hear(null);
  assert.deepEqual(drawn(quests), [], 'a room just joined');
  quests.hear(state({ ...walkingAt(0, 1), quest: { ...walkingAt(0, 1).quest!, claimed: false } }));
  assert.deepEqual(drawn(quests), [], "a room's starting character's");
});

test("a step's ward stands in the room the player is in, its plate held in view", async () => {
  const { quests, frame } = roads();
  const { task, goal } = stepOf(STORM, 'defend');
  quests.hear(gear(STORM, task, { pledge: 1, ward: { x: 1, y: 2, health: 0.5 } }));
  await frame();
  const plate = quests.wardPlate(() => 0);
  assert.deepEqual([plate?.name, plate?.held], [goal.ward, true]);
  quests.hear(null);
  assert.equal(
    quests.wardPlate(() => 0),
    null,
  );
});

test("a horde's Art is noticed unbounded as it begins, and bound again as it falls or is left", async () => {
  const { quests, frame, noticed } = roads();
  const task = QUESTS[STORM - 1]?.tasks.findIndex((each) => each.goals.some((goal) => goal.horde)) ?? -1;
  const running = (horde: QuestState['horde']) => {
    const word = gear(STORM, task, { pledge: STORM, horde });
    return { ...word, arts: { art: 1, cores: [], anima: 1, tenets: [1, 1] as const } };
  };
  const titles = () => noticed.map((notice) => notice.title);
  quests.hear(running(null));
  await frame();
  assert.deepEqual(titles(), [], 'none before it runs');
  quests.hear(running({ left: 29, all: 29 }));
  await frame();
  assert.deepEqual(titles(), ['Storm unbounded']);
  assert.ok(noticed[0]?.icon?.svg.startsWith('<svg'), "under the Art's emblem");
  quests.hear(running({ left: 3, all: 29 }));
  await frame();
  assert.deepEqual(titles(), ['Storm unbounded'], 'once, as long as it runs');
  quests.hear(running(null));
  await frame();
  assert.deepEqual(titles(), ['Storm unbounded', 'Storm bound again'], 'its end seen');
  quests.hear(running({ left: 29, all: 29 }));
  quests.hear(null);
  await frame();
  assert.deepEqual(titles().slice(-2), ['Storm unbounded', 'Storm bound again'], 'left: bound again too');
});

test('the tracker runs a step’s clock down between the room’s words, and each word sets it again', async () => {
  const { quests, frame, clock } = roads();
  const { task, goal } = stepOf(STORM, 'race');
  const index = QUESTS[STORM - 1]?.tasks[task]?.goals.findIndex((each) => each === goal) ?? -1;
  const shown = () => quests.tracked?.steps[index]?.clock;
  clock(1_000);
  quests.hear(gear(STORM, task, { pledge: STORM, clock: 270 }));
  await frame();
  assert.equal(shown(), 270);
  clock(61_000);
  assert.equal(shown(), 210, 'a minute on, a minute less, with no word between');
  quests.hear(gear(STORM, task, { pledge: STORM, clock: 205 }));
  assert.equal(shown(), 205, 'the room’s word sets it');
  clock(1_000_000);
  assert.equal(shown(), 0, 'never below none');
});
