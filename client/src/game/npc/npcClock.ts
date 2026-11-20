// The time a keeper's screen counts down at its foot: to the next midnight by the world clock (UTC), when the daily
// keepers' wares change, as Destiny's vendors refresh at the daily reset; and to Shape's leaving.

const DAY_S = 86_400;

/** Whole seconds from `nowMs` to the next midnight, UTC; a whole day at midnight itself. */
export function secondsToMidnight(nowMs: number): number {
  return DAY_S - Math.floor((nowMs % (DAY_S * 1000)) / 1000);
}

/** Shape's seconds left: the room's `minutesLeft`, heard at `heardMs`, run down to `nowMs`, never below none. */
export function shapeSecondsLeft(minutesLeft: number, heardMs: number, nowMs: number): number {
  return Math.max(0, minutesLeft * 60 - Math.floor((nowMs - heardMs) / 1000));
}

const two = (value: number) => String(value).padStart(2, '0');

/** A countdown's words: hours, minutes and seconds, with whole days before them. */
export function clockWords(seconds: number): string {
  const days = Math.floor(seconds / DAY_S);
  const left = seconds % DAY_S;
  const clock = `${Math.floor(left / 3600)}:${two(Math.floor(left / 60) % 60)}:${two(left % 60)}`;
  return days > 0 ? `${days} ${days === 1 ? 'day' : 'days'} ${clock}` : clock;
}
