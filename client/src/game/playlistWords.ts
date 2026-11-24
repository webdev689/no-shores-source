// What the Playlist screen says, from what the rules say is on (`activitiesAt`), why the gates shut (`gatesAt`) and the
// character's record as their gear last carried it: the Elite and the Abyss Playlist, then the week's Elite and Abyss
// Dungeons, each with its level, rules, modifiers, rewards and why it is shut. Nothing here judges a rule.
import type { Activities, Gates, PlaylistOn } from './activities.ts';
import {
  ABYSS_PAYS,
  ELITE_PAYS,
  type KeyedModifier,
  NEVER_MATCHED,
  levelWords,
  revivesWords,
  shown,
} from './activityWords.ts';
import type { ActivityRecord } from '../network/activityRecord.ts';
import { SOURCES } from '../player/sourceLooks.ts';
import { countdownWords } from './journalWords.ts';

/** The four entries, in the order the screen shows them. */
export type PlaylistKind = 'elite' | 'abyss' | 'week-elite' | 'week-abyss';

/** A reward an entry pays, and how this character stands with it: taken or not (null before their gear is known), its
 *  clears this week as marks filling (the weekly's alone), and the time to its reset. */
export interface PlaylistReward {
  readonly words: string;
  readonly taken: boolean | null;
  readonly clears: readonly boolean[] | null;
  readonly resets: string;
}

/** What Launch and Find a Company start: a run at `seas` of `place` (null: one of the 18, drawn as it starts) with its
 *  foes at `playlist` for a playlist's (null for the week's), and the base Find a Company matches (null for none). */
export interface PlaylistLaunch {
  readonly place: string | null;
  readonly seas: 'elite' | 'abyss';
  readonly playlist: number | null;
  readonly finds: string | null;
}

export interface PlaylistEntry {
  readonly kind: PlaylistKind;
  readonly name: string;
  readonly about: string;
  readonly rules: readonly string[];
  readonly modifiers: readonly KeyedModifier[];
  readonly rewards: readonly PlaylistReward[];
  /** What its runs drop: "Drops Elite Dungeon gear". */
  readonly drops: string;
  /** Why it is shut, in its gate's words; null where it is open. */
  readonly shut: string | null;
  /** Why it is shut at a glance, its crest's line ("Opens at level 24 · You are 15"); null where it is open. */
  readonly lock: string | null;
  readonly launch: PlaylistLaunch;
}

export interface PlaylistScreenState {
  readonly title: string;
  readonly port: string;
  readonly entries: readonly PlaylistEntry[];
  /** What every run pays beside its rewards, said once under the entries. */
  readonly note: string;
}

const DRAWN_RULE = 'One of the 18 Elite Dungeons, drawn as each run starts.';
const ABYSS_DRAWN_RULE = 'One of the 18 Elite Dungeons, at Abyss, drawn as each run starts.';
const DAILY = "Daily, the first clear: a Boss's worth of XP and Aurem, and a Vestige in a Boss's colours.";
const PLAIN = 'Every clear pays its kills and its cache, as any run does.';

/** What a tier's runs drop, by its content's name (`content/gear/looks.json`), never a metal's: "Drops Elite Dungeon
 *  gear". */
function dropsWords(seas: 'elite' | 'abyss'): string {
  const name = SOURCES.find((source) => source.key === seas)?.name ?? '';
  return name === '' ? '' : `Drops ${name.replace(/^(an?|the) /, '')} gear`;
}

/** A shut entry's reason at a glance: "Opens at level 24 · You are 15", from its gate's words; the gate's own words
 *  where it is shut for anything but a level. */
export function lockWords(shut: string, level: number | null): string {
  const opens = /opens at level (\d+)/.exec(shut)?.[1];
  if (opens === undefined) return shut;
  return level === null ? `Opens at level ${opens}` : `Opens at level ${opens} · You are ${level}`;
}

/** The band a level stands in, as the rules give the bands; none below the first. */
const bandOf = (playlist: PlaylistOn, level: number | null) =>
  level === null ? null : (playlist.bands.find(([first, last]) => level >= first && level <= last) ?? null);

/** The weekly reward's words: "Weekly, at 3 clears: 2 Essence of each stock and a Vestige." */
function weeklyWords(given: PlaylistOn): string {
  const vestiges = given.weekVestiges === 1 ? 'a Vestige' : `${given.weekVestiges} Vestiges`;
  return `Weekly, at ${given.weekClears} clears: ${given.weekEssence} Essence of each stock and ${vestiges} in a Boss's colours.`;
}

