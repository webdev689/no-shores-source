import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import type { Line } from '../../speech/cast.ts';
import { CLEAR } from '../../cinema/weather.ts';
import type { ToldSky } from '../../sky/skyDriver.ts';
import { WRECK } from './skies.ts';
import { HUD_VEIL_S, headOnView, Stage, type StageParts } from './stage.ts';
import { STORY_DAY_S } from './storySky.ts';

test('a scene plays in order, barks over heads and runs of lines in the box, its words with no glyph', async () => {
  const said: string[] = [];
  const lines: Line[] = [
    { who: 'lookout', say: 'Sails!', kind: 'bark', emote: 'alert' },
    { who: 'mate', say: 'They mean to take us.', emote: 'anger' },
    { who: 'gunner', say: 'Guns are loaded.' },
    { who: 'bosun', say: 'Brace!', kind: 'bark' },
  ];
  const parts = {
    scenes: { sighted: lines },
    cast: { speakers: {}, voices: {} },
    overheads: {
      bark: (head: string, line: Line) => said.push(`bark ${head}: ${line.say}`),
      emote: (head: string, kind: string) => said.push(`emote ${head}: ${kind}`),
    },
    dialogue: {
      play: (run: readonly Line[], _cast: unknown, options: { onLine: (line: Line, index: number) => void }) => {
        said.push(`box: ${run.map((line) => line.say).join(' / ')}`);
        run.forEach((line, index) => options.onLine(line, index));
        return Promise.resolve();
      },
    },
  } as unknown as StageParts;
  const stage = new Stage(parts);
  const playing = stage.play('sighted', true, { gunner: 'gun-crew' });
  for (let step = 0; step < 10; step++) {
    await Promise.resolve();
    stage.tick(1.1);
  }
  await playing;
  assert.deepEqual(said, [
    'bark lookout: Sails!',
    'box: They mean to take us. / Guns are loaded.',
    'bark bosun: Brace!',
  ]);
});

test('a scene the story does not hold plays nothing', async () => {
  const parts = { scenes: {}, cast: {}, overheads: {}, dialogue: {} } as unknown as StageParts;
  await new Stage(parts).play('nowhere');
});

test('a head off the edges of the view, or behind the eye, has no point, so its words are neither shown nor heard', () => {
  const view = { width: 1600, height: 900 };
  assert.deepEqual(headOnView([800, 450], view), [800, 450]);
  assert.deepEqual(headOnView([0, 900], view), [0, 900], 'the edge itself is on the view');
  assert.equal(headOnView([-1100, 400], view), null, 'off the left edge');
  assert.equal(headOnView([800, 950], view), null, 'under the bottom edge');
  assert.equal(headOnView(null, view), null, 'behind the eye');
});

test('a hushed scene stops at once: no line after the hush is said, and the box and the heads are cleared', async () => {
  const said: string[] = [];
  const lines: Line[] = [
    { who: 'lookout', say: 'Sails!', kind: 'bark' },
    { who: 'bosun', say: 'Three!', kind: 'bark' },
    { who: 'mate', say: 'They mean to take us.' },
  ];
  const parts = {
    scenes: { sighted: lines },
    cast: { speakers: {}, voices: {} },
    overheads: {
      bark: (_head: string, line: Line) => said.push(line.say),
      clear: () => said.push('heads cleared'),
    },
    dialogue: {
      play: (run: readonly Line[]) => (said.push(...run.map((line) => line.say)), Promise.resolve()),
      skip: () => said.push('box closed'),
    },
  } as unknown as StageParts;
  const stage = new Stage(parts);
  const playing = stage.play('sighted');
  await Promise.resolve();
  stage.hush();
  // The hush ends the gap the scene was waiting out at once: no time has to pass for it to stop.
  await playing;
  assert.deepEqual(said, ['Sails!', 'box closed', 'heads cleared']);
});

test('leaving gives the game back its clear weather and its own sky, quiet, an HUD with no death or fight, and an open view', () => {
  const done: string[] = [];
  const note = (what: string) => () => void done.push(what);
  const scene = { weather: { ...CLEAR, rain: 1, overcast: 1 }, sky: { told: {} as unknown } };
  const parts = {
    scene,
    ambience: { stop: note('quiet') },
    birds: { clear: note('no birds') },
    flames: { clear: note('no fires') },
    hud: {
      reach: (standing: { kind: string }) => done.push(`reach ${standing.kind}`),
      hints: note('no hints'),
      tasks: { show: (quest: unknown) => quest === null && done.push('no task') },
      seaFight: (ship: unknown) => ship === null && done.push('no ship panel'),
      toast: (...texts: string[]) => texts.length === 0 && done.push('no toasts'),
    },
    footView: { hide: note('no fight panel') },
    screen: { clear: note('open view') },
    dialogue: { skip: note('box closed') },
    overheads: { clear: note('heads cleared') },
  } as unknown as StageParts;
  const stage = new Stage(parts);
  stage.weatherTowards({ ...CLEAR, rain: 1 }, 0);
  mock.timers.enable({ apis: ['setTimeout'] });
  stage.leave();
  assert.deepEqual(scene.weather, CLEAR);
  assert.deepEqual(stage.weather, CLEAR);
  assert.equal(scene.sky.told, null, "the world's own sky");
  const cleared = [
    'quiet',
    'no birds',
    'no fires',
    'no task',
    'no ship panel',
    'no toasts',
    'reach inside',
    'no hints',
  ];
  for (const what of [...cleared, 'no fight panel']) assert.ok(done.includes(what), what);
  assert.ok(done.includes('box closed') && done.includes('heads cleared'));
  // The story's black holds while the game's veil rises over it, and goes once the veil is up.
  mock.timers.tick(HUD_VEIL_S * 1000 - 1);
  assert.ok(!done.includes('open view'), 'the black holds under the rising veil');
  mock.timers.tick(1);
  mock.timers.reset();
  assert.ok(done.includes('open view'));
});

