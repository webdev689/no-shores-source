import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mock, test } from 'node:test';
import type { Line } from '../../speech/cast.ts';
import { CLEAR } from '../../cinema/weather.ts';
import { HUD_VEIL_S, headOnView, Stage, type StageParts } from './stage.ts';

test('a scene plays in order: barks over heads, runs of lines together in the box, each line its emote', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
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
  const playing = new Stage(parts).play('sighted', true, { gunner: 'gun-crew' });
  for (let step = 0; step < 10; step++) {
    await Promise.resolve();
    mock.timers.tick(1100);
  }
  await playing;
  mock.timers.reset();
  assert.deepEqual(said, [
    'bark lookout: Sails!',
    'emote lookout: alert',
    'box: They mean to take us. / Guns are loaded.',
    'emote mate: anger',
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
  mock.timers.enable({ apis: ['setTimeout'] });
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
      emote: () => undefined,
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
  for (let step = 0; step < 5; step++) {
    mock.timers.tick(1100);
    await Promise.resolve();
  }
  await playing;
  mock.timers.reset();
  assert.deepEqual(said, ['Sails!', 'box closed', 'heads cleared']);
});

test('leaving gives the game back its clear weather, quiet, an HUD with no death or fight, and an open view', () => {
  const done: string[] = [];
  const note = (what: string) => () => void done.push(what);
  const scene = { weather: { ...CLEAR, rain: 1, overcast: 1 } };
  const parts = {
    scene,
    ambience: { stop: note('quiet') },
    birds: { clear: note('no birds') },
    flames: { clear: note('no fires') },
    objective: { clear: note('no prompt') },
    hud: { reach: (standing: { kind: string }) => done.push(`reach ${standing.kind}`), hints: note('no hints') },
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
  for (const what of ['quiet', 'no birds', 'no fires', 'no prompt', 'reach inside', 'no hints', 'no fight panel'])
    assert.ok(done.includes(what), what);
  assert.ok(done.includes('box closed') && done.includes('heads cleared'));
  // The story's black holds while the game's veil rises over it, and goes once the veil is up.
  mock.timers.tick(HUD_VEIL_S * 1000 - 1);
  assert.ok(!done.includes('open view'), 'the black holds under the rising veil');
  mock.timers.tick(1);
  mock.timers.reset();
  assert.ok(done.includes('open view'));
});

test("the veil's time is the page's own veil transition", () => {
  const page = readFileSync(new URL('../../../index.html', import.meta.url), 'utf8');
  const veil = /\n\s*\.veil \{[^}]*transition: opacity ([\d.]+)s/.exec(page);
  assert.equal(Number(veil?.[1]), HUD_VEIL_S);
});
