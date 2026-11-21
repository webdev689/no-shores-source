// The music director's law: what plays, from what the game hears each frame. Out of danger a calm piece comes now and
// then, at sea, in the social space and on the islands, in fair skies, with minutes of silence between pieces. A foe
// near turning alert (at sea, a hostile ship closing) brings in the tension layers of the place's fight score; the
// player fighting brings in the fight's layers; several foes, an Elite or a Miniboss, or low health the peak; a Boss
// engaged plays its own score, its phase by its health. Each mood holds a few seconds after its cause. A death, a
// boss's fall or waking and a fight won are stings. The story tells it what to play. Pure: the game's state, the memory
// and a die in, the mood, the score and any sting out; the director plays them on bar lines.

import type { Climate, Place } from '../place.ts';
import type { Role } from './score.ts';
import type { SeaSong } from './seaScore.ts';
import type { StorySong } from './storyScore.ts';

/** The islands' climates in four families, each with a fight score of its own. */
export type Family = 'green' | 'dry' | 'wet' | 'cold';
export const FAMILY_OF: Readonly<Record<Climate, Family>> = {
  'temperate-coast': 'green',
  'highland': 'green',
  'woodland': 'green',
  'desert': 'dry',
  'savanna': 'dry',
  'steppe': 'dry',
  'rainforest': 'wet',
  'swamp': 'wet',
  'tundra': 'cold',
};

/** The boss scores. */
export type Boss = 'boarding' | 'reckoning' | 'wrath';
/** Each Boss's own score by the name over its bar; a Boss not named here plays the Wrath. */
export const BOSS_SCORES: Readonly<Record<string, Boss>> = {
  'Captain Brannoc Thule': 'boarding',
  'High Assessor Corvane': 'reckoning',
};
/** A boss score's part: a phase by the boss's health, or its last stand. */
export type BossPart = 1 | 2 | 3 | 'last';

export type Mood = 'silent' | 'tension' | 'combat' | 'peak' | 'boss';

/** What plays: nothing, a piece of the social space's, a family's fight score or one of its roaming pieces, a sea
 *  song, a boss's part, or a song of the story's own. */
export type Cue =
  | { readonly kind: 'none' }
  | { readonly kind: 'social'; readonly piece: number }
  | { readonly kind: 'family'; readonly family: Family }
  | { readonly kind: 'roam'; readonly family: Family; readonly piece: number }
  | { readonly kind: 'sea'; readonly song: SeaSong }
  | { readonly kind: 'boss'; readonly boss: Boss; readonly part: BossPart }
  | { readonly kind: 'story'; readonly song: StorySong };

/** What the story asks of the music this frame: a song of its own in a mood's layers; silence, cut at once or let
 *  ring out; or the fight it plays heard as the game hears any, a fight on foot at sea playing a boss's first part
 *  (`score`), in no less than the mood `least`. */
export type StoryHeard =
  | { readonly kind: 'song'; readonly song: StorySong; readonly mood: Mood }
  | { readonly kind: 'silence'; readonly cut: boolean }
  | { readonly kind: 'fight'; readonly score: Boss | null; readonly least: Mood };

/** A moment: a fight won, lost or simply over (its cadence), in the score that was playing; a boss waking or falling. */
export type Sting =
  | { readonly kind: 'victory'; readonly cue: Cue }
  | { readonly kind: 'cadence'; readonly cue: Cue }
  | { readonly kind: 'defeat'; readonly cue: Cue }
  | { readonly kind: 'wake'; readonly boss: Boss }
  | { readonly kind: 'fallen'; readonly boss: Boss };

/** A foe as the music hears it: its rank (1 Minor to 5 Boss), how alert (0 idle, 1 suspicious, 2 alert, 3 searching),
 *  its distance from the player, its health as a share, whether it fights the player, and its name. */
export interface HeardFoe {
  readonly id: number;
  readonly name: string;
  readonly rank: number;
  readonly alert: number;
  readonly distance: number;
  readonly health: number;
  readonly engaged: boolean;
}

/** The sea as the music hears it: whether the player is in a fight, the hostile captains in it and the strongest's
 *  rank, the player's hull as a share, the hostile ships near, and whether it lies off a coast to land on. */
