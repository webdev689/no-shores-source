// The shell's half of the bridge the game's page finds as `noShoresDesktop` (`preload.cts`): the channels it speaks
// on, what the page may ask, checked before anything is done with it, and what the game is told. Only the game's own
// window, on the game's own pages, is heard (`main.ts`); an ask that is not one of the few named here is dropped.
import {
  type DesktopAsk,
  type DesktopInfo,
  type DesktopPlatform,
  type DesktopUpdate,
  GRAPHICS_APIS,
  type GpuReport,
  type GraphicsApi,
} from '../../client/src/desktop.ts';
import { API_OF, type Desk, type Launch, choicesOf } from './graphics.ts';

/** The channels the preload and the shell speak on, and the argument that tells the preload the game's origin. The
 *  preload, which a sandbox keeps from loading this file, names the same (held equal by its test). */
export const CHANNELS = { info: 'noshores:info', changed: 'noshores:info-changed', ask: 'noshores:ask' } as const;
export const ORIGIN_ARGUMENT = '--noshores-game-origin=';

/** The longest text of a report kept. */
const TEXT_MOST = 200;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const textOf = (value: unknown): string => (typeof value === 'string' ? value.slice(0, TEXT_MOST) : '');

function reportOf(value: unknown): GpuReport | null {
  if (!isRecord(value)) return null;
  return {
    adapter: value['adapter'] === true,
    device: value['device'] === true,
    backend: textOf(value['backend']),
    type: textOf(value['type']),
    vendor: textOf(value['vendor']),
    architecture: textOf(value['architecture']),
    description: textOf(value['description']),
    driver: textOf(value['driver']),
    fallback: value['fallback'] === true,
    error: textOf(value['error']),
  };
}

/** An ask as the page sent it, checked; null where it is not one the shell answers. */
export function askOf(value: unknown): DesktopAsk | null {
  if (!isRecord(value)) return null;
  switch (value['ask']) {
    case 'gpu': {
      const report = reportOf(value['report']);
      return report ? { ask: 'gpu', report } : null;
    }
    case 'gpuLost':
      return { ask: 'gpuLost', reason: textOf(value['reason']) };
    case 'graphics':
      return GRAPHICS_APIS.includes(value['api'] as GraphicsApi)
        ? { ask: 'graphics', api: value['api'] as GraphicsApi }
        : null;
    case 'gpuAsked':
    case 'drawn':
    case 'restart':
    case 'download':
    case 'relock':
      return { ask: value['ask'] };
    default:
      return null;
  }
}

const PLATFORMS: Readonly<Partial<Record<NodeJS.Platform, DesktopPlatform>>> = {
  win32: 'windows',
  darwin: 'mac',
  linux: 'linux',
};

/** What the game is told: the app's version, the graphics as chosen, launched and running, and the update. `next`
 *  is the backend the next launch would take, which differs from this one's when the choice needs a restart. */
export function infoOf(state: {
  readonly version: string;
  readonly desk: Desk;
  readonly chosen: GraphicsApi;
  readonly launch: Launch;
  readonly next: Launch;
  readonly report: GpuReport | null;
  readonly update: DesktopUpdate;
}): DesktopInfo {
  const { report, launch } = state;
  const adapter = report ? report.description || [report.vendor, report.architecture].filter(Boolean).join(' ') : '';
  return {
    version: state.version,
    platform: PLATFORMS[state.desk.platform] ?? 'linux',
    graphics: {
      chosen: state.chosen,
      choices: choicesOf(state.desk),
      launched: API_OF[launch.backend],
      running: report?.backend ?? '',
      adapter,
      held: state.next.held !== null,
      restart: state.next.backend === launch.backend ? null : API_OF[state.next.backend],
    },
    update: state.update,
  };
}
