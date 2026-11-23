// The time a keeper's screen counts down at its foot: to the daily reset, when the daily keepers' wares change, as
// Destiny's vendors refresh then; and to Shape's leaving. The room module's rules count both in whole minutes
// (`activitiesAt`), so the page only takes off the seconds gone in the minute.
import { roomNow } from '../../sky/worldClock.ts';
import { activitiesAt } from '../activities.ts';

const DAY_S = 86_400;

/** The room module the screens count by, once the game has compiled it. */
let rules: WebAssembly.Module | null = null;

/** The countdowns read the game's room module once it is compiled. */
export function countBy(module: Promise<WebAssembly.Module>): void {
  void module.then((read) => (rules = read)).catch(() => undefined);
}

let read: { minute: number; module: WebAssembly.Module; drawn: ReturnType<typeof activitiesAt> } | null = null;

/** Whole seconds from `nowMs` (the rooms' now) to the next stock and to Shape's leaving (none once he has gone), by
 *  `module`'s rules; null before the game's is read. */
export function countdownsAt(
  nowMs = roomNow(),
  module: WebAssembly.Module | null = rules,
): { readonly stock: number; readonly shape: number } | null {
  if (!module) return null;
  const minute = Math.floor(nowMs / 60_000);
  // Read once a minute: a keeper's screen asks every frame.
  if (read?.minute !== minute || read.module !== module) read = { minute, module, drawn: activitiesAt(module, minute) };
  const { drawn } = read;
  const gone = Math.floor((nowMs - minute * 60_000) / 1000);
  return { stock: drawn.untilDay * 60 - gone, shape: Math.max(0, drawn.untilShapeGoes * 60 - gone) };
}

const two = (value: number) => String(value).padStart(2, '0');

/** A countdown's words: hours, minutes and seconds, with whole days before them. */
export function clockWords(seconds: number): string {
  const days = Math.floor(seconds / DAY_S);
  const left = seconds % DAY_S;
  const clock = `${Math.floor(left / 3600)}:${two(Math.floor(left / 60) % 60)}:${two(left % 60)}`;
  return days > 0 ? `${days} ${days === 1 ? 'day' : 'days'} ${clock}` : clock;
}