export interface HeardSea {
  readonly fighting: boolean;
  readonly captains: number;
  readonly strongest: number;
  readonly hull: number;
  readonly hostilesNear: number;
  readonly landfall: boolean;
}

/** The sky as the music hears it: how hard rain or snow falls, the storm, the fog, the wind (m/s), and whether it
 *  is night, dusk gone. */
export interface HeardSky {
  readonly falling: number;
  readonly storm: number;
  readonly fog: number;
  readonly windMS: number;
  readonly night: boolean;
}

/** One frame as the music hears it: where the player is, whether they lie dead, their health as a share, whether
 *  they struck or were struck this frame and how many foes they killed, the foes, and the sea. */
export interface Hearing {
  readonly place: Place;
  readonly dead: boolean;
  readonly health: number;
  readonly struck: boolean;
  readonly kills: number;
  readonly foes: readonly HeardFoe[];
  readonly sea: HeardSea | null;
  readonly sky: HeardSky | null;
  /** What the story asks, while it plays; never outside it. */
  readonly story?: StoryHeard;
}

/** The ranks: an Elite and a Miniboss bring the peak, a Boss its own score. */
const ELITE = 3;
const MINIBOSS = 4;
const BOSS = 5;
/** A foe this alert: it has a target, or searches for one. */
const ALERT = 2;
/** A foe alert within this many metres brings the tension. */
export const NEAR_M = 40;
/** This many foes engaged at once bring the peak, as does the player's health at or under this share. */
const MANY = 3;
const LOW_HEALTH = 0.35;
/** How long each mood outlives its cause, seconds: the fight, its peak, the danger near. */
export const FIGHT_HOLD_S = 6;
export const PEAK_HOLD_S = 8;
export const TENSION_HOLD_S = 4;
/** A boss at or under this share of its health plays its score's last stand. */
const LAST_SHARE = 0.1;

/** What the law keeps between frames. */
export interface Memory {
  readonly clock: number;
  readonly lastFight: number;
  readonly lastPeak: number;
  readonly lastDanger: number;
  readonly dead: boolean;
  readonly boss: { readonly boss: Boss; readonly id: number; readonly seen: number } | null;
  readonly seaSong: SeaSong | null;
  readonly killed: boolean;
  /** When the last boss fell: for a while after, only a foe still engaged keeps the fight going. */
  readonly fell: number;
  readonly mood: Mood;
  readonly cue: Cue;
  /** The calm piece playing out of danger and when it ends; none before the clock reaches `restUntil`. */
  readonly roaming: { readonly cue: Cue; readonly until: number } | null;
  readonly restUntil: number;
  /** Where the last frame was heard, for its pieces and its rests; and the piece last begun, never begun twice running. */
  readonly where: Where | null;
  readonly lastPiece: Cue | null;
  /** Whether it lay off a coast to land on last frame, and when landfall last began. */
  readonly offCoast: boolean;
  readonly landedAt: number;
}

export const QUIET: Memory = {
  clock: 0,
  lastFight: -Infinity,
  lastPeak: -Infinity,
  lastDanger: -Infinity,
  dead: false,
  boss: null,
  seaSong: null,
  killed: false,
  fell: -Infinity,
  mood: 'silent',
  cue: { kind: 'none' },
  roaming: null,
  restUntil: -Infinity,
  where: null,
  lastPiece: null,
  offCoast: false,
  landedAt: -Infinity,
};

/** Where the calm pieces are chosen: the sea, the social space, or an island by its climate's family. */
export type Where = 'sea' | 'social' | Family;
export const whereOf = (place: Place): Where =>
  place.kind === 'sea' ? 'sea' : place.kind === 'social' ? 'social' : FAMILY_OF[place.climate];

/** After a sea song, or danger, this many seconds of silence at least, and at most, before another may come. */
export const REST_S: readonly [number, number] = [4 * 60, 8 * 60];
/** Each place's silences, seconds: `after` a piece, at least and at most; and `least` on arriving and after danger,
 *  before the first may come. A social space is where players wait, so its pieces come soonest and most often; an
 *  island's, between fights, least. */
export const RESTS: Readonly<
  Record<'sea' | 'social' | 'island', { readonly after: readonly [number, number]; readonly least: number }>
