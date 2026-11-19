import assert from 'node:assert/strict';
import { test } from 'node:test';
import scenes from '../../../../content/story/prologue.json' with { type: 'json' };
import { Lightning } from '../../cinema/lightning.ts';
import type { MarkView } from '../../ships/markView.ts';
import { shipSails, shipWaterline } from '../../ships/shipMesh.ts';
import { AUTO_HOLD_S } from '../../speech/conversation.ts';
import { CHARACTERS_PER_SECOND } from '../../speech/typing.ts';
import type { CaptainAt, FightView } from '../../rules/fightRules.ts';
import type { LandWorker } from '../../terrain/landClient.ts';
import { onScreen, type Shot } from '../camera.ts';
import { Battle } from './battle.ts';
import { Brig } from './brig.ts';
import { Calm, DECK_VIEW, onBrig } from './calm.ts';
import { BRACED_S, IMPACT_S, Ram, rammerAway } from './ram.ts';
import { Sailing, type Sailed } from './sailing.ts';
import { CRY_S, inboundAt, Sighted } from './sighted.ts';
import { headOnView, type StoryFrame } from './stage.ts';
import type { Story } from './story.ts';
import type { Beat } from './beat.ts';

const VIEW = { width: 1600, height: 900 };
const STEP_S = 1 / 30;

type Said = { readonly scene: string; readonly at: number };

/** A story over a stage that writes down what is said and done, its scenes played at once or when the test says. */
function storied(options: { land?: LandWorker } = {}) {
  const said: Said[] = [];
  const done: string[] = [];
  const playing = new Map<string, () => void>();
  const clock = { now: 0 };
  const note = (what: string) => () => void done.push(what);
  const stage = {
    play: (scene: string) => {
      said.push({ scene, at: clock.now });
      return new Promise<void>((resolve) => playing.set(scene, resolve));
    },
    weatherTowards: (_to: unknown, seconds: number) => done.push(`weather ${seconds}`),
    stepWeather: () => undefined,
    windBearing: () => 0,
    swell: () => undefined,
    parts: {
      ambience: {
        set: note('sound'),
        thunder: note('thunder'),
        whoosh: note('whoosh'),
        crash: note('crash'),
        ringing: note('ringing'),
      },
      dialogue: { skip: note('cut') },
      screen: { fade: note('fade'), flash: note('flash') },
      objective: { show: note('objective'), clear: () => undefined },
      hud: { hints: (lines: string[]) => done.push(`hints ${lines[0] ?? ''}`), shipBars: () => undefined },
    },
  };
  const brig = new Brig([10_000, 20_000], 0.7);
  const sailing = new Sailing({
    brig: { waterline: shipWaterline('brig'), sails: shipSails('brig') },
    sloop: { waterline: shipWaterline('sloop'), sails: shipSails('sloop') },
  });
  const story = {
    stage,
    sailing,
    brig,
    lightning: new Lightning(17, () => undefined),
    land: options.land,
    marks: { drawInto: () => undefined } as unknown as MarkView,
    dress: brig.crew({ x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0 }, 0)[0]?.dress,
  } as unknown as Story;
  /** Plays `beat` for `seconds`, each frame's shot and heads kept with its time. */
  const run = (beat: Beat, seconds: number, from = 0) => {
    const frames: { at: number; frame: StoryFrame }[] = [];
    for (let time = from + STEP_S; time <= from + seconds + 1e-9; time += STEP_S) {
      clock.now = time;
      const frame = beat.frame({ seconds: STEP_S, clock: time, controls: null as never, size: VIEW, viewport: VIEW });
      if (frame) frames.push({ at: time, frame });
    }
    return frames;
  };
  return { story, said, done, playing, run, clock };
}

/** How long a scene takes to say, roughly: a bark and the gap after it, each line typed and held. */
function sayingS(scene: keyof typeof scenes.scenes): number {
  return scenes.scenes[scene].reduce(
    (sum, line) => sum + ('kind' in line ? 1.1 : line.say.length / CHARACTERS_PER_SECOND + AUTO_HOLD_S + 0.6),
    0,
  );
}

