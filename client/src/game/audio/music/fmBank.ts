// The voice bank the music plays on: two-operator FM, one sine bending another's pitch, the synthesis the old sound
// cards played and the sound the scores are written for. Every General MIDI program resolves to its family's voice,
// a few programs to their own articulation (a harp plucks where its family bows); channel 9 is the drums, each key a
// sine falling in pitch or a band of noise. These are pure descriptions: the song player builds the sound from them.

/** A note's pitch in hertz: A440 at note 69. */
export const noteToHz = (note: number): number => 440 * 2 ** ((note - 69) / 12);

/** The drums' channel, whatever program it was given. */
export const PERCUSSION_CHANNEL = 9;

/** The sixteen families General MIDI groups its programs in, eight to a family. */
const FAMILIES = [
  'piano',
  'chromatic',
  'organ',
  'guitar',
  'bass',
  'strings',
  'ensemble',
  'brass',
  'reed',
  'pipe',
  'synthLead',
  'synthPad',
  'synthEffects',
  'ethnic',
  'percussive',
  'soundEffects',
] as const;
type Family = (typeof FAMILIES)[number];

/** A pitched voice: the carrier's and the modulator's pitch as multiples of the note's; the modulation's depth in
 *  multiples of the carrier's pitch (its brightness) and the seconds it takes to settle to 12% of that, as a struck
 *  or blown sound dulls; the loudness envelope (seconds, sustain a share of the peak); and its loudness. */
export interface FmVoice {
  readonly car: number;
  readonly mod: number;
  readonly index: number;
  readonly idxDecay: number;
  readonly attack: number;
  readonly decay: number;
  readonly sustain: number;
  readonly release: number;
  readonly gain: number;
}

const voice = (
  mod: number,
  index: number,
  idxDecay: number,
  [attack, decay, sustain, release]: readonly [number, number, number, number],
  gain: number,
): FmVoice => ({ car: 1, mod, index, idxDecay, attack, decay, sustain, release, gain });

/** Each family's voice: an integer ratio is tonal, a fractional one rings like metal. */
const FAMILY_VOICES: Readonly<Record<Family, FmVoice>> = {
  piano: voice(1, 2.6, 0.3, [0.003, 0.55, 0.18, 0.3], 0.8),
  chromatic: voice(3.5, 4, 0.22, [0.002, 0.7, 0.04, 0.5], 0.7),
  organ: voice(2, 1.2, 2, [0.012, 0.06, 0.92, 0.1], 0.55),
  guitar: voice(2, 3.2, 0.18, [0.004, 0.45, 0.16, 0.28], 0.7),
  bass: voice(1, 2, 0.16, [0.006, 0.35, 0.45, 0.18], 0.95),
  strings: voice(1, 1.1, 1.2, [0.09, 0.3, 0.78, 0.4], 0.6),
  ensemble: voice(1, 1.4, 1.4, [0.13, 0.3, 0.82, 0.5], 0.55),
  brass: voice(1, 3.4, 0.55, [0.045, 0.22, 0.75, 0.22], 0.65),
  reed: voice(2, 2.4, 0.6, [0.03, 0.2, 0.78, 0.2], 0.55),
  pipe: voice(2, 0.8, 1, [0.045, 0.15, 0.85, 0.2], 0.6),
  synthLead: voice(1, 2.8, 0.7, [0.01, 0.25, 0.7, 0.2], 0.6),
  synthPad: voice(1, 1, 2, [0.26, 0.4, 0.82, 0.7], 0.5),
  synthEffects: voice(1.41, 3, 0.8, [0.11, 0.5, 0.45, 0.55], 0.45),
  ethnic: voice(3, 2.6, 0.2, [0.006, 0.4, 0.2, 0.28], 0.65),
  percussive: voice(3.5, 5, 0.12, [0.002, 0.4, 0.02, 0.25], 0.75),
  soundEffects: voice(1.73, 2, 0.6, [0.02, 0.4, 0.25, 0.35], 0.45),
};

/** The programs whose family is wrong about how the note is made: plucked or struck where the family bows or holds,
 *  a stab where it is a slow pad, and a swell, the one envelope that runs backwards. Each keeps every field it does
 *  not restate. */
