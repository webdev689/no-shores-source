/** Where the deployed accounts are (`server/accounts`). */
export const LIVE_ACCOUNTS = 'https://overlook-accounts.mackcothran.workers.dev';

/** An account as its player sees it: a guest until it has a username or Discord. */
export interface Account {
  readonly id: string;
  readonly username: string | null;
  readonly discord: boolean;
  readonly guest: boolean;
}

/** What a Discord sign-in came back with, in the page's address. */
export type Came = 'signed in' | 'linked' | 'cancelled' | 'failed';

/** Where a page keeps its session's token: the browser's local storage, or anything shaped like it. */
export interface Kept {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const KEY = 'overlook.session';
const TOKEN = /^[0-9a-f]{64}$/;

/**
 * A page's way to its player's account. The session's token is kept in the browser; a player without one is made a
 * guest. A guest may take a username and password, sign in with them elsewhere, or sign in with Discord, which comes
 * back to the page with a session or a link in its address. Unreachable accounts leave the player signed out, playing
 * a character that is not kept.
 */
export class AccountLink {
  private readonly base: string;
  private readonly kept: Kept;
  private readonly ask: typeof fetch;

  constructor(base: string, kept: Kept, ask: typeof fetch = (...given) => fetch(...given)) {
    this.base = base.replace(/\/+$/, '');
    this.kept = kept;
    this.ask = ask;
  }

  /** The session's token, if the page holds one. */
  get token(): string | null {
    const token = this.kept.getItem(KEY);
    return token !== null && TOKEN.test(token) ? token : null;
  }

  /** Takes what a Discord sign-in sent back in the page's address's fragment, keeping a session it brought. */
  takeFrom(fragment: string): Came | null {
    const given = new URLSearchParams(fragment.replace(/^#/, ''));
    const session = given.get('session');
    if (session !== null && TOKEN.test(session)) {
      this.kept.setItem(KEY, session);
      return 'signed in';
    }
    const discord = given.get('discord');
    return discord === 'linked' || discord === 'cancelled' || discord === 'failed' ? discord : null;
  }

  private async call(method: string, path: string, body?: unknown): Promise<Record<string, unknown> | string> {
    const token = this.token;
    try {
      const answer = await this.ask(`${this.base}${path}`, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const read = (await answer.json().catch(() => ({}))) as Record<string, unknown>;
      if (answer.ok) return read;
      return typeof read['error'] === 'string' ? read['error'] : `The accounts answered ${answer.status}.`;
    } catch {
      return 'The accounts could not be reached.';
    }
  }

  /** The account and its token from an answer that brings a new session, which is kept. */
  private signedIn(answer: Record<string, unknown> | string): Account | string {
    if (typeof answer === 'string') return answer;
    if (typeof answer['token'] === 'string' && TOKEN.test(answer['token'])) this.kept.setItem(KEY, answer['token']);
    return answer['account'] as Account;
  }

  /** The player's account: the session held, or else a new guest; null if the accounts cannot be reached. */
  async session(): Promise<Account | null> {
    if (this.token) {
      const known = await this.call('GET', '/v1/me');
      if (typeof known !== 'string') return known['account'] as Account;
      if (known !== 'Not signed in.') return null;
      this.kept.removeItem(KEY);
    }
    const guest = this.signedIn(await this.call('POST', '/v1/guest'));
    return typeof guest === 'string' ? null : guest;
  }

  /** Gives the account a username and password; the account, or why not. */
  async register(username: string, password: string): Promise<Account | string> {
    const answer = await this.call('POST', '/v1/register', { username, password });
    return typeof answer === 'string' ? answer : (answer['account'] as Account);
  }

  /** Signs in with a username and password, leaving any guest behind; the account, or why not. */
  async login(username: string, password: string): Promise<Account | string> {
    return this.signedIn(await this.call('POST', '/v1/login', { username, password }));
  }

  /** Signs out: the session ends, and the next `session` makes a new guest. */
  async logout(): Promise<void> {
    await this.call('POST', '/v1/logout');
    this.kept.removeItem(KEY);
  }

  /** Where to send the player to sign in or link with Discord, coming back to `back`. */
  async discord(back: string): Promise<string> {
    const ticket = this.token ? await this.call('POST', '/v1/discord/ticket') : null;
    const url = new URL(`${this.base}/v1/discord/start`);
    url.searchParams.set('back', back);
    if (ticket !== null && typeof ticket !== 'string' && typeof ticket['ticket'] === 'string')
      url.searchParams.set('ticket', ticket['ticket']);
    return url.toString();
  }
}
