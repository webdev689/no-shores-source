import assert from 'node:assert/strict';
import { test } from 'node:test';
import scenes from '../../../../content/story/prologue.json' with { type: 'json' };
import ships from '../../../../content/ships/ships.json' with { type: 'json' };
import type { CaptainAt } from '../../rules/fightRules.ts';
import type { LandWorker } from '../../terrain/landClient.ts';
import type { Line } from '../../speech/cast.ts';
import { onScreen } from '../camera.ts';
import { Battle, type Wreck } from './battle.ts';
import { Calm, DECK_VIEW, onBrig } from './calm.ts';
import { BRACED_S, IMPACT_S, Ram, RAMMER_SHADE, rammerAway } from './ram.ts';
import { onDeck } from './sailing.ts';
import { CRY_S, inboundAt, Sighted } from './sighted.ts';
import { headOnView } from './stage.ts';
import { FROM, lying, sayingS, speakers, STEP_S, storied, turnBetween, unseen, VIEW, viewOf } from './seaStory.test.ts';

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
  const wrecks: Wreck[] = [
    { ship: { ...lying('struck', 10_300, 20_000, 1), founder: [0, 0, -0.1] }, going: null },
    {
      ship: { ...lying('going', 10_000, 20_400, 2), founder: [0.8, 0.1, 0.2] },
      going: { sunk: [9, 0.35, 0.56], inS: 12 },
    },
  ];
  const frames = run(new Calm(story, FROM, wrecks), 6);
  const [early, late] = [frames[0]?.frame.ships ?? [], frames.at(-1)?.frame.ships ?? []];
  assert.equal(early.length, 3, 'the Brig and both wrecks');
  assert.ok(early[1] && late[1] && Math.abs(early[1].place.z - late[1].place.z) < 1e-9, 'the struck one lies still');
  assert.ok(early[2] && late[2] && late[2].place.z < early[2].place.z - 1, 'the other goes on down');
  assert.equal(late[2]?.place.x, 10_000);
});

test('as the lookout speaks of the wrecks the camera looks out over him to the nearest, and comes back after', () => {
  const { story, saying, run } = storied();
  const wrecks: Wreck[] = [
    { ship: lying('far', 10_900, 20_600, 1), going: null },
    // Astern of her, where the deck shot looking forward down her deck cannot see it.
    { ship: lying('near', 9_839, 20_191, 2), going: null },
  ];
  const calm = new Calm(story, FROM, wrecks);
  const onDeckOnly = run(calm, 4).at(-1)?.frame;
  const astern = onDeckOnly?.ships?.[2]?.place;
  assert.ok(
    onDeckOnly && astern && !headOnView(onScreen(onDeckOnly.shot, VIEW, [astern.x, astern.y, astern.z + 2]), VIEW),
  );
  const lines = scenes.scenes.calm as readonly Line[];
  const [lookout, mate] = [lines.find((line) => line.who === 'lookout'), lines.find((line) => line.who === 'mate')];
  assert.ok(lookout && mate);
  saying.get('calm')?.(lookout);
  const out = run(calm, 1.6, 4).at(-1)?.frame;
  assert.ok(out);
  const near = out.ships?.[2]?.place;
  assert.ok(near && near.x === 9_839, 'the nearest wreck is the second');
  assert.ok(headOnView(onScreen(out.shot, VIEW, [near.x, near.y, near.z + 2]), VIEW), 'the nearest wreck in view');
  const head = out.heads?.get('lookout');
  assert.ok(head && headOnView(onScreen(out.shot, VIEW, head), VIEW), 'the lookout in view as he speaks');
  const pushed = run(calm, 2.4, 5.6).at(-1)?.frame.shot;
  assert.ok(pushed);
  const [foot, top] = [
    onScreen(pushed, VIEW, [near.x, near.y, near.z]),
    onScreen(pushed, VIEW, [near.x, near.y, near.z + 15]),
  ];
  assert.ok(
    foot && top && foot[1] - top[1] >= VIEW.height * 0.15,
    `the wreck read at ${near.x}: ${foot?.[1]} ${top?.[1]}`,
  );
  saying.get('calm')?.(mate);
  const back = run(calm, 1.6, 8).at(-1)?.frame.shot;
  const own = story.sailing.frame([story.brig.sailed()], 0, 0, 0, undefined)[0]?.place;
  const deck = own && onBrig(own, [{ at: 0, eye: [...DECK_VIEW.eye], look: [...DECK_VIEW.look] }], 0);
  assert.ok(back && deck && Math.hypot(back.eye[0] - deck.eye[0], back.eye[1] - deck.eye[1]) < 0.5, 'back on deck');
  assert.ok(back && Math.abs(back.fov - deck.fov) < 1e-6);
});