/** The Playlist screen opened beside `port`, at `now` (Unix milliseconds), for a character of `level`. */
export function playlistScreenOf(
  port: string,
  drawn: Activities,
  gates: Gates | null,
  record: ActivityRecord | null,
  level: number | null,
  placeName: (id: string) => string,
  now: number,
): PlaylistScreenState {
  const dayResets = `Resets in ${countdownWords((drawn.minute + drawn.untilDay) * 60_000 - now)}`;
  const weekResets = `Resets in ${countdownWords((drawn.minute + drawn.untilWeek) * 60_000 - now)}`;
  const today = record !== null && record.day === drawn.day;
  const thisWeek = record !== null && record.week === drawn.week;
  const playlist = (given: PlaylistOn, index: number): PlaylistEntry => {
    const band = bandOf(given, level) ?? given.bands[0] ?? null;
    const seas = given.key;
    const tier = seas === 'elite' ? 'Elite' : 'Abyss';
    const about =
      band && level !== null && level >= given.opens
        ? `${tier} · ${levelWords([band[0], band[1]])} · Foes at level ${band[2]}`
        : `${tier} · From level ${given.opens}`;
    const clears = thisWeek ? (record.playlistClears?.[index] ?? 0) : 0;
    const shut = gates?.playlists[index] ?? null;
    return {
      kind: seas,
      name: given.name,
      about,
      rules: seas === 'abyss' ? [ABYSS_DRAWN_RULE, revivesWords(drawn)] : [DRAWN_RULE],
      drops: dropsWords(seas),
      modifiers: shown(drawn, given.modifiers),
      rewards: [
        {
          words: DAILY,
          taken: record ? today && (record.playlistTaken?.[index] ?? false) : null,
          clears: null,
          resets: dayResets,
        },
        {
          words: weeklyWords(given),
          taken: record ? clears >= given.weekClears : null,
          clears: Array.from({ length: given.weekClears }, (_unused, place) => place < clears),
          resets: weekResets,
        },
      ],
      shut,
      lock: shut === null ? null : lockWords(shut, level),
      launch: { place: null, seas, playlist: band?.[2] ?? null, finds: shut === null ? `playlist-${seas}` : null },
    };
  };
  const week = (seas: 'elite' | 'abyss'): PlaylistEntry => {
    const given = seas === 'elite' ? drawn.weekElite : drawn.weekAbyss;
    const shut = (seas === 'elite' ? gates?.weekElite : gates?.weekAbyss) ?? null;
    const taken = record ? thisWeek && record[seas] : null;
    return {
      kind: seas === 'elite' ? 'week-elite' : 'week-abyss',
      name: seas === 'elite' ? 'Elite Dungeon of the week' : 'Abyss Dungeon of the week',
      about: `${placeName(given.place)} · ${seas === 'elite' ? 'Elite' : 'Abyss'} · Level ${given.level}`,
      rules: seas === 'abyss' ? [revivesWords(drawn), NEVER_MATCHED] : [],
      modifiers: shown(drawn, given.modifiers),
      drops: dropsWords(seas),
      rewards: [{ words: seas === 'elite' ? ELITE_PAYS : ABYSS_PAYS, taken, clears: null, resets: weekResets }],
      shut,
      lock: shut === null ? null : lockWords(shut, level),
      launch: {
        place: given.place,
        seas,
        playlist: null,
        // Found from the Playlist, the week's run is one started at sea (`--sea`), so its queue is the Playlist's own.
        finds: seas === 'elite' && shut === null ? `node-${given.place}--elite--sea` : null,
      },
    };
  };
  return {
    title: 'Playlist',
    port,
    entries: [...drawn.playlists.map(playlist), week('elite'), week('abyss')],
    note: PLAIN,
  };
}

/** The room a launch opens: its place's run at its seas, a playlist's naming its foes' level and the week's marked
 *  `--sea` (so the rooms send it back to the sea, never onto its island), then its instance. */
export function launchRoom(launch: PlaylistLaunch, place: string, instance: string): string {
  const listed = launch.playlist === null ? '--sea' : `--playlist-${launch.playlist}`;
  return `node-${place}--${launch.seas}${listed}--run-${instance}`;
}