/** Who says a line of the scene. */
const speakers = (scene: keyof typeof scenes.scenes) => [...new Set(scenes.scenes[scene].map((line) => line.who))];

/** The speakers whose heads are off the view of a frame. */
function unseen(frame: StoryFrame, who: readonly string[]): string[] {
  return who.filter((name) => {
    const head = frame.heads?.get(name);
    return !head || !headOnView(onScreen(frame.shot, VIEW, head), VIEW);
  });
}

const turnBetween = (first: number, second: number) =>
  Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second)));

test('each cry of the ships sighted is said with every speaker of it on the view, from the first cry to the last word', () => {
  const { story, said, run } = storied();
  const beat = new Sighted(story);
  const frames = run(beat, 13);
  assert.deepEqual(
    said.map((each) => each.scene),
    ['sighted'],
  );
  const from = said[0]?.at ?? Infinity;
  assert.ok(Math.abs(from - CRY_S) < STEP_S * 1.5, `the crew cry out once the camera has turned: ${from}`);
  for (const { at, frame } of frames.filter((each) => each.at >= from && each.at <= from + sayingS('sighted'))) {
    assert.deepEqual(unseen(frame, speakers('sighted')), [], `at ${at.toFixed(2)} s`);
  }
});

test('the sighted camera ends through the fight camera lens, so the fight opens without a snap', async () => {
  const { FIELD_OF_VIEW } = await import('../../overworld/overworldCamera.ts');
  const { story, run } = storied();
  const frames = run(new Sighted(story), 13);
  assert.ok(Math.abs((frames.at(-1)?.frame.shot.fov ?? 0) - FIELD_OF_VIEW) < 1e-6);
});

test('a skipped sighting leaves its weather but says and sounds nothing', () => {
  const { story, said, done, run } = storied();
  const beat = new Sighted(story);
  run(beat, 1);
  beat.skip();
  run(beat, 5, 1);
  assert.deepEqual(said, []);
  assert.ok(!done.includes('thunder'));
  assert.ok(done.includes('weather 5'), 'the storm still closes in');
  assert.equal(beat.done, true);
});

test('the inbound ships are where they would be sighted, without playing the sighting', () => {
  const brig = { x: 100, y: 200, heading: 0 };
  const ships = inboundAt(brig);
  assert.equal(ships.length, 3);
  for (const ship of ships) {
    assert.ok(Math.hypot(ship.x - 100, ship.y - 200) > 700, 'off her bow, far out');
    assert.ok(ship.y < 200, 'ahead of her (north)');
    assert.ok(turnBetween(ship.heading, Math.atan2(100 - ship.x, ship.y - 200)) < 1e-9, 'each heads for her');
  }
});

const FROM: Shot = { eye: [9_950, 20_050, 30], yaw: 0.7, pitch: 0.3, fov: 1.134, near: 0.3, far: 30_000 };

test('the calm comes down from the fight camera without a snap, and its crew are on the view as they talk', () => {
  const { story, said, run } = storied();
  const frames = run(new Calm(story, FROM, []), 8);
  const first = frames[0]?.frame.shot;
  assert.ok(first && Math.abs(first.fov - FROM.fov) < 0.01 && turnBetween(first.yaw, FROM.yaw) < 0.01, `${first?.fov}`);
  const talk = said[0]?.at ?? Infinity;
  for (const { at, frame } of frames.filter((each) => each.at >= talk)) {
    assert.deepEqual(unseen(frame, speakers('calm')), [], `at ${at.toFixed(2)} s`);
  }
});

test('a calm skipped before its talk says nothing later, on any clock', () => {
  const { story, said, run } = storied();
  const beat = new Calm(story, FROM, []);
  run(beat, 1.5);
  beat.skip();
  run(beat, 10, 1.5);
  assert.deepEqual(said, []);
});

