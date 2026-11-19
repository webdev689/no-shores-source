// A sea fight's sounds, heard where each happens: each cue is the game's own recording for it (soundSamples.ts), and
// a cue without one stays silent, never stood in for. A sea fight is watched from far off, so it carries further
// than a fight on foot.
import { playSample } from '../soundSamples.ts';
import type { Cue } from './fightFeel.ts';

/** A cue is heard at its fullest within this of the eye, and not at all past this, metres. */
const NEAR_M = 10;
const MOST_M = 600;

/** Where the sounds play: a page's audio context and the node they go into. */
export interface SoundOutput {
  readonly audio: AudioContext;
  readonly out: AudioNode;
}

type Play = typeof playSample;

/** The cues heard from the eye (`eye`, the cues' own metres) looking along `yaw` (radians clockwise from north). */
export function playCues(
  output: SoundOutput | null,
  cues: readonly Cue[],
  eye: readonly [number, number, number],
  yaw: number,
  play: Play = playSample,
): number {
  if (!output || cues.length === 0) return 0;
  const { audio, out } = output;
  const listener = audio.listener;
  // The world's east, south and up are the listener's x, z and y.
  if (listener.positionX as AudioParam | undefined) {
    [listener.positionX.value, listener.positionY.value, listener.positionZ.value] = [eye[0], eye[2], eye[1]];
    [listener.forwardX.value, listener.forwardY.value, listener.forwardZ.value] = [Math.sin(yaw), 0, -Math.cos(yaw)];
  }
  let played = 0;
  for (const { cue, at } of cues) {
    if (Math.hypot(at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]) > MOST_M) continue;
    const panner = audio.createPanner();
    Object.assign(panner, { panningModel: 'equalpower', distanceModel: 'inverse', refDistance: NEAR_M, maxDistance: MOST_M });
    [panner.positionX.value, panner.positionY.value, panner.positionZ.value] = [at[0], at[2], at[1]];
    panner.connect(out);
    const source = play(audio, panner, cue);
    if (!source) panner.disconnect();
    else {
      source.onended = () => panner.disconnect();
      played++;
    }
  }
  return played;
}