> = {
  sea: { after: REST_S, least: REST_S[0] },
  social: { after: [150, 300], least: 30 },
  island: { after: [300, 540], least: 120 },
};
const restsOf = (where: Where) => RESTS[where === 'sea' || where === 'social' ? where : 'island'];
/** A sea song is never played in rain or snow this hard, a storm this strong, or fog this thick. */
const FOUL = { falling: 0.05, storm: 0.15, fog: 0.3 } as const;
/** Under this wind, m/s, the sea is still. */
export const STILL_WIND_MS = 4;

/** Whether the sky is fair enough for a sea song; with no reading yet, it is. */
export const fairForSong = (sky: HeardSky | null): boolean =>
  !sky || (sky.falling < FOUL.falling && sky.storm < FOUL.storm && sky.fog < FOUL.fog);

/** The sea song for a fair sky: the night's after dusk, the still sea's in a light wind, else the open sea's. */
export const voyageSongFor = (sky: HeardSky | null): SeaSong =>
  sky?.night ? 'night' : sky && sky.windMS < STILL_WIND_MS ? 'calm' : 'open';

/** How the law hears the calm pieces: each one's length played once through, seconds; how many pieces a place has;
 *  and a die for the rests and the choices. */
export interface SongClock {
  readonly lengthOf: (cue: Cue) => number;
  readonly pieces: (where: Exclude<Where, 'sea'>) => number;
  readonly random: () => number;
}
const SONG_CLOCK: SongClock = { lengthOf: () => 180, pieces: () => 1, random: Math.random };

/** The calm piece for `where` under `sky`: at sea the sky's song; elsewhere one of the place's, by the die, never the
 *  one last begun while there is another. None where nothing is written. */
function pieceFor(where: Where, sky: HeardSky | null, last: Cue | null, songs: SongClock): Cue | null {
  if (where === 'sea') return { kind: 'sea', song: voyageSongFor(sky) };
  const count = songs.pieces(where);
  if (count < 1) return null;
  const cue = (piece: number): Cue =>
    where === 'social' ? { kind: 'social', piece } : { kind: 'roam', family: where, piece };
  const first = Math.min(count - 1, Math.floor(songs.random() * count));
  const again = last !== null && sameCue(last, cue(first)) && count > 1;
  return cue(again ? (first + 1 + Math.min(count - 2, Math.floor(songs.random() * (count - 1)))) % count : first);
}

/** The calm piece out of danger this frame, and when the next may come. Danger, a new place or a sky turning foul ends
 *  one and begins a rest; a new place waits its own least before its first. Landfall plays as the ship comes off a
 *  coast, whatever the rest or the sky. */
function roamOf(
  memory: Memory,
  clock: number,
  calm: boolean,
  hearing: Hearing,
  songs: SongClock,
): Pick<Memory, 'roaming' | 'restUntil' | 'offCoast' | 'landedAt' | 'where' | 'lastPiece'> {
  // Ashore it lies at the coast: sailing out from it is no landfall.
  const offCoast = hearing.sea ? hearing.sea.landfall : true;
  const where = whereOf(hearing.place);
  const { after, least } = restsOf(where);
  const moved = where !== memory.where;
  let { roaming, restUntil, landedAt, lastPiece } = memory;
  if (moved) [roaming, restUntil] = [null, clock + least];
  const landfall = roaming?.cue.kind === 'sea' && roaming.cue.song === 'landfall';
  const ended = roaming && (!calm || clock >= roaming.until || (!landfall && !fairForSong(hearing.sky)));
  if (ended) [roaming, restUntil] = [null, clock + after[0] + (after[1] - after[0]) * songs.random()];
  const kept = { offCoast, landedAt, where, lastPiece };
  if (!calm) return { ...kept, roaming, restUntil: Math.max(restUntil, clock + least) };
  const begin = (cue: Cue) => ({ cue, until: clock + songs.lengthOf(cue) });
  // A ship along the edge of a coast's reach comes off it again and again: landfall comes once in a rest's while.
  if (where === 'sea' && offCoast && !memory.offCoast && clock - landedAt >= REST_S[0])
    [roaming, landedAt] = [begin({ kind: 'sea', song: 'landfall' }), clock];
  else if (!roaming && clock >= restUntil && fairForSong(hearing.sky)) {
    const cue = pieceFor(where, hearing.sky, lastPiece, songs);
    if (cue) [roaming, lastPiece] = [begin(cue), cue];
  }
  return { roaming, restUntil, offCoast, landedAt, where, lastPiece };
}

