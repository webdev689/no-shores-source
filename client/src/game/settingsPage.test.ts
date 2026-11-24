import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BINDS } from '../player/input.ts';
import { AccountPanel } from './accountTab.ts';
import { drawn, fakeLink, fakePage, heard, settle } from './menuPagesForTests.ts';
import { Rebinding } from './rebinding.ts';
import { resolution } from './renderScale.ts';
import { SETTINGS_TABS, Settings, type SettingsTab, titleAddress } from './settingsPage.ts';

/** Settings drawn at `tab`, its account `account` (none offline), leaving or closing `page`. */
function settingsAt(tab: SettingsTab, account: AccountPanel | null = null, page = fakePage().page) {
  const rebinding = new Rebinding();
  const settings = new Settings(() => account, page, rebinding);
  settings.show(tab);
  return { settings, rebinding, ...drawn((context) => settings.node(context)) };
}

/** A press `id` held down for `seconds` in sixtieths, then let go. */
function hold(page: ReturnType<typeof settingsAt>, id: string, seconds: number): void {
  const point = page.middle(id);
  page.frame([
    { kind: 'pointer', ...point },
    { kind: 'down', ...point, button: 0 },
  ]);
  for (let step = 0; step < seconds * 60; step++) page.frame([], 1 / 60);
  page.frame([{ kind: 'up', ...point, button: 0 }]);
}

test('Settings stands in tabs, Graphics, Audio, Controls and Account, each a press showing its own', () => {
  const page = settingsAt('graphics');
  page.frame();
  assert.match(page.shows(), /^GRAPHICS \| AUDIO \| CONTROLS \| ACCOUNT \| EXIT TO MENU \| EXIT TO DESKTOP/);
  assert.match(page.shows(), /DISPLAY \| Resolution \| Auto/);
  for (const { id } of SETTINGS_TABS) {
    page.click(`settings-${id}`);
    assert.equal(page.settings.tab, id);
  }
  assert.match(page.shows(), /ACCOUNT \| Playing offline: there is no account\./);
  page.click('settings-audio');
  assert.match(page.shows(), /VOLUME \| Interface sounds .* World sounds .* Music .* Ambience/);
  assert.ok(page.ui.boxOf('volume-music'), 'the music slider is laid');
});

test('the resolution chosen from its list is the one drawn at, and shown', () => {
  const page = settingsAt('graphics');
  page.frame();
  page.click('resolution');
  page.click('resolution:0.75');
  assert.equal(resolution(), '0.75');
  assert.match(page.shows(), /Resolution \| 75%/);
  page.click('resolution');
  page.click('resolution:auto');
  assert.equal(resolution(), 'auto');
});