test('the lookout cuts into the mate: the calm ends soon after the mate begins her last line', async () => {
  const { story, said, playing, run } = storied();
  const beat = new Calm(story, FROM, []);
  run(beat, 4);
  assert.deepEqual(
    said.map((each) => each.scene),
    ['calm'],
  );
  playing.get('calm')?.();
  await new Promise((settle) => setTimeout(settle, 0));
  run(beat, 0.5, 4);
  assert.deepEqual(
    said.map((each) => each.scene),
    ['calm', 'calmCutOff'],
  );
  assert.equal(beat.done, false);
  run(beat, 1, 4.5);
  assert.equal(beat.done, true, 'done while her last line is still being said');
});

test('the calm keeps the beaten ships where they lie, the struck afloat and the one going down settling on', () => {
  const { story, run } = storied();
  const wrecks: Sailed[] = [
    { who: 'struck', hull: 'sloop', x: 10_300, y: 20_000, heading: 1, underWay: false, sinking: 0.1 },
    { who: 'going', hull: 'sloop', x: 10_000, y: 20_400, heading: 2, underWay: false, sinking: 0.3 },
  ];
  const frames = run(new Calm(story, FROM, wrecks), 6);
  const [early, late] = [frames[0]?.frame.ships ?? [], frames.at(-1)?.frame.ships ?? []];
  assert.equal(early.length, 3, 'the Brig and both wrecks');
  assert.ok(early[1] && late[1] && Math.abs(early[1].place.z - late[1].place.z) < 1e-9, 'the struck one lies still');
  assert.ok(early[2] && late[2] && late[2].place.z < early[2].place.z - 1, 'the other goes on down');
  assert.equal(late[2]?.place.x, 10_000);
});

test('the ram opens where the calm left the camera, its cries on the view and the larger ship shown coming', () => {
  const { story, said, done, run } = storied();
  const ram = new Ram(story);
  const frames = run(ram, IMPACT_S + 2);
  assert.deepEqual(done.slice(done.indexOf('cut'), done.indexOf('cut') + 1), ['cut'], 'the mate is cut off');
  assert.equal(said[0]?.scene, 'ram');
  assert.ok((said[0]?.at ?? 1) < STEP_S * 1.5, 'at once');
  const own = story.sailing.frame([story.brig.sailed()], 0, 0, 0, undefined)[0]?.place;
  const deck = own && onBrig(own, [{ at: 0, eye: [...DECK_VIEW.eye], look: [...DECK_VIEW.look] }], 0);
  const opening = frames[0]?.frame.shot;
  assert.ok(deck && opening && turnBetween(deck.yaw, opening.yaw) < 0.02, `${deck?.yaw} ${opening?.yaw}`);
  for (const { at, frame } of frames.filter((each) => each.at <= BRACED_S)) {
    assert.deepEqual(unseen(frame, speakers('ram')), [], `at ${at.toFixed(2)} s`);
  }
  const { brig } = story;
  const side = brig.heading + Math.PI / 2;
  for (const { at, frame } of frames.filter((each) => each.at >= 3.6 && each.at <= BRACED_S)) {
    const away = rammerAway(at);
    const middle = [brig.x + Math.sin(side) * away, brig.y - Math.cos(side) * away, 6] as const;
    assert.ok(
      headOnView(onScreen(frame.shot, VIEW, middle), VIEW),
      `the larger ship on the view at ${at.toFixed(2)} s`,
    );
  }
});

test('a ram skipped at once still leaves her struck and the screen black, and says and sounds nothing', () => {
  const { story, said, done, run } = storied();
  const ram = new Ram(story);
  ram.skip();
  run(ram, 2);
  assert.deepEqual(said, []);
  assert.ok(done.includes('fade'));
  for (const sound of ['crash', 'ringing', 'whoosh', 'cut']) assert.ok(!done.includes(sound), sound);
  assert.ok(ram.meeting, 'where they met is kept for the wreck');
});

