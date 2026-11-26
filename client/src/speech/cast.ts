// Reads a mission's cast and scenes from content/story/ and refuses what the speech system cannot play: a line by
// someone not in the cast, or a speaker without a voice, since every line on screen must be heard.
import type { VoiceProfile } from './voice.ts';

/** The feelings a line may name. A scene keeps them as written; no glyph or sound shows them. */
export const EMOTE_KINDS = ['alert', 'question', 'fear', 'anger', 'cheer', 'pain', 'silence'] as const;
export type EmoteKind = (typeof EMOTE_KINDS)[number];

/** One line: who says it, what they say, whether it is a short bark over the head, and the feeling it shows. */
export interface Line {
  readonly who: string;
  readonly say: string;
  readonly kind?: 'bark';
  readonly emote?: EmoteKind;
}

export interface Cast {
  /** Each speaker by key: the name shown over their words ("" for a voice from nowhere), their voice's key, and the
   *  colour their name is shown in (`#rrggbb`; null for one with none, whose name is the kit's brass). */
  readonly speakers: Record<string, { name: string; voice: string; colour: string | null }>;
  readonly voices: Record<string, VoiceProfile>;
}

/** A name's colour as the cast writes it. */
const COLOUR = /^#[0-9a-f]{6}$/i;

const VOICE_NUMBERS = ['pitchHz', 'spreadHz', 'muffleHz', 'volume', 'syllableS'] as const;
/** Numbers a voice cannot be heard without, so they must be above zero; the spread alone may be nothing. */
const ABOVE_ZERO = new Set<string>(['pitchHz', 'muffleHz', 'volume', 'syllableS']);
/** A syllable shorter than this cannot rise, hold and fall (voice.ts), and would sound every frame. */
const SHORTEST_SYLLABLE_S = 0.04;

/** The one key a plain object cannot hold as its own: set, it replaces the object's prototype, so a speaker, a voice or
 *  a scene named so would vanish. The dialogue check (crates/xtask) refuses it too. */
const PROTOTYPE_KEY = '__proto__';

function record(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${what} is not an object`);
  return value as Record<string, unknown>;
}

/** A record's own entries, refusing the key no record can keep. */
function entriesOf(value: unknown, what: string): [string, unknown][] {
  const entries = Object.entries(record(value, what));
  if (entries.some(([key]) => key === PROTOTYPE_KEY)) throw new Error(`${what} cannot hold the key "${PROTOTYPE_KEY}"`);
  return entries;
}

function voiceOf(value: unknown, key: string): VoiceProfile {
  const fields = record(value, `voice "${key}"`);
  for (const number of VOICE_NUMBERS) {
    const given = fields[number];
    if (typeof given !== 'number' || !Number.isFinite(given) || given < 0 || (ABOVE_ZERO.has(number) && given === 0)) {
      throw new Error(`voice "${key}" has no usable ${number}`);
    }
  }
  if ((fields.syllableS as number) < SHORTEST_SYLLABLE_S) {
    throw new Error(`voice "${key}" has a syllableS under ${SHORTEST_SYLLABLE_S} s, too short to swell and fall`);
  }
  const { pitchHz, spreadHz, muffleHz, volume, syllableS } = fields as unknown as VoiceProfile;
  return { pitchHz, spreadHz, muffleHz, volume, syllableS };
}

/** The cast in `json`; throws when a speaker's voice is missing or a voice cannot be heard. */
export function castOf(json: unknown): Cast {
  const file = record(json, 'the cast');
  const listed = entriesOf(file.speakers, "the cast's speakers");
  const voices: Record<string, VoiceProfile> = {};
  for (const [key, voice] of entriesOf(file.voices, "the cast's voices")) voices[key] = voiceOf(voice, key);
  const speakers: Record<string, { name: string; voice: string; colour: string | null }> = {};
  for (const [key, value] of listed) {
    const speaker = record(value, `speaker "${key}"`);
    if (typeof speaker.name !== 'string') throw new Error(`speaker "${key}" has no name`);
    if (typeof speaker.voice !== 'string' || !Object.hasOwn(voices, speaker.voice)) {
      throw new Error(`speaker "${key}" has no voice: "${String(speaker.voice)}" is not in the cast's voices`);
    }
    const colour = typeof speaker.colour === 'string' && COLOUR.test(speaker.colour) ? speaker.colour : null;
    speakers[key] = { name: speaker.name, voice: speaker.voice, colour };
  }
  return { speakers, voices };
}

function lineOf(value: unknown, where: string, cast: Cast): Line {
  const fields = record(value, where);
  const { who, say, kind, emote } = fields;
  if (typeof who !== 'string' || !Object.hasOwn(cast.speakers, who))
    throw new Error(`${where}: "${String(who)}" is not in the cast`);
  if (typeof say !== 'string' || say.trim() === '') throw new Error(`${where}: a line needs words`);
  if (kind !== undefined && kind !== 'bark') throw new Error(`${where}: kind "${String(kind)}" is not "bark"`);
  if (emote !== undefined && !EMOTE_KINDS.includes(emote as EmoteKind)) {
    throw new Error(`${where}: emote "${String(emote)}" is not one of ${EMOTE_KINDS.join(', ')}`);
  }
  return {
    who,
    say,
    ...(kind === 'bark' ? { kind } : {}),
    ...(emote === undefined ? {} : { emote: emote as EmoteKind }),
  };
}

/** The scenes of a mission file, `{ scenes: { name: [line, ...] } }`, each line checked against `cast`. */
export function scenesOf(json: unknown, cast: Cast): Record<string, readonly Line[]> {
  const scenes: Record<string, readonly Line[]> = {};
  for (const [name, lines] of entriesOf(record(json, 'the mission').scenes, "the mission's scenes")) {
    if (!Array.isArray(lines)) throw new Error(`scene "${name}" is not a list of lines`);
    scenes[name] = lines.map((line, place) => lineOf(line, `scene "${name}" line ${place + 1}`, cast));
  }
  return scenes;
}
