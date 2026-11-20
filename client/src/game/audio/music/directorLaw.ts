// The music director's law: what plays, from what the game hears each frame. Roaming is silent, ambience alone. A foe
// near turning alert (at sea, a hostile ship closing) brings in the tension layers of the place's fight score,
// quietly; the player fighting (striking, struck, or a foe engaging them) brings in the fight's layers; several foes,
// an Elite or a Miniboss, or the player's health low bring in the peak; a Boss engaged plays its own score, its phase
// by its health. Each mood holds a few seconds after its cause, so a fight falls back to silence only once no foe has
// engaged for a while. A death, a boss's fall, a boss's waking and a fight won are moments of their own (stings). Pure:
// the game's state and the memory in, the mood, the score and any sting out; the director plays them on bar lines.

import type { Climate, Place } from '../place.ts';
import type { Role } from './score.ts';
import type { SeaSong } from './seaScore.ts';

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

/** What plays: nothing, the social space's theme, a family's fight score, a sea song, or a boss's part. */
export type Cue =
  | { readonly kind: 'none' }
  | { readonly kind: 'social' }
  | { readonly kind: 'family'; readonly family: Family }
  | { readonly kind: 'sea'; readonly song: SeaSong }
  | { readonly kind: 'boss'; readonly boss: Boss; readonly part: BossPart };

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
 *  rank, the player's hull as a share, and the hostile ships near. */
export interface HeardSea {
  readonly fighting: boolean;
  readonly captains: number;
  readonly strongest: number;
  readonly hull: number;
  readonly hostilesNear: number;
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
};

export interface Verdict {
  readonly memory: Memory;
  readonly mood: Mood;
  readonly cue: Cue;
  readonly sting: Sting | null;
}

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
export function hear(memory: Memory, hearing: Hearing, seconds: number): Verdict {
  const clock = memory.clock + seconds;
  if (hearing.dead) {
    const sting: Sting | null = memory.dead ? null : { kind: 'defeat', cue: memory.cue };
    return { memory: { ...QUIET, clock, dead: true }, mood: 'silent', cue: { kind: 'none' }, sting };
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
  const mood: Mood = boss
    ? 'boss'
    : clock - lastFight < FIGHT_HOLD_S
      ? clock - lastPeak < PEAK_HOLD_S
        ? 'peak'
        : 'combat'
      : clock - lastDanger < TENSION_HOLD_S
        ? 'tension'
        : 'silent';
  const playing = mood !== 'silent';
  const seaSong = atSea && playing ? (memory.seaSong ?? seaSongFor(sea)) : null;
  let cue: Cue = { kind: 'none' };
  if (boss) cue = { kind: 'boss', boss: boss.boss, part: bossPart(bossFoe?.health ?? 1) };
  else if (seaSong) cue = { kind: 'sea', song: seaSong };
  else if (playing && place.kind !== 'sea') cue = { kind: 'family', family: FAMILY_OF[place.climate] };
  else if (place.kind === 'social') cue = { kind: 'social' };
  // A boss part holds while the boss is out of sight a moment: its health is not heard then.
  if (boss && !bossFoe && memory.cue.kind === 'boss') cue = memory.cue;
  const fightOver = (memory.mood === 'combat' || memory.mood === 'peak') && (mood === 'tension' || mood === 'silent');
  const killed = (memory.killed || hearing.kills > 0) && mood !== 'silent' && mood !== 'tension';
  if (!sting && fightOver) sting = { kind: memory.killed ? 'victory' : 'cadence', cue: memory.cue };
  const next: Memory = { clock, lastFight, lastPeak, lastDanger, dead: false, boss, seaSong, killed, fell, mood, cue };
  return { memory: next, mood, cue, sting };
}

/** Whether two cues name the same music. */
export const sameCue = (one: Cue, other: Cue): boolean => JSON.stringify(one) === JSON.stringify(other);
