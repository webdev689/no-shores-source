// Answers, CORS and body reads shared by every route. The panel is the only browser caller, so CORS names its origins
// alone; Discord's calls are server to server and need none.

import type { Vars } from './kit.ts';

/** The largest JSON body any route reads. */
export const BODY_MAX = 64 * 1024;

export type HeaderSet = Readonly<Record<string, string>>;

/** The origins allowed to call the panel API: PANEL_ORIGINS, comma-separated. */
export function panelOrigins(vars: Vars): string[] {
  return String(vars.PANEL_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => /^https?:\/\/[^\s/]+$/.test(origin));
}

/** CORS headers for a request: the caller's origin echoed when it is allowed, nothing otherwise. */
export function corsFor(vars: Vars, request: Request): HeaderSet {
  const origin = request.headers.get('origin') ?? '';
  if (!origin || !panelOrigins(vars).includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'access-control-max-age': '600',
    vary: 'origin',
  };
}

export function json(body: unknown, status = 200, headers: HeaderSet = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

/** An error answer. `error` is a stable code the panel switches on; `message` is words a person can read. */
export function fail(error: string, status: number, headers: HeaderSet = {}, message = ''): Response {
  return json(message ? { error, message } : { error }, status, headers);
}

export function redirect(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { location, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
  });
}

/** At most `most` bytes of a request's body; null when it is longer. */
export async function readCapped(request: Request, most = BODY_MAX): Promise<Uint8Array<ArrayBuffer> | null> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > most) return null;
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    size += chunk.value.byteLength;
    if (size > most) {
      await reader.cancel().catch(() => {});
      return null;
    }
    parts.push(chunk.value);
  }
  const whole = new Uint8Array(size);
  parts.reduce((offset, part) => (whole.set(part, offset), offset + part.byteLength), 0);
  return whole;
}

/** A JSON object body, or null. */
export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const bytes = await readCapped(request);
  if (!bytes) return null;
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The bearer token on a request, or ''. */
export function bearer(request: Request): string {
  const match = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(request.headers.get('authorization') ?? '');
  return match?.[1] ?? '';
}
