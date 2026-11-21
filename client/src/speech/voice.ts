// The one voice every speaker is heard in, a voice blurb: a buzz through two band-passes set to a vowel, then a
// low-pass that muffles it, as speech heard through wind and timber rather than words made out. Each call is one
// syllable with a vowel of its own, so a run of them reads as talk without being a language. A speaker differs only by
// the numbers in its profile.

/** A speaker's voice, as content/story/cast.json gives it. */
export interface VoiceProfile {
  /** The lowest pitch of the buzz. */
  pitchHz: number;
  /** How far above that a syllable may land. */
  spreadHz: number;
  /** The low-pass that muffles the voice; a little above it is rolled each syllable. */
  muffleHz: number;
  volume: number;
  /** One syllable's length, which is also the time between syllables. */
  syllableS: number;
}

/** One syllable's sound, rolled from its voice. */
export interface Syllable {
  readonly pitchHz: number;
  readonly firstFormantHz: number;
  readonly secondFormantHz: number;
  readonly muffleHz: number;
  readonly volume: number;
  readonly lengthS: number;
}

/** How much higher and louder a leant-on syllable is: a shout or a cry. */
const EMPHASIS_HZ = 12;
const EMPHASIS_VOLUME = 0.1;
/** How far above its floor the muffle may be rolled, so the voice shimmers rather than drones. */
const MUFFLE_SHIMMER_HZ = 400;
const ATTACK_S = 0.012;

/** Rolls one syllable of `voice`. */
export function syllableOf(voice: VoiceProfile, emphasis: boolean, roll: () => number = Math.random): Syllable {
  return {
    pitchHz: voice.pitchHz + roll() * voice.spreadHz + (emphasis ? EMPHASIS_HZ : 0),
    firstFormantHz: 300 + roll() * 400,
    secondFormantHz: 800 + roll() * 1200,
    muffleHz: voice.muffleHz + roll() * MUFFLE_SHIMMER_HZ,
    volume: voice.volume + (emphasis ? EMPHASIS_VOLUME : 0),
    lengthS: voice.syllableS,
  };
}

/** The pan of a voice whose speaker stands `x` CSS pixels across a screen `width` wide: -1 at the left, 1 at the right. */
export function panOf(x: number, width: number): number {
  if (width <= 0) return 0;
  return Math.max(-1, Math.min(1, (x / width) * 2 - 1));
}

/** Sounds one syllable of `voice` into `out`, now or at `when` on the audio clock. */
export function speakSyllable(
  audio: AudioContext,
  out: AudioNode,
  voice: VoiceProfile,
  options: { pan?: number; emphasis?: boolean; when?: number } = {},
): void {
  const syllable = syllableOf(voice, options.emphasis ?? false);
  const start = options.when ?? audio.currentTime;
  const end = start + syllable.lengthS;
  const muffle = new BiquadFilterNode(audio, { type: 'lowpass', frequency: syllable.muffleHz, Q: 1 });
  const envelope = new GainNode(audio, { gain: 0 });
  envelope.gain.setValueAtTime(0, start);
  envelope.gain.linearRampToValueAtTime(syllable.volume, start + ATTACK_S);
  envelope.gain.setValueAtTime(syllable.volume * 0.85, start + syllable.lengthS * 0.7);
  envelope.gain.linearRampToValueAtTime(0, end);
  muffle
    .connect(envelope)
    .connect(new StereoPannerNode(audio, { pan: options.pan ?? 0 }))
    .connect(out);
  const buzz = new OscillatorNode(audio, { type: 'sawtooth', frequency: syllable.pitchHz });
  const vowel = new GainNode(audio);
  for (const [frequency, sharpness] of [
    [syllable.firstFormantHz, 8],
    [syllable.secondFormantHz, 6],
  ]) {
    buzz.connect(new BiquadFilterNode(audio, { type: 'bandpass', frequency, Q: sharpness })).connect(vowel);
  }
  vowel.connect(muffle);
  buzz.start(start);
  buzz.stop(end + 0.02);
}
