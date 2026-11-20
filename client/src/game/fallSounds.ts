// The sounds of a fall in a social space, made from the page's own oscillators: a whistle sliding down in pitch while
// a dead body drops, heard where it is, and a thud where it lands. The player hears their own; others near hear it too.

import type { Point3 } from '../cinema/rail.ts';
import { whistlePitch } from './fallLaw.ts';

/** Where the sounds play: a page's audio context and the node they go into (null: none may sound yet). */
type Output = { readonly audio: AudioContext; readonly out: AudioNode } | null;

/** A body as the sounds hear it this frame: whose, where its feet are, and whether it is falling dead. */
export interface HeardFall {
  readonly id: number;
  readonly at: Point3;
  readonly falling: boolean;
}

/** A fall is as loud as it is this close (metres), fading by distance beyond; none is heard farther than the most. */
const NEAR_M = 12;
const MOST_M = 160;
/** How loud the whistle and the thud are at their nearest. */
const WHISTLE_PEAK = 0.16;
const THUD_PEAK = 0.9;
/** The whistle's warble: how fast, and how far either way as a share of its pitch. */
const WARBLE_HZ = 5.5;
const WARBLE_SHARE = 0.012;

interface Whistle {
  readonly voice: OscillatorNode;
  readonly warble: OscillatorNode;
  readonly depth: GainNode;
  readonly gain: GainNode;
  readonly panner: PannerNode;
  seconds: number;
}

/** A panner at `at` (world east, south, up as the listener's x, z, y), fading by distance as the world's sounds do. */
function pannerAt(audio: AudioContext, place: Point3): PannerNode {
  const panner = audio.createPanner();
  Object.assign(panner, { panningModel: 'equalpower', distanceModel: 'inverse', refDistance: NEAR_M });
  panner.maxDistance = MOST_M;
  placePanner(panner, place);
  return panner;
}

function placePanner(panner: PannerNode, place: Point3): void {
  [panner.positionX.value, panner.positionY.value, panner.positionZ.value] = [place[0], place[2], place[1]];
}

/**
 * The falls heard: each body's whistle from the frame it is seen falling dead, following it down, ended by a thud
 * the frame it is seen landed. A body first seen already lying makes no sound for a fall it was heard in before.
 */
export class FallSounds {
  private readonly live: () => Output;
  private readonly whistles = new Map<number, Whistle>();

  constructor(live: () => Output) {
    this.live = live;
  }

  /** One frame `seconds` long with the bodies seen (nothing sounds while `quiet`, and every whistle stops). */
  frame(bodies: readonly HeardFall[], seconds: number, eye: Point3, quiet: boolean): void {
    const output = quiet ? null : this.live();
    const seen = new Set<number>();
    for (const body of bodies) {
      seen.add(body.id);
      const whistle = this.whistles.get(body.id);
      const near = Math.hypot(body.at[0] - eye[0], body.at[1] - eye[1], body.at[2] - eye[2]) <= MOST_M;
      if (body.falling && !whistle && output && near) this.whistles.set(body.id, this.whistle(output, body.at));
      else if (body.falling && whistle) this.follow(whistle, body.at, seconds);
      else if (!body.falling && whistle) {
        this.stop(body.id);
        if (output) thud(output, body.at);
      }
    }
    for (const id of this.whistles.keys()) if (!seen.has(id) || !output) this.stop(id);
  }

  /** Stops every whistle at once, as the player leaves. */
  clear(): void {
    for (const id of this.whistles.keys()) this.stop(id);
  }

  private whistle({ audio, out }: NonNullable<Output>, place: Point3): Whistle {
    const when = audio.currentTime;
    const panner = pannerAt(audio, place);
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(WHISTLE_PEAK, when + 0.12);
    const voice = audio.createOscillator();
    voice.frequency.setValueAtTime(whistlePitch(0), when);
    // A slow warble, so it reads as air rushing past and not a test tone.
    const warble = audio.createOscillator();
    warble.frequency.setValueAtTime(WARBLE_HZ, when);
    const depth = audio.createGain();
    depth.gain.setValueAtTime(whistlePitch(0) * WARBLE_SHARE, when);
    warble.connect(depth).connect(voice.frequency);
    voice.connect(gain).connect(panner).connect(out);
    voice.start(when);
    warble.start(when);
    return { voice, warble, depth, gain, panner, seconds: 0 };
  }

  private follow(whistle: Whistle, place: Point3, seconds: number): void {
    whistle.seconds += seconds;
    const when = whistle.voice.context.currentTime;
    const pitch = whistlePitch(whistle.seconds);
    whistle.voice.frequency.setTargetAtTime(pitch, when, 0.03);
    whistle.depth.gain.setTargetAtTime(pitch * WARBLE_SHARE, when, 0.03);
    placePanner(whistle.panner, place);
  }

  private stop(id: number): void {
    const whistle = this.whistles.get(id);
    if (!whistle) return;
    this.whistles.delete(id);
    const when = whistle.voice.context.currentTime;
    whistle.gain.gain.cancelScheduledValues(when);
    whistle.gain.gain.setTargetAtTime(0.0001, when, 0.015);
    for (const voice of [whistle.voice, whistle.warble]) voice.stop(when + 0.1);
  }
}

/** A body landing at `place`: a deep thump falling in pitch, over a duller knock an octave and a half up. */
function thud({ audio, out }: NonNullable<Output>, place: Point3): void {
  const when = audio.currentTime;
  const panner = pannerAt(audio, place);
  panner.connect(out);
  const strike = (type: OscillatorType, [from, to]: readonly [number, number], peak: number, length: number) => {
    const voice = audio.createOscillator();
    voice.type = type;
    voice.frequency.setValueAtTime(from, when);
    voice.frequency.exponentialRampToValueAtTime(to, when + length);
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(peak, when + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + length);
    voice.connect(gain).connect(panner);
    voice.start(when);
    voice.stop(when + length + 0.02);
  };
  strike('sine', [110, 38], THUD_PEAK, 0.42);
  strike('triangle', [260, 90], THUD_PEAK * 0.35, 0.12);
}
