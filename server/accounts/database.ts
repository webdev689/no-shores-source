/** The part of Cloudflare D1 the accounts use, so their rules run on the Worker's database and on SQLite in tests. */
export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ readonly results: T[] }>;
  run(): Promise<{ readonly meta: { readonly changes: number } }>;
}

export interface Db {
  prepare(sql: string): Statement;
}

/** How long a session lasts unseen when its account has a way back in, a username or Discord; and how long a guest
 *  is kept unused, whose session lasts as long as the guest, its token the only way back to it. */
export const SESSION_IDLE_MS = 30 * 24 * 60 * 60_000;
