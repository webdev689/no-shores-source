// The sea's and the storm's ambience for the prologue's cutscenes: seven looping beds (rain, wind, waves, fire, the
// deep, gulls, creaking timbers) that glide to the levels a scene asks for, the spot sounds that ride on them, and the
// mission's one-shots. Each is synthesised (noise, filters, oscillators) until the owner's Freesound pick for it has
// come, which then plays in its place as loud as it was. Nothing plays until the game's world output answers, and the
// output may come and go: the levels keep gliding meanwhile, and the sound picks up where they stand once it returns.

import {
  brownNoise,
  clampLevel,
  crackle,
  glided,
  nextGapS,
  seamlessLoop,
  seededRandom,
  whiteNoise,
} from './ambienceShapes.ts';
import {
  breakVoice,
  crashVoice,
  creakVoice,
  disconnectAfter,
  flashVoice,
  groanVoice,
  gullVoice,
  heartbeatVoice,
  type Kit,
  popVoice,
  ringingVoice,
  splashVoice,
  thudVoice,
  thunderVoice,
  whooshVoice,
} from './ambienceVoices.ts';
import { type Loudness, playSample } from '../soundSamples.ts';

/** Where the world's sounds play; the game passes uiSounds' worldOutput. Null while there is no sound. */
export type SoundOut = () => { readonly audio: AudioContext; readonly out: AudioNode } | null;

/** Each bed's level, 0 silent to 1 full. */
export interface AmbienceLevels {
  rain: number;
  wind: number;
  waves: number;
  fire: number;
  deep: number;
  gulls: number;
  creak: number;
}

type Bed = keyof AmbienceLevels;
const BEDS: readonly Bed[] = ['rain', 'wind', 'waves', 'fire', 'deep', 'gulls', 'creak'];

/** Each bed's gain at level 1, set by ear and by the rendered checks so the storm's rain is the loudest bed. */
const BED_GAIN: Readonly<Record<Bed, number>> = {
  rain: 0.22,
  wind: 2.4,
  waves: 0.33,
  fire: 0.23,
  deep: 0.18,
  gulls: 1.2,
  creak: 3,
};

/** The spot sounds that ride on a bed, and their mean gap at the bed's full level, in seconds. */
const SPOTS: readonly { readonly bed: Bed; readonly meanGapS: number; readonly voice: typeof gullVoice }[] = [
  { bed: 'gulls', meanGapS: 1.6, voice: gullVoice },
  { bed: 'creak', meanGapS: 2.2, voice: creakVoice },
  { bed: 'waves', meanGapS: 3.5, voice: breakVoice },
  { bed: 'fire', meanGapS: 0.7, voice: popVoice },
  { bed: 'deep', meanGapS: 5, voice: groanVoice },
];

/** Each recorded bed's cue, and the synthesiser's bed it stands in for (its spots with it) as measured offline before
 *  the bed's gain: its peak, and its loudest RECORDED_WINDOW_S. A recording is matched to that loudness. */
export const RECORDED_BEDS: Readonly<Partial<Record<Bed, { readonly cue: string; readonly synth: Loudness }>>> = {
  wind: { cue: 'story.wind', synth: { peak: 0.109, loud: 0.0248 } },
  waves: { cue: 'story.waves', synth: { peak: 0.887, loud: 0.2065 } },
  creak: { cue: 'story.creak', synth: { peak: 0.0955, loud: 0.0097 } },
  fire: { cue: 'story.fire', synth: { peak: 1.183, loud: 0.2414 } },
  deep: { cue: 'story.deep', synth: { peak: 1.158, loud: 0.308 } },
};
const RECORDED_WINDOW_S = 4;
/** Each play of a recorded bed fades into the next, and the first takes over from the synthesiser, at equal power. */
const RECORDED_FADE_S = 3;
const FADE_IN = Float32Array.from({ length: 64 }, (unused, step) => Math.sin((Math.PI / 2) * (step / 63)));
const FADE_OUT = FADE_IN.slice().reverse();
/** The one-shots that have recordings, each as the synthesiser's measured before the shots' gain, over its loudest
 *  SHOT_WINDOW_S: the recording takes that loudness, its peak never past the synthesiser's. */