const viewOf = (states: readonly ('afloat' | 'struck')[]): FightView => {
  const vessel = {
    ship: [10_000, 20_000, 0.7, 0, 0, 0, 0, 2],
    pose: [0, 0, 0, 0],
    hull: 240,
    max_hull: 240,
    sail: 96,
    max_sail: 96,
    crew: 0,
    max_crew: 0,
    state: 'afloat',
    fires: 0,
    guns: { left: [0, 0], progress: [1, 1], load: 'round', braced: false },
  } as const;
  const [first, ...rest] = states.map((state, index) => ({
    ...vessel,
    ship: [10_300 + index * 50, 19_300, 3, 0, 0, 0, 0, 2],
    state,
    name: 'Pirate Sloop',
    faction: 2,
    rank: 2,
    mode: 'engage' as const,
    hostile: true,
    run_out: [],
  }));
  if (!first) throw new Error('a captain');
  const beaten = states.every((state) => state !== 'afloat');
  return {
    clock: 0,
    player: vessel,
    captain: first,
    others: rest,
    balls: [],
    lay: null,
    events: [],
    over: beaten ? 'beaten' : null,
    fingerprint: '',
  };
};

test('the fight begins on the story clock, tells how many ships are left, and leaves its beaten ships for the calm', async () => {
  let begunAt = Number.NaN;
  const answers = [viewOf(['afloat', 'struck', 'afloat']), viewOf(['struck', 'struck', 'struck'])];
  const land = {
    fightBegin: (_ship: Float64Array, _seed: number, time: number, _captains: readonly CaptainAt[]) => {
      begunAt = time;
      return Promise.resolve(viewOf(['afloat', 'afloat', 'afloat']));
    },
    fightStep: () => Promise.resolve(answers.shift() ?? viewOf(['struck', 'struck', 'struck'])),
    fightEnd: () => Promise.resolve(),
  } as unknown as LandWorker;
  const { story, done, run } = storied({ land });
  const battle = new Battle(story, inboundAt(story.brig));
  for (let time = 40; time < 41 && !battle.done; time += 0.1) {
    run(battle, 0.1, time);
    await new Promise((settle) => setTimeout(settle, 0));
  }
  assert.ok(Math.abs(begunAt - (40 + STEP_S)) < 1e-6, `begun at ${begunAt}`);
  const told = done.filter((each) => each.startsWith('hints Ships'));
  assert.ok(told.includes('hints Ships left: 3 of 3.') && told.includes('hints Ships left: 2 of 3.'), told.join());
  assert.equal(battle.done, true, 'over once every captain is beaten');
  assert.equal(battle.wrecks?.length, 3);
  assert.ok(battle.wrecks?.every((wreck) => !wreck.underWay));
});

test('a fight that cannot begin is thrown from the frame after, for the director to go on past it', async () => {
  const land = {
    fightBegin: () => Promise.reject(new Error('no landmass is open')),
  } as unknown as LandWorker;
  const { story, run } = storied({ land });
  const battle = new Battle(story, inboundAt(story.brig));
  run(battle, STEP_S);
  await new Promise((settle) => setTimeout(settle, 0));
  assert.throws(() => run(battle, STEP_S, STEP_S), /no landmass is open/);
  assert.equal(battle.wrecks, null, 'the calm lays its own wrecks');
});

test('a story begun at the fight takes its ships without playing the sighting', async () => {
  const { Prologue } = await import('./prologue.ts');
  const { storyCueNow } = await import('./music.ts');
  Object.assign(globalThis, { localStorage: { getItem: () => null, setItem: () => undefined } });
  const { story, said, done } = storied();
  const director = new Prologue(story, {} as never, {} as never, {} as never, 'battle');
  assert.equal(director.now.name, 'battle');
  assert.equal(storyCueNow(), 'battle');
  assert.deepEqual(said, []);
  assert.ok(!done.includes('weather 1.5'), 'no sighting eased the fog in');
});
