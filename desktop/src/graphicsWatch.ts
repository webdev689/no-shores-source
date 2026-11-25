// The watch over one launch's graphics. The game says what adapter WebGPU gave it; a launch fails when it gave none,
// gave one that draws on the CPU, drew with another API than the one launched, could not start its device, said
// nothing within a minute of asking WebGPU for it, or lost the GPU's process in the launch's first minute. A failure is
// kept by card, driver and Chromium, the player is told, and the app starts again on the next backend; with none left
// it says what to do. A backend that may draw a blank window, which no check sees, has its player asked once the game
// has drawn whether they see it, and the answer is kept for that card, driver and Chromium.
import type { GpuReport } from '../../client/src/desktop.ts';
import type { GraphicsFailure, GraphicsSeen } from './config.ts';
import type { Box } from './crashes.ts';
import {
  API_OF,
  BACKEND_ARGUMENT,
  type Backend,
  type Desk,
  type Launch,
  MAY_DRAW_BLANK,
  nameOf,
  orderOf,
} from './graphics.ts';

/** How long the game has to say what it draws with once it has asked WebGPU (a page slow to load is no failure of the
 *  graphics), the launch's first stretch in which a lost GPU process counts as its backend failing, and how long the
 *  player has to answer whether they see the game. */
export const REPORT_WITHIN_MS = 60_000;
export const GPU_GONE_WITHIN_MS = 60_000;
export const ASK_WITHIN_MS = 20_000;

/** Why a report fails `backend` on `desk`, or null where the game draws as it should. The desk's own default takes
 *  whatever card and API Chromium gives it; a backend asked for by its switches must be the one drawn with. */
export function failureIn(report: GpuReport, backend: Backend, desk: Desk): string | null {
  if (!report.adapter) return 'WebGPU gave no adapter';
  const software = report.fallback || report.type.toLowerCase() === 'cpu';
  if (software && backend !== 'swiftshader')
    return `WebGPU gave a software adapter (${report.description || report.architecture || report.vendor})`;
  const drew = report.backend.toLowerCase();
  const strict = backend !== orderOf(desk)[0] && backend !== 'swiftshader';
  if (strict && drew !== '' && drew !== API_OF[backend]) return `WebGPU drew with ${drew}, not ${API_OF[backend]}`;
  if (!report.device) return `the WebGPU device did not start: ${report.error || 'no reason given'}`;
  return null;
}

/** How the app starts again: with another API, or the same reached another way. */
const againWith = (backend: Backend, next: Backend) =>
  nameOf(next) === nameOf(backend) ? `reaching ${nameOf(next)} another way` : `with ${nameOf(next)}`;

/** The notice before the app starts again on `next`. */
export function failedBox(backend: Backend, next: Backend): Box {
  return {
    type: 'warning',
    message: `${nameOf(backend)} could not start on this graphics card`,
    detail: `No Shores starts again ${againWith(backend, next)}. It tries this again after a graphics driver update, or an update of the app.`,
    buttons: ['Restart'],
    defaultId: 0,
    cancelId: 0,
  };
}

/** Whether the player sees the game drawn by `backend`; the safe answer, the default, is to go back to `next`, or,
 *  with no backend left, to be told what to do. */
export function seenBox(backend: Backend, next: Backend | null): Box {
  const detail =
    next === null
      ? 'If the window is blank, choose It is blank, and No Shores says what to do.'
      : `If the window is blank, choose Go back, and No Shores starts again ${againWith(backend, next)}. With no answer in ${ASK_WITHIN_MS / 1000} seconds, it does so once.`;
  return {
    type: 'question',
    message: 'Can you see the game?',
    detail,
    buttons: ['I can see it', next === null ? 'It is blank' : 'Go back'],
    defaultId: 1,
    cancelId: 1,
  };
}

const ADVICE: Readonly<Partial<Record<NodeJS.Platform, string>>> = {
  win32: 'Update your graphics driver from your card maker (NVIDIA, AMD or Intel), then open No Shores again.',
  linux:
    "No Shores draws with Vulkan. Install your card's Vulkan driver (Mesa's for AMD and Intel, or NVIDIA's own), then open No Shores again.",
  darwin: 'Update macOS, then open No Shores again.',
};

/** No backend is left to try: what the player can do. */
export function adviceBox(platform: NodeJS.Platform, why: string): Box {
  return {
    type: 'error',
    message: 'No Shores could not start your graphics card',
    detail: `${ADVICE[platform] ?? 'Update your graphics driver, then open No Shores again.'}\n\n(${why})`,
    buttons: ['OK'],
    defaultId: 0,
    cancelId: 0,
  };
}

/** What the watch does through the app. */
export interface WatchEffects {
  readonly failures: () => readonly GraphicsFailure[];
  /** Keeps the failures; answers whether they reached the disk. */
  readonly keepFailures: (failures: readonly GraphicsFailure[]) => boolean;
  readonly seen: () => readonly GraphicsSeen[];
  readonly keepSeen: (seen: readonly GraphicsSeen[]) => void;
  /** The card and its driver (`gpuKeyOf`), or null where they cannot be learned. */
  readonly gpuKey: () => Promise<string | null>;
  readonly tell: (box: Box) => Promise<unknown>;
  /** Asks over the game's window; answers the button, or null when `stop` closed the box first. */
  readonly ask: (box: Box, stop: AbortSignal) => Promise<number | null>;
  /** Starts the app again with `args` added, and leaves. */
  readonly restart: (args: readonly string[]) => void;
  readonly later: (work: () => void, milliseconds: number) => () => void;
  readonly now: () => number;
  readonly log: (line: string) => void;
}