export const RECORDED_SHOTS = {
  crash: { cue: 'story.crash', synth: { peak: 1.438, loud: 0.5012 } },
  splash: { cue: 'story.splash', synth: { peak: 0.734, loud: 0.1208 } },
  whoosh: { cue: 'story.whoosh', synth: { peak: 0.532, loud: 0.1191 } },
  thud: { cue: 'story.thud', synth: { peak: 0.8225, loud: 0.1716 } },
  ringing: { cue: 'story.ringing', synth: { peak: 0.109, loud: 0.0504 } },
  heartbeat: { cue: 'story.heartbeat', synth: { peak: 0.6011, loud: 0.1296 } },
  flash: { cue: 'story.flash', synth: { peak: 0.2789, loud: 0.0916 } },
} as const;
const SHOT_WINDOW_S = 0.4;

/** The beds the world's own soundscape plays once it is heard round the listener, and how long the hand over takes,
 *  seconds. */
const WORLD_BEDS: ReadonlySet<Bed> = new Set(['rain', 'wind', 'waves', 'creak', 'gulls']);
const HAND_OVER_S = 1.5;

/** A gain written to the audio clock eases to it over this time constant, so no level change clicks. */
const EASE_S = 0.04;
/** The one-shots' level against the beds: the crash is the loudest thing in the mission. */
const SHOTS_GAIN = 0.55;
/** A heartbeat at a frightened 75 a minute. */
const BEAT_S = 60 / 75;
const SEED = 0x5a17;

interface Glide {
  from: number;
  to: number;
  elapsedS: number;
  glideS: number;
  value: number;
}

interface BedGraph {
  readonly gain: GainNode;
  /** The synthesiser's share of the bed, faded out once its recording takes over. */
  readonly synth: GainNode;
  readonly sources: readonly AudioScheduledSourceNode[];
  readonly nodes: readonly AudioNode[];
  /** The level last written to the bed's gain. */
  written: number;
  /** The recording's play now sounding, once one has come, and when it ends. */
  recorded: { readonly fade: GainNode; readonly source: AudioBufferSourceNode; readonly endsAt: number } | null;
}

interface Engine {
  readonly kit: Kit;
  readonly out: AudioNode;
  readonly master: GainNode;
  readonly shots: GainNode;
  readonly beds: Map<Bed, BedGraph>;
}

/** The noise buffers, made once for each context and shared by every bed and voice. */
const kits = new WeakMap<BaseAudioContext, Omit<Kit, 'random'>>();

/** Thunder farther than this is not heard at all. */
const HEARD_KM = 20;
/** How long `stop` takes to fade everything out, so it never clicks. */
const FADE_S = 0.25;

function bufferOf(audio: BaseAudioContext, samples: Float32Array<ArrayBuffer>): AudioBuffer {
  const buffer = audio.createBuffer(1, samples.length, audio.sampleRate);
  buffer.copyToChannel(samples, 0);
  return buffer;
}

function kitFor(audio: AudioContext, random: () => number): Kit {
  let made = kits.get(audio);
  if (!made) {
    const rate = audio.sampleRate;
    const noiseRandom = seededRandom(SEED);
    // Four seconds of noise, long enough that its loop is never heard, folded so it has no seam.
    const loop = (samples: Float32Array<ArrayBuffer>) =>
      bufferOf(audio, seamlessLoop(samples, Math.round(rate * 0.25)));
    made = {
      audio,
      white: loop(whiteNoise(rate * 4, noiseRandom)),
      brown: loop(brownNoise(rate * 4, noiseRandom)),
      crackle: bufferOf(audio, seamlessLoop(crackle(rate * 4, rate, noiseRandom, 40), 256)),
    };
    kits.set(audio, made);
  }
  return { ...made, random };
}

/** Seconds from a caller, with nonsense (NaN, Infinity, below zero) taken as none. */
const finiteSeconds = (seconds: number): number => (Number.isFinite(seconds) ? Math.max(0, seconds) : 0);

