// A world of accounts for the tests: the API on a fresh database, its clock where a test sets it.

import { type Deps, handle } from './accounts.ts';
import type { DiscordApp } from './discord.ts';
import { sqliteForTests } from './sqliteForTests.ts';

export const API = 'https://accounts.test';
export const PAGE = 'https://lattymoy.github.io/overlook-source';

/** A world of accounts on a fresh database, its clock where the test sets it. */
export function accounts(discord: DiscordApp | null = null) {
  const clock = { now: 1_000_000 };
  const deps: Deps = { database: sqliteForTests(), now: () => clock.now, discord, pages: [`${PAGE}/`] };
  const ask = async (method: string, path: string, body?: unknown, token?: string, headers: HeadersInit = {}) => {
    const response = await handle(
      new Request(`${API}${path}`, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'CF-Connecting-IP': '203.0.113.9',
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      deps,
    );
    const text = await response.text();
    const isJson = response.headers.get('Content-Type') === 'application/json';
    return {
      status: response.status,
      body: (isJson ? JSON.parse(text) : { text }) as Record<string, unknown>,
      response,
    };
  };
  return { deps, clock, ask };
}
