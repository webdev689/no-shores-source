import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { makePage } from '../page.ts';
import { SITE_PAGES } from '../siteMap.ts';
import { CONTENT_POLICY, PANEL_POLICY, policyOf } from '../sitePlugin.ts';
import { FakeElement, boxFor, buttonsNamed, settle, withDocument } from './domForTests.ts';
import { BOT_ORIGIN, TOKEN_KEY } from './panelApi.ts';
import { startPanel } from './panelMain.ts';
import { skipToPanel } from './panelPage.ts';

const PANEL = SITE_PAGES.find((page) => page.id === 'panel') ?? assert.fail('the panel is not in the site map');
const SOURCE = readFileSync(new URL('../../panel/index.html', import.meta.url), 'utf8');
const SERVER_A = '900000000000000001';
const SERVER_B = '900000000000000002';

/** A storage as a browser's. */
function memoryStorage(entries: Record<string, string> = {}) {
  const items = new Map(Object.entries(entries));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

/**
 * The browser the panel starts in: this page's address with a hash that can be moved (a `hashchange` follows, as in
 * a browser), its storages, and the bot answering each path through `answer`. Every call is kept in `calls`; every
 * question the page asks is kept in `confirms.asked` and answered `confirms.answer`.
 */
function browser(hash: string, answer: (path: string, init: RequestInit) => Promise<unknown> | unknown, token = '') {
  const listeners: Record<string, (event: { oldURL?: string; preventDefault?: () => void }) => void> = {};
  const calls: Array<{ method: string; path: string; auth: string; body: unknown }> = [];
  const confirms = { answer: true, asked: [] as string[] };
  const location = {
    origin: 'https://noshores.online',
    pathname: '/panel/',
    hostname: 'noshores.online',
    hash,
  };
  const window = {
    Event: globalThis.Event,
    addEventListener: (type: string, listener: (typeof listeners)[string]) => void (listeners[type] = listener),
    history: {
      replaceState: (_state: unknown, _title: string, url: string) =>
        void (location.hash = new URL(url, `${location.origin}${location.pathname}`).hash),
    },
    confirm: (question: string) => {
      confirms.asked.push(question);
      return confirms.answer;
    },
  };
  const fetch = async (url: string, init: RequestInit): Promise<Response> => {
    const path = url.replace(BOT_ORIGIN, '');
    const headers = (init.headers ?? {}) as Record<string, string>;
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
    calls.push({ method: init.method ?? 'GET', path, auth: headers.authorization ?? '', body });
    const held = await answer(path, init);
    return held instanceof Response ? held : new Response(JSON.stringify(held), { status: 200 });
  };
  // the storage every tab of the site shares, and this tab's own
  const shared = memoryStorage();
  const ownTab = memoryStorage(token ? { [TOKEN_KEY]: token } : {});
  const globals: { location: typeof location; [name: string]: unknown } = {
    location,
    window,
    fetch,
    localStorage: shared,
    sessionStorage: ownTab,
  };
  const move = (next: string): void => {
    const oldURL = `${location.origin}${location.pathname}${location.hash}`;
    location.hash = next;
    listeners.hashchange?.({ oldURL });
  };
  return { globals, calls, listeners, move, confirms, shared, ownTab };
}

const textOf = (root: FakeElement): string => root.textContent;

test('the panel is a site page, named in the foot as Discord bot, built with its own sheet and script', () => {
  assert.equal(PANEL.folder, 'panel');
  assert.equal(PANEL.inBar, false);
  const built = makePage(SOURCE, PANEL);
  assert.match(built, /<a aria-current="page" href="\/panel\/">Discord bot<\/a>/, 'the foot links it');
  const home = SITE_PAGES.find((page) => page.id === 'home') ?? assert.fail();
  const homeSource = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(makePage(homeSource, home), /<a href="\/panel\/">Discord bot<\/a>/, 'and so does every other page');
  assert.match(built, /<link rel="stylesheet" href="\/src\/panel\/panel\.css" \/>/);
  assert.match(built, /<main id="main">[\s\S]*<div class="bot-panel" id="app" tabindex="-1">[\s\S]*<\/main>/);
  assert.match(built, /<meta name="referrer" content="no-referrer" \/>/, "a picture's host is not told the page");
  assert.equal([...built.matchAll(/<script\b/g)].length, 1, 'one script, its own');
  assert.match(built, /<script type="module" src="\/src\/panel\/panelPage\.ts"><\/script>/);
  assert.match(built, /<img class="frame" alt="[^"]+" src="\/art\/bell\.png\?v=[0-9a-f]{8}"/);
  assert.doesNotMatch(
    built,
    /aria-live/,
    'a page redrawn whole is not read out whole: its status lines say what changed',
  );
});

test("the panel's policy is the site's but for its own script, the bot alone to talk to, and pictures from https", () => {
  const part = (policy: string, name: string): string | undefined =>
    policy.split('; ').find((one) => one.startsWith(`${name} `));
  assert.equal(policyOf(PANEL), PANEL_POLICY);
  assert.equal(part(PANEL_POLICY, 'script-src'), "script-src 'self'");
  assert.equal(part(PANEL_POLICY, 'connect-src'), `connect-src ${BOT_ORIGIN}`);
  assert.equal(part(PANEL_POLICY, 'img-src'), "img-src 'self' https:");
  for (const name of ['default-src', 'style-src', 'font-src', 'base-uri', 'form-action'])
    assert.equal(part(PANEL_POLICY, name), part(CONTENT_POLICY, name), name);
  assert.doesNotMatch(PANEL_POLICY, /localhost|127\.0\.0\.1|http:|'unsafe/);
  for (const page of SITE_PAGES.filter((each) => each !== PANEL)) assert.equal(policyOf(page), CONTENT_POLICY, page.id);
});

test("the skip link takes the focus to the panel and leaves the panel's hash alone", () =>
  withDocument(() => {
    const page = new FakeElement('body');
    const skip = new FakeElement('a');
    skip.setAttribute('class', 'skip');
    const app = new FakeElement('div');
    let focused = false;
    app.focus = () => void (focused = true);
    page.append(skip, app);
    const lookup = { querySelector: (name: string) => page.querySelector(name), getElementById: () => app };
    assert.equal(skipToPanel(lookup as unknown as Document), true);
    let stopped = false;
    skip.dispatchEvent({ type: 'click', preventDefault: () => void (stopped = true) });
    assert.deepEqual([stopped, focused], [true, true]);
    const empty = { querySelector: () => null, getElementById: () => null };
    assert.equal(skipToPanel(empty as unknown as Document), false);
  }));

test('signed out, the panel offers Discord and asks to come back to this page; the ticket it brings is traded', async () => {
  const token = 'T'.repeat(43);
  const world = browser('', (path) =>
    path === '/v1/auth/exchange' ? { token } : { user: { globalName: 'Mara' }, guilds: [], owner: false },
  );
  await withDocument(async () => {
    const root = new FakeElement('div');
    startPanel(root as unknown as HTMLElement);
    await settle();
    assert.deepEqual(Object.keys(world.listeners).sort(), ['beforeunload', 'hashchange']);
    const door = root.find((node) => node.tagName === 'A' && node.textContent === 'Sign in with Discord');
    const signIn = new URL(door?.attrs.href ?? '');
    assert.equal(`${signIn.origin}${signIn.pathname}`, `${BOT_ORIGIN}/v1/auth/discord`);
    assert.equal(signIn.searchParams.get('to'), 'https://noshores.online/panel/');
    assert.doesNotMatch(textOf(root), /DFO/);
    door?.click();
    // Discord's round trip comes back with a ticket in the hash: it is traded for a session, then the servers read
    world.move('#ticket=abc');
    await settle(10);
    const asked = world.calls.map((call) => `${call.method} ${call.path}`);
    assert.deepEqual(asked.slice(-2), ['POST /v1/auth/exchange', 'GET /v1/panel/me']);
    assert.equal(world.calls.at(-1)?.auth, `Bearer ${token}`);
    assert.match(textOf(root), /Signed in as Mara/);
    assert.match(textOf(root), /Your servers/);
    assert.equal(world.ownTab.items.get(TOKEN_KEY), token, "the session is kept in this tab's own storage");
    assert.equal(world.shared.items.size, 0, "and nothing of it where the site's other pages could read it");
  }, world.globals);
});

test('a tab whose storage the browser blocks trades no ticket, and the page says what sign-in needs', async () => {
  const world = browser('', () => ({ token: 'T'.repeat(43) }));
  const refuse = (): never => {
    throw new Error('denied');
  };
  world.globals.sessionStorage = { getItem: refuse, setItem: refuse, removeItem: refuse };
  await withDocument(async () => {
    const root = new FakeElement('div');
    startPanel(root as unknown as HTMLElement);
    await settle();
    root.find((node) => node.tagName === 'A' && node.textContent === 'Sign in with Discord')?.click();
    world.move('#ticket=abc');
    await settle();
    assert.deepEqual(world.calls, [], 'the ticket is never sent');
    assert.equal(
      root.find((node) => node.attrs.role === 'alert')?.textContent,
      'Your browser blocks the site data that sign-in needs. Allow site data for this site, then sign in again.',
    );
  }, world.globals);
});

test("an answer that comes back after the person moved on draws nothing, so one server's page never stands under another's address", async () => {
  let releaseA = (): void => {};
  const entry = (who: string) => ({
    id: 1,
    at: 1,
    actorName: who,
    actorId: '1',
    action: 'module.save',
    target: 'welcome',
  });
  const world = browser(
    `#g=${SERVER_A}&audit`,
    async (path) => {
      if (path === '/v1/panel/me') return { user: { username: 'ann' }, guilds: [] };
      if (path === `/v1/panel/g/${SERVER_A}/audit`) {
        await new Promise<void>((resolve) => (releaseA = resolve));
        return { entries: [entry('from server A')] };
      }
      return { entries: [entry('from server B')] };
    },
    'panel-token',
  );
  await withDocument(async () => {
    const root = new FakeElement('div');
    startPanel(root as unknown as HTMLElement);
    await settle();
    world.move(`#g=${SERVER_B}&audit`);
    await settle();
    assert.ok(
      root.find((node) => node.textContent === 'from server B'),
      'the page moved to is drawn',
    );
    releaseA();
    await settle();
    assert.ok(!root.find((node) => node.textContent === 'from server A'), 'the slow answer draws nothing');
    assert.ok(root.find((node) => node.textContent === 'from server B'));
  }, world.globals);
});

test("a module's page saves its settings with their revision, and the bot's refusal lands on its field", async () => {
  let refuse = false;
  const overview = {
    guild: { id: SERVER_A, name: 'Saltmere', icon: null, memberCount: 12 },
    level: 'owner',
    modules: [],
    channels: [{ id: '900000000000000030', name: 'general', type: 0, parentId: null, position: 1 }],
    roles: [],
    emojis: [],
  };
  const saved = {
    config: { panelGrants: [], problemsChannel: '', accent: '#8a5a2b' },
    enabled: true,
    rev: 4,
    canEdit: true,
  };
  const world = browser(
    `#g=${SERVER_A}&m=core`,
    (path, init) => {
      if (path === '/v1/panel/me') return { user: { username: 'ann' }, guilds: [], owner: true };
      if (path === `/v1/panel/g/${SERVER_A}`) return overview;
      if (init.method === 'PUT' && refuse) {
        const refusal = { error: 'invalid', errors: [{ path: 'accent', message: 'Use a # and six hex digits.' }] };
        return new Response(JSON.stringify(refusal), { status: 400 });
      }
      if (init.method === 'PUT') return { rev: 5, config: saved.config, enabled: true };
      return saved;
    },
    'panel-token',
  );
  await withDocument(async () => {
    const root = new FakeElement('div');
    startPanel(root as unknown as HTMLElement);
    await settle(10);
    assert.match(textOf(root), /Bot settings/);
    buttonsNamed(root, 'Save')[0]?.click();
    await settle();
    const put = world.calls.find((call) => call.method === 'PUT');
    assert.equal(put?.path, `/v1/panel/g/${SERVER_A}/m/core`);
    assert.deepEqual(put?.body, { config: saved.config, enabled: true, rev: 4 });
    assert.ok(root.find((node) => node.attrs.role === 'status' && node.textContent === 'Saved.'));
    refuse = true;
    buttonsNamed(root, 'Save')[0]?.click();
    await settle();
    assert.equal(
      (world.calls.filter((call) => call.method === 'PUT').at(-1)?.body as { rev?: number } | undefined)?.rev,
      5,
      'the next save names the new revision',
    );
    const errors = root
      .querySelectorAll('.field-error')
      .map((node) => node.textContent)
      .filter(Boolean);
    assert.deepEqual(errors, ['Use a # and six hex digits.']);
  }, world.globals);
});

test('a sign-in that came back refused says why in words and clears the address', async () => {
  const world = browser('#error=denied', () => ({}));
  await withDocument(async () => {
    const root = new FakeElement('div');
    startPanel(root as unknown as HTMLElement);
    await settle();
    assert.equal(root.find((node) => node.attrs.role === 'alert')?.textContent, 'Discord sign-in was cancelled.');
    assert.equal(world.globals.location.hash, '');
    world.move('#error=<b>made-up</b>');
    await settle();
    assert.equal(root.find((node) => node.attrs.role === 'alert')?.textContent, 'Sign-in did not finish. Try again.');
  }, world.globals);
});

test("a save the bot refuses for any other reason shows the bot's own words", async () => {
  const overview = {
    guild: { id: SERVER_A, name: 'Saltmere', icon: null, memberCount: 12 },
    level: 'owner',
    modules: [],
    channels: [],
    roles: [],
  };
  const saved = {
    config: { panelGrants: [], problemsChannel: '', accent: '#8a5a2b' },
    enabled: true,
    rev: 4,
    canEdit: true,
  };
  const world = browser(
    `#g=${SERVER_A}&m=core`,
    (path, init) => {
      if (path === '/v1/panel/me') return { user: { username: 'ann' }, guilds: [] };
      if (path === `/v1/panel/g/${SERVER_A}`) return overview;
      if (init.method === 'PUT')
        return new Response(JSON.stringify({ error: 'stale', message: 'Someone saved this first.' }), { status: 409 });
      return saved;
    },
    'panel-token',
  );
  await withDocument(async () => {
    const root = new FakeElement('div');
    startPanel(root as unknown as HTMLElement);
    await settle(10);
    const save = buttonsNamed(root, 'Save')[0];
    save?.click();
    assert.equal(save?.disabled, true, 'one save at a time');
    await settle();
    assert.equal(save?.disabled, false);
    assert.ok(root.find((node) => node.attrs.role === 'status' && node.textContent === 'Someone saved this first.'));
  }, world.globals);
});

test('a page with changes not saved asks before it is left or signed out of, and stays where the person says no', async () => {
  const overview = {
    guild: { id: SERVER_A, name: 'Saltmere', icon: null, memberCount: 12 },
    level: 'owner',
    modules: [],
    channels: [],
    roles: [],
  };
  const saved = {
    config: { panelGrants: [], problemsChannel: '', accent: '#8a5a2b' },
    enabled: true,
    rev: 4,
    canEdit: true,
  };
  const page = `#g=${SERVER_A}&m=core`;
  const world = browser(
    page,
    (path, init) => {
      if (path === '/v1/panel/me') return { user: { username: 'ann' }, guilds: [] };
      if (path === `/v1/panel/g/${SERVER_A}`) return overview;
      if (init.method === 'PUT') return { rev: 5, config: saved.config, enabled: true };
      return saved;
    },
    'panel-token',
  );
  await withDocument(async () => {
    const root = new FakeElement('div');
    startPanel(root as unknown as HTMLElement);
    await settle(10);
    const closingAsks = (): boolean => {
      let stopped = false;
      world.listeners.beforeunload?.({ preventDefault: () => void (stopped = true) });
      return stopped;
    };
    const colour = (): FakeElement | undefined => boxFor(root, 'Card colour');
    assert.equal(closingAsks(), false, 'nothing changed: the tab closes without a question');
    colour()?.type('#123456');
    assert.equal(closingAsks(), true, 'a change not saved: the browser asks before the tab closes');
    buttonsNamed(root, 'Save')[0]?.click();
    await settle();
    assert.equal(closingAsks(), false, 'once saved, it does not');
    colour()?.type('#654321');
    world.confirms.answer = false;
    world.move('#');
    await settle();
    assert.deepEqual(world.confirms.asked, ['This page has changes that are not saved. Leave it?']);
    assert.equal(world.globals.location.hash, page, 'a no puts the address back');
    assert.equal(colour()?.value, '#654321', 'and the change is still there');
    buttonsNamed(root, 'Sign out')[0]?.click();
    await settle();
    assert.equal(world.confirms.asked.length, 2, 'signing out asks too');
    assert.ok(!world.calls.some((call) => call.path === '/v1/auth/logout'), 'and a no keeps the person signed in');
    assert.equal(colour()?.value, '#654321');
    world.confirms.answer = true;
    world.move('#');
    await settle(10);
    assert.equal(world.confirms.asked.length, 3);
    assert.match(textOf(root), /Your servers/, 'a yes leaves');
  }, world.globals);
});

test('a public leaderboard needs no sign-in, offers more while a page of a hundred comes back full, and says when it is not public', async () => {
  const rows = (from: number, count: number) =>
    Array.from({ length: count }, (_row, i) => ({ rank: from + i, name: `Sailor ${from + i}`, level: 3, xp: 120 }));
  const world = browser(`#lb=${SERVER_A}`, (path) => {
    if (path === `/v1/public/levels/${SERVER_A}?offset=0`) return { guild: { name: 'Saltmere' }, rows: rows(1, 100) };
    if (path === `/v1/public/levels/${SERVER_A}?offset=100`) return { guild: { name: 'Saltmere' }, rows: rows(101, 3) };
    return new Response(JSON.stringify({ error: 'board' }), { status: 404 });
  });
  await withDocument(async () => {
    const root = new FakeElement('div');
    startPanel(root as unknown as HTMLElement);
    await settle();
    const cellsOf = (rank: number): string[] | undefined =>
      root
        .findAll((node) => node.tagName === 'TR')
        .map((line) => line.children.map((cell) => cell.textContent))
        .find((cells) => cells[0] === String(rank));
    assert.equal(root.querySelector('h2')?.textContent, 'Saltmere: leaderboard');
    assert.deepEqual(cellsOf(1), ['1', 'Sailor 1', '3', '120']);
    assert.ok(!root.find((node) => node.textContent === 'Sign in with Discord'), 'no sign-in is asked for');
    const more = buttonsNamed(root, 'More')[0];
    assert.equal(more?.hidden, false, 'a full page: there may be more');
    more?.click();
    await settle();
    assert.deepEqual(cellsOf(103), ['103', 'Sailor 103', '3', '120']);
    assert.equal(root.findAll((node) => node.tagName === 'TR').length, 104, 'the head and every row, each once');
    assert.equal(more?.hidden, true, 'fewer than a hundred: the last page');
    assert.deepEqual(
      world.calls.map((call) => call.path),
      [`/v1/public/levels/${SERVER_A}?offset=0`, `/v1/public/levels/${SERVER_A}?offset=100`],
    );
    world.move(`#lb=${SERVER_B}`);
    await settle();
    assert.equal(root.find((node) => node.attrs.role === 'status')?.textContent, 'This leaderboard is not public.');
    assert.equal(buttonsNamed(root, 'More')[0]?.hidden, true);
    world.move('#lb=not-a-server');
    await settle();
    assert.ok(
      root.find((node) => node.textContent === 'Sign in with Discord'),
      'only a server id opens a board',
    );
  }, world.globals);
});
