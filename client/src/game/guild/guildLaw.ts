import numbers from '../../../../content/guilds/guilds.json' with { type: 'json' };

/**
 * A guild's levels and weeks, which the accounts keep and the page shows: its level from the XP its members have
 * earned it, the week by the game's one clock (a week from Tuesday 09:00 UTC, as the rules' `gear::clock` counts it),
 * and the four guild bounties drawn for that week, the same for every guild. The rules draw the same four with
 * `gear::guild::bounties_of`, and a test on each side holds both to the same weeks.
 */

/** A guild bounty as `content/guilds/guilds.json` holds it. */
export interface GuildBounty {
  readonly id: string;
  readonly name: string;
  readonly words: string;
  readonly target: number;
  readonly together?: boolean;
}

/** The XP a guild needs to stand at each level, the first level's 0. */
export const LEVELS: readonly number[] = numbers.levels;
/** The highest level. */
export const TOP_LEVEL = LEVELS.length;
/** What a member gives: so many tenths of the XP they earn, at most so much a week. */
export const CONTRIBUTION = numbers.contribution;
/** The XP a guild gains for each guild bounty it completes. */
export const BOUNTY_XP: number = numbers.bountyXp;
/** Every guild bounty, by its place, as the week's draw names them. */
export const GUILD_BOUNTIES: readonly GuildBounty[] = numbers.bounties;

/** A guild's level by its XP: 1 to the highest. */
export function levelOf(earned: number): number {
  return LEVELS.filter((needed) => needed <= earned).length || 1;
}

/** The XP that brings a guild of this XP to its next level, or null at the highest. */
export function nextLevelXp(earned: number): number | null {
  return LEVELS.find((needed) => needed > earned) ?? null;
}

const DAY_MINUTES = 1_440;
const WEEK_MINUTES = 7 * DAY_MINUTES;
/** Tuesday 6 January 1970 09:00 UTC, the first week's turn, in minutes since Unix time began. */
const FIRST_WEEK_MINUTE = 5 * DAY_MINUTES + 9 * 60;

/** The week it is at this time in milliseconds: how many Tuesday resets have passed since Unix time began. */
export function weekOf(milliseconds: number): number {
  const minutes = Math.floor(milliseconds / 60_000);
  return Math.floor((minutes + WEEK_MINUTES - FIRST_WEEK_MINUTE) / WEEK_MINUTES);
}

/** When a week begins, in milliseconds. */
export function weekStart(week: number): number {
  return (week * WEEK_MINUTES + FIRST_WEEK_MINUTE - WEEK_MINUTES) * 60_000;
}

/** One step of a 32-bit xorshift, the same in every language. */
function stepped(seed: number): number {
  let next = seed >>> 0;
  next = (next ^ (next << 13)) >>> 0;
  next = (next ^ (next >>> 17)) >>> 0;
  return (next ^ (next << 5)) >>> 0;
}

/** The places of the guild bounties drawn for a week: a shuffle of the whole list seeded by the week, its first few. */
export function bountiesOf(week: number): readonly number[] {
  const places = GUILD_BOUNTIES.map((unused, place) => place);
  let seed = (Math.imul(week, 2654435761) + 12345) >>> 0 || 1;
  for (let last = places.length - 1; last > 0; last--) {
    seed = stepped(seed);
    const other = seed % (last + 1);
    [places[last], places[other]] = [places[other] as number, places[last] as number];
  }
  return places.slice(0, numbers.bountiesAWeek);
}
