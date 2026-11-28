// The sea's and the storm's ambience for the prologue's cutscenes: seven beds (rain, wind, waves, fire, the deep,
// gulls, creaking timbers) that glide to the levels a scene asks for, the gulls' cries that ride on theirs, and the
// mission's one-shots. Each is picked from Freesound, as loud as the sound it took the place of, and silent until
// its recording has come. Nothing plays until the game's world output answers, and the output may come and go: the
// levels keep gliding meanwhile, and the sound picks up where they stand once it returns.

import { seeded } from '../seeded.ts';
import { clampLevel, glided, nextGapS, thunderShape } from './ambienceShapes.ts';
import type { Loudness } from '../soundMeasure.ts';
import { playSample, prefetchSamples, releaseSamples } from '../soundSamples.ts';

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

/** A recording and the loudness it is heard at: the sound it took the place of, measured offline. */
interface Recorded {
  readonly cue: string;
  readonly loudness: Loudness;
}

/** Each bed's recording, at the loudness of the bed it took the place of before the bed's gain: its peak, and its
 *  loudest RECORDED_WINDOW_S. The gulls have no bed of their own: their cries ride on the gulls' level. */
export const RECORDED_BEDS: Readonly<Record<Exclude<Bed, 'gulls'>, Recorded>> = {
  rain: { cue: 'amb.sea.rain', loudness: { peak: 1.62, loud: 0.4553 } },
  wind: { cue: 'story.wind', loudness: { peak: 0.109, loud: 0.0248 } },
  waves: { cue: 'story.waves', loudness: { peak: 0.887, loud: 0.2065 } },
  creak: { cue: 'story.creak', loudness: { peak: 0.0955, loud: 0.0097 } },
  fire: { cue: 'story.fire', loudness: { peak: 1.183, loud: 0.2414 } },
  deep: { cue: 'story.deep', loudness: { peak: 1.158, loud: 0.308 } },
};
const RECORDED_WINDOW_S = 4;
/** Each play of a bed fades into the next, at equal power. */
const RECORDED_FADE_S = 3;
const FADE_IN = Float32Array.from({ length: 64 }, (unused, step) => Math.sin((Math.PI / 2) * (step / 63)));
const FADE_OUT = FADE_IN.slice().reverse();
/** The one-shots, each at the loudness of the sound it took the place of over its loudest SHOT_WINDOW_S, its peak
 *  never past that sound's: a gull's cry, thunder (at a strike's whole level), and the mission's moments. */
export const RECORDED_SHOTS = {
  gull: { cue: 'amb.sea.gull', loudness: { peak: 0.1754, loud: 0.063 } },
  crack: { cue: 'amb.thunder.crack', loudness: { peak: 1.503, loud: 0.3393 } },
  roll: { cue: 'amb.thunder.roll', loudness: { peak: 1.513, loud: 0.5372 } },
  crash: { cue: 'story.crash', loudness: { peak: 1.438, loud: 0.5012 } },
  splash: { cue: 'story.splash', loudness: { peak: 0.734, loud: 0.1208 } },
  whoosh: { cue: 'story.whoosh', loudness: { peak: 0.532, loud: 0.1191 } },
  thud: { cue: 'story.thud', loudness: { peak: 0.8225, loud: 0.1716 } },
  ringing: { cue: 'story.ringing', loudness: { peak: 0.109, loud: 0.0504 } },
  heartbeat: { cue: 'story.heartbeat', loudness: { peak: 0.6011, loud: 0.1296 } },
  flash: { cue: 'story.flash', loudness: { peak: 0.2789, loud: 0.0916 } },
} as const satisfies Readonly<Record<string, Recorded>>;
const SHOT_WINDOW_S = 0.4;
/** A gull cries this often at the gulls' full level, a mean gap in seconds. */
const GULL_GAP_S = 1.6;

/** The beds the world's own soundscape plays once it is heard round the listener, and how long the hand over takes,
 *  seconds. */
const WORLD_BEDS: ReadonlySet<Bed> = new Set(['rain', 'wind', 'waves', 'creak', 'gulls']);
const HAND_OVER_S = 1.5;

/** A gain written to the audio clock eases to it over this time constant, so no level change clicks. */
const EASE_S = 0.04;
/** The one-shots' level against the beds: the crash is the loudest thing in the mission. */
const SHOTS_GAIN = 0.55;
/** A heartbeat at a frightened 75 a minute: a beat this many seconds apart. */
export const HEART_BEAT_S = 60 / 75;
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
  /** The level last written to the bed's gain. */
  written: number;
  /** The recording's play now sounding, once one has come, and when it ends. */
  play: { readonly fade: GainNode; readonly source: AudioBufferSourceNode; readonly endsAt: number } | null;
  /** The fade made for a play whose recording has not come, kept for the next try rather than made each frame. */
  waiting: GainNode | null;
}