test('the sound credits stand behind a press of their own in Audio; their links open, and Escape steps back', () => {
  const { page: browser, done } = fakePage();
  const page = settingsAt('audio', null, browser);
  page.frame();
  assert.match(page.shows(), /CREDITS \| Sound credits \| View/);
  assert.ok(!page.shows().includes('Freesound'), 'no credit is listed until asked for');
  page.click('settings-credits');
  assert.match(page.shows(), /‹ Audio \| SOUND CREDITS \| Each plays at the game's own level\./);
  assert.ok(!page.shows().includes('Interface sounds'), 'in the volumes’ place');
  page.click('credit-0-source');
  assert.match(done[0] ?? '', /^open https:\/\/freesound\.org\//);
  assert.equal(page.settings.back(), true);
  page.frame();
  assert.ok(page.shows().includes('Interface sounds'));
  assert.equal(page.settings.back(), false, 'with nothing open the menu takes the step');
  page.click('settings-credits');
  page.click('settings-credits-back');
  assert.ok(page.shows().includes('Interface sounds'), 'its own press back');
});

test('Controls lists every control as the sheet does; a key chosen waits for its new one, and another tab gives it up', () => {
  const page = settingsAt('controls');
  page.frame();
  assert.match(page.shows(), /CONTROLS \| Reset to defaults \| Choose a key or button, then press its new one\./);
  for (const group of ['MOVE', 'FIGHT', 'ARTS', 'CAMERA', 'MENUS', 'SEA', 'SEA FIGHT'])
    assert.ok(page.shows().includes(group), group);
  assert.ok(page.shows().includes('Hold to leave'));
  page.click('controls:jump:keys:0');
  assert.deepEqual(page.rebinding.slot, { id: 'jump', device: 'keys', place: 0 });
  page.frame();
  assert.match(page.shows(), /Press a key or button · Esc cancels/);
  page.settings.show('audio');
  assert.equal(page.rebinding.slot, null, 'given up as the tab changes');
  page.settings.show('controls');
  page.frame();
  page.click('controls:jump:keys:0');
  page.rebinding.key('j');
  assert.deepEqual(BINDS.now.jump.keys, ['j']);
  page.click('settings-reset');
  assert.deepEqual(BINDS.now.jump.keys, [' '], 'reset to defaults');
});

test('Exit to Menu and Exit to Desktop act only once held; the menu is the title, the desktop the window closed', async () => {
  const { page: browser, done } = fakePage('https://game/?at=overlook-social&spawn=&room=wss://rooms');
  const page = settingsAt('graphics', null, browser);
  page.frame();
  page.click('settings-exit-menu');
  page.click('settings-exit-desktop');
  assert.deepEqual(done, [], 'a click does nothing');
  hold(page, 'settings-exit-menu', 2);
  assert.deepEqual(done, ['assign https://game/?room=wss%3A%2F%2Frooms']);
  hold(page, 'settings-exit-desktop', 2);
  assert.deepEqual(done.at(-1), 'close');
  await new Promise((wait) => setTimeout(wait, 600));
  page.frame();
  assert.match(page.shows(), /Your browser keeps this tab open\. Close it to leave the game\./);
  page.settings.show('audio');
  page.frame();
  assert.ok(!page.shows().includes('Your browser keeps'), 'said once, until another tab is shown');
});

test('the title’s address keeps the rooms asked for and drops what goes past the title', () => {
  assert.equal(titleAddress('https://game/'), 'https://game/');
  assert.equal(titleAddress('https://game/?room=wss://rooms'), 'https://game/?room=wss://rooms', 'as it was');
  assert.equal(
    titleAddress('https://game/no-shores-source/?at=x&spawn=1,2&view=first&arrival=1&prologue=wreck&run=2&perf'),
    'https://game/no-shores-source/?perf=',
  );
});

test('signed in, the words typed in the fields sign in to another account; a refusal is said', async () => {
  const { link, asked } = fakeLink({ id: 'a', username: 'Ana', discord: false, guest: false });
  const { page: browser, done } = fakePage();
  const settings = settingsAt('account', new AccountPanel(link, browser), browser);
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
  const { page: browser, done } = fakePage();
  const settings = settingsAt('account', new AccountPanel(link, browser), browser);
  await settle();
  settings.frame();
  assert.match(settings.shows(), /You play as a guest/);
  assert.ok(!settings.shows().includes('Sign in to another account'));
  settings.click('account-out');
  await settle();
  assert.ok(!asked.includes('logout'), 'a click does not sign out');
  hold(settings, 'account-out', 1);
  await settle();
  assert.ok(asked.includes('logout'), 'held, it signs out');
  assert.deepEqual(done, ['reload']);
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
  const settings = settingsAt('account', new AccountPanel(link, fakePage().page));
  await settle();
  settings.frame();
  assert.match(settings.shows(), /The accounts cannot be reached: your character is not kept\. \| Try again/);
  assert.equal(settings.ui.boxOf('account-name'), null, 'no fields with nothing to sign in to');
});

test('a blocked player is unblocked, the focus kept on the list', async () => {
  const { link, asked } = fakeLink({ id: 'a', username: 'Ana', discord: false, guest: false });
  const settings = settingsAt('account', new AccountPanel(link, fakePage().page));
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
  const settings = settingsAt('account', new AccountPanel(link, fakePage().page));
  await settle();
  settings.frame();
  assert.match(settings.shows(), /MUTED PLAYERS \| Wren \| Unmute/);
  // Under the fold of a 720-line view: scrolled to, as the wheel would.
  settings.ui.scrollBy('settings-list', 10_000);
  settings.frame();
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