export interface Verdict {
  readonly memory: Memory;
  readonly mood: Mood;
  readonly cue: Cue;
  readonly sting: Sting | null;
  /** Everything stops at once: the story's cut (a crash, the black after it). */
  readonly cut: boolean;
}

/** The moods from the least to the most. */
const MOODS: readonly Mood[] = ['silent', 'tension', 'combat', 'peak', 'boss'];
const atLeast = (mood: Mood, least: Mood): Mood => (MOODS.indexOf(mood) < MOODS.indexOf(least) ? least : mood);

/** The layers each mood plays: the tension's bed and colour, the fight's pulse, body and tune, the peak's all. */
export const MOOD_ROLES: Readonly<Record<Mood, ReadonlySet<Role>>> = {
  silent: new Set(),
  tension: new Set(['bed', 'tension']),
  combat: new Set(['bed', 'tension', 'pulse', 'combat', 'lead']),
  peak: new Set(['bed', 'tension', 'pulse', 'combat', 'lead', 'peak']),
  boss: new Set(['bed', 'tension', 'pulse', 'combat', 'lead', 'peak']),
};
/** How loud each mood plays its score (the tension comes in quietly), and how far it lowers the ambience under it. */
export const MOOD_LEVEL: Readonly<Record<Mood, number>> = { silent: 0, tension: 0.7, combat: 1, peak: 1, boss: 1 };
export const MOOD_DUCK: Readonly<Record<Mood, number>> = {
  silent: 1,
  tension: 0.85,
  combat: 0.6,
  peak: 0.6,
  boss: 0.4,
};

/** A boss score's part for the boss's health: a phase each third, the last stand in the last tenth. */
export function bossPart(health: number): BossPart {
  if (health <= LAST_SHARE) return 'last';
  return health > 2 / 3 ? 1 : health > 1 / 3 ? 2 : 3;
}

/** The sea's song for an encounter, the sea score's own law on Overlook's waters: its storm, its gravest arm, for two
 *  hostile ships or one of Elite rank or over; else its fight. Held for the whole encounter. */
export function seaSongFor(sea: HeardSea): SeaSong {
  return sea.captains >= 2 || sea.hostilesNear >= 2 || sea.strongest >= ELITE ? 'storm' : 'fight';
}