interface Engine {
  readonly audio: AudioContext;
  readonly out: AudioNode;
  readonly master: GainNode;
  readonly shots: GainNode;
  readonly beds: Map<Bed, BedGraph>;
}

type Play = typeof playSample;
type Prefetch = typeof prefetchSamples;
/** The story's moments' cues and its thunder, fetched as the sound wakes and held until it stops: each is first heard
 *  too soon after it is asked for to fetch then, the crash and the splash only once. A gull's cry comes again and
 *  again, so it is fetched as it is wanted. */
const SHOT_CUES = Object.values(RECORDED_SHOTS)
  .filter((shot) => shot !== RECORDED_SHOTS.gull)
  .map((shot) => shot.cue);

/** Thunder farther than this is not heard at all. */
const HEARD_KM = 20;
/** How long `stop` takes to fade everything out, so it never clicks. */
const FADE_S = 0.25;

/** Seconds from a caller, with nonsense (NaN, Infinity, below zero) taken as none. */
const finiteSeconds = (seconds: number): number => (Number.isFinite(seconds) ? Math.max(0, seconds) : 0);

export class Ambience {
  private readonly output: SoundOut;
  private readonly play: Play;
  private readonly prefetch: Prefetch;
  private readonly random = seeded(SEED + 1);
  private readonly glides = new Map<Bed, Glide>(
    BEDS.map((bed) => [bed, { from: 0, to: 0, elapsedS: 0, glideS: 0, value: 0 }]),
  );
  /** The gulls' countdown to their next cry, in seconds at their full level: quieter, it counts down slower. */
  private gullCountdownS: number | null = null;
  /** When the last flock ends on the audio clock: the next one's gap begins only then. */
  private gullEndsAt = 0;
  private engine: Engine | null = null;
  private heart = false;
  private nextBeatAt = 0;
  /** How far the world's own soundscape has taken over the sea and the weather, 0 to 1, and where it is going. */
  private world = 0;
  private worldTo = 0;

  constructor(output: SoundOut, play: Play = playSample, prefetch: Prefetch = prefetchSamples) {
    [this.output, this.play, this.prefetch] = [output, play, prefetch];
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

  /** A strike's thunder from `distanceKm` away, as its sound arrives: a near one's crack, a far one's roll. */
  thunder(distanceKm: number): void {
    // NaN and Infinity fail this too: neither is a strike anyone hears.
    if (!(distanceKm <= HEARD_KM)) return;
    const shape = thunderShape(distanceKm);
    this.shot(shape.crack ? RECORDED_SHOTS.crack : RECORDED_SHOTS.roll, shape.gain, undefined, shape.delayS);
  }

  crash(): void {
    this.shot(RECORDED_SHOTS.crash);
  }

  splash(size: number): void {
    this.shot(RECORDED_SHOTS.splash, clampLevel(size));
  }

  thud(): void {
    this.shot(RECORDED_SHOTS.thud);
  }

  /** The ears ringing, for as long as its recording rings. */
  ringing(): void {
    this.shot(RECORDED_SHOTS.ringing);
  }

  heartbeat(beating: boolean): void {
    this.heart = beating;
  }

  flash(): void {
    this.shot(RECORDED_SHOTS.flash);
  }

  whoosh(): void {
    this.shot(RECORDED_SHOTS.whoosh);
  }

  /** Moves every glide on by `seconds`, writes the beds' gains, and plays the gulls' cries and heartbeats now due. */
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
    const now = engine.audio.currentTime;
    for (const bed of BEDS) {
      const value = this.heard(bed);
      const built = engine.beds.get(bed) ?? (value > 0 ? this.buildBed(engine, bed) : null);
      // Written only when it moves: each write is another event on the parameter's timeline.
      if (built && built.written !== value) {
        built.gain.gain.setTargetAtTime(value * BED_GAIN[bed], now, EASE_S);
        built.written = value;
      }
      if (built && value > 0 && bed !== 'gulls') this.playBed(engine, RECORDED_BEDS[bed], built, now);
    }
    const gulls = this.heard('gulls');
    const gullsGain = engine.beds.get('gulls')?.gain;
    // The recording is a whole flock, so the next waits for it to end: never two flocks over each other.
    if (gulls > 0 && gullsGain && now >= this.gullEndsAt) {
      let countdown = (this.gullCountdownS ?? nextGapS(GULL_GAP_S, this.random())) - step * gulls;
      if (countdown <= 0) {
        const flockS = this.shot(RECORDED_SHOTS.gull, 1, now, 0, gullsGain);
        this.gullEndsAt = now + flockS;
        // A recording not yet come is asked for again next frame, as a bed's is, so a scene's first flock is not lost.
        countdown = flockS > 0 ? nextGapS(GULL_GAP_S, this.random()) : 0;
      }
      this.gullCountdownS = countdown;
    }
    if (!this.heart) this.nextBeatAt = 0;
    else {
      this.nextBeatAt = Math.max(this.nextBeatAt, now);
      // Beats are laid a little ahead of the clock, so an uneven frame never makes the heart stumble.
      while (this.nextBeatAt < now + 0.15) {
        this.shot(RECORDED_SHOTS.heartbeat, 1, this.nextBeatAt);
        this.nextBeatAt += HEART_BEAT_S;
      }
    }
  }

