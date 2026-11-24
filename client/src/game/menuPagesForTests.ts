// What the menu's plain pages are tested with: a page drawn frame by frame through the interface over a face of blocks,
// fake accounts answering, and a page that records what it is asked. The game never imports it.
import type { Account, AccountLink, Details, Person, Roster } from '../network/accounts.ts';
import { glyphDrawn } from '../ui/glyphs.ts';
import type { Child, Node } from '../ui/node.ts';
import type { Page } from '../ui/page.ts';
import { QuadList } from '../ui/quads.ts';
import { type Face, widthOf } from '../ui/text.ts';
import { Interface, type UiEvent } from '../ui/ui.ts';
import type { UiRenderer } from '../ui/uiRenderer.ts';
import { Holds } from './gearHold.ts';
import { sizesOf } from './gearNodes.ts';
import type { PlainContext } from './menuPage.ts';

const block = glyphDrawn({ rows: ['##', '##'], advance: 600 });
const face: Face = { glyph: () => block };
const VIEW = { width: 1280, height: 720, scale: 1 };
const ROOM = { width: 1180, height: 520 };

function renderer(): UiRenderer {
  return {
    face,
    quads: new QuadList(),
    tileTexels: () => null,
    glyphTexels: () => null,
    picture: () => undefined,
    measure: (words: string, size: number) => widthOf(face, words, size),
  } as unknown as UiRenderer;
}

// What the pages dispatch to the page around them: heard and counted, never acted on.
export const heard: string[] = [];
Object.assign(globalThis, { dispatchEvent: (event: Event) => heard.push(event.type) });

/** Every word a tree shows, in order. */
export function wordsOf(node: Child): string[] {
  if (!node) return [];
  const own = node.text
    ? [typeof node.text.words === 'string' ? node.text.words : node.text.words.map((span) => span.words).join('')]
    : [];
  return [...own, ...(node.children ?? []).flatMap(wordsOf)];
}

/** A page drawn frame by frame through the interface, with the clock `now` for its holds, in `room`. */
export function drawn(page: (context: PlainContext) => Node, room: { width: number; height: number } = ROOM) {
  let now = 0;
  const ui = new Interface(renderer());
  ui.speak = () => undefined;
  const holds = new Holds(() => now);
  const context: PlainContext = { ui, room, sizes: sizesOf(VIEW.width, VIEW.height, 1), holds };
  let last: Node = { children: [] };
  const frame = (events: UiEvent[] = [], seconds = 1 / 60) => {
    now += seconds * 1000;
    ui.frame(VIEW, events, seconds);
    holds.frame(ui);
    last = page(context);
    holds.end();
    ui.draw({ width: 'grow', height: 'grow', direction: 'column', children: [last] });
  };
  const middle = (id: string) => {
    const box = ui.boxOf(id);
    if (!box) throw new Error(`${id} is not laid`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const click = (id: string) => {
    const point = middle(id);
    frame([
      { kind: 'pointer', ...point },
      { kind: 'down', ...point, button: 0 },
      { kind: 'up', ...point, button: 0 },
    ]);
    frame();
  };
  const type = (id: string, text: string) => {
    click(id);
    frame([{ kind: 'text', text }]);
  };
  const shows = () => wordsOf(last).join(' | ');
  return { ui, frame, click, type, middle, shows };
}

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
    discord: async (back: string) => `discord?back=${back}`,
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
