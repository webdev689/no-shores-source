// The time a keeper's screen counts down at its foot: to the next midnight by the world clock (UTC), when the daily
// keepers' wares change, as Destiny's vendors refresh at the daily reset; and to Shape's leaving.

const DAY_S = 86_400;

/** Monday 00:00 UTC comes three days after the epoch's Thursday; Shape goes on Sunday at 21:00 UTC
 *  (crates/gear/src/shape.rs). */
const EPOCH_PAST_MONDAY_S = 3 * DAY_S;
const WEEK_S = 7 * DAY_S;
const SHAPE_GOES_S = 6 * DAY_S + 21 * 3_600;

/** Whole seconds from `nowMs` to the next midnight, UTC: none at midnight itself, as the wares turn then. */
export function secondsToMidnight(nowMs: number): number {
  return (DAY_S - Math.floor((nowMs % (DAY_S * 1000)) / 1000)) % DAY_S;
}

/** Shape's seconds left by the world clock, as the rules count his minutes; none once he has gone. */
export function shapeSecondsLeft(nowMs: number): number {
  const into = (Math.floor(nowMs / 1000) + EPOCH_PAST_MONDAY_S) % WEEK_S;
  return Math.max(0, SHAPE_GOES_S - into);
}

const two = (value: number) => String(value).padStart(2, '0');

/** A countdown's words: hours, minutes and seconds, with whole days before them. */
export function clockWords(seconds: number): string {
  const days = Math.floor(seconds / DAY_S);
  const left = seconds % DAY_S;
  const clock = `${Math.floor(left / 3600)}:${two(Math.floor(left / 60) % 60)}:${two(left % 60)}`;
  return days > 0 ? `${days} ${days === 1 ? 'day' : 'days'} ${clock}` : clock;
}
