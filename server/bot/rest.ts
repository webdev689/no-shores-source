// The bot's one door to Discord's HTTP API. Every call carries the User-Agent Discord asks for and a timeout, and
// respects Discord's rate limits: the per-route buckets its headers describe, and the global limit. A call never
// throws and never logs the token. A 429 short enough to wait out is waited out once; a longer one comes back as
// `down` with how long to wait, so a clock job can try again on its next firing.

import { recordOf } from './law/settings.ts';

export const DISCORD_API = 'https://discord.com/api/v10';
export const USER_AGENT = 'DiscordBot (https://noshores.online, 1)';
export const REST_TIMEOUT_MS = 8_000;
/** The longest wait a call will sit through itself before answering `down` instead. */
export const WAIT_MAX_MS = 5_000;
/** Discord's limit on the audit-log reason header, in characters. */
export const REASON_MAX = 512;

/** Discord's answer body, as JSON: read by whoever asked, through `recordOf`, as they know its shape. */
export type DiscordJson = unknown;
export interface RestOk {
  readonly ok: true;
  readonly status: number;
  readonly json: DiscordJson;
}
export interface RestFail {
  readonly ok: false;
  readonly status: number;
  readonly code: number;
  readonly down: boolean;
  readonly retryAfterMs: number;
  readonly message: string;
}
export type RestResult = RestOk | RestFail;

/** The way out to the network: `fetch`, or a test's fake. */
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * The bucket a call belongs to before Discord has named one. Discord keys buckets by route with the channel, guild or
 * webhook id kept and every other id folded, so a route key does the same.
 */
export function routeKey(method: string, path: string): string {
  const parts = (path.split('?')[0] ?? '').split('/');
  const out = parts.map((part, i) => {
    if (!/^\d{5,25}$/.test(part)) return part;
    const before = parts[i - 1];
    return before === 'channels' || before === 'guilds' || before === 'webhooks' ? part : ':id';
  });
  // A webhook's token is a major parameter too, but it must never reach a log line or a map key in the clear.
  const webhook = out.indexOf('webhooks');
  if (webhook >= 0 && out[webhook + 2] && !out[webhook + 2]?.startsWith(':')) out[webhook + 2] = ':token';
  return `${method} ${out.join('/')}`;
}

/** A route key's major parameters: the channel, guild or webhook id Discord limits each bucket by. */
export const majorOf = (key: string): string => (key.match(/(?:channels|guilds|webhooks)\/\d+/g) ?? []).join(',');

/** A path fit for a log line: every id folded. */
export const logPath = (path: string): string =>
  (path.split('?')[0] ?? '').replace(/\/webhooks\/(\d+)\/[^/]+/g, '/webhooks/$1/:token').replace(/\d{5,25}/g, '#');

export const reasonHeader = (reason: string): string => encodeURIComponent(String(reason).slice(0, REASON_MAX));

export interface CallOptions {
  readonly json?: unknown;
  readonly form?: FormData;
  readonly reason?: string;
  readonly query?: Readonly<Record<string, string | number | boolean>>;
}

export interface Rest {
  call(method: string, path: string, options?: CallOptions): Promise<RestResult>;
  on(): boolean;
  get(path: string, options?: CallOptions): Promise<RestResult>;
  post(path: string, json: unknown, options?: CallOptions): Promise<RestResult>;
  patch(path: string, json: unknown, options?: CallOptions): Promise<RestResult>;
  put(path: string, json: unknown, options?: CallOptions): Promise<RestResult>;
  del(path: string, options?: CallOptions): Promise<RestResult>;
}

const failed = (status: number, code: number, down: boolean, retryAfterMs: number, message: string): RestFail => ({
  ok: false,
  status,
  code,
  down,
  retryAfterMs,
  message,
});

const parsed = (body: string): DiscordJson => {
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
};