export class Ambience {
  private readonly output: SoundOut;
  private readonly random = seededRandom(SEED + 1);
  private readonly glides = new Map<Bed, Glide>(
    BEDS.map((bed) => [bed, { from: 0, to: 0, elapsedS: 0, glideS: 0, value: 0 }]),
  );
  /** Each spot sound's countdown, in seconds at its bed's full level: a quieter bed counts down slower. */
  private readonly spotCountdownS = new Map<Bed, number>();
  private engine: Engine | null = null;
  private heart = false;
  private nextBeatAt = 0;
  /** How far the world's own soundscape has taken over the sea and the weather, 0 to 1, and where it is going. */
  private world = 0;
  private worldTo = 0;

  constructor(output: SoundOut) {
    this.output = output;
  }

  /** Each named bed glides from where it stands to its new level over `glideS` seconds. */
  set(levels: Partial<AmbienceLevels>, glideS = 2): void {
    for (const bed of BEDS) {
      const level = levels[bed];
      const glide = this.glides.get(bed);
      if (level === undefined || !glide) continue;
      Object.assign(glide, { from: glide.value, to: clampLevel(level), elapsedS: 0, glideS: finiteSeconds(glideS) });
      if (glide.glideS === 0) glide.value = glide.to;
    }
  }

  /** Whether the world's own soundscape plays round the listener: its rain, wind, sea, timbers and gulls are then
   *  its, and these beds fall silent over HAND_OVER_S; the fire, the deep and every moment stay the story's. */
  handOver(heard: boolean): void {
    this.worldTo = heard ? 1 : 0;
  }

  /** A bed's level as it is heard: the world's own beds under the world's soundscape once it has them. */
  private heard(bed: Bed): number {
    const level = this.glides.get(bed)?.value ?? 0;
    return WORLD_BEDS.has(bed) ? level * (1 - this.world) : level;
  }

  /** Each bed's level as it is heard this moment: the world's own beds under the world's soundscape once it has
   *  them. */
  levels(): AmbienceLevels {
    const levels = { rain: 0, wind: 0, waves: 0, fire: 0, deep: 0, gulls: 0, creak: 0 };
    for (const bed of BEDS) levels[bed] = this.heard(bed);
    return levels;
  }

  thunder(distanceKm: number): void {
    // NaN and Infinity fail this too: neither is a strike anyone hears.
    if (!(distanceKm <= HEARD_KM)) return;
    this.shot((kit, out, when) => thunderVoice(kit, out, when, distanceKm));
  }

  crash(): void {
    this.shot(crashVoice, RECORDED_SHOTS.crash);
  }

  splash(size: number): void {
    const level = clampLevel(size);
    this.shot((kit, out, when) => splashVoice(kit, out, when, level), RECORDED_SHOTS.splash, level);
  }

  thud(): void {
    this.shot(thudVoice, RECORDED_SHOTS.thud);
  }

  ringing(seconds: number): void {
    this.shot((kit, out, when) => ringingVoice(kit, out, when, finiteSeconds(seconds)), RECORDED_SHOTS.ringing);
  }

  heartbeat(beating: boolean): void {
    this.heart = beating;
  }

  flash(): void {
    this.shot(flashVoice, RECORDED_SHOTS.flash);
  }

  whoosh(): void {
    this.shot(whooshVoice, RECORDED_SHOTS.whoosh);
  }