/** The watch's doors, which the shell's wiring calls as the launch goes. */
export interface GraphicsWatch {
  /** The game has asked WebGPU for its adapter: the minute it has to say what it got starts, once. */
  readonly gpuAsked: () => void;
  readonly report: (report: GpuReport) => Promise<void>;
  /** The game has drawn: the player may now be asked whether they see it. */
  readonly drawn: () => Promise<void>;
  /** The GPU went from under the game (its process ended, or WebGPU lost the device), `reason` saying how: early in
   *  the launch, that fails it. */
  readonly gpuGone: (reason: string) => Promise<void>;
  /** The game's own words for what it draws with, once it has said. */
  readonly reported: () => GpuReport | null;
}

export function watchGraphics(launch: Launch, desk: Desk, chromium: string, effects: WatchEffects): GraphicsWatch {
  const startedAt = effects.now();
  const next = launch.next[0] ?? null;
  /** A failure or sighting is kept under the backend, but never SwiftShader's or a launch named for itself. */
  const kept = launch.backend !== 'swiftshader' && !launch.named;
  let failing = false;
  let heard: GpuReport | null = null;
  let stopClock: (() => void) | null = null;
  let asking: AbortController | null = null;
  /** Whether the player has been asked this launch: a page loaded again (a restart, a sign-in's return) is not asked
   *  again. */
  let asked = false;

  async function fail(reason: string, { told = true, keep = true } = {}): Promise<void> {
    if (failing) return;
    failing = true;
    asking?.abort();
    stopClock?.();
    const gpu = await effects.gpuKey();
    effects.log(`graphics: ${launch.backend} failed on ${gpu ?? 'an unknown card'}: ${reason}`);
    const when = new Date(effects.now()).toISOString();
    const others = effects.failures().filter((one) => one.backend !== launch.backend);
    const record: GraphicsFailure = { backend: launch.backend, gpu, chromium, reason, at: when };
    const written = keep && kept && effects.keepFailures([...others, record]);
    if (next === null) {
      await effects.tell(adviceBox(desk.platform, reason)).catch(() => undefined);
      return;
    }
    if (told) await effects.tell(failedBox(launch.backend, next)).catch(() => undefined);
    effects.restart(written ? [] : [`${BACKEND_ARGUMENT}${launch.next.join(',')}`]);
  }

  async function askPlayer(): Promise<void> {
    if (asked || !kept || !MAY_DRAW_BLANK.has(launch.backend)) return;
    asked = true;
    const gpu = await effects.gpuKey();
    const seen = effects.seen();
    const known = (one: GraphicsSeen) => one.backend === launch.backend && one.gpu === gpu && one.chromium === chromium;
    if (failing || (gpu !== null && seen.some(known))) return;
    asking = new AbortController();
    const stop = asking;
    const stopLater = effects.later(() => stop.abort(), ASK_WITHIN_MS);
    const given = await effects.ask(seenBox(launch.backend, next), stop.signal).catch(() => null);
    stopLater();
    // A box its signal closed answers as if cancelled: that is no answer from the player.
    const answer = stop.signal.aborted ? null : given;
    if (failing) return;
    if (answer === 0) {
      if (gpu !== null)
        effects.keepSeen([...seen.filter((one) => !known(one)), { backend: launch.backend, gpu, chromium }]);
      effects.log(`graphics: the player sees the game drawn by ${launch.backend}`);
    } else if (answer === 1) await fail('the player saw no game', { told: false });
    // Unanswered, a launch with a backend left tries it once; with none, nothing is said over what may be a game.
    else if (next !== null)
      await fail(`the player did not answer within ${ASK_WITHIN_MS / 1000} s`, { told: false, keep: false });
    else effects.log(`graphics: the player did not say whether they see the game drawn by ${launch.backend}`);
  }

  return {
    gpuAsked() {
      if (stopClock || heard || failing) return;
      stopClock = effects.later(() => {
        if (!heard) void fail(`the game said nothing of its graphics within ${REPORT_WITHIN_MS / 1000} s`);
      }, REPORT_WITHIN_MS);
    },
    async report(report) {
      if (heard || failing) return;
      heard = report;
      stopClock?.();
      const why = failureIn(report, launch.backend, desk);
      if (why) await fail(why);
      else
        effects.log(
          `graphics: ${launch.backend} up, drawing with ${report.backend || 'its default'} on ${report.description || report.vendor}`,
        );
    },
    async drawn() {
      if (heard && !failing) await askPlayer();
    },
    async gpuGone(reason) {
      if (effects.now() - startedAt <= GPU_GONE_WITHIN_MS) await fail(reason);
    },
    reported: () => heard,
  };
}