test("a bark's gap is counted in the story's time, so a slow frame never lets the next line come early", async () => {
  const said: string[] = [];
  const lines: Line[] = [
    { who: 'lookout', say: 'Sails!', kind: 'bark' },
    { who: 'bosun', say: 'Three!', kind: 'bark' },
  ];
  const parts = {
    scenes: { sighted: lines },
    cast: { speakers: {}, voices: {} },
    overheads: { bark: (_head: string, line: Line) => said.push(line.say) },
    dialogue: {},
  } as unknown as StageParts;
  const stage = new Stage(parts);
  const playing = stage.play('sighted');
  await new Promise((settle) => setTimeout(settle, 1300));
  assert.deepEqual(said, ['Sails!'], 'more than the gap passed on the wall, none in the story');
  stage.tick(1.05);
  await Promise.resolve();
  assert.deepEqual(said, ['Sails!'], 'not yet the whole gap');
  stage.tick(0.1);
  await Promise.resolve();
  assert.deepEqual(said, ['Sails!', 'Three!']);
  // The scene ends once the last bark's own gap has passed too.
  stage.tick(1.1);
  await playing;
});

test("the stage tells the game's sky the story's weather at its hour, each bolt one strike, and keeps the rest", () => {
  const scene = { weather: CLEAR, sky: { told: null as ToldSky | null } };
  const stage = new Stage({ scene } as unknown as StageParts);
  stage.weatherTowards(WRECK, 0);
  const bolt = { x: 400, y: -900, seed: 7 };
  stage.stepWeather(0.5, 0.8, bolt);
  stage.stepWeather(0.1, 0.6, bolt);
  stage.stepWeather(0.1, 0, null);
  const told = scene.sky.told;
  assert.ok(told);
  assert.deepEqual([told.weather.falling, (told.worldS - STORY_DAY_S).toFixed(3)], [WRECK.rain, '0.700']);
  assert.deepEqual(told.strikes, [{ x: 400, y: -900, atS: STORY_DAY_S + 0.5, toGround: true, power: 1 }], 'one strike');
  assert.deepEqual([scene.weather.rain, scene.weather.flash, scene.weather.glow], [0, 0, WRECK.glow]);
  stage.weatherTowards({ ...CLEAR, rain: 1 }, 0);
  stage.stepWeather(0.1);
  assert.equal(scene.sky.told, null, 'a weather with no hour leaves the world its sky, and lays its own');
  assert.equal(scene.weather.rain, 1);
});

test("a frame heard at sea or ashore plays the world's own soundscape there, the story's beds handing it the sea", () => {
  const heard: string[] = [];
  const landmass = { nodes: [{ kind: 'social' }, { kind: 'patrol', id: 'cove' }] };
  const parts = {
    scene: { draw: () => undefined },
    figures: {},
    forge: {},
    hulls: {},
    birds: {},
    flames: {},
    overheads: { frame: () => undefined },
    dialogue: { frame: () => undefined },
    screen: { blurPixels: 0 },
    canvas: { clientWidth: 960, clientHeight: 540 },
    landDrawers: () => null,
    landmass: () => landmass,
    ambience: { handOver: (world: boolean) => heard.push(`story beds ${world ? 'handed over' : 'their own'}`) },
    worldSound: {
      atSea: (land: unknown, ship: readonly number[], ear: unknown, voyage: { deck: boolean }) =>
        heard.push(`sea at ${ship.join(',')} ${voyage.deck ? 'on deck' : 'over her'}`),
      onFoot: (node: { id: string }) => heard.push(`ashore by ${node.id}`),
    },
  } as unknown as StageParts;
  const stage = new Stage(parts);
  const shot = { eye: [0, 0, 5], yaw: 0, pitch: 0, fov: 1, near: 0.1, far: 100 } as const;
  const size = { width: 960, height: 540 };
  stage.draw({ shot, focus: [10, 20], heard: { at: 'sea', deck: true, sailing: false } }, size, 0, 0.1);
  assert.ok(stage.hearsTheWorld);
  stage.draw({ shot, heard: { at: 'ashore' } }, size, 0, 0.1);
  stage.draw({ shot }, size, 0, 0.1);
  assert.ok(!stage.hearsTheWorld, "the deep and the intro are the story's own");
  assert.deepEqual(heard, [
    'story beds handed over',
    'sea at 10,20 on deck',
    'story beds handed over',
    'ashore by cove',
    'story beds their own',
  ]);
});
