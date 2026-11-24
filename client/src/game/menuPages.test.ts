import assert from 'node:assert/strict';
import { test } from 'node:test';
import { laterPage, shipPage } from './menuPages.ts';
import { ROSTER, drawn, fakeLink, heard, person, settle } from './menuPagesForTests.ts';
import { RosterPage, socialPage } from './rosterTab.ts';

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
