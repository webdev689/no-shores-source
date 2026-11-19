import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import type { Line } from '../../speech/cast.ts';
import { Stage, type StageParts } from './stage.ts';

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
