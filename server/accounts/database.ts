/** The part of Cloudflare D1 the accounts use, so their rules run on the Worker's database and on SQLite in tests. */
export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ readonly meta: { readonly changes: number } }>;
}

export interface Db {
  prepare(sql: string): Statement;
}
