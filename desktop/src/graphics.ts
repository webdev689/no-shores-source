// The graphics API the app launches with. The game draws with WebGPU, which Chromium runs on the machine's own API, as
// its switches at launch ask: Direct3D 12 on Windows, or Direct3D 11 where 12 fails (Chromium offers WebGPU no Vulkan
// there); Metal on a Mac; Vulkan on Linux, its only API there, reached in one of three ways. Each launch takes the
// first backend in the player's order that has not failed on this card, its driver and this Chromium; the watch over
// the launch (`graphicsWatch.ts`) records a failure and starts the next. Auto is the platform's own order.
import type { GraphicsApi } from '../../client/src/desktop.ts';
import type { GraphicsFailure } from './config.ts';

/** What the shell launches Chromium on. On Linux, Vulkan three ways: Chromium's own way, through OpenGL, which it
 *  allows on Wayland for Intel's newer cards and NVIDIA's; the same past the blocklist that keeps it from other cards;
 *  and with Chromium's own drawing on Vulkan too, which X11 needs. SwiftShader draws on the CPU, only ever for a run
 *  that tests the app. */
export const BACKENDS = ['d3d12', 'd3d11', 'metal', 'vulkan', 'vulkan-unlisted', 'vulkan-skia', 'swiftshader'] as const;
export type Backend = (typeof BACKENDS)[number];

/** A backend's Chromium switches as name and value, and the features it turns on, gathered into one switch at
 *  launch (`switches.ts`): Chromium reads only the last of a switch given twice. */
export interface BackendSwitches {
  readonly switches: readonly (readonly [string, string])[];
  readonly features: readonly string[];
}

/** Each backend's switches. Chromium blocks every Direct3D 11 adapter from WebGPU by its own list, lifted here alone;
 *  entry 186 of its GPU list is the one that keeps Vulkan through OpenGL from all but Intel's and NVIDIA's cards. */
export const BACKEND_SWITCHES: Readonly<Record<Backend, BackendSwitches>> = {
  'd3d12': { switches: [], features: [] },
  'd3d11': {
    switches: [
      ['use-webgpu-adapter', 'd3d11'],
      ['disable-dawn-features', 'adapter_blocklist'],
    ],
    features: [],
  },
  'metal': { switches: [], features: [] },
  'vulkan': { switches: [], features: [] },
  'vulkan-unlisted': { switches: [['ignore-gpu-blocklist', '186']], features: [] },
  'vulkan-skia': { switches: [], features: ['Vulkan'] },
  'swiftshader': {
    switches: [
      ['use-angle', 'swiftshader'],
      ['enable-unsafe-swiftshader', ''],
      ['enable-unsafe-webgpu', ''],
    ],
    features: [],
  },
};

/** The API each backend is, as the player chooses and reads it, and as the game's adapter names it (Chromium's
 *  developer features, which the app turns on, in any case). */
export const API_OF: Readonly<Record<Backend, Exclude<GraphicsApi, 'auto'>>> = {
  'd3d12': 'd3d12',
  'd3d11': 'd3d11',
  'metal': 'metal',
  'vulkan': 'vulkan',
  'vulkan-unlisted': 'vulkan',
  'vulkan-skia': 'vulkan',
  'swiftshader': 'vulkan',
};

/** The backends that may draw a blank window though every check passes, whose player is asked once whether they see
 *  the game. */
export const MAY_DRAW_BLANK: ReadonlySet<Backend> = new Set(['d3d11', 'vulkan-unlisted', 'vulkan-skia']);

/** The names the player reads. */
export const API_NAMES: Readonly<Record<GraphicsApi, string>> = {
  auto: 'Auto',
  d3d12: 'Direct3D 12',
  d3d11: 'Direct3D 11',
  vulkan: 'Vulkan',
  metal: 'Metal',
};
export const nameOf = (backend: Backend): string => API_NAMES[API_OF[backend]];

/** Where the app runs: its platform, and on Linux whether the desktop is Wayland's, where Chromium opens its windows
 *  by itself and its own way to Vulkan works. */
export interface Desk {
  readonly platform: NodeJS.Platform;
  readonly wayland: boolean;
}

/** Whether the desktop the app opens on is Wayland's, from the variables a desktop session sets. */
export const isWayland = (variables: Readonly<Record<string, string | undefined>>): boolean =>
  variables['XDG_SESSION_TYPE'] === 'wayland' || Boolean(variables['WAYLAND_DISPLAY']);

/** The desk's backends, in the order Auto tries them: the first is its default. */
export function orderOf(desk: Desk): readonly Backend[] {
  if (desk.platform === 'win32') return ['d3d12', 'd3d11'];
  if (desk.platform === 'darwin') return ['metal'];
  return desk.wayland ? ['vulkan', 'vulkan-unlisted', 'vulkan-skia'] : ['vulkan-skia'];
}

