// The song player: a score's notes onto the audio clock. It wakes on a coarse timer and schedules every note falling
// in the next quarter second at its exact time, so a stalled page never makes a note late (a stall past the window
// skips the gap rather than playing the past all at once). A song loops on its bar line, to the tick. Each note is
// built from the FM bank: a modulator sine bending a carrier's pitch, its brightness settling as a real instrument's
// does, in unison copies for a song's own ensembles; each drum a falling sine or a band of noise, with a beater's click
// and a skin's body where the song asks. Each layer role plays through a gain of its own, so the director brings
// layers in and out on a bar line; a note is only built while its layer plays. Under the song's own level, its press
// and a fader for fades, the whole stands at MUSIC_GAIN in the music's bus.

import { type FmVoice, PERCUSSION_CHANNEL, drumOf, fmVoice, noteToHz, panPosition, velocityGain } from './fmBank.ts';
import { type Note, type Press, ROLES, type Role, type Song, TICKS_PER_BEAT, type Track } from './score.ts';

/** How far ahead each wake schedules, and how often it wakes: the window must outlast the wait. */
export const LOOKAHEAD_S = 0.25;
const PUMP_MS = 100;
/** The music's trim under its volume: the FM bank's oscillators sum hot. */
export const MUSIC_GAIN = 0.22;
/** How far ahead of now a song begins when asked to begin at once. */
export const START_LEAD_S = 0.06;

/** The highest a note's partials reach, hertz: its modulation is held under it, so a high note dulls rather than
 *  ringing, or folding back into the band as a whine. A note low or in the middle keeps its voice's whole depth. */
export const PARTIALS_HZ = 6000;
/** A note's deepest modulation, hertz: its voice's, held so the carrier and its widest sidebands stay under
 *  PARTIALS_HZ. */
export const depthOf = (spec: FmVoice, hertz: number): number =>
  Math.max(1, Math.min(spec.index * hertz, PARTIALS_HZ - hertz * (spec.car + spec.mod)));
/** Every song is high-passed here before its press: a 1:1 FM voice's lower sideband reaches 0 Hz, a standing offset
 *  no speaker plays, which the press would answer by pressing the whole song and which thumps as a song fades. */
const FLOOR_HZ = 30;
/** How far the soft ceiling's curve reaches, in the hyperbolic tangent's units: tanh(3) is 0.995. */
const CEILING_DRIVE = 3;
/** How long a layer let go takes to fall silent, in beats: its last notes ring out under it, never cut. */
const LAYER_FADE_BEATS = 2;
/** How long a one-shot song rings past its last note's end before it counts as finished, seconds. */
const RING_S = 2;

const ALL: ReadonlySet<Role> = new Set(ROLES);

/** The notes from `fromTick` up to `toTick`, halving to the first: the notes are in time order. */
export function notesInWindow(notes: readonly Note[], fromTick: number, toTick: number): Note[] {
  let [low, high] = [0, notes.length];
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((notes[middle]?.tick ?? 0) < fromTick) low = middle + 1;
    else high = middle;
  }
  const found: Note[] = [];
  for (let index = low; index < notes.length; index++) {
    const note = notes[index];
    if (!note || note.tick >= toTick) break;
    found.push(note);
  }
  return found;
}

/** The cents each of a unison's `count` copies is set off the note: `cents` either side, spread evenly. */
export function unisonCents(count: number, cents: number): number[] {
  if (!(count > 1) || !(cents > 0)) return [0];
  return Array.from({ length: count }, (unused, i) => -cents + (2 * cents * i) / (count - 1));
}

/** The time of the first bar line at or after `after`, for a song begun at `origin` with bars `barSeconds` long. */
export function barLineAfter(origin: number, barSeconds: number, after: number): number {
  if (after <= origin) return origin;
  return origin + Math.ceil((after - origin) / barSeconds - 1e-9) * barSeconds;
}

/** Where a one-shot song falls silent, in seconds from its start: its last note's end and the ring after it. */
export function songTail(song: Song): number {
  const last = song.notes.reduce((most, note) => Math.max(most, note.tick + note.duration), 0);
  return last * song.secondsPerTick + RING_S;
}

