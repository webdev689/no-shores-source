// The interface's sounds: a tick as the pointer or the keys reach a control, a press, a tab turned, the menu opened and
// shut, a hold's build-up until it acts, an item dismantled or fed, a gain's chime by its rarity, and a refusal.
// The owner picked each on the sound sheet: a recording from Freesound (soundSamples.ts), silent while it loads, or,
// for the refusal, the chimes and the hold, one the browser's own synthesiser makes here. One listener hears every
// press, as DFO's click does, and plays the press only where no sound of its own already played. The volume is the
// player's, kept in this browser, as are the world's, the music's and the ambience's, each playing through a bus of
// this engine's.

import { loadSamples, playSample } from '../soundSamples.ts';

/** The sounds the interface makes. */
export type Cue = 'hover' | 'press' | 'tab' | 'open' | 'close' | 'back' | 'dismantle' | 'feed' | 'refused';

/** Where the player's volumes are kept, 0 to 1: the interface's and the world's. */
const VOLUME_KEY = 'noshores.interfaceVolume';
const VOLUME_FIRST = 0.6;
const WORLD_KEY = 'noshores.worldVolume';
const WORLD_FIRST = 0.8;
const MUSIC_KEY = 'noshores.musicVolume';
const MUSIC_FIRST = 0.7;
const AMBIENCE_KEY = 'noshores.ambienceVolume';
const AMBIENCE_FIRST = 0.8;
/** How loud the whole interface stands at full volume, under the game's own sounds. */
const LEVEL = 0.35;
/** The least time between two ticks, so a sweep across a grid is a patter, not a buzz. */
const TICK_MS = 45;
/** How far a tick's or a press's pitch strays, either way, as a share of it. */
const STRAY = 0.06;
/** The cues played from a recording the owner picked, by its place in content/audio/sounds.json. */
const RECORDED: Partial<Record<Cue, string>> = {
  hover: 'ui.hover',
  press: 'ui.press',
  back: 'ui.back',
  open: 'ui.open',
  dismantle: 'hold.dismantle',
  feed: 'hold.feed',
  tab: 'ui.tab',
  close: 'ui.close',
};

let context: AudioContext | null = null;
let master: GainNode | null = null;
let world: GainNode | null = null;
let music: GainNode | null = null;
let ambience: GainNode | null = null;
/** The ambience's duck, under its volume: the music lowers it as a fight swells, and lets it back after. */
let duck: GainNode | null = null;
/** Two seconds of pink noise, softer at the top than white, the stuff of a hold's air. */
let air: AudioBuffer | null = null;
/** When the last sound played, so a press that already sounded sounds once. */
let lastCueAt = -Infinity;
let lastTickAt = -Infinity;

/** Each volume once set in this page, so a browser that keeps nothing still shows what it plays at. */
const chosen = new Map<string, number>();

/** A volume kept under `key`, 0 to 1. */
function volumeOf(key: string, first: number): number {
  const set = chosen.get(key);
  if (set !== undefined) return set;
  try {
    const kept = Number(localStorage.getItem(key) ?? first);
    return Number.isFinite(kept) ? Math.min(1, Math.max(0, kept)) : first;
  } catch {
    return first;
  }
}

function keepVolume(key: string, volume: number): number {
  const kept = Math.min(1, Math.max(0, volume));
  chosen.set(key, kept);
  try {
    localStorage.setItem(key, String(kept));
  } catch {
    // A browser that keeps nothing still hears the change until the page closes.
  }
  return kept;
}

/** The interface's volume, 0 to 1. */
export const interfaceVolume = (): number => volumeOf(VOLUME_KEY, VOLUME_FIRST);

export function setInterfaceVolume(volume: number): void {
  const kept = keepVolume(VOLUME_KEY, volume);
  if (master) master.gain.value = kept * LEVEL;
}