  /** Fades everything out in a moment and lets go of every node; the next sound builds them afresh. */
  stop(): void {
    for (const glide of this.glides.values()) Object.assign(glide, { from: 0, to: 0, value: 0, glideS: 0 });
    this.gullCountdownS = null;
    this.heart = false;
    this.teardown();
    // Held under the budget again; a sound woken after builds the engine afresh and holds them once more.
    releaseSamples(SHOT_CUES);
  }

  /** The engine on the output as it answers now: built on the first answer, rebuilt should the context change. */
  private live(): Engine | null {
    const output = this.output();
    if (!output) return null;
    if (this.engine && this.engine.audio === output.audio && this.engine.out === output.out) return this.engine;
    this.teardown();
    const { audio, out } = output;
    const master = audio.createGain();
    master.connect(out);
    const shots = audio.createGain();
    shots.gain.value = SHOTS_GAIN;
    shots.connect(master);
    this.engine = { audio, out, master, shots, beds: new Map() };
    this.prefetch(audio, SHOT_CUES);
    return this.engine;
  }

  private teardown(): void {
    const engine = this.engine;
    this.engine = null;
    // The heart's next beat and the last flock's end were on the old clock; a new context's clock starts again near 0.
    this.nextBeatAt = 0;
    this.gullEndsAt = 0;
    if (!engine) return;
    const { audio } = engine;
    const end = audio.currentTime + FADE_S;
    engine.master.gain.setTargetAtTime(0, audio.currentTime, FADE_S / 5);
    const nodes: AudioNode[] = [engine.shots, engine.master];
    for (const bed of engine.beds.values()) {
      bed.play?.source.stop(end);
      nodes.push(bed.gain);
    }
    // Let go once the fade is done, on the audio clock: a silent source ends then.
    const marker = audio.createConstantSource();
    marker.offset.value = 0;
    marker.addEventListener('ended', () => [marker, ...nodes].forEach((node) => node.disconnect()));
    marker.start(end);
    marker.stop(end);
  }

  /** A one-shot's recording at `level`, now or at `when` on the audio clock, `after` seconds on, into the shots or
   *  `into`, as loud as the sound it took the place of; its length in seconds, 0 until its recording has come. */
  private shot(recorded: Recorded, level = 1, when?: number, after = 0, into?: AudioNode): number {
    const engine = this.live();
    if (!engine) return 0;
    const { audio } = engine;
    const sized = audio.createGain();
    sized.gain.value = level;
    sized.connect(into ?? engine.shots);
    const like = { measured: recorded.loudness, windowS: SHOT_WINDOW_S };
    const source = this.play(audio, sized, recorded.cue, 1, { when: (when ?? audio.currentTime) + after, like });
    if (source) source.addEventListener('ended', () => sized.disconnect());
    else sized.disconnect();
    return source?.buffer?.duration ?? 0;
  }

  /** A bed's recording, once it has come: each play fades into the next before it ends, at equal power, so the bed
   *  never dips. */
  private playBed(engine: Engine, recorded: Recorded, built: BedGraph, now: number): void {
    const playing = built.play;
    if (playing && now < playing.endsAt - RECORDED_FADE_S) return;
    const { audio } = engine;
    const fade = built.waiting ?? audio.createGain();
    const like = { measured: recorded.loudness, windowS: RECORDED_WINDOW_S, most: Infinity };
    const source = this.play(audio, fade, recorded.cue, 1, { when: now, like });
    built.waiting = source?.buffer ? null : fade;
    if (!source?.buffer) return;
    fade.gain.setValueCurveAtTime(FADE_IN, now, RECORDED_FADE_S);
    fade.connect(built.gain);
    if (playing) {
      playing.fade.gain.cancelScheduledValues(now);
      playing.fade.gain.setValueCurveAtTime(FADE_OUT, now, RECORDED_FADE_S);
    }
    source.addEventListener('ended', () => fade.disconnect());
    built.play = { fade, source, endsAt: now + source.buffer.duration };
  }

  /** A bed's gain, made the first time its level rises, so silent beds cost nothing. */
  private buildBed(engine: Engine, bed: Bed): BedGraph {
    const gain = engine.audio.createGain();
    gain.gain.value = 0;
    gain.connect(engine.master);
    const built = { gain, written: 0, play: null, waiting: null };
    engine.beds.set(bed, built);
    return built;
  }
}