export function createRest(options: {
  readonly token: string | undefined;
  readonly fetch?: Fetch;
  readonly now?: () => number;
  readonly sleep?: (millis: number) => Promise<void>;
  readonly log?: (line: string) => void;
}): Rest {
  const token = typeof options.token === 'string' ? options.token : '';
  const send = options.fetch ?? ((url, init) => fetch(url, init));
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((millis) => new Promise<void>((resolve) => setTimeout(resolve, millis)));
  const log = options.log ?? ((line) => console.warn(line));
  /** route key to Discord's bucket id */
  const bucketOf = new Map<string, string>();
  /** a bucket id with its major parameters (or the route key until named) to what is left of it */
  const buckets = new Map<string, { remaining: number; resetAt: number }>();
  let globalUntil = 0;

  // Discord shares one bucket id across channels and servers, but counts each one apart.
  const stateKey = (key: string) => {
    const bucket = bucketOf.get(key);
    return bucket ? `${bucket}|${majorOf(key)}` : key;
  };

  const learn = (key: string, response: Response) => {
    const bucket = response.headers.get('x-ratelimit-bucket');
    const remaining = Number(response.headers.get('x-ratelimit-remaining') ?? NaN);
    const resetAfter = Number(response.headers.get('x-ratelimit-reset-after') ?? NaN);
    if (bucket) bucketOf.set(key, bucket);
    if (Number.isFinite(remaining) && Number.isFinite(resetAfter))
      buckets.set(stateKey(key), { remaining, resetAt: now() + Math.ceil(resetAfter * 1000) });
  };

  /** How long this route must wait before it may call, in milliseconds. */
  const waitFor = (key: string) => {
    const nowMs = now();
    const state = buckets.get(stateKey(key));
    const routeWait = state && state.remaining <= 0 && state.resetAt > nowMs ? state.resetAt - nowMs : 0;
    return Math.max(routeWait, globalUntil > nowMs ? globalUntil - nowMs : 0);
  };

  const sent = async (method: string, path: string, given: CallOptions): Promise<Response | null> => {
    const url = new URL(`${DISCORD_API}${path}`);
    for (const [name, value] of Object.entries(given.query ?? {})) url.searchParams.set(name, String(value));
    const headers: Record<string, string> = { authorization: `Bot ${token}`, 'user-agent': USER_AGENT };
    if (given.json !== undefined) headers['content-type'] = 'application/json';
    if (given.reason) headers['x-audit-log-reason'] = reasonHeader(given.reason);
    const body = given.json !== undefined ? JSON.stringify(given.json) : given.form;
    try {
      return await send(url.toString(), {
        method,
        headers,
        ...(body !== undefined ? { body } : {}),
        signal: AbortSignal.timeout(REST_TIMEOUT_MS),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : 'error';
      log(`[bot] Discord unreachable on ${method} ${logPath(path)}: ${name}`);
      return null;
    }
  };

  const call = async (method: string, path: string, given: CallOptions = {}): Promise<RestResult> => {
    if (!token) return failed(0, 0, true, 0, 'The bot token is not set.');
    const key = routeKey(method, path);
    for (let attempt = 0; attempt < 2; attempt++) {
      const wait = waitFor(key);
      if (wait > WAIT_MAX_MS) return failed(429, 0, true, wait, 'Rate limited.');
      if (wait > 0) await sleep(wait);
      const response = await sent(method, path, given);
      if (!response) return failed(0, 0, true, 0, 'Discord could not be reached.');
      learn(key, response);
      const json = parsed(await response.text().catch(() => ''));
      if (response.ok) return { ok: true, status: response.status, json };
      const body = recordOf(json);
      const code = Number(body.code) || 0;
      if (response.status === 429) {
        const retryMs = Math.ceil(
          1000 * (Number(body.retry_after) || Number(response.headers.get('retry-after')) || 1),
        );
        if (body.global || response.headers.get('x-ratelimit-global')) globalUntil = now() + retryMs;
        else buckets.set(stateKey(key), { remaining: 0, resetAt: now() + retryMs });
        if (attempt === 0 && retryMs <= WAIT_MAX_MS) continue;
        return failed(429, code, true, retryMs, 'Rate limited.');
      }
      const down = response.status >= 500;
      if (!down) log(`[bot] Discord refused ${method} ${logPath(path)}: ${response.status} ${code || ''}`.trim());
      return failed(response.status, code, down, 0, String(body.message ?? `HTTP ${response.status}`));
    }
    return failed(429, 0, true, 0, 'Rate limited.');
  };

  return {
    call,
    on: () => token.length > 0,
    get: (path, given) => call('GET', path, given),
    post: (path, json, given) => call('POST', path, { ...given, json }),
    patch: (path, json, given) => call('PATCH', path, { ...given, json }),
    put: (path, json, given) => call('PUT', path, { ...given, json }),
    del: (path, given) => call('DELETE', path, given),
  };
}

/** Discord's error codes for a resource that is gone. */
export const UNKNOWN = Object.freeze({
  CHANNEL: 10003,
  GUILD: 10004,
  MEMBER: 10007,
  MESSAGE: 10008,
  ROLE: 10011,
  USER: 10013,
});
/** Discord's error code for "the bot lacks the permission for this". */
export const MISSING_PERMISSIONS = 50013;