/** The world's volume, 0 to 1. */
export const worldVolume = (): number => volumeOf(WORLD_KEY, WORLD_FIRST);

export function setWorldVolume(volume: number): void {
  const kept = keepVolume(WORLD_KEY, volume);
  if (world) world.gain.value = kept;
}

/** Where the world's sounds play: this engine's context, through the world's volume; null before the first press or
 *  key wakes it, or with the world silenced. */
export function worldOutput(): { readonly audio: AudioContext; readonly out: AudioNode } | null {
  if (!context || !world || worldVolume() === 0) return null;
  if (context.state === 'suspended') void context.resume();
  return { audio: context, out: world };
}

/** The music's volume, 0 to 1. */
export const musicVolume = (): number => volumeOf(MUSIC_KEY, MUSIC_FIRST);

export function setMusicVolume(volume: number): void {
  const kept = keepVolume(MUSIC_KEY, volume);
  if (music) music.gain.value = kept;
}

/** The ambience's volume, 0 to 1. */
export const ambienceVolume = (): number => volumeOf(AMBIENCE_KEY, AMBIENCE_FIRST);

export function setAmbienceVolume(volume: number): void {
  const kept = keepVolume(AMBIENCE_KEY, volume);
  if (ambience) ambience.gain.value = kept;
}

/** A bus of this engine's, through its volume; null before the first press or key wakes it, or with it silenced. */
function bus(node: GainNode | null, volume: number): { readonly audio: AudioContext; readonly out: AudioNode } | null {
  if (!context || !node || volume === 0) return null;
  if (context.state === 'suspended') void context.resume();
  return { audio: context, out: node };
}

/** Where the music plays. */
export const musicOutput = () => bus(music, musicVolume());
/** Where the ambience plays, under its duck. */
export const ambienceOutput = () => bus(duck, ambienceVolume());

/** Lowers the ambience to `level` of itself (1 is untouched) over `seconds`, as music swells over it. */
export function duckAmbience(level: number, seconds: number): void {
  if (!context || !duck) return;
  const now = context.currentTime;
  duck.gain.cancelScheduledValues(now);
  duck.gain.setValueAtTime(duck.gain.value, now);
  duck.gain.linearRampToValueAtTime(Math.min(1, Math.max(0, level)), now + Math.max(0.01, seconds));
}

/** The synthesiser, woken by the player's first press or key, as a browser lets sound start only then; woken again by
 *  a later one, should the browser have stopped it. Nothing else wakes it, so no sound waits to play all at once. */
function wake(): void {
  if (context) {
    if (context.state !== 'running') void context.resume();
    return;
  }
  if (typeof AudioContext === 'undefined') return;
  context = new AudioContext();
  master = context.createGain();
  master.gain.value = interfaceVolume() * LEVEL;
  master.connect(context.destination);
  world = context.createGain();
  world.gain.value = worldVolume();
  world.connect(context.destination);
  music = context.createGain();
  music.gain.value = musicVolume();
  music.connect(context.destination);
  ambience = context.createGain();
  ambience.gain.value = ambienceVolume();
  ambience.connect(context.destination);
  duck = context.createGain();
  duck.connect(ambience);
  loadSamples(context);
  air = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const airy = air.getChannelData(0);
  // White noise filtered to fall away by its pitch, as pink noise does.
  let [slow, middle, quick] = [0, 0, 0];
  for (let index = 0; index < airy.length; index++) {
    const white = Math.random() * 2 - 1;
    slow = 0.99765 * slow + white * 0.099;
    middle = 0.963 * middle + white * 0.2965;
    quick = 0.57 * quick + white * 1.0526;
    airy[index] = (slow + middle + quick + white * 0.1848) * 0.2;
  }
}

/** The synthesiser, if it is awake and may sound now. */
function live(): { readonly audio: AudioContext; readonly out: GainNode; readonly when: number } | null {
  if (!context || !master || interfaceVolume() === 0) return null;
  if (context.state === 'suspended') void context.resume();
  return { audio: context, out: master, when: context.currentTime + 0.005 };
}

