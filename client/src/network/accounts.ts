/** Where the deployed accounts are (`server/accounts`). */
export const LIVE_ACCOUNTS = 'https://overlook-accounts.mackcothran.workers.dev';

/** An account as its player sees it: a guest until it has a username or Discord. */
export interface Account {
  readonly id: string;
  readonly username: string | null;
  readonly discord: boolean;
  readonly guest: boolean;
}

/** What a Discord sign-in came back with, in the page's address: a code to take, or no sign-in. */
export type Came = 'came back' | 'cancelled' | 'failed';

/** Where a page keeps its session's token: the browser's local storage, or anything shaped like it. */
export interface Kept {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const KEY = 'overlook.session';
/** What the accounts say of a session its player has not used in a month, which they end. */
const LAPSED = 'Your sign-in lapsed after 30 days away. Sign in again.';
/** Where the page keeps the nonce of the Discord sign-in it began, for the tab alone. */
const NONCE_KEY = 'overlook.discord';
const TOKEN = /^[0-9a-f]{64}$/;

/** A random 32 bytes in hex, as the accounts make their tokens. */
function nonceOf(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * A page's way to its player's account. The session's token is kept in the browser, the deployed accounts' apart from
 * any other's; a player without one is made a guest. A guest may take a username and password, sign in with them
 * elsewhere, or sign in or link with Discord, which comes back to the page with a one-time code that only the tab that
 * began it can take, by the nonce it kept. Unreachable accounts leave the player signed out, playing a character that
 * is not kept.
 */
export class AccountLink {
  private readonly base: string;
  private readonly kept: Kept;
  private readonly passing: Kept;
  private readonly ask: typeof fetch;
  private readonly key: string;
  /** A Discord sign-in's code, taken from the page's address and not yet redeemed. */
  private code: string | null = null;
  /** What the last Discord sign-in came to, in words, once the page has taken it. */
  said: string | null = null;

  constructor(base: string, kept: Kept, ask: typeof fetch = (...given) => fetch(...given), passing: Kept = kept) {
    this.base = base.replace(/\/+$/, '');
    this.kept = kept;
    this.passing = passing;
    this.ask = ask;
    this.key = this.base === LIVE_ACCOUNTS ? KEY : `${KEY}@${this.base}`;
  }

  /** The session's token, if the page holds one. */
  get token(): string | null {
    const token = this.kept.getItem(this.key);
    return token !== null && TOKEN.test(token) ? token : null;
  }

  /** Takes what a Discord sign-in sent back in the page's address's fragment: a code to redeem on the next `session`,
   *  or word that it went nowhere. A session or token in the address is never taken. */
  takeFrom(fragment: string): Came | null {
    const given = new URLSearchParams(fragment.replace(/^#/, ''));
    const discord = given.get('discord');
    const code = given.get('code');
    if (discord === 'done' && code !== null && TOKEN.test(code)) {
      this.code = code;
      return 'came back';
    }
    if (discord === 'cancelled' || discord === 'failed') {
      this.said = discord === 'cancelled' ? 'Discord sign-in was cancelled.' : 'Discord sign-in did not finish.';
      return discord;
    }
    return null;
  }

  /** Redeems a Discord sign-in's code with the nonce this tab kept: a new session, or Discord linked to this one. */
  private async redeem(code: string): Promise<void> {
    const nonce = this.passing.getItem(NONCE_KEY) ?? '';
    this.passing.removeItem(NONCE_KEY);
    const answer = await this.call('POST', '/v1/discord/finish', { code, nonce });
    if (typeof answer === 'string') {
      this.said = answer;
      return;
    }
    if (answer['linked'] === true) this.said = 'Discord is linked.';
    else if (typeof answer['token'] === 'string' && TOKEN.test(answer['token'])) {
      this.kept.setItem(this.key, answer['token']);
      this.said = 'Signed in with Discord.';
    }
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
    if (typeof answer['token'] === 'string' && TOKEN.test(answer['token']))
      this.kept.setItem(this.key, answer['token']);
    return answer['account'] as Account;
  }

  /** The player's account: a Discord sign-in's first, if one came back, then the session held, or else a new guest;
   *  null if the accounts cannot be reached. */
  async session(): Promise<Account | null> {
    const code = this.code;
    this.code = null;
    if (code !== null) await this.redeem(code);
    if (this.token) {
      const known = await this.call('GET', '/v1/me');
      if (typeof known !== 'string') return known['account'] as Account;
      if (known !== 'Not signed in.' && known !== LAPSED) return null;
      if (known === LAPSED) this.said = LAPSED;
      this.kept.removeItem(this.key);
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
    this.kept.removeItem(this.key);
  }

  /** Ends every session of an account with a way back in, this one with them; why not, if it cannot. */
  async logoutEverywhere(): Promise<string | null> {
    const answer = await this.call('POST', '/v1/logout/everywhere');
    if (typeof answer === 'string') return answer;
    this.kept.removeItem(this.key);
    return null;
  }

  /** Where to send the player to sign in or link with Discord, coming back to `back`; the tab keeps a nonce for the
   *  code that comes back. */
  async discord(back: string): Promise<string> {
    const ticket = this.token ? await this.call('POST', '/v1/discord/ticket') : null;
    const nonce = nonceOf();
    this.passing.setItem(NONCE_KEY, nonce);
    const url = new URL(`${this.base}/v1/discord/start`);
    url.searchParams.set('back', back);
    url.searchParams.set('nonce', nonce);
    if (ticket !== null && typeof ticket !== 'string' && typeof ticket['ticket'] === 'string')
      url.searchParams.set('ticket', ticket['ticket']);
    return url.toString();
  }
}