let ceiling: Float32Array<ArrayBuffer> | null = null;
/** The soft ceiling's curve over the shaper's -1 to 1: tanh(CEILING_DRIVE u), its ends at the ceiling. */
function ceilingCurve(): Float32Array<ArrayBuffer> {
  if (ceiling) return ceiling;
  const points = 2049;
  ceiling = new Float32Array(points);
  for (let i = 0; i < points; i++) ceiling[i] = Math.tanh(CEILING_DRIVE * ((2 * i) / (points - 1) - 1));
  return ceiling;
}

/** A gain's automation as the player wrote it, so a new move starts from wherever the last stands at its time. */
class Ramp {
  private readonly param: AudioParam;
  private points: readonly (readonly [number, number])[];

  constructor(param: AudioParam, value: number) {
    this.param = param;
    param.value = value;
    this.points = [[0, value]];
  }

  valueAt(time: number): number {
    let [before, value] = this.points[0] ?? [0, 0];
    for (const [when, level] of this.points) {
      if (when > time) return value + ((level - value) * (time - before)) / Math.max(1e-9, when - before);
      [before, value] = [when, level];
    }
    return value;
  }

  /** Holds where it stands until `when`, then moves to `level` over `seconds`. */
  to(level: number, when: number, seconds: number, now: number): void {
    const [here, there] = [this.valueAt(now), this.valueAt(Math.max(now, when))];
    this.param.cancelScheduledValues(now);
    this.param.setValueAtTime(here, now);
    if (when > now) this.param.linearRampToValueAtTime(there, when);
    const done = Math.max(when, now) + Math.max(0.005, seconds);
    this.param.linearRampToValueAtTime(level, done);
    this.points = [
      [now, here],
      [Math.max(now, when), there],
      [done, level],
    ];
  }
}

/** A built note, to stop early and to let go of once it has ended. */
interface Sounding {
  readonly endsAt: number;
  stop(): void;
}

/**
 * Plays one song at a time into `out`, looping it, or once. In the game a timer pumps it; for a render, the caller
 * pumps it with the times it will reach.
 */
export class SongPlayer {
  private readonly audio: BaseAudioContext;
  private readonly master: GainNode;
  private readonly fader: Ramp;
  private readonly faderNode: GainNode;
  private readonly level: GainNode;
  private readonly layers = new Map<Role, { node: GainNode; ramp: Ramp }>();
  private readonly channels = new Map<string, GainNode>();
  private readonly panned = new Map<string, StereoPannerNode>();
  private press: { comp: DynamicsCompressorNode; drive: GainNode; top: GainNode } | null = null;
  private floor: BiquadFilterNode | null = null;
  private levelTo: AudioNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly timed: boolean;
  private readonly clock: () => number;
  private playing: Song | null = null;
  private tracks: (Track | undefined)[] = [];
  private looping = true;
  private origin = 0;
  private cursor = 0;
  private sounding: Sounding[] = [];
  /** The layers each stretch of time plays, from each change's time on. */
  private changes: { readonly at: number; readonly roles: ReadonlySet<Role> }[] = [];
  private stopAt: number | null = null;
  private startedAt = 0;

  /** `timed`: pumped by its own timer, as in the game; `clock`: the time it schedules against (a render's own). */
  constructor(audio: BaseAudioContext, out: AudioNode, { timed = true, clock = () => audio.currentTime } = {}) {
    this.audio = audio;
    this.timed = timed;
    this.clock = clock;
    this.master = audio.createGain();
    this.master.gain.value = MUSIC_GAIN;
    this.master.connect(out);
    this.faderNode = audio.createGain();
    this.fader = new Ramp(this.faderNode.gain, 1);
    this.faderNode.connect(this.master);
    this.level = audio.createGain();
    this.level.connect(this.faderNode);
    for (const role of ROLES) {
      const node = audio.createGain();
      node.connect(this.level);
      this.layers.set(role, { node, ramp: new Ramp(node.gain, 1) });
    }
  }