/** An envelope: up to `peak` at once, down to silence over `length` seconds. */
function envelope(audio: AudioContext, out: AudioNode, when: number, peak: number, length: number): GainNode {
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(peak, when + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + length);
  gain.connect(out);
  return gain;
}

/** A tone gliding from one pitch to another over its length. */
function tone(type: OscillatorType, [from, to]: readonly [number, number], peak: number, length: number, delay = 0) {
  const now = live();
  if (!now) return;
  const when = now.when + delay;
  const voice = now.audio.createOscillator();
  voice.type = type;
  voice.frequency.setValueAtTime(from, when);
  voice.frequency.exponentialRampToValueAtTime(to, when + length);
  voice.connect(envelope(now.audio, now.out, when, peak, length));
  voice.start(when);
  voice.stop(when + length + 0.02);
}

/** Plays a cue of the interface. */
export function play(cue: Cue): void {
  lastCueAt = performance.now();
  // The sounds heard most stray a little in pitch, so a run of them never drones.
  const stray = 1 + (Math.random() - 0.5) * STRAY;
  const now = live();
  const recorded = RECORDED[cue];
  const often = cue === 'hover' || cue === 'press' || cue === 'back';
  if (recorded) {
    if (now) playSample(now.audio, now.out, recorded, often ? stray : 1);
    return;
  }
  // The refusal is the synthesiser's: a low double buzz.
  tone('square', [118, 112], 0.08, 0.09);
  tone('square', [118, 112], 0.08, 0.09, 0.12);
}

/** A brass bell: a sine rung by another at 1.4 times its pitch, the ring fading faster than the note, over a soft
 *  octave below for its body. */
function bell(pitch: number, peak: number, length: number, delay = 0) {
  const now = live();
  if (!now) return;
  const when = now.when + delay;
  const sound = (freq: number, share: number, rings: number, struck: boolean) => {
    const voice = now.audio.createOscillator();
    voice.frequency.setValueAtTime(freq, when);
    if (struck) {
      const striker = now.audio.createOscillator();
      striker.frequency.setValueAtTime(freq * 1.4, when);
      const depth = now.audio.createGain();
      depth.gain.setValueAtTime(freq * 2.2, when);
      depth.gain.exponentialRampToValueAtTime(freq * 0.05, when + rings * 0.6);
      striker.connect(depth).connect(voice.frequency);
      striker.start(when);
      striker.stop(when + rings + 0.05);
    }
    voice.connect(envelope(now.audio, now.out, when, peak * share, rings));
    voice.start(when);
    voice.stop(when + rings + 0.05);
  };
  sound(pitch, 1, length, true);
  sound(pitch / 2, 0.25, length * 0.8, false);
}

/** A chord swelling in and out, its notes each a little apart in pitch so it shimmers. */
function held(pitches: readonly number[], peak: number, length: number, delay: number) {
  const now = live();
  if (!now) return;
  const when = now.when + delay;
  for (const pitch of pitches)
    for (const cents of [-6, 6]) {
      const voice = now.audio.createOscillator();
      voice.frequency.setValueAtTime(pitch * 2 ** (cents / 1200), when);
      const gain = now.audio.createGain();
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(peak / pitches.length, when + length * 0.35);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + length);
      voice.connect(gain).connect(now.out);
      voice.start(when);
      voice.stop(when + length + 0.05);
    }
}

/** The gains' bells are pitched from A5, a step at a time in semitones. */
const BELL = 880;
const fromBell = (steps: readonly number[]) => steps.map((semitones) => BELL * 2 ** (semitones / 12));
/** A Legendary gain's glints, as dust catching the light: each a multiple of the bell an octave up. */
const GLINTS = [2, 3, 2.5, 4, 3.5, 2, 3, 2.5];
/** A gain's chime, the Brass bells the owner picked: one voice at three sizes, a single bell for a Normal or Magic gain,
 *  a rising run for a Rare, and for a Legendary or Atheric a longer run over a held, shimmering chord and its glints. */
