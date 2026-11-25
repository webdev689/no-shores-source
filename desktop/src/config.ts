// What the shell keeps between launches, in `config.json` beside the browser's own data: the graphics API the player
// chose and what each backend did on this machine, the window's place, and whether updates are looked for. It is read
// before the app is ready, as Chromium takes its switches at launch or never, so it is plain files, never the page's
// storage. Every field is read on its own: one that does not read is its default, and the rest are kept.
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GRAPHICS_APIS, type GraphicsApi } from '../../client/src/desktop.ts';
import { BACKENDS, type Backend } from './graphics.ts';

/** A backend that failed on a card, its driver and the Chromium that drove it: it is not tried again until one of
 *  those three changes. */
export interface GraphicsFailure {
  readonly backend: Backend;
  /** The card and its driver, as `vendor:device@driver`, or null where the launch never learned them. */
  readonly gpu: string | null;
  readonly chromium: string;
  readonly reason: string;
  readonly at: string;
}

/** A backend the player saw draw the game, on that card, driver and Chromium: not asked about again there. */
export interface GraphicsSeen {
  readonly backend: Backend;
  readonly gpu: string;
  readonly chromium: string;
}

/** The window as it was left. */
export interface WindowPlace {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly maximized: boolean;
  readonly fullScreen: boolean;
}

export interface Kept {
  readonly graphics: GraphicsApi;
  readonly failures: readonly GraphicsFailure[];
  readonly seen: readonly GraphicsSeen[];
  readonly window: WindowPlace | null;
  readonly updateChecks: boolean;
}

export const DEFAULT_KEPT: Kept = { graphics: 'auto', failures: [], seen: [], window: null, updateChecks: true };

/** The file's name in the app's data folder. */
export const CONFIG_NAME = 'config.json';

/** The most failures and sightings kept: older ones go first, so a machine that changes cards often never grows it. */
const KEPT_MOST = 16;

const isApi = (value: unknown): value is GraphicsApi => GRAPHICS_APIS.includes(value as GraphicsApi);
const isBackend = (value: unknown): value is Backend => BACKENDS.includes(value as Backend);
const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length < 300;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isWhole = (value: unknown): value is number => Number.isSafeInteger(value);

function failureOf(value: unknown): GraphicsFailure | null {
  if (!isRecord(value) || !isBackend(value['backend']) || !isText(value['chromium'])) return null;
  const gpu = value['gpu'] === null || isText(value['gpu']) ? value['gpu'] : null;
  const reason = isText(value['reason']) ? value['reason'] : 'unknown';
  const when = isText(value['at']) ? value['at'] : '';
  return { backend: value['backend'], gpu, chromium: value['chromium'], reason, at: when };
}

function seenOf(value: unknown): GraphicsSeen | null {
  if (!isRecord(value) || !isBackend(value['backend']) || !isText(value['gpu']) || !isText(value['chromium']))
    return null;
  return { backend: value['backend'], gpu: value['gpu'], chromium: value['chromium'] };
}

function windowOf(value: unknown): WindowPlace | null {
  if (!isRecord(value)) return null;
  const { x, y, width, height, maximized, fullScreen } = value;
  if (!isWhole(x) || !isWhole(y) || !isWhole(width) || !isWhole(height) || width <= 0 || height <= 0) return null;
  return { x, y, width, height, maximized: maximized === true, fullScreen: fullScreen === true };
}

const listOf = <Item>(value: unknown, read: (item: unknown) => Item | null): Item[] =>
  Array.isArray(value)
    ? value
        .map(read)
        .filter((item): item is Item => item !== null)
        .slice(-KEPT_MOST)
    : [];

/** What `text` keeps, each field read on its own. */
export function keptOf(text: string | null): Kept {
  let raw: unknown = null;
  try {
    raw = text === null ? null : JSON.parse(text);
  } catch {
    raw = null;
  }
  if (!isRecord(raw)) return DEFAULT_KEPT;
  return {
    graphics: isApi(raw['graphics']) ? raw['graphics'] : DEFAULT_KEPT.graphics,
    failures: listOf(raw['failures'], failureOf),
    seen: listOf(raw['seen'], seenOf),
    window: windowOf(raw['window']),
    updateChecks: raw['updateChecks'] !== false,
  };
}

/** The kept settings in `folder`, read and written as one file. A write goes to a file beside it first and is then
 *  moved over it, so a launch that stops mid-write leaves the last whole file. */
export class Config {
  private readonly file: string;
  private kept: Kept;

  constructor(folder: string) {
    this.file = path.join(folder, CONFIG_NAME);
    let text: string | null = null;
    try {
      text = readFileSync(this.file, 'utf8');
    } catch {
      text = null;
    }
    this.kept = keptOf(text);
  }

  get(): Kept {
    return this.kept;
  }

  /** Keeps `change` over what is kept. Answers whether it reached the disk: a folder that cannot be written keeps it
   *  for this launch alone. */
  set(change: Partial<Kept>): boolean {
    this.kept = { ...this.kept, ...change };
    const passing = `${this.file}.${process.pid}.new`;
    try {
      mkdirSync(path.dirname(this.file), { recursive: true });
      writeFileSync(passing, `${JSON.stringify(this.kept, null, 2)}\n`);
      renameSync(passing, this.file);
      return true;
    } catch {
      try {
        rmSync(passing, { force: true });
      } catch {
        // Nothing was written where nothing can be.
      }
      return false;
    }
  }
}
