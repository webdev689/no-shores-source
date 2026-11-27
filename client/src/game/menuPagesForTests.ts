// What the menu's plain pages are tested with: a page drawn frame by frame through the interface over a face of blocks,
// fake accounts answering, and a page that records what it is asked. The game never imports it.
import type { Account, AccountLink, Details, Person, Roster } from '../network/accounts.ts';
import type { Page } from '../ui/page.ts';

// What the pages dispatch to the page around them: heard and counted, never acted on.
export const heard: string[] = [];
Object.assign(globalThis, { dispatchEvent: (event: Event) => heard.push(event.type) });

export { drawn, wordsOf } from './menuForTests.ts';

export const settle = () => new Promise((done) => setTimeout(done, 0));

export const person = (name: string, place: string | null = 'node-overlook'): Person => ({
  name,
  tag: null,
  emblem: null,
  level: 3,
  place,
});
export const ROSTER: Roster = {
  me: person('Ana'),
  privacy: 'Friends Only',
  company: null,
  invites: [],
  nearby: [],
  guests: 1,
  friends: [person('Bo'), person('Cy', null)],
  asking: [],
  asked: [],
  guild: null,
  guildInvites: [],
  blocked: ['Rook', 'Sable'],
  muted: ['Wren'],
};

/** A link to fake accounts answering `account`, and every ask made of it. */
export function fakeLink(account: Account | null, roster: Roster | string = ROSTER) {
  const asked: string[] = [];
  let blocked = typeof roster === 'string' ? [] : [...roster.blocked];
  let muted = typeof roster === 'string' ? [] : [...(roster.muted ?? [])];
  const link = {
    said: null,
    session: async () => account,
    roster: async () => {
      asked.push('roster');
      return typeof roster === 'string' ? roster : { ...roster, blocked, muted };
    },
    details: async (name: string) => {
      asked.push(`details ${name}`);
      return { ...person(name), playing: true, guild: null, shown: null } satisfies Details;
    },
    social: async (path: string, body: Record<string, unknown> = {}) => {
      asked.push(`${path} ${JSON.stringify(body)}`);
      if (path === 'unblock') blocked = blocked.filter((name) => name !== body['name']);
      if (path === 'unmute') muted = muted.filter((name) => name !== body['name']);
      return null;
    },
    login: async (name: string, password: string) => {
      asked.push(`login ${name} ${password}`);
      return 'Wrong username or password.';
    },
    register: async (name: string, password: string) => {
      asked.push(`register ${name} ${password}`);
      return { id: 'a', username: name, discord: false, guest: false };
    },
    logout: async () => void asked.push('logout'),
    logoutEverywhere: async () => null,
    discord: async (back: string) => ({ to: `discord?back=${back}` }),
  };
  return { link: link as unknown as AccountLink, asked };
}

/** A page that records what it is asked to do, at `address`. */
export function fakePage(address = 'https://game/') {
  const done: string[] = [];
  const page: Page = {
    open: (url) => done.push(`open ${url}`),
    reload: () => done.push('reload'),
    assign: (url) => done.push(`assign ${url}`),
    address: () => address,
    close: () => done.push('close'),
  };
  return { page, done };
}
