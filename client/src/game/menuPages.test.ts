import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Account, AccountLink, Details, Person, Roster } from '../network/accounts.ts';
import { glyphDrawn } from '../ui/glyphs.ts';
import type { Child, Node } from '../ui/node.ts';
import type { Page } from '../ui/page.ts';
import { QuadList } from '../ui/quads.ts';
import { type Face, widthOf } from '../ui/text.ts';
import { Interface, type UiEvent } from '../ui/ui.ts';
import type { UiRenderer } from '../ui/uiRenderer.ts';
import { AccountPanel } from './accountTab.ts';
import { Holds } from './gearHold.ts';
import { sizesOf } from './gearNodes.ts';
import type { PlainContext } from './menuPage.ts';
import { laterPage, settingsPage, shipPage } from './menuPages.ts';
import { resolution } from './renderScale.ts';
import { RosterPage, socialPage } from './rosterTab.ts';

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
const heard: string[] = [];
Object.assign(globalThis, { dispatchEvent: (event: Event) => heard.push(event.type) });

/** Every word a tree shows, in order. */
function wordsOf(node: Child): string[] {
  if (!node) return [];
  const own = node.text
    ? [typeof node.text.words === 'string' ? node.text.words : node.text.words.map((span) => span.words).join('')]
    : [];
  return [...own, ...(node.children ?? []).flatMap(wordsOf)];
}

