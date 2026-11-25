// What the desktop app's shell and the game say to each other, and the game's side of it. In the app, the page finds
// the shell's bridge (`noShoresDesktop`) and hands the game what it tells; in a browser there is none, and every
// ask here does nothing. The shell's own code (`desktop/`) reads these types too, so the two cannot drift apart.

/** The graphics APIs a player may choose. Auto is the platform's own order, falling to the next where one fails. */
export const GRAPHICS_APIS = ['auto', 'd3d12', 'd3d11', 'vulkan', 'metal'] as const;
export type GraphicsApi = (typeof GRAPHICS_APIS)[number];

export type DesktopPlatform = 'windows' | 'mac' | 'linux';

/** The graphics API as the app runs it. */
export interface DesktopGraphics {
  /** What the player chose, and what they may choose here (one choice, Auto, where there is nothing to choose). */
  readonly chosen: GraphicsApi;
  readonly choices: readonly GraphicsApi[];
  /** The API this launch asked for, and the backend the game's adapter says it draws with, once the game has said. */
  readonly launched: GraphicsApi;
  readonly running: string;
  /** The card the game draws on, as its adapter names it; empty until the game has said. */
  readonly adapter: string;
  /** Whether the choice failed on this card and the app runs another, until the card, its driver or the app's
   *  Chromium changes. */
  readonly held: boolean;
  /** The API the app draws with once started again, where that is another backend than this launch's (a choice made,
   *  or a failure kept or dropped, that takes a restart); null where a restart changes nothing. */
  readonly restart: GraphicsApi | null;
}

/** The names the player reads for each API. */
export const API_NAMES: Readonly<Record<GraphicsApi, string>> = {
  auto: 'Auto',
  d3d12: 'Direct3D 12',
  d3d11: 'Direct3D 11',
  vulkan: 'Vulkan',
  metal: 'Metal',
};

/** An update of the app itself (the game updates with the site, as in a browser). */
export type DesktopUpdate =
  | { readonly state: 'none' }
  | { readonly state: 'downloading'; readonly version: string; readonly percent: number }
  /** Downloaded: it installs when the app closes, or at once with a restart. */
  | { readonly state: 'ready'; readonly version: string }
  /** This copy cannot install it itself: the player downloads it. */
  | { readonly state: 'manual'; readonly version: string };

export interface DesktopInfo {
  /** The app's version as its installer was cut, `year.monthday.hourminute` of its commit; `dev` unpackaged. */
  readonly version: string;
  readonly platform: DesktopPlatform;
  readonly graphics: DesktopGraphics;
  readonly update: DesktopUpdate;
}

/** The game's graphics adapter as it found it, for the shell's watch over the graphics API it launched with. */
export interface GpuReport {
  readonly adapter: boolean;
  readonly device: boolean;
  /** The adapter's own words; the backend, type and driver only where the app asks Chromium to say them. */
  readonly backend: string;
  readonly type: string;
  readonly vendor: string;
  readonly architecture: string;
  readonly description: string;
  readonly driver: string;
  readonly fallback: boolean;
  /** Why the device did not start, or empty. */
  readonly error: string;
}

/** What the game asks of the shell. */
export type DesktopAsk =
  /** The game is asking WebGPU for its adapter: a launch whose graphics hang says nothing after this. */
  | { readonly ask: 'gpuAsked' }
  | { readonly ask: 'gpu'; readonly report: GpuReport }
  /** WebGPU lost the game's device, as a driver that cannot draw with the launch's API does. */
  | { readonly ask: 'gpuLost'; readonly reason: string }
  /** The game has started and drawn: a blank window would show by now. */
  | { readonly ask: 'drawn' }
  | { readonly ask: 'graphics'; readonly api: GraphicsApi }
  /** Starts the app again, to bring a graphics API or a downloaded update into force. */
  | { readonly ask: 'restart' }
  /** Opens the download of an update this copy cannot install itself. */
  | { readonly ask: 'download' }
  /** Takes the pointer's lock back where the page may not ask without a press, as after Escape. */
  | { readonly ask: 'relock' };

/** The shell's bridge, as the page finds it on `window`. */
export interface DesktopBridge {
  readonly info: () => DesktopInfo;
  readonly onInfo: (listener: (info: DesktopInfo) => void) => void;
  readonly ask: (ask: DesktopAsk) => void;
}

/** The bridge's name on the page's `window`. */
export const BRIDGE_NAME = 'noShoresDesktop';
/** The page's own hook the shell runs, as a press, to take the pointer's lock back: it takes it only while the game
 *  still wants it, so a lock asked for before a menu opened is never taken under the menu. */
export const RELOCK_HOOK = '__noShoresRelock';

let info: DesktopInfo | null = null;
let send: (ask: DesktopAsk) => void = () => undefined;

/** The shell as the game starts: what it told, and where the game's asks go. */
export function useDesktop(told: DesktopInfo | null, asks: (ask: DesktopAsk) => void): void {
  [info, send] = [told, asks];
}

/** What the shell tells as it changes. */
export function desktopChanged(told: DesktopInfo): void {
  info = told;
}

/** The shell as it last told, or null in a browser. */
export const desktop = (): DesktopInfo | null => info;

/** Asks the shell, where there is one. */
export function askDesktop(ask: DesktopAsk): void {
  if (info) send(ask);
}