const PROGRAM_VOICES: Readonly<Record<number, Partial<FmVoice>>> = {
  6: { attack: 0.002, decay: 0.3, sustain: 0.04, release: 0.16, index: 3.8, idxDecay: 0.14 }, // harpsichord
  13: { attack: 0.001, decay: 0.22, sustain: 0.02, release: 0.16 }, // xylophone
  14: { attack: 0.002, decay: 1.6, sustain: 0.06, release: 1.2, index: 5, idxDecay: 0.5 }, // tubular bells
  45: { attack: 0.002, decay: 0.22, sustain: 0.02, release: 0.14, index: 2.6, idxDecay: 0.12 }, // pizzicato strings
  46: { attack: 0.002, decay: 0.9, sustain: 0.05, release: 0.7, index: 2.2, idxDecay: 0.35 }, // orchestral harp
  47: { attack: 0.002, decay: 0.45, sustain: 0.02, release: 0.3, index: 4.2, idxDecay: 0.1 }, // timpani
  55: { attack: 0.004, decay: 0.3, sustain: 0.03, release: 0.22, index: 3.6, idxDecay: 0.16 }, // orchestra hit
  119: { attack: 0.55, decay: 0.1, sustain: 0.9, release: 0.08, index: 4, idxDecay: 1.5 }, // reverse cymbal
};

/** A program held to 0..127, so a bad number never silences a track. */
const program = (value: number): number => Math.max(0, Math.min(127, Math.trunc(value) || 0));

/** The voice of a General MIDI program: its family's, with its own articulation over it where it has one. */
export function fmVoice(programNumber: number): FmVoice {
  const held = program(programNumber);
  return { ...FAMILY_VOICES[FAMILIES[held >> 3] ?? 'piano'], ...PROGRAM_VOICES[held] };
}

/** A drum: a sine at `hz` falling to `drop` times it over its decay (1 holds: a bell, a block, a triangle), or a band
 *  of noise about `hz` (`q` its narrowness); its attack and decay in seconds and its loudness; and, for a song's own
 *  kit, the beater's `click` over it and a skin's `body` (hertz) under a noise's crack. */
export interface Drum {
  readonly kind: 'tone' | 'noise';
  readonly hz: number;
  readonly attack: number;
  readonly decay: number;
  readonly gain: number;
  readonly drop: number;
  readonly q?: number;
  readonly click?: number;
  readonly body?: number;
}

/** General MIDI's drum keys, 35 to 87: [key, kind, hertz, attack, decay, loudness, drop]. A skin falls an octave
 *  unless it says otherwise; struck metal and wood hold their pitch. */
