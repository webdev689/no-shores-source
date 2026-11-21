// A sea fight's sounds, heard where each happens: each cue is the game's own recording for it (soundSamples.ts), and
// a cue without one stays silent, never stood in for. A sea fight is heard over a sea's distances (DFO's
// navalSounds.js NAVAL_SOUND_RANGE): each sound full within its near reach, falling off past it, gone past its most.
// A gun far off is heard as the far roll across the water rather than the near report, crossfaded between, the roll
// once a volley (DFO's navalHost.js THE MIX).
import { playSample } from '../soundSamples.ts';
import type { Cue } from './fightFeel.ts';

/** Each sea sound's reach, metres: full within `nearM`, inverse past it, gone past `mostM`. */
export const SEA_SOUNDS: Readonly<Record<string, { readonly nearM: number; readonly mostM: number }>> = {
  'ship.cannon': { nearM: 30, mostM: 2400 },
  'ship.cannon-far': { nearM: 70, mostM: 3000 },
  'ship.swivel': { nearM: 14, mostM: 1200 },
  'ship.hit': { nearM: 16, mostM: 1000 },
  'ship.blast': { nearM: 26, mostM: 1800 },
  'ship.grapple': { nearM: 6, mostM: 240 },
  // The run-out is the tell, carried across the fight; the ship's own battery ready is a word for its helm alone.
  'ship.runout': { nearM: 24, mostM: 900 },
  'ship.ready': { nearM: 10, mostM: 80 },
  'ship.sinking': { nearM: 18, mostM: 420 },
  'ship.whistle': { nearM: 8, mostM: 90 },
  'shot.splash': { nearM: 12, mostM: 600 },
};
/** Any other cue's reach. */
const OTHER = { nearM: 10, mostM: 600 } as const;
/** A gun's report is the near one within this of the eye, the far roll past it, crossfaded over this either side;
 *  the roll at this share of the near report's level. */
export const NEAR_BOOM_M = 260;
const FAR_FADE_M = 60;
const FAR_MATCH = 0.46;
/** A volley's far roll plays once in this long, seconds. */
const ROLL_S = 1.5;
/** When each page's audio last rolled a far volley. */
const rolledAt = new WeakMap<object, number>();

/** Where the sounds play: a page's audio context and the node they go into. */
export interface SoundOutput {
  readonly audio: AudioContext;
  readonly out: AudioNode;
}

type Play = typeof playSample;

/** The cues heard from the eye (`eye`, the cues' own metres) looking along `yaw` (radians clockwise from north); a
 *  jar of the eye is none. Answers how many played. */
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
  const sound = (cue: string, spot: Cue['at'], gain: number) => {
    const reach = SEA_SOUNDS[cue] ?? OTHER;
    if (gain <= 0 || Math.hypot(spot[0] - eye[0], spot[1] - eye[1], spot[2] - eye[2]) > reach.mostM) return;
    const panner = audio.createPanner();
    Object.assign(panner, {
      panningModel: 'equalpower',
      distanceModel: 'inverse',
      refDistance: reach.nearM,
      maxDistance: reach.mostM,
    });
    [panner.positionX.value, panner.positionY.value, panner.positionZ.value] = [spot[0], spot[2], spot[1]];
    const level = audio.createGain();
    level.gain.value = gain;
    level.connect(panner);
    panner.connect(out);
    const source = play(audio, level, cue);
    if (!source) panner.disconnect();
    else {
      source.onended = () => panner.disconnect();
      played++;
    }
  };
  for (const { cue, at, gain = 1, kick } of cues) {
    if (kick !== undefined) continue;
    if (cue !== 'ship.cannon') {
      sound(cue, at, gain);
      continue;
    }
    const away = Math.hypot(at[0] - eye[0], at[1] - eye[1]);
    const far = Math.min(1, Math.max(0, (away - (NEAR_BOOM_M - FAR_FADE_M)) / (2 * FAR_FADE_M)));
    if (far < 1) sound(cue, at, gain * Math.cos((far * Math.PI) / 2));
    const clock = (audio as { readonly currentTime?: number }).currentTime ?? 0;
    if (far > 0 && clock - (rolledAt.get(audio) ?? -Infinity) >= ROLL_S) {
      rolledAt.set(audio, clock);
      sound('ship.cannon-far', at, gain * FAR_MATCH * Math.sin((far * Math.PI) / 2));
    }
  }
  return played;
}