test('the ram opens where the calm left the camera, its cries on the view and the larger ship shown coming', () => {
  const { story, said, done, run } = storied();
  const ram = new Ram(story, []);
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

test("the larger ship is Thule's Frigate at her own size, lighter than a captain's, her stem first touching the Brig's side as she strikes", () => {
  const { story, run } = storied();
  const frames = run(new Ram(story, []), IMPACT_S);
  const drawn = frames.at(-1)?.frame.ships ?? [];
  const [own, rammer] = [drawn[0]?.place, drawn[1]];
  assert.ok(own && rammer);
  assert.equal(rammer.hull, 'frigate');
  assert.equal(rammer.place.scale, 1);
  assert.equal(rammer.shade, RAMMER_SHADE);
  // The head of her stem, the fore end of her hull's box, is at the Brig's side where her hull is broadest.
  const [stemX, stemY] = onDeck(rammer.place, ships.ships.frigate.boxes.hull[1][0], 0, 0);
  const out = Math.hypot(stemX - own.x, stemY - own.y);
  const broadest = ships.ships.brig.boxes.hull[1][1];
  assert.ok(Math.abs(out - broadest) < 0.05, `her stem ${out.toFixed(2)} m from the Brig's middle`);
  const coming = (rammerAway(IMPACT_S - 1) - rammerAway(IMPACT_S)) / 1;
  assert.ok(coming > 4 && coming < 8, `she comes at a ship's pace under sail: ${coming.toFixed(1)} m/s`);
});

test('a ram skipped at once still leaves her struck and the screen black, and says and sounds nothing', () => {
  const { story, said, done, run } = storied();
  const ram = new Ram(story, []);
  ram.skip();
  run(ram, 2);
  assert.deepEqual(said, []);
  assert.ok(done.includes('fade'));
  for (const sound of ['crash', 'ringing', 'whoosh', 'cut']) assert.ok(!done.includes(sound), sound);
  assert.ok(ram.meeting, 'where they met is kept for the wreck');
});

test('the fight begins on the story clock, tasks the player with the ships left, and leaves its beaten ships for the calm', async () => {
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
  const told = done.filter((each) => each.startsWith('task '));
  const left = (ships: number) => `task Ships left ${ships}, Their men `;
  const said = (ships: number) => told.some((each) => each.startsWith(left(ships)));
  assert.ok(said(3) && said(2), told.join());
  assert.equal(battle.done, true, 'over once every captain is beaten');
  assert.equal(battle.wrecks?.length, 3);
  assert.ok(battle.wrecks?.every((wreck) => !wreck.ship.underWay));
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
  Object.assign(globalThis, { localStorage: { getItem: () => null, setItem: () => undefined } });
  const { story, said, done } = storied();
  // The wreck's mesh and light are fetched once the story is past its intro: here they never come.
  const wreckContext = { drawn: () => new Promise(() => undefined) };
  const director = new Prologue(story, {} as never, wreckContext as never, 'battle');
  assert.equal(director.now.name, 'battle');
  assert.deepEqual(
    director.now.music?.().story,
    { kind: 'song', song: 'storm', mood: 'peak' },
    'the storm, till it begins',
  );
  assert.deepEqual(said, []);
  assert.ok(!done.includes('weather 1.5'), 'no sighting eased the fog in');
});

test('a wreck the fight left far off still reads as the lookout speaks of her', () => {
  const { story, saying, run } = storied();
  // As far as the pirates were sighted: about 700 m astern.
  const calm = new Calm(story, FROM, [{ ship: lying('far', 9_550, 20_530, 1), going: null }]);
  run(calm, 4);
  const lookout = (scenes.scenes.calm as readonly Line[]).find((line) => line.who === 'lookout');
  assert.ok(lookout);
  saying.get('calm')?.(lookout);
  const frame = run(calm, 4, 4).at(-1)?.frame;
  const far = frame?.ships?.[1]?.place;
  assert.ok(frame && far);
  const [foot, top] = [
    onScreen(frame.shot, VIEW, [far.x, far.y, far.z]),
    onScreen(frame.shot, VIEW, [far.x, far.y, far.z + 15]),
  ];
  assert.ok(foot && top && foot[1] - top[1] >= VIEW.height * 0.15, `${foot?.[1]} ${top?.[1]}`);
});