/** A page drawn frame by frame through the interface, with the clock `now` for its holds. */
function drawn(page: (context: PlainContext) => Node) {
  let now = 0;
  const ui = new Interface(renderer());
  ui.speak = () => undefined;
  const holds = new Holds(() => now);
  const context: PlainContext = { ui, room: ROOM, sizes: sizesOf(VIEW.width, VIEW.height, 1), holds };
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
    assert.ok(box, `${id} is laid`);
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

const settle = () => new Promise((done) => setTimeout(done, 0));

const person = (name: string, place: string | null = 'node-overlook'): Person => ({
  name,
  tag: null,
  emblem: null,
  level: 3,
  place,
});
const ROSTER: Roster = {
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
function fakeLink(account: Account | null, roster: Roster | string = ROSTER) {
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

function fakePage() {
  const done: string[] = [];
  const page: Page = {
    open: (url) => done.push(`open ${url}`),
    reload: () => done.push('reload'),
    assign: (url) => done.push(`assign ${url}`),
    address: () => 'https://game/',
  };
  return { page, done };
}

test('a page to come says so, and the Ship lists its papers or says it is loading', () => {
  const later = drawn(() => laterPage('Journal', 'Quests and lore.'));
  later.frame();
  assert.equal(later.shows(), 'Journal | Later | Quests and lore.');
  const ship = drawn((context) =>
    shipPage(
      {
        title: 'Your Sloop',
        parts: [
          { heading: 'Vessel', rows: [['Hull', '9 / 9']] },
          { heading: 'Crew', rows: [] },
        ],
      },
      context.sizes,
    ),
  );
  ship.frame();
  assert.equal(ship.shows(), 'Your Sloop | VESSEL | Hull | 9 / 9 | CREW');
  const loading = drawn((context) => shipPage(null, context.sizes));
  loading.frame();
  assert.equal(loading.shows(), 'Loading your ship…');
});

test('Settings offline says there is no account, and still has the resolution, the volumes and the credits', () => {
  const page = drawn((context) => settingsPage(context, null));
  page.frame();
  assert.match(page.shows(), /Playing offline: there is no account\. \| PICTURE \| Resolution \| Auto/);
  assert.match(page.shows(), /The interface stays sharp\. \| SOUND \| Interface sounds/);
  assert.ok(page.ui.boxOf('volume-music'), 'the music slider is laid');
});

test('the resolution chosen from its list is the one drawn at, and shown', () => {
  const page = drawn((context) => settingsPage(context, null));
  page.frame();
  page.click('resolution');
  page.click('resolution:0.75');
  assert.equal(resolution(), '0.75');
  assert.match(page.shows(), /Resolution \| 75%/);
  page.click('resolution');
  page.click('resolution:auto');
  assert.equal(resolution(), 'auto');
});

test('a credit’s link opens its page in a new tab', () => {
  const { page, done } = fakePage();
  const settings = drawn((context) => settingsPage(context, null, page));
  settings.frame();
  settings.click('credit-0-source');
  assert.equal(done.length, 1);
  assert.match(done[0] ?? '', /^open https:\/\/freesound\.org\//);
});

test('signed in, the words typed in the fields sign in to another account; a refusal is said', async () => {
  const { link, asked } = fakeLink({ id: 'a', username: 'Ana', discord: false, guest: false });
  const { page, done } = fakePage();
  const account = new AccountPanel(link, page);
  const settings = drawn((context) => settingsPage(context, account, page));
  await settle();
  settings.frame();
  assert.match(settings.shows(), /Signed in as Ana\. \| Sign in to another account \| Username \| Password \| Sign in/);
  assert.ok(!settings.shows().includes('Keep this character'), 'a named account keeps no guest');
  settings.type('account-name', 'Bo');
  settings.type('account-password', 'hunter22');
  settings.click('account-sign-in');
  await settle();
  settings.frame();
  assert.ok(asked.includes('login Bo hunter22'));
  assert.match(settings.shows(), /Wrong username or password\./);
  assert.deepEqual(done, []);
  // Discord is left for with the page's own address to come back to.
  settings.click('account-discord');
  await settle();
  assert.deepEqual(done, ['assign discord?back=https://game/']);
});

test('a guest keeps their character with a username; signing in or out leaving the guest is held, not clicked', async () => {
  const { link, asked } = fakeLink({ id: 'a', username: null, discord: false, guest: true });
  const { page, done } = fakePage();
  const account = new AccountPanel(link, page);
  const settings = drawn((context) => settingsPage(context, account, page));
  await settle();
  settings.frame();
  assert.match(settings.shows(), /You play as a guest/);
  assert.ok(!settings.shows().includes('Sign in to another account'));
  settings.click('account-out');
  await settle();
  assert.ok(!asked.includes('logout'), 'a click does not sign out');
  const point = settings.middle('account-out');
  settings.frame([
    { kind: 'pointer', ...point },
    { kind: 'down', ...point, button: 0 },
  ]);
  for (let step = 0; step < 60; step++) settings.frame([], 1 / 60);
  await settle();
  assert.ok(asked.includes('logout'), 'held, it signs out');
  assert.deepEqual(done, ['reload']);
  settings.frame([{ kind: 'up', ...point, button: 0 }]);
  settings.type('account-name', 'Ana');
  settings.click('account-keep');
  await settle();
  settings.frame();
  assert.ok(asked.includes('register Ana '));
  assert.ok(heard.includes('overlook:account'), 'the menu hears the account changed');
  assert.match(settings.shows(), /Signed in as Ana\./);
});

test('the accounts out of reach say so, with a press to ask them again', async () => {
  const { link } = fakeLink(null);
  const account = new AccountPanel(link, fakePage().page);
  const settings = drawn((context) => settingsPage(context, account));
  await settle();
  settings.frame();
  assert.match(settings.shows(), /The accounts cannot be reached: your character is not kept\. \| Try again/);
  assert.equal(settings.ui.boxOf('account-name'), null, 'no fields with nothing to sign in to');
});

test('a blocked player is unblocked, the focus kept on the list', async () => {
  const { link, asked } = fakeLink({ id: 'a', username: 'Ana', discord: false, guest: false });
  const account = new AccountPanel(link, fakePage().page);
  const settings = drawn((context) => settingsPage(context, account));
  await settle();
  settings.frame();
  assert.match(settings.shows(), /BLOCKED PLAYERS \| Rook \| Unblock \| Sable \| Unblock/);
  settings.click('unblock-Rook');
  await settle();
  await settle();
  settings.frame();
  settings.frame();
  assert.ok(asked.includes('unblock {"name":"Rook"}'));
  assert.match(settings.shows(), /BLOCKED PLAYERS \| Sable \| Unblock \| Rook is unblocked\./);
  assert.equal(settings.ui.focusedId, 'unblock-Sable');
});

test('a muted player is listed under the blocked and unmuted from Settings', async () => {
  const { link, asked } = fakeLink({ id: 'a', username: 'Ana', discord: false, guest: false });
  const account = new AccountPanel(link, fakePage().page);
  const settings = drawn((context) => settingsPage(context, account));
  await settle();
  settings.frame();
  assert.match(settings.shows(), /MUTED PLAYERS \| Wren \| Unmute/);
  settings.click('unmute-Wren');
  await settle();
  await settle();
  settings.frame();
  assert.ok(asked.includes('unmute {"name":"Wren"}'));
  assert.match(
    settings.shows(),
    /MUTED PLAYERS \| None\. Mute a player from their menu, or with \/mute in the chat\. \| Wren is unmuted\./,
  );
});

test('offline, Social says the Roster needs an account', () => {
  const social = drawn((context) => socialPage(context, null));
  social.frame();
  assert.equal(social.shows(), 'The Roster needs an account. You are playing offline.');
});

test('a row opens its panel beside it, focused on its first press; Escape closes it and gives the row the focus back', async () => {
  const { link, asked } = fakeLink({ id: 'a', username: 'Ana', discord: false, guest: false });
  let shown = 0;
  const roster = new RosterPage({ link, travel: () => null, now: () => shown, hidden: () => false });
  const social = drawn((context) => roster.node(context));
  await settle();
  social.frame();
  assert.match(social.shows(), /GAME \| Page 1 \/ 1 \| Company: Friends Only/);
  assert.match(social.shows(), /1 friend playing · 1 guest nearby/);
  social.click('roster-friend-Bo');
  social.frame();
  assert.ok(social.ui.boxOf('roster-panel'), 'the panel is laid');
  assert.equal(social.ui.focusedId, 'roster-action-0');
  assert.match(social.shows(), /Bo \| Playing · Overlook \| Details/);
  assert.equal(roster.back(), true);
  social.frame();
  social.frame();
  assert.equal(social.ui.boxOf('roster-panel'), null);
  assert.equal(social.ui.focusedId, 'roster-friend-Bo');
  assert.equal(roster.back(), false, 'with nothing open the menu takes the step');
  // Asked again once a while has passed, while it is seen.
  shown += 15_001;
  social.frame();
  await settle();
  assert.equal(asked.filter((each) => each === 'roster').length, 2);
  // Not again while a panel is open.
  social.click('roster-friend-Bo');
  shown += 15_001;
  social.frame();
  assert.equal(asked.filter((each) => each === 'roster').length, 2);
});

test('a panel’s field opens empty again, and a row’s panel closes once its page is turned away', async () => {
  const many = {
    ...ROSTER,
    friends: [...Array(20).keys()].map((index) => person(`Friend${String(index).padStart(2, '0')}`)),
  };
  const { link } = fakeLink({ id: 'a', username: 'Ana', discord: false, guest: false }, many);
  const roster = new RosterPage({ link, travel: () => null, hidden: () => false });
  const social = drawn((context) => roster.node(context));
  await settle();
  social.frame();
  social.click('roster-top-friends');
  social.frame();
  social.frame([{ kind: 'text', text: 'Dee' }]);
  assert.equal(social.ui.fieldText('roster-field-Username'), 'Dee');
  roster.back();
  social.click('roster-top-friends');
  assert.equal(social.ui.fieldText('roster-field-Username'), '');
  roster.back();
  social.frame();
  social.click('roster-friend-Friend00');
  social.frame();
  assert.ok(social.ui.boxOf('roster-panel'));
  social.click('roster-page-friends-next');
  social.frame();
  assert.equal(social.ui.boxOf('roster-panel'), null);
  assert.equal(roster.back(), false, 'nothing unseen is left for Escape to close');
});

test('a player’s details open from their row and close back to it', async () => {
  const { link, asked } = fakeLink({ id: 'a', username: 'Ana', discord: false, guest: false });
  const roster = new RosterPage({ link, travel: () => null, hidden: () => false });
  const social = drawn((context) => roster.node(context));
  await settle();
  social.frame();
  social.click('roster-friend-Bo');
  social.frame();
  social.click('roster-action-0');
  assert.match(social.shows(), /Loading…/);
  await settle();
  social.frame();
  assert.ok(asked.includes('details Bo'));
  assert.match(social.shows(), /Bo \| Level 3 · Overlook \| WHERE \| Overlook/);
  assert.match(social.shows(), /They have not played online yet\./);
  social.click('roster-back');
  social.frame();
  assert.match(social.shows(), /FRIENDS/);
  assert.equal(social.ui.focusedId, 'roster-friend-Bo');
});

test('a friend is asked for by the name typed in the head’s panel, sent by Enter', async () => {
  const { link, asked } = fakeLink({ id: 'a', username: 'Ana', discord: false, guest: false });
  const roster = new RosterPage({ link, travel: () => null, hidden: () => false });
  const social = drawn((context) => roster.node(context));
  await settle();
  social.frame();
  social.click('roster-top-friends');
  social.frame();
  assert.equal(social.ui.focusedId, 'roster-field-Username');
  social.frame([{ kind: 'text', text: ' Dee ' }]);
  social.frame([{ kind: 'key', key: 'Enter' }]);
  await settle();
  social.frame();
  assert.ok(asked.includes('friend/ask {"name":"Dee"}'));
  assert.match(social.shows(), /Ask: done\./);
  assert.ok(heard.includes('overlook:company'));
});

test('the Roster out of reach says why, with a press to ask again', async () => {
  const { link, asked } = fakeLink(
    { id: 'a', username: 'Ana', discord: false, guest: false },
    'The accounts are away.',
  );
  const roster = new RosterPage({ link, travel: () => null, hidden: () => false });
  const social = drawn((context) => roster.node(context));
  await settle();
  social.frame();
  assert.equal(social.shows(), 'The accounts are away. | Try again');
  social.click('roster-again');
  assert.equal(asked.filter((each) => each === 'roster').length, 2);
});