  /** Moves every glide on by `seconds`, writes the beds' gains, and plays the spot sounds and heartbeats now due. */
  frame(seconds: number): void {
    const step = finiteSeconds(seconds);
    for (const glide of this.glides.values()) {
      glide.elapsedS += step;
      glide.value = glided(glide.from, glide.to, glide.elapsedS, glide.glideS);
    }
    const toward = Math.sign(this.worldTo - this.world);
    this.world = Math.min(1, Math.max(0, this.world + (toward * step) / HAND_OVER_S));
    const engine = this.live();
    if (!engine) return;
    const now = engine.kit.audio.currentTime;
    for (const bed of BEDS) {
      const value = this.heard(bed);
      const built = engine.beds.get(bed) ?? (value > 0 ? this.buildBed(engine, bed) : null);
      // Written only when it moves: each write is another event on the parameter's timeline.
      if (built && built.written !== value) {
        built.gain.gain.setTargetAtTime(value * BED_GAIN[bed], now, EASE_S);
        built.written = value;
      }
      if (built && value > 0) this.recordedBed(engine, bed, built, now);
    }
    for (const { bed, meanGapS, voice } of SPOTS) {
      const level = this.heard(bed);
      // A bed playing its recording has the recording's own spots.
      if (level <= 0 || engine.beds.get(bed)?.recorded) continue;
      let countdown = (this.spotCountdownS.get(bed) ?? nextGapS(meanGapS, this.random())) - step * level;
      const bedGain = engine.beds.get(bed)?.gain;
      if (countdown <= 0 && bedGain) {
        voice(engine.kit, bedGain, now);
        countdown = nextGapS(meanGapS, this.random());
      }
      this.spotCountdownS.set(bed, countdown);
    }
    if (!this.heart) this.nextBeatAt = 0;
    else {
      this.nextBeatAt = Math.max(this.nextBeatAt, now);
      // Beats are laid a little ahead of the clock, so an uneven frame never makes the heart stumble.
      while (this.nextBeatAt < now + 0.15) {
        this.shot(heartbeatVoice, RECORDED_SHOTS.heartbeat, 1, this.nextBeatAt);
        this.nextBeatAt += BEAT_S;
      }
    }
  }

  /** Fades everything out in a moment and lets go of every node; the next sound builds them afresh. */
  stop(): void {
    for (const glide of this.glides.values()) Object.assign(glide, { from: 0, to: 0, value: 0, glideS: 0 });
    this.spotCountdownS.clear();
    this.heart = false;
    this.teardown();
  }

  /** The engine on the output as it answers now: built on the first answer, rebuilt should the context change. */
  private live(): Engine | null {
    const output = this.output();
    if (!output) return null;
    if (this.engine && this.engine.kit.audio === output.audio && this.engine.out === output.out) return this.engine;
    this.teardown();
    const { audio, out } = output;
    const master = audio.createGain();
    master.connect(out);
    const shots = audio.createGain();
    shots.gain.value = SHOTS_GAIN;
    shots.connect(master);
    this.engine = { kit: kitFor(audio, this.random), out, master, shots, beds: new Map() };
    return this.engine;
  }

  private teardown(): void {
    const engine = this.engine;
    this.engine = null;
    // The heart's next beat was on the old clock; a new context's clock starts again near 0.
    this.nextBeatAt = 0;
    if (!engine) return;
    const { audio } = engine.kit;
    const end = audio.currentTime + FADE_S;
    engine.master.gain.setTargetAtTime(0, audio.currentTime, FADE_S / 5);
    const nodes: AudioNode[] = [engine.shots, engine.master];
    for (const bed of engine.beds.values()) {
      for (const source of bed.sources) source.stop(end);
      bed.recorded?.source.stop(end);
      nodes.push(...bed.nodes);
    }
    disconnectAfter(engine.kit, end, nodes);
  }

  /** A one-shot, now or at `scheduled` on the audio clock: its recording where it has come, as loud as the
   *  synthesiser's at `level`, else the synthesiser's. */
  private shot(
    voice: (kit: Kit, out: AudioNode, when: number) => void,
    recorded?: { readonly cue: string; readonly synth: Loudness },
    level = 1,
    scheduled?: number,
  ): void {
    const engine = this.live();
    if (!engine) return;
    const { audio } = engine.kit;
    const when = scheduled ?? audio.currentTime;
    if (recorded) {
      const sized = audio.createGain();
      sized.gain.value = level;
      sized.connect(engine.shots);
      const like = { measured: recorded.synth, windowS: SHOT_WINDOW_S };
      const source = playSample(audio, sized, recorded.cue, 1, { when, like });
      if (source) {
        source.addEventListener('ended', () => sized.disconnect());
        return;
      }
      sized.disconnect();
    }
    voice(engine.kit, engine.shots, when);
  }