/** The music for one frame, `seconds` after the last. */
export function hear(memory: Memory, hearing: Hearing, seconds: number, songs: SongClock = SONG_CLOCK): Verdict {
  const clock = memory.clock + seconds;
  if (hearing.dead) {
    const sting: Sting | null = memory.dead ? null : { kind: 'defeat', cue: memory.cue };
    const rest = { restUntil: Math.max(memory.restUntil, clock + REST_S[0]) };
    return {
      memory: { ...QUIET, ...rest, clock, dead: true },
      mood: 'silent',
      cue: { kind: 'none' },
      sting,
      cut: false,
    };
  }
  const story = hearing.story;
  if (story && story.kind !== 'fight') {
    // The story's own song, or its silence, is all that plays: no fight, boss or sea song is kept through it.
    const cue: Cue = story.kind === 'song' ? { kind: 'story', song: story.song } : { kind: 'none' };
    const mood: Mood = story.kind === 'song' ? story.mood : 'silent';
    const rest = { restUntil: Math.max(memory.restUntil, clock + REST_S[0]) };
    const cut = story.kind === 'silence' && story.cut;
    return { memory: { ...QUIET, ...rest, clock, mood, cue }, mood, cue, sting: null, cut };
  }
  const { place, foes, sea } = hearing;
  let sting: Sting | null = null;
  // The boss: one engaged, or the one fought, while it stays alert.
  const kept = memory.boss;
  const alive = (foe: HeardFoe) => foe.health > 0;
  const bossFoe = foes.find(
    (foe) => foe.rank >= BOSS && alive(foe) && (foe.engaged || (foe.id === kept?.id && foe.alert >= ALERT)),
  );
  let boss = kept;
  if (bossFoe) {
    const named = BOSS_SCORES[bossFoe.name] ?? 'wrath';
    if (!kept || kept.id !== bossFoe.id) sting = { kind: 'wake', boss: named };
    boss = { boss: named, id: bossFoe.id, seen: clock };
  } else if (kept && place.kind !== 'sea' && !foes.some((foe) => foe.id === kept.id && alive(foe))) {
    // Dead, or dissolved where it fell: the player left no node behind it, which is the sea's.
    sting = { kind: 'fallen', boss: kept.boss };
    boss = null;
  } else if (kept && clock - kept.seen >= FIGHT_HOLD_S) boss = null;
  const atSea = place.kind === 'sea' && sea !== null;
  const engaged = foes.filter((foe) => foe.engaged && alive(foe));
  // The blows that felled a boss are over with it: its fall is its own moment, not a fight's hold.
  const fell = sting?.kind === 'fallen' ? clock : memory.fell;
  const quietened = clock - fell < FIGHT_HOLD_S;
  const fighting = atSea ? sea.fighting : engaged.length > 0 || (hearing.struck && !quietened);
  const peak = atSea
    ? sea.fighting && (sea.captains >= 2 || sea.strongest >= ELITE || sea.hull <= LOW_HEALTH)
    : fighting &&
      (engaged.length >= MANY ||
        engaged.some((foe) => foe.rank === ELITE || foe.rank === MINIBOSS) ||
        hearing.health <= LOW_HEALTH);
  const danger = atSea
    ? sea.hostilesNear > 0
    : foes.some((foe) => alive(foe) && foe.alert >= ALERT && foe.distance <= NEAR_M);
  const lastFight = fighting ? clock : quietened ? -Infinity : memory.lastFight;
  const lastPeak = peak ? clock : quietened ? -Infinity : memory.lastPeak;
  const lastDanger = danger || fighting ? clock : quietened ? -Infinity : memory.lastDanger;
  const heard: Mood = boss
    ? 'boss'
    : clock - lastFight < FIGHT_HOLD_S
      ? clock - lastPeak < PEAK_HOLD_S
        ? 'peak'
        : 'combat'
      : clock - lastDanger < TENSION_HOLD_S
        ? 'tension'
        : 'silent';
  const mood = story ? atLeast(heard, story.least) : heard;
  const playing = mood !== 'silent';
  const seaSong = atSea && playing ? (memory.seaSong ?? seaSongFor(sea)) : null;
  const roam = roamOf(memory, clock, !playing && !boss, hearing, songs);
  let cue: Cue = { kind: 'none' };
  if (boss) cue = { kind: 'boss', boss: boss.boss, part: bossPart(bossFoe?.health ?? 1) };
  else if (seaSong) cue = { kind: 'sea', song: seaSong };
  else if (roam.roaming) cue = roam.roaming.cue;
  else if (playing && story?.score) cue = { kind: 'boss', boss: story.score, part: 1 };
  else if (playing && place.kind !== 'sea') cue = { kind: 'family', family: FAMILY_OF[place.climate] };
  // A boss part holds while the boss is out of sight a moment: its health is not heard then.
  if (boss && !bossFoe && memory.cue.kind === 'boss') cue = memory.cue;
  const fightOver = (memory.mood === 'combat' || memory.mood === 'peak') && (mood === 'tension' || mood === 'silent');
  const killed = (memory.killed || hearing.kills > 0) && mood !== 'silent' && mood !== 'tension';
  if (!sting && fightOver) sting = { kind: memory.killed ? 'victory' : 'cadence', cue: memory.cue };
  const next: Memory = {
    ...roam,
    clock,
    lastFight,
    lastPeak,
    lastDanger,
    dead: false,
    boss,
    seaSong,
    killed,
    fell,
    mood,
    cue,
  };
  return { memory: next, mood, cue, sting, cut: false };
}

/** Whether two cues name the same music. */
export const sameCue = (one: Cue, other: Cue): boolean => JSON.stringify(one) === JSON.stringify(other);
