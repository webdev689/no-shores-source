// The game's page or the GPU's process stopped, or the page stopped answering: what the shell says, what each answer
// does, and the line it keeps in `app.log`. A browser's tab says it crashed; a window that only stood black would say
// less. A page that stops again and again in a short while says so, so a loop of crashes is told, not hidden behind
// restarts. Each question's safe answer is its cancel, the one Escape and closing the box choose.

/** A box the shell shows, as Electron's `dialog.showMessageBox` takes it. */
export interface Box {
  readonly type: 'none' | 'info' | 'error' | 'question' | 'warning';
  readonly message: string;
  readonly detail: string;
  readonly buttons: readonly string[];
  readonly defaultId: number;
  readonly cancelId: number;
}

/** Electron's reasons a page's process went, in the player's words. */
const GONE_WHY: Readonly<Record<string, string>> = {
  'oom': 'It ran out of memory.',
  'crashed': 'It crashed.',
  'killed': 'It was stopped by the system.',
  'launch-failed': 'It could not start.',
  'integrity-failure': 'Its code failed a check.',
  'abnormal-exit': 'It closed unexpectedly.',
  'memory-eviction': 'It was closed to free memory.',
};

/** How many stops inside `LOOP_SPAN_MS` make a loop worth saying. */
export const LOOP_STOPS = 3;
export const LOOP_SPAN_MS = 120_000;

/** The page stopped: Restart, or Quit. */
export function goneBox(reason: string, stops: number): Box {
  const loop =
    stops >= LOOP_STOPS
      ? `\n\nIt has stopped ${stops} times in two minutes. Closing other programs, or a lower Resolution in Settings, may help.`
      : '';
  return {
    type: 'error',
    message: 'The game stopped',
    detail: `${GONE_WHY[reason] ?? 'It closed unexpectedly.'} Restart it to play on.${loop}`,
    buttons: ['Restart', 'Quit'],
    defaultId: 0,
    cancelId: 1,
  };
}
/** Whether an answer to `goneBox` restarts the page. */
export const restarts = (answer: number): boolean => answer === 0;

/** The page stopped answering: Wait, the default, as a long load must not be thrown away, or Restart. */
export const HANG_BOX: Box = {
  type: 'warning',
  message: 'The game is not responding',
  detail: 'Wait for it, or restart it.',
  buttons: ['Wait', 'Restart'],
  defaultId: 0,
  cancelId: 0,
};
/** Whether an answer to `HANG_BOX` restarts the page. */
export const restartsHung = (answer: number): boolean => answer === 1;

/** The game's address did not answer: Try again, or Quit. */
export function unreachableBox(host: string, why: string): Box {
  return {
    type: 'warning',
    message: 'No Shores cannot reach the game',
    detail: `${host} did not answer (${why}). Check your connection, then try again.`,
    buttons: ['Try again', 'Quit'],
    defaultId: 0,
    cancelId: 1,
  };
}
/** Whether an answer to `unreachableBox` tries again. */
export const triesAgain = (answer: number): boolean => answer === 0;

/** The stops of the last `LOOP_SPAN_MS`, counted as they come: `stop(now)` answers how many, this one with them. */
export function stopCount(): { stop: (now: number) => number } {
  const stops: number[] = [];
  return {
    stop(now) {
      stops.push(now);
      while (stops.length > 0 && now - (stops[0] ?? now) > LOOP_SPAN_MS) stops.shift();
      return stops.length;
    },
  };
}

/** The most `app.log` keeps: past it, its oldest whole lines go. */
export const LOG_MOST = 64 * 1024;

/** The log's words for a process gone: which, why, its exit code, and what the game drew on. */
export function goneLine(
  what: string,
  details: { readonly reason?: string; readonly exitCode?: number },
  drawing = '',
): string {
  const card = drawing === '' ? '' : ` on ${drawing.replace(/\s+/g, ' ').slice(0, 160)}`;
  return `${what} ${details.reason ?? 'unknown'} exitCode=${details.exitCode ?? '?'}${card}`;
}

/** `words` as the log keeps them, stamped with `when`, on one line: a page's words may hold line breaks that would
 *  forge a line of their own. */
export const logLine = (words: string, when: number): string =>
  `${new Date(when).toISOString()} ${words.replace(/[\u0000-\u001f\u007f]/g, ' ')}\n`;

/** `log` with `line` after it, its oldest whole lines dropped past `LOG_MOST`. */
export function logWith(log: string, line: string): string {
  const whole = `${log}${line}`;
  if (whole.length <= LOG_MOST) return whole;
  const cut = whole.slice(whole.length - LOG_MOST);
  return cut.slice(cut.indexOf('\n') + 1);
}