  /** The song playing, or null. */
  get song(): Song | null {
    return this.playing;
  }

  /** How far the notes are scheduled, in the audio clock's seconds. */
  get scheduledUntil(): number {
    return this.origin + this.cursor * (this.playing?.secondsPerTick ?? 0);
  }

  /** Whether nothing it plays sounds at `now` or after: stopped, or faded out. */
  idle(now: number): boolean {
    return !this.playing || (this.stopAt !== null && now >= this.stopAt);
  }

  /** Whether its song still waits to begin at `now`, nothing of it sounding yet. */
  waiting(now: number): boolean {
    return this.playing !== null && this.startedAt > now;
  }

  /** When its song begins (or began). */
  get startsAt(): number {
    return this.startedAt;
  }

  /** When its fade out ends, or null while it is not fading out. */
  get fadingUntil(): number | null {
    return this.stopAt;
  }

  /** Whether a one-shot song has played and rung out by `now`. */
  finished(now: number): boolean {
    const song = this.playing;
    return !song || (!this.looping && now >= this.origin + songTail(song));
  }

  /** The first bar line of the song playing at or after what is already scheduled (or `after`, if later). */
  nextBar(after: number): number {
    const song = this.playing;
    if (!song) return after;
    const bar = song.ticksPerBar * song.secondsPerTick;
    return barLineAfter(this.origin, bar, Math.max(after, this.scheduledUntil));
  }

  /** Begins `song` at `when` (its first bar line there), with `roles` playing, at `level` of its own level; looping, or
   *  once. */
  play(
    song: Song,
    when: number,
    { roles = ALL, level = 1, loop = true }: { roles?: ReadonlySet<Role>; level?: number; loop?: boolean } = {},
  ): void {
    this.stop();
    this.playing = song;
    this.tracks = [];
    for (const track of song.tracks) this.tracks[track.channel] = track;
    for (const node of [...this.channels.values(), ...this.panned.values()]) node.disconnect();
    this.channels.clear();
    this.panned.clear();
    this.level.gain.value = song.level;
    this.route(song.press);
    [this.looping, this.origin, this.startedAt, this.cursor, this.stopAt] = [loop, when, when, 0, null];
    const now = this.clock();
    this.changes = [{ at: -Infinity, roles }];
    for (const [role, layer] of this.layers) layer.ramp.to(roles.has(role) ? 1 : 0, now, 0.005, now);
    this.fader.to(level, now, 0.005, now);
    this.pump(now);
    if (this.timed) this.timer = setInterval(() => this.pump(), PUMP_MS);
  }

