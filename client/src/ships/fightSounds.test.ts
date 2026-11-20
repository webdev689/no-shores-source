import assert from 'node:assert/strict';
import { test } from 'node:test';
import listed from '../../../content/audio/freesound.json' with { type: 'json' };
import type { Cue } from './fightFeel.ts';
import { playCues, SEA_SOUNDS, type SoundOutput } from './fightSounds.ts';

/** A page's audio as far as the cues use it: each panner and gain made, and each sound asked for. */
function audio() {
  const param = () => ({ value: 0 });
  const node = () => ({ connect: () => node(), disconnect: () => undefined, gain: param() });
  const context = {
    listener: {
      positionX: param(),
      positionY: param(),
      positionZ: param(),
      forwardX: param(),
      forwardY: param(),
      forwardZ: param(),
    },
    createPanner: () => ({ ...node(), positionX: param(), positionY: param(), positionZ: param() }),
    createGain: () => node(),
  };
  const output = { audio: context, out: node() } as unknown as SoundOutput;
  const played: { cue: string; gain: number }[] = [];
  const play = (_audio: AudioContext, out: AudioNode, cue: string) => {
    played.push({ cue, gain: Math.round((out as unknown as { gain: { value: number } }).gain.value * 100) / 100 });
    return { onended: null } as unknown as AudioBufferSourceNode;
  };
  return { output, played, play };
}

const east = (metres: number): Cue['at'] => [metres, 0, 0];

test("each sea sound carries DFO's sea distances: a cannon to 2400 m, a whistle 90 m, her ready 80 m", () => {
  assert.deepEqual(SEA_SOUNDS['ship.cannon'], { nearM: 30, mostM: 2400 });
  assert.deepEqual(SEA_SOUNDS['ship.whistle'], { nearM: 8, mostM: 90 });
  const { output, played, play } = audio();
  const cues: Cue[] = [
    { cue: 'ship.whistle', at: east(120) },
    { cue: 'ship.ready', at: east(60) },
    { cue: 'ship.hit', at: east(900), gain: 0.9 },
  ];
  playCues(output, cues, [0, 0, 0], 0, play);
  assert.deepEqual(
    played.map(({ cue }) => cue),
    ['ship.ready', 'ship.hit'],
  );
});

test("a gun near is the near report, past DFO's 320 m the far roll once a volley, crossfaded between", () => {
  const near = audio();
  playCues(near.output, [{ cue: 'ship.cannon', at: east(50) }], [0, 0, 0], 0, near.play);
  assert.deepEqual(near.played, [{ cue: 'ship.cannon', gain: 1 }]);
  const far = audio();
  playCues(
    far.output,
    [
      { cue: 'ship.cannon', at: east(1500) },
      { cue: 'ship.cannon', at: east(1505) },
    ],
    [0, 0, 0],
    0,
    far.play,
  );
  assert.deepEqual(far.played, [{ cue: 'ship.cannon-far', gain: 0.46 }]);
  const between = audio();
  playCues(between.output, [{ cue: 'ship.cannon', at: east(260) }], [0, 0, 0], 0, between.play);
  assert.deepEqual(
    between.played.map(({ cue }) => cue),
    ['ship.cannon', 'ship.cannon-far'],
  );
});

test('a jar of the eye is no sound', () => {
  const { output, played, play } = audio();
  assert.equal(playCues(output, [{ cue: 'kick', at: east(0), kick: 1.1 }], [0, 0, 0], 0, play), 0);
  assert.equal(played.length, 0);
});

test("every sea sound is a cue on the sound sheet, DFO's own synthesised sounds its candidates", () => {
  const sheet = new Map(listed.cues.map((cue) => [cue.id, cue]));
  for (const cue of Object.keys(SEA_SOUNDS)) assert.ok(sheet.has(cue), `${cue} is on the sheet`);
  for (const cue of Object.keys(SEA_SOUNDS).filter((id) => id.startsWith('ship.')))
    assert.ok('dfo' in (sheet.get(cue) ?? {}), `${cue} offers DFO's own`);
});

test("a far volley's guns spread over frames roll once", () => {
  const { output, played, play } = audio();
  playCues(output, [{ cue: 'ship.cannon', at: east(1500) }], [0, 0, 0], 0, play);
  playCues(output, [{ cue: 'ship.cannon', at: east(1500) }], [0, 0, 0], 0, play);
  assert.equal(played.filter(({ cue }) => cue === 'ship.cannon-far').length, 1);
});