const KIT: readonly (readonly [number, 'tone' | 'noise', number, number, number, number, number?])[] = [
  [35, 'tone', 55, 0.002, 0.28, 1], // acoustic bass drum
  [36, 'tone', 60, 0.002, 0.24, 1], // bass drum
  [37, 'noise', 2500, 0.001, 0.05, 0.55], // side stick
  [38, 'noise', 1800, 0.001, 0.16, 0.75], // snare
  [39, 'noise', 1500, 0.001, 0.12, 0.65], // hand clap
  [40, 'noise', 2000, 0.001, 0.14, 0.75], // electric snare
  [41, 'tone', 90, 0.002, 0.28, 0.8], // low floor tom
  [42, 'noise', 7000, 0.001, 0.06, 0.45], // closed hi-hat
  [43, 'tone', 110, 0.002, 0.26, 0.8], // high floor tom
  [44, 'noise', 6500, 0.001, 0.08, 0.4], // pedal hi-hat
  [45, 'tone', 130, 0.002, 0.24, 0.8], // low tom
  [46, 'noise', 6000, 0.001, 0.32, 0.45], // open hi-hat
  [47, 'tone', 165, 0.002, 0.22, 0.8], // low-mid tom
  [48, 'tone', 195, 0.002, 0.21, 0.8], // hi-mid tom
  [49, 'noise', 4500, 0.002, 0.9, 0.55], // crash cymbal
  [50, 'tone', 230, 0.002, 0.2, 0.8], // high tom
  [51, 'noise', 5500, 0.002, 0.5, 0.4], // ride cymbal
  [52, 'noise', 4000, 0.002, 0.7, 0.5], // china cymbal
  [53, 'tone', 2200, 0.001, 0.4, 0.45, 1], // ride bell
  [54, 'noise', 9000, 0.001, 0.12, 0.55], // tambourine
  [55, 'noise', 6500, 0.002, 0.35, 0.45], // splash cymbal
  [56, 'tone', 800, 0.001, 0.22, 0.55, 1], // cowbell
  [57, 'noise', 4200, 0.002, 0.85, 0.55], // crash cymbal 2
  [58, 'noise', 3000, 0.002, 0.45, 0.45], // vibraslap
  [59, 'noise', 5200, 0.002, 0.55, 0.4], // ride cymbal 2
  [60, 'tone', 400, 0.001, 0.13, 0.7, 0.8], // high bongo
  [61, 'tone', 300, 0.001, 0.15, 0.7, 0.8], // low bongo
  [62, 'tone', 360, 0.001, 0.09, 0.65, 0.8], // muted high conga
  [63, 'tone', 330, 0.001, 0.2, 0.7, 0.8], // open high conga
  [64, 'tone', 240, 0.001, 0.24, 0.7, 0.8], // low conga
  [65, 'tone', 520, 0.001, 0.18, 0.65, 0.85], // high timbale
  [66, 'tone', 420, 0.001, 0.2, 0.65, 0.85], // low timbale
  [67, 'tone', 1050, 0.001, 0.18, 0.55, 1], // high agogo
  [68, 'tone', 850, 0.001, 0.2, 0.55, 1], // low agogo
  [69, 'noise', 8000, 0.001, 0.07, 0.4], // cabasa
  [70, 'noise', 8500, 0.001, 0.06, 0.4], // maracas
  [71, 'tone', 2300, 0.002, 0.12, 0.4, 1], // short whistle
  [72, 'tone', 2300, 0.002, 0.35, 0.4, 1], // long whistle
  [73, 'noise', 2200, 0.002, 0.1, 0.45], // short guiro
  [74, 'noise', 2200, 0.002, 0.3, 0.45], // long guiro
  [75, 'tone', 2400, 0.001, 0.06, 0.6, 1], // claves
  [76, 'tone', 2000, 0.001, 0.07, 0.55, 1], // high wood block
  [77, 'tone', 1600, 0.001, 0.08, 0.55, 1], // low wood block
  [78, 'tone', 600, 0.002, 0.1, 0.5, 0.9], // muted cuica
  [79, 'tone', 500, 0.002, 0.25, 0.5, 0.9], // open cuica
  [80, 'tone', 6000, 0.001, 0.08, 0.35, 1], // muted triangle
  [81, 'tone', 6000, 0.001, 0.6, 0.35, 1], // open triangle
  [82, 'noise', 9000, 0.001, 0.07, 0.4], // shaker
  [83, 'tone', 5000, 0.001, 0.3, 0.4, 1], // jingle bell
  [84, 'noise', 7500, 0.002, 0.7, 0.35], // bell tree
  [85, 'noise', 4000, 0.001, 0.05, 0.5], // castanets
  [86, 'tone', 90, 0.002, 0.16, 0.85], // muted surdo
  [87, 'tone', 80, 0.002, 0.4, 0.85], // open surdo
];

/** The drum a key strikes: its own, or the nearest key's, so no drum note is ever silent. */
export function drumOf(key: number): Drum {
  const held = program(key);
  let nearest = KIT[0];
  for (const row of KIT) if (nearest && Math.abs(row[0] - held) < Math.abs(nearest[0] - held)) nearest = row;
  const [, kind, hertz, attack, decay, gain, drop = 0.5] = nearest ?? [35, 'tone', 55, 0.002, 0.28, 1];
  return { kind, hz: hertz, attack, decay, gain, drop };
}

/** A velocity, 0 to 127, as a loudness: squared, so a quiet note sounds quiet. A track's volume reads the same way. */
export function velocityGain(velocity: number): number {
  const share = Math.max(0, Math.min(127, velocity || 0)) / 127;
  return share * share;
}

/** A track's place, 0 to 127 with 64 the middle, as a stereo pan from -1 to 1. */
export const panPosition = (value: number): number => (Math.max(0, Math.min(127, value || 0)) - 64) / 63;