  /** Stops at once: every note built is cut. A fade first, by `fade`, makes it a quiet stop. */
  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    for (const sound of this.sounding)
      try {
        sound.stop();
      } catch {
        // Already stopped.
      }
    [this.sounding, this.playing, this.stopAt] = [[], null, null];
  }

  /** Moves the song's fader to `level` over `seconds` from `when`; at 0, the song stops once it gets there. */
  fade(level: number, when: number, seconds: number): void {
    const now = this.clock();
    this.fader.to(level, when, seconds, now);
    this.stopAt = level <= 0 ? Math.max(when, now) + seconds + 0.05 : null;
  }

  /** The layers that play from `when` on: a layer coming in sounds from its next note there, one let go fades over two
   *  beats while what it was already playing rings out. */
  setRoles(roles: ReadonlySet<Role>, when: number): void {
    const now = this.clock();
    this.changes = [...this.changes.filter((change) => change.at < when), { at: when, roles }];
    const beat = (this.playing?.secondsPerTick ?? 0) * TICKS_PER_BEAT;
    for (const [role, layer] of this.layers)
      layer.ramp.to(roles.has(role) ? 1 : 0, when, roles.has(role) ? 0.005 : LAYER_FADE_BEATS * beat, now);
  }

  /** The layers playing at `time`. */
  rolesAt(time: number): ReadonlySet<Role> {
    let roles: ReadonlySet<Role> = new Set();
    for (const change of this.changes) if (change.at <= time) roles = change.roles;
    return roles;
  }

  /** Schedules every note falling within the window ahead of `now`. */
  pump(now = this.clock()): void {
    const song = this.playing;
    if (!song) return;
    if (this.stopAt !== null && now >= this.stopAt) return this.stop();
    const { secondsPerTick: tickSeconds, durationTicks: length } = song;
    const ahead = LOOKAHEAD_S / tickSeconds;
    const nowTick = (now - this.origin) / tickSeconds;
    const toTick = Math.min(nowTick + ahead, length);
    // A page that stalled past the window skips the gap: the notes in it would all sound at once.
    if (nowTick - this.cursor > ahead) this.cursor = nowTick;
    if (this.cursor < toTick) {
      for (const note of notesInWindow(song.notes, this.cursor, toTick)) {
        const when = this.origin + note.tick * tickSeconds;
        if (this.rolesAt(when).has(note.role)) this.voice(note, when, Math.max(0.05, note.duration * tickSeconds));
      }
      this.cursor = toTick;
    }
    if (this.cursor >= length && this.looping) {
      // The next pass begins where this one ends, to the tick: a song written as whole bars loops on its bar line.
      [this.origin, this.cursor] = [this.origin + length * tickSeconds, 0];
      return this.pump(now);
    }
    const current = this.changes.findLastIndex((change) => change.at <= now);
    if (current > 0) this.changes = this.changes.slice(current);
    if (this.sounding.length > 512) this.sounding = this.sounding.filter((sound) => sound.endsAt > now);
  }

  /** The level through the floor and the song's press, or the floor alone, to the fader. */
  private route(press: Press | null): void {
    let to: AudioNode = this.faderNode;
    if (press) {
      this.press ??= this.makePress();
      const { comp, drive, top } = this.press;
      comp.threshold.value = press.threshold;
      comp.knee.value = press.knee;
      comp.ratio.value = press.ratio;
      comp.attack.value = press.attack;
      comp.release.value = press.release;
      // The ceiling in the song's own amplitude, under MUSIC_GAIN: at the full music volume it is `ceiling` dBFS.
      const highest = 10 ** (press.ceiling / 20) / MUSIC_GAIN;
      drive.gain.value = press.out / (highest * CEILING_DRIVE);
      top.gain.value = highest;
      to = comp;
    }
    this.floor ??= this.makeFloor();
    this.floor.disconnect();
    this.floor.connect(to);
    to = this.floor;
    if (this.levelTo === to) return;
    this.level.disconnect();
    this.level.connect(to);
    this.levelTo = to;
  }

  private makePress() {
    const comp = this.audio.createDynamicsCompressor();
    const drive = this.audio.createGain();
    const shaper = this.audio.createWaveShaper();
    const top = this.audio.createGain();
    shaper.curve = ceilingCurve();
    // The clip's harmonics folded back under the audible band, not into it.
    shaper.oversample = '4x';
    comp.connect(drive).connect(shaper).connect(top).connect(this.faderNode);
    return { comp, drive, top };
  }

  private makeFloor(): BiquadFilterNode {
    const floor = this.audio.createBiquadFilter();
    floor.type = 'highpass';
    floor.frequency.value = FLOOR_HZ;
    floor.Q.value = Math.SQRT1_2;
    return floor;
  }

  /** A channel's gain for a layer: the track's volume, into the layer's gain. */
  private channel(channel: number, role: Role): GainNode {
    const key = `${channel}:${role}`;
    let node = this.channels.get(key);
    if (!node) {
      node = this.audio.createGain();
      const volume = channel === PERCUSSION_CHANNEL ? this.playing?.kit.volume : this.tracks[channel]?.volume;
      node.gain.value = velocityGain(volume ?? 127);
      const layer = this.layers.get(role);
      if (layer) node.connect(layer.node);
      this.channels.set(key, node);
    }
    return node;
  }

  /** A note's last gain into its channel, through the channel's panner for its place where it is not in the middle:
   *  one panner a place, not a note, as a pan is the same sum either way. Answers what to let go of as it ends. */
  private connect(gain: AudioNode, pan: number, note: Note): AudioNode {
    const into = this.channel(note.channel, note.role);
    if (!pan) {
      gain.connect(into);
      return gain;
    }
    const place = Math.max(-1, Math.min(1, pan));
    const key = `${note.channel}:${note.role}:${place}`;
    let panner = this.panned.get(key);
    if (!panner) {
      panner = this.audio.createStereoPanner();
      panner.pan.value = place;
      panner.connect(into);
      this.panned.set(key, panner);
    }
    gain.connect(panner);
    return gain;
  }

  /** One second of white noise, made once and shared by every drum. */
  private noiseBuffer(): AudioBuffer {
    if (this.noise) return this.noise;
    const length = Math.floor(this.audio.sampleRate);
    this.noise = this.audio.createBuffer(1, length, this.audio.sampleRate);
    const samples = this.noise.getChannelData(0);
    for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;
    return this.noise;
  }

  /** Builds one note and schedules it. */
  private voice(note: Note, when: number, seconds: number): void {
    const amp = velocityGain(note.velocity);
    if (amp <= 0) return;
    if (note.channel === PERCUSSION_CHANNEL) return this.drum(note, when, amp);
    const track = this.tracks[note.channel];
    if (!track) return;
    const own = track.voice;
    const spec = { ...fmVoice(track.program), ...own };
    const audio = this.audio;
    const hertz = noteToHz(note.note);
    const attackEnd = when + spec.attack;
    const decayEnd = attackEnd + spec.decay;
    const release = Math.max(decayEnd, when + seconds);
    const end = release + spec.release;
    // A unison's copies, each set off by its cents and begun a share of a period apart so they never start in phase.
    const offsets = unisonCents(own?.unison ?? 1, own?.cents ?? 0);
    const peak = (amp * spec.gain) / Math.sqrt(offsets.length);
    const sustain = Math.max(0.0001, peak * spec.sustain);
    const spread = own?.spread ?? 0;
    const left = audio.createGain();
    const right = spread > 0 && offsets.length > 1 ? audio.createGain() : null;
    const sides = right ? [left, right] : [left];
    const oscillators: OscillatorNode[] = [];
    offsets.forEach((cents, copy) => {
      const begin = when + (copy * 0.29) / hertz;
      const carrier = audio.createOscillator();
      carrier.frequency.value = hertz * spec.car;
      const modulator = audio.createOscillator();
      modulator.frequency.value = hertz * spec.mod;
      if (cents) [carrier.detune.value, modulator.detune.value] = [cents, cents];
      // The modulation's depth in hertz, settling: a bright attack dulls into its sustain.
      const depth = audio.createGain();
      const deepest = depthOf(spec, hertz);
      depth.gain.setValueAtTime(deepest, when);
      depth.gain.exponentialRampToValueAtTime(Math.max(1, deepest * 0.12), when + Math.max(0.02, spec.idxDecay));
      modulator.connect(depth).connect(carrier.frequency);
      carrier.connect(right && copy % 2 === 1 ? right : left);
      modulator.start(begin);
      carrier.start(begin);
      oscillators.push(modulator, carrier);
    });
    const subShare = own?.sub ?? 0;
    if (subShare > 0) {
      const sub = audio.createOscillator();
      const share = audio.createGain();
      sub.frequency.value = (hertz * spec.car) / 2;
      share.gain.value = (subShare * Math.sqrt(offsets.length)) / sides.length;
      sub.connect(share);
      for (const side of sides) share.connect(side);
      sub.start(when);
      oscillators.push(sub);
    }
    for (const side of sides) {
      side.gain.setValueAtTime(0.0001, when);
      side.gain.linearRampToValueAtTime(Math.max(0.0001, peak), attackEnd);
      side.gain.exponentialRampToValueAtTime(sustain, decayEnd);
      side.gain.setValueAtTime(sustain, release);
      side.gain.exponentialRampToValueAtTime(0.0001, end);
    }
    const pan = panPosition(track.pan);
    const outs = right
      ? [this.connect(left, Math.max(-1, pan - spread), note), this.connect(right, Math.min(1, pan + spread), note)]
      : [this.connect(left, pan, note)];
    for (const oscillator of oscillators) oscillator.stop(end + 0.02);
    // A finished note lets go of its channel, so the graph never pulls the dead.
    const first = oscillators[0];
    if (first) first.onended = () => outs.forEach((out) => out.disconnect());
    this.sounding.push({ endsAt: end, stop: () => oscillators.forEach((oscillator) => oscillator.stop()) });
  }

  /** Builds one drum hit: a falling sine or a band of noise, and a song's own drum's click and body over it. */
  private drum(note: Note, when: number, amp: number): void {
    const audio = this.audio;
    const own = this.playing?.kit.drums.get(note.note);
    const drum = { ...drumOf(note.note), ...own };
    const gain = audio.createGain();
    let source: AudioScheduledSourceNode;
    if (drum.kind === 'noise') {
      const noise = audio.createBufferSource();
      noise.buffer = this.noiseBuffer();
      // Looped, so a cymbal longer than the second of noise rings to its end.
      noise.loop = true;
      const band = audio.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = drum.hz;
      band.Q.value = drum.q ?? 1.2;
      noise.connect(band).connect(gain);
      source = noise;
    } else {
      const tone = audio.createOscillator();
      tone.frequency.setValueAtTime(drum.hz, when);
      // A skin falls in pitch, which is what makes it a drum; metal and wood hold theirs.
      if (drum.drop !== 1) tone.frequency.exponentialRampToValueAtTime(drum.hz * drum.drop, when + drum.decay);
      tone.connect(gain);
      source = tone;
    }
    const peak = amp * drum.gain;
    const ends = when + drum.attack + drum.decay;
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(peak, when + drum.attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, ends);
    const out = this.connect(gain, 0, note);
    source.start(when);
    source.stop(ends + 0.02);
    const layers = own ? this.drumLayers(drum, when, peak, note) : [];
    source.onended = () => out.disconnect();
    this.sounding.push({ endsAt: ends, stop: () => [source, ...layers].forEach((each) => each.stop()) });
  }

  /** A song's own drum's layers: the beater's click (noise about 3.2 kHz, gone in 15 ms) and a skin's body (a tone
   *  falling a third over the first of the decay). */
  private drumLayers(
    drum: { readonly click?: number; readonly body?: number; readonly decay: number },
    when: number,
    peak: number,
    note: Note,
  ): AudioScheduledSourceNode[] {
    const audio = this.audio;
    const made: AudioScheduledSourceNode[] = [];
    if ((drum.click ?? 0) > 0) {
      const noise = audio.createBufferSource();
      const band = audio.createBiquadFilter();
      const gain = audio.createGain();
      noise.buffer = this.noiseBuffer();
      band.type = 'bandpass';
      band.frequency.value = 3200;
      band.Q.value = 0.8;
      gain.gain.setValueAtTime(peak * (drum.click ?? 0), when);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.015);
      noise.connect(band).connect(gain);
      const out = this.connect(gain, 0, note);
      noise.onended = () => out.disconnect();
      noise.start(when);
      noise.stop(when + 0.03);
      made.push(noise);
    }
    const body = drum.body ?? 0;
    if (body > 0) {
      const tone = audio.createOscillator();
      const gain = audio.createGain();
      const length = Math.max(0.03, drum.decay * 0.6);
      tone.frequency.setValueAtTime(body, when);
      tone.frequency.exponentialRampToValueAtTime(body * 0.66, when + length);
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.linearRampToValueAtTime(peak * 0.7, when + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + length);
      tone.connect(gain);
      const out = this.connect(gain, 0, note);
      tone.onended = () => out.disconnect();
      tone.start(when);
      tone.stop(when + length + 0.02);
      made.push(tone);
    }
    return made;
  }
}