/** What a player may choose: Auto, and each API where there is more than one. */
export function choicesOf(desk: Desk): readonly GraphicsApi[] {
  const apis = [...new Set(orderOf(desk).map((backend) => API_OF[backend]))];
  return apis.length > 1 ? ['auto', ...apis] : ['auto'];
}

/** The backends an API names on the desk: choosing it again tries them again. */
export const backendsOf = (api: GraphicsApi, desk: Desk): readonly Backend[] =>
  api === 'auto' ? [] : orderOf(desk).filter((backend) => API_OF[backend] === api);

/** The argument and variable that name one launch's backend over the player's order: the watch's restart when a
 *  failure could not be kept, and a run testing the app (`NOSHORES_GRAPHICS=swiftshader`). */
export const BACKEND_ARGUMENT = '--noshores-graphics=';
export const BACKEND_VARIABLE = 'NOSHORES_GRAPHICS';

const isBackend = (value: string | undefined): value is Backend => BACKENDS.includes(value as Backend);

/** A launch's graphics: the backend, the ones still to try after it, the player's choice, and the failure that held
 *  that choice off, if one did. */
export interface Launch {
  readonly backend: Backend;
  readonly next: readonly Backend[];
  readonly chosen: GraphicsApi;
  readonly held: GraphicsFailure | null;
  /** Named for this launch alone, by the argument or the variable. */
  readonly named: boolean;
}

/** Whether `backend` failed on record under this Chromium (a record's card is checked once the launch knows its own,
 *  `reviewFailures`). */
const failedOn = (backend: Backend, failures: readonly GraphicsFailure[], chromium: string): GraphicsFailure | null =>
  failures.find((failure) => failure.backend === backend && failure.chromium === chromium) ?? null;

/** This launch's graphics, from the player's choice, the failures on record, and the argument and variable. */
export function launchFor(input: {
  readonly desk: Desk;
  readonly chosen: GraphicsApi;
  readonly failures: readonly GraphicsFailure[];
  readonly chromium: string;
  readonly argv: readonly string[];
  readonly variable: string | undefined;
}): Launch {
  const order = orderOf(input.desk);
  const named = input.argv.find((arg) => arg.startsWith(BACKEND_ARGUMENT))?.slice(BACKEND_ARGUMENT.length);
  const asked = isBackend(named) ? named : isBackend(input.variable) ? input.variable : null;
  if (asked) return { backend: asked, next: [], chosen: input.chosen, held: null, named: true };
  const own = backendsOf(input.chosen, input.desk);
  const preferred = [...own, ...order.filter((backend) => !own.includes(backend))];
  const left = preferred.filter((backend) => !failedOn(backend, input.failures, input.chromium));
  const held = own.length > 0 && own.every((backend) => failedOn(backend, input.failures, input.chromium));
  // With every one failed, the default is tried as it comes: the game then says why it cannot draw.
  const [backend = order[0] ?? 'vulkan-skia', ...next] = left;
  const holder = held ? failedOn(own[0] ?? backend, input.failures, input.chromium) : null;
  return { backend, next, chosen: input.chosen, held: holder, named: false };
}

/** The failures to keep once a launch knows its card: one made on another card, or under another Chromium, is
 *  dropped, so the next launch tries its backend again; one that never learned its card learns this one. */
export function reviewFailures(
  failures: readonly GraphicsFailure[],
  gpu: string | null,
  chromium: string,
): readonly GraphicsFailure[] {
  return failures
    .filter((failure) => failure.chromium === chromium && (gpu === null || failure.gpu === null || failure.gpu === gpu))
    .map((failure) => (failure.gpu === null && gpu !== null ? { ...failure, gpu } : failure));
}

/** A device as Chromium lists it (`app.getGPUInfo`). */
export interface ListedDevice {
  readonly vendorId?: number;
  readonly deviceId?: number;
  readonly driverVersion?: string;
  readonly active?: boolean;
}

/** Vendors that name no card: Microsoft's software renderer, ANGLE's own and none at all. */
const SOFTWARE_VENDORS = new Set([0x1414, 0xffff, 0x0000]);

/** A card as `vendor:device@driver`: the active one, or the first that is a card; null where none is (a software
 *  renderer lists only its own). */
export function gpuKeyOf(devices: readonly ListedDevice[]): string | null {
  const cards = devices.filter((device) => !SOFTWARE_VENDORS.has(device.vendorId ?? 0));
  const card = cards.find((device) => device.active) ?? cards[0];
  if (!card) return null;
  const hex = (value: number | undefined) => (value ?? 0).toString(16).padStart(4, '0');
  return `${hex(card.vendorId)}:${hex(card.deviceId)}@${card.driverVersion ?? '?'}`;
}
