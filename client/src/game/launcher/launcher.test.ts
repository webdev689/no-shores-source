import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type DesktopInfo, useDesktop } from '../../desktop.ts';
import { Stack } from '../../ui/stack.ts';
import { drawn, settle } from '../menuPagesForTests.ts';
import { LAUNCHER_PASSED, launcherStanding, launcherWanted, openLauncher } from './launcher.ts';
import { DISCORD_INVITE, PLAY, serversWords } from './launcherNodes.ts';
import { LAST_PLAYED, type Notes } from './patchNotes.ts';

const app: DesktopInfo = {
  version: '2026.1125.1230',
  platform: 'windows',
  graphics: {
    chosen: 'auto',
    choices: ['auto', 'd3d12', 'd3d11'],
    launched: 'd3d12',
    running: 'D3D12',
    adapter: 'NVIDIA GeForce RTX 4070',
    held: false,
    restart: null,
  },
  update: { state: 'none' },
};

const notes: Notes = {
  from: 'read',
  notes: [
    { number: 212, title: 'Sailing at night', merged: '2026-11-24T18:00:00Z', lines: ['Lanterns light the deck.'] },
    { number: 205, title: 'Quieter gulls', merged: '2026-11-20T09:00:00Z', lines: ['Gulls call less often.'] },
  ],
};

/** A store of keys, as `localStorage` and `sessionStorage` are. */
const storeOf = (kept: Record<string, string> = {}) => ({
  kept,
  getItem: (key: string) => kept[key] ?? null,
  setItem: (key: string, value: string) => void (kept[key] = value),
});

/** The launcher opened in the app over a stack, drawn frame by frame, with what it opened and kept. */
function launched(read: Notes = notes, lastPlayed = '2026-11-22T00:00:00Z') {
  useDesktop(app, () => undefined);
  const stack = new Stack();
  const [local, session] = [storeOf({ [LAST_PLAYED]: lastPlayed }), storeOf()];
  const opened: string[] = [];
  let played = false;
  const playing = openLauncher(stack, { local, session }, '/play/', {
    readNotes: async () => read,
    askServer: async (health) => (health.includes('rooms') ? { state: 'up', ms: 38 } : { state: 'down' }),
    open: (address) => opened.push(address),
    now: () => new Date('2026-11-25T12:00:00Z'),
  }).then(() => (played = true));
  const page = drawn((context) => stack.node(context.ui), { width: 1600, height: 900 });
  /** Ends the launcher as a player does, so its server checks stop whether the test passed or failed. */
  const close = () => {
    if (launcherStanding()) page.click(PLAY);
    useDesktop(null, () => undefined);
  };
  return { page, local, session, opened, playing, played: () => played, close };
}

test('the launcher shows the notes newest first, new since last played marked, the servers, graphics and app', async () => {
  const { page, close } = launched();
  try {
    await settle();
    page.frame();
    page.frame();
    const shows = page.shows();
    assert.match(shows, /PATCH NOTES \| 1 NEW/);
    assert.match(shows, /Sailing at night \| NEW \| 24 November 2026 \| • {2}Lanterns light the deck\./);
    assert.match(shows, /Quieter gulls \| 20 November 2026/);
    assert.doesNotMatch(shows, /Quieter gulls \| NEW/, 'one merged before the last Play is not new');
    assert.match(shows, /SERVERS \| Rooms \| Online, 38 ms \| Accounts \| Not answering/);
    assert.match(shows, /DISPLAY \| Resolution .*APP \| Graphics API/);
    assert.match(shows, /Version \| 2026\.1125\.1230/);
    assert.match(shows, /A server is not answering, so Play may not get in\. Bugs go in #bug-reports\./);
    assert.equal(page.ui.focusedId, PLAY, 'Play has the focus');
  } finally {
    close();
  }
});

test('the links open in the browser, and Play goes on, keeping when the player played and that it stood', async () => {
  const { page, local, session, opened, playing, played, close } = launched();
  try {
    page.frame();
    page.click('launcher-discord');
    page.click('launcher-website');
    assert.deepEqual(opened, [DISCORD_INVITE, 'https://noshores.online/']);
    assert.equal(played(), false);
    assert.equal(launcherStanding(), true, 'the interface hears the keys and the pointer while it loads');
    page.click(PLAY);
    await playing;
    assert.equal(launcherStanding(), false);
    assert.equal(local.kept[LAST_PLAYED], '2026-11-25T12:00:00.000Z');
    assert.equal(launcherWanted(session), false, 'once a run');
    assert.ok(session.kept[LAUNCHER_PASSED]);
    page.frame();
    assert.doesNotMatch(page.shows(), /PATCH NOTES/, 'gone');
  } finally {
    close();
  }
});

test('with no notes to read, or only those kept, the launcher says so; a first launch marks nothing new', async () => {
  const none = launched({ from: 'none', notes: [] });
  try {
    await settle();
    none.page.frame();
    assert.match(none.page.shows(), /No patch notes could be read\./);
  } finally {
    none.close();
  }
  const kept = launched({ ...notes, from: 'kept' }, '');
  try {
    await settle();
    kept.page.frame();
    assert.match(kept.page.shows(), /The site did not answer: these are the notes last read\./);
    assert.doesNotMatch(kept.page.shows(), /\| NEW/);
  } finally {
    kept.close();
  }
});

test('the launcher stands only in the app, once a run', () => {
  assert.equal(launcherWanted(storeOf()), false, 'a browser has none');
  useDesktop(app, () => undefined);
  try {
    assert.equal(launcherWanted(storeOf()), true);
    assert.equal(launcherWanted(storeOf({ [LAUNCHER_PASSED]: '1' })), false);
  } finally {
    useDesktop(null, () => undefined);
  }
});

test('the servers are said together: checking, up, or one not answering', () => {
  assert.equal(serversWords([{ state: 'checking' }, { state: 'up', ms: 3 }]), 'Checking the servers.');
  assert.equal(
    serversWords([
      { state: 'up', ms: 3 },
      { state: 'up', ms: 9 },
    ]),
    'The servers are up.',
  );
  assert.match(serversWords([{ state: 'up', ms: 3 }, { state: 'down' }]), /not answering/);
});

test("the launcher's dropdowns open over it, and an option there is chosen", async () => {
  const { resolution, setResolution } = await import('../renderScale.ts');
  const before = resolution();
  const { page, close } = launched();
  try {
    page.frame();
    page.click('resolution');
    const drawn = page.ui.laid.map((each) => each.node.id);
    assert.ok(drawn.indexOf('resolution:list') > drawn.indexOf('launcher'), 'the list is drawn over the launcher');
    page.click('resolution:0.75');
    assert.equal(resolution(), '0.75');
  } finally {
    setResolution(before);
    close();
  }
});
