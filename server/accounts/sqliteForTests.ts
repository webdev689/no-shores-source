import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { Db, Statement } from './database.ts';

/** A fresh database in memory, its tables made by the accounts' own migrations, behind the part of D1 they use. */
export function sqliteForTests(): Db {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('migrations/0001_accounts.sql', import.meta.url), 'utf8'));
  const statement = (sql: string, values: readonly SQLInputValue[] = []): Statement => ({
    bind: (...given) => statement(sql, given as SQLInputValue[]),
    first: <T>() => Promise.resolve((sqlite.prepare(sql).get(...values) ?? null) as T | null),
    run: () => Promise.resolve({ meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }),
  });
  return { prepare: (sql) => statement(sql) };
}
