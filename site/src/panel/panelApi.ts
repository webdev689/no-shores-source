// The panel's door to the bot: its address, the session token it keeps in this browser, and one call that sends the
// token and turns every answer into { ok, status, body }.
import type { FieldError } from '../../../server/bot/law/settings.ts';

/** The bot's Worker on the account's workers.dev. A panel served from this machine may name another (`npm run bot`). */
export const BOT_ORIGIN = 'https://noshores-bot.mackcothran.workers.dev';
/** The bot `npm run bot` runs, which a panel on this machine talks to unless the storage key below names another. */
export const LOCAL_BOT_ORIGIN = 'http://localhost:8789';
export const BOT_ORIGIN_KEY = 'noshores.bot.origin';
export const TOKEN_KEY = 'noshores.bot.panel';
/** A sign-in this tab began (its time, ms), kept for the tab alone: a ticket it did not begin is not traded. */
export const SIGNING_KEY = 'noshores.bot.signing';
/** How long a begun sign-in waits for its ticket. */
export const SIGNING_TTL_MS = 10 * 60_000;
/** A session whose sign-out did not reach the bot, told again at the next load. */
export const PENDING_OUT_KEY = 'noshores.bot.signout';

/** What the bot says when it refuses, or when it cannot be reached (status 0). */
export interface Refusal {
  readonly error?: string;
  readonly message?: string;
  readonly errors?: readonly FieldError[];
}
export type Answer<Body> =
  | { readonly ok: true; readonly status: number; readonly body: Body }
  | { readonly ok: false; readonly status: number; readonly body: Refusal };

/** The part of the browser's storage the panel uses. */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Fetch = (url: string, init: RequestInit) => Promise<Response>;

function read(store: StorageLike | null, key: string): string {
  try {
    return store?.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function write(store: StorageLike | null, key: string, value: string): void {
  try {
    if (value) store?.setItem(key, value);
    else store?.removeItem(key);
  } catch {
    // a browser that refuses storage keeps the session for this page only
  }
}

/** Whether a storage can be read at all: one that refuses every call holds no begun sign-in to check. */
function keeps(store: StorageLike | null): boolean {
  try {
    store?.getItem(SIGNING_KEY);
    return store !== null;
  } catch {
    return false;
  }
}

/** One of the browser's storages, or null where the browser refuses it. */
function storageOf(name: 'localStorage' | 'sessionStorage'): StorageLike | null {
  try {
    return globalThis[name] ?? null;
  } catch {
    return null;
  }
}

export interface PanelDeps {
  readonly store?: StorageLike | null;
  readonly tab?: StorageLike | null;
  readonly fetchFn?: Fetch;
  /** Whether the page is served from this machine, where another bot may be named. */
  readonly local?: boolean;
  readonly now?: () => number;
}

export function createPanelApi(deps: PanelDeps = {}) {
  const store = deps.store === undefined ? storageOf('localStorage') : deps.store;
  const tab = deps.tab === undefined ? storageOf('sessionStorage') : deps.tab;
  const now = deps.now ?? (() => Date.now());
  const fetchFn: Fetch = deps.fetchFn ?? ((url, init) => fetch(url, init));
  const named = deps.local ? read(store, BOT_ORIGIN_KEY) : '';
  const fallback = deps.local ? LOCAL_BOT_ORIGIN : BOT_ORIGIN;
  const base = /^https?:\/\/[^\s/]+$/.test(named) ? named : fallback;
  let token = read(store, TOKEN_KEY);

  /** A call to the bot. A body is sent as JSON, or as it is when it is a file. */
  async function call<Body = Record<string, unknown>>(
    method: string,
    path: string,
    body?: unknown,
    { bearer = token }: { bearer?: string } = {},
  ): Promise<Answer<Body>> {
    const headers: Record<string, string> = {};
    if (bearer) headers.authorization = `Bearer ${bearer}`;
    const file = typeof Blob !== 'undefined' && body instanceof Blob;
    if (body !== undefined)
      headers['content-type'] = file ? body.type || 'application/octet-stream' : 'application/json';
    try {
      const response = await fetchFn(`${base}${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: file ? body : JSON.stringify(body) } : {}),
      });
      const parsed: unknown = await response.json().catch(() => null);
      // only the session this call carried is let go: another tab may have signed in since
      if (response.status === 401 && bearer && bearer === token) {
        token = '';
        if (read(store, TOKEN_KEY) === bearer) write(store, TOKEN_KEY, '');
      }
      const held = (parsed !== null && typeof parsed === 'object' ? parsed : {}) as Body & Refusal;
      return response.ok
        ? { ok: true, status: response.status, body: held }
        : { ok: false, status: response.status, body: held };
    } catch {
      return { ok: false, status: 0, body: { error: 'offline', message: 'The bot could not be reached.' } };
    }
  }

  function setToken(next: string): void {
    token = next;
    write(store, TOKEN_KEY, next);
  }

  return {
    base,
    call,
    signedIn: (): boolean => token.length > 0,
    /** Where the sign-in starts: the bot sends the person to Discord and back to `back`, this page's address. */
    signInUrl: (back: string): string => `${base}/v1/auth/discord?to=${encodeURIComponent(back)}`,
    /** The person pressed Sign in here: this tab will take the ticket that comes back. */
    beginSignIn(): void {
      write(tab, SIGNING_KEY, String(now()));
    },
    /**
     * Trade the ticket Discord's round trip left in the address for a session, where this tab began that sign-in: a
     * ticket in a link someone else sent is not traded, so no one is signed in as another. It is sent with no session,
     * and a refusal lets go of nothing.
     */
    async exchange(ticket: string): Promise<Answer<{ token?: unknown }>> {
      const began = Number(read(tab, SIGNING_KEY));
      write(tab, SIGNING_KEY, '');
      // a browser that keeps no tab storage, or refuses it, cannot tell, and signs in as before
      if (keeps(tab) && !(began > 0 && now() - began < SIGNING_TTL_MS))
        return { ok: false, status: 0, body: { error: 'ticket' } };
      const answer = await call<{ token?: unknown }>('POST', '/v1/auth/exchange', { ticket }, { bearer: '' });
      if (answer.ok && typeof answer.body.token === 'string') setToken(answer.body.token);
      return answer;
    },
    /** Sign out. One that cannot reach the bot is kept and told at the next load, so the session does not live on. */
    async signOut(): Promise<void> {
      const held = token;
      setToken('');
      if (!held) return;
      const answer = await call('POST', '/v1/auth/logout', undefined, { bearer: held });
      if (answer.status === 0) write(store, PENDING_OUT_KEY, held);
    },
    /** Tell the bot of a sign-out it did not hear. */
    async finishSignOut(): Promise<void> {
      const held = read(store, PENDING_OUT_KEY);
      if (!held) return;
      const answer = await call('POST', '/v1/auth/logout', undefined, { bearer: held });
      if (answer.status !== 0) write(store, PENDING_OUT_KEY, '');
    },
  };
}

export type PanelApi = ReturnType<typeof createPanelApi>;
