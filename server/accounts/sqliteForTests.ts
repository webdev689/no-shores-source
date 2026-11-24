import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { Db, Statement } from './database.ts';

/** A fresh database in memory, its tables made by the accounts' own migrations in order, behind the part of D1 they
 *  use; a batch is one transaction, as D1's is. */
export function sqliteForTests(): Db {
  const sqlite = new DatabaseSync(':memory:');
  const migrations = new URL('migrations/', import.meta.url);
  for (const name of readdirSync(migrations)
    .filter((each) => each.endsWith('.sql'))
    .sort())
    sqlite.exec(readFileSync(new URL(name, migrations), 'utf8'));
  const statement = (sql: string, values: readonly SQLInputValue[] = []): Statement => ({
    bind: (...given) => statement(sql, given as SQLInputValue[]),
    first: <T>() => Promise.resolve((sqlite.prepare(sql).get(...values) ?? null) as T | null),
    all: <T>() => Promise.resolve({ results: sqlite.prepare(sql).all(...values) as T[] }),
    run: () => Promise.resolve({ meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }),
  });
  const ran = new WeakMap<Statement, () => number>();
  const kept = (sql: string, values: readonly SQLInputValue[] = []): Statement => {
    const made = statement(sql, values);
    const bound: Statement = { ...made, bind: (...given) => kept(sql, given as SQLInputValue[]) };
    ran.set(bound, () => Number(sqlite.prepare(sql).run(...values).changes));
    return bound;
  };
  const batch = (statements: Statement[]) => {
    sqlite.exec('BEGIN');
    try {
      const results = statements.map((each) => ({ meta: { changes: ran.get(each)?.() ?? 0 } }));
      sqlite.exec('COMMIT');
      return Promise.resolve(results);
    } catch (error) {
      sqlite.exec('ROLLBACK');
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  };
  return { prepare: (sql) => kept(sql), batch };
}