export function chime(rarity: number): void {
  lastCueAt = performance.now();
  if (rarity <= 1) return bell(BELL, 0.22, 0.45);
  if (rarity === 2) return fromBell([0, 4, 7]).forEach((pitch, nth) => bell(pitch, 0.2, 0.7, nth * 0.075));
  fromBell([0, 4, 7, 12, 16]).forEach((pitch, nth) => bell(pitch, 0.18, 0.9, nth * 0.065));
  held(fromBell([-12, -5, 0, 4]), 0.12, 1.6, 0.2);
  GLINTS.forEach((step, nth) => {
    const pitch = BELL * 2 * step;
    tone('sine', [pitch, pitch], 0.05 * (1 - nth / 10), 0.12, 0.35 + nth * 0.045 + (nth % 3) * 0.012);
  });
}

/** A hold's build-up, the Shimmer the owner picked: high, thin air swelling over `holdMs` as it is held, glinting
 *  faster as it nears its end, then gone; the stop it returns lets it fall away at once, let go early. */
export function charge(holdMs: number): () => void {
  lastCueAt = performance.now();
  const now = live();
  if (!now || !air) return () => undefined;
  const seconds = holdMs / 1000;
  const source = now.audio.createBufferSource();
  source.buffer = air;
  source.loop = true;
  const high = now.audio.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.setValueAtTime(3000, now.when);
  high.frequency.exponentialRampToValueAtTime(6000, now.when + seconds);
  // Its loudness flutters, quickening from seven times a second to fourteen.
  const flutter = now.audio.createOscillator();
  flutter.frequency.setValueAtTime(7, now.when);
  flutter.frequency.linearRampToValueAtTime(14, now.when + seconds);
  const depth = now.audio.createGain();
  depth.gain.value = 0.35;
  const glint = now.audio.createGain();
  flutter.connect(depth).connect(glint.gain);
  const gain = now.audio.createGain();
  gain.gain.setValueAtTime(0.0001, now.when);
  gain.gain.exponentialRampToValueAtTime(0.31, now.when + seconds);
  gain.gain.exponentialRampToValueAtTime(0.0001, now.when + seconds + 0.08);
  source.connect(high).connect(glint).connect(gain).connect(now.out);
  for (const voice of [source, flutter]) {
    voice.start(now.when);
    voice.stop(now.when + seconds + 0.1);
  }
  return () => {
    lastCueAt = performance.now();
    const when = now.audio.currentTime;
    gain.gain.cancelScheduledValues(when);
    // Let go before it began, it reads at the gain's default of 1: it stays silent, never a hiss at the full level.
    const level = when < now.when + 0.004 ? 0.0001 : Math.max(0.0001, gain.gain.value);
    gain.gain.setValueAtTime(level, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
    for (const voice of [source, flutter]) voice.stop(when + 0.05);
  };
}

/** A drawn press let go that makes no press's sound: a hold, whose own charge is its sound. */
export function quietPress(): void {
  lastCueAt = performance.now();
}

/** A press the game draws, let go at `when` (`performance.now()`): it sounds, unless a sound of its own played since. */
export function drawnPress(when: number): void {
  if (lastCueAt < when) play('press');
}

/** A control the game draws, reached by the pointer or the keys: a tick, no oftener than a patter. */
export function drawnReach(): void {
  const now = performance.now();
  if (now - Math.max(lastTickAt, lastCueAt) < TICK_MS) return;
  lastTickAt = now;
  play('hover');
}

/** Wakes the sounds at the player's every press or key (`wake`). */
export function wakeOnGesture(): void {
  addEventListener('pointerdown', () => wake(), true);
  addEventListener('keydown', () => wake(), true);
}