  /** A bed's recording, once it has come: each play fades into the next before it ends, the first taking over from
   *  the synthesiser, at equal power, so the bed never dips. */
  private recordedBed(engine: Engine, bed: Bed, built: BedGraph, now: number): void {
    const recorded = RECORDED_BEDS[bed];
    const playing = built.recorded;
    if (!recorded || (playing && now < playing.endsAt - RECORDED_FADE_S)) return;
    const { audio } = engine.kit;
    const fade = audio.createGain();
    const like = { measured: recorded.synth, windowS: RECORDED_WINDOW_S, most: Infinity };
    const source = playSample(audio, fade, recorded.cue, 1, { when: now, like });
    if (!source?.buffer) {
      fade.disconnect();
      return;
    }
    fade.gain.setValueCurveAtTime(FADE_IN, now, RECORDED_FADE_S);
    fade.connect(built.gain);
    const out = playing?.fade ?? built.synth;
    out.gain.cancelScheduledValues(now);
    out.gain.setValueCurveAtTime(FADE_OUT, now, RECORDED_FADE_S);
    source.addEventListener('ended', () => fade.disconnect());
    built.recorded = { fade, source, endsAt: now + source.buffer.duration };
  }

  /** A bed's looping graph, built the first time its level rises, so silent beds cost nothing. */
  private buildBed(engine: Engine, bed: Bed): BedGraph {
    const { audio, white, brown } = engine.kit;
    const gain = audio.createGain();
    gain.gain.value = 0;
    gain.connect(engine.master);
    const synth = audio.createGain();
    synth.connect(gain);
    const sources: AudioScheduledSourceNode[] = [];
    const nodes: AudioNode[] = [gain, synth];
    const loop = (buffer: AudioBuffer, ...chain: AudioNode[]): AudioNode => {
      const source = audio.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.start(audio.currentTime, this.random() * buffer.duration);
      sources.push(source);
      nodes.push(source, ...chain);
      let last: AudioNode = source;
      for (const node of chain) last = last.connect(node);
      return last;
    };
    const filter = (type: BiquadFilterType, frequency: number, quality = 0.7) => {
      const biquad = audio.createBiquadFilter();
      Object.assign(biquad, { type });
      biquad.frequency.value = frequency;
      biquad.Q.value = quality;
      return biquad;
    };
    /** A slow wobble added to `param`: `depth` either side of where it stands, `rate` times a second. */
    const wobble = (param: AudioParam, rate: number, depth: number) => {
      const oscillator = audio.createOscillator();
      oscillator.frequency.value = rate;
      const amount = audio.createGain();
      amount.gain.value = depth;
      oscillator.connect(amount).connect(param);
      oscillator.start();
      sources.push(oscillator);
      nodes.push(oscillator, amount);
    };
    if (bed === 'rain') {
      // A downpour: hiss over a duller roar of drops on the sea.
      loop(white, filter('highpass', 600), filter('lowpass', 9000)).connect(synth);
      loop(brown, filter('bandpass', 900, 0.6)).connect(synth);
    } else if (bed === 'wind') {
      // A gale: its pitch and its strength wander at unrelated slow rates, so the gusts never repeat.
      const howl = filter('bandpass', 450, 1.6);
      const gust = audio.createGain();
      gust.gain.value = 0.5;
      loop(brown, howl, gust).connect(synth);
      wobble(howl.frequency, 0.09, 220);
      wobble(gust.gain, 0.19, 0.3);
      wobble(gust.gain, 0.07, 0.17);
    } else if (bed === 'waves') {
      // The sea round the hull, swelling and easing.
      const swell = audio.createGain();
      swell.gain.value = 0.65;
      loop(brown, filter('lowpass', 650), swell).connect(synth);
      wobble(swell.gain, 0.11, 0.3);
    } else if (bed === 'fire') {
      // A blaze: a low roar under a loop of crackle.
      loop(brown, filter('lowpass', 600)).connect(synth);
      const crackleGain = audio.createGain();
      crackleGain.gain.value = 0.4;
      loop(engine.kit.crackle, filter('highpass', 1200), crackleGain).connect(synth);
    } else if (bed === 'deep') {
      // Under the water: a muffled pressure, all low notes.
      loop(brown, filter('lowpass', 120, 1.2)).connect(synth);
    }
    const built = { gain, synth, sources, nodes, written: 0, recorded: null };
    engine.beds.set(bed, built);
    return built;
  }
}
