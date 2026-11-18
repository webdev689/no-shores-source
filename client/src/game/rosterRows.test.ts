import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Person, Roster } from '../network/accounts.ts';
import { actionsFor, friendRows, gameRows, guildRows, pagesOf, placeWords } from './rosterRows.ts';

const person = (name: string, place: string | null = 'node-overlook-social', tag: string | null = null): Person => ({
  name,
  tag,
  emblem: 'overlook',
  level: 20,
  place,
});

const roster = (more: Partial<Roster> = {}): Roster => ({
  me: person('Ada'),
  privacy: 'Friends Only',
  company: null,
  invites: [],
  nearby: [],
  guests: 0,
  friends: [],
  asking: [],
  asked: [],
  guild: null,
  guildInvites: [],
  blocked: [],
  ...more,
});

const labels = (from: Roster, name: string, place: string | null = 'node-overlook-social') =>
  actionsFor(from, person(name, place)).map((action) => action.label);

test('where a player is reads as its place: a node by name and its seas, the sea, or away', () => {
  assert.equal(placeWords('node-overlook-social'), 'Overlook');
  assert.equal(placeWords('node-saltgrass-downs--rough'), 'Saltgrass Downs · Rough seas');
  assert.equal(placeWords('sea'), 'At sea');
  assert.equal(placeWords(null), 'Away');
});

test('the Game column holds invites, then the company leader first, then those nearby by name', () => {
  const company = { leader: 'Cal', members: [person('Cal'), person('Ada')] };
  const rows = gameRows(roster({ company, invites: [person('Eve')], nearby: [person('Zed'), person('Ben')] }));
  assert.deepEqual(
    rows.map((row) => [row.person.name, row.leads]),
    [
      ['Eve', false],
      ['Cal', true],
      ['Ada', false],
      ['Ben', false],
      ['Zed', false],
    ],
  );
  assert.deepEqual(
    gameRows(roster()).map((row) => [row.person.name, row.leads]),
    [['Ada', true]],
    'alone, leading',
  );
});

test('the Friends column asks first, then playing, then asked, then away, greyed', () => {
  const rows = friendRows(
    roster({
      friends: [person('Zed', null), person('Ben'), person('cal', 'sea')],
      asking: [person('Eve')],
      asked: [person('Fay', null)],
    }),
  );
  assert.deepEqual(
    rows.map((row) => [row.person.name, row.words, row.dim]),
    [
      ['Eve', 'Wants to be friends', false],
      ['Ben', 'Overlook', false],
      ['cal', 'At sea', false],
      ['Fay', 'Asked to be friends', true],
      ['Zed', 'Away', true],
    ],
  );
});

test('each player offers what their place in the lists allows, and what cannot be undone is held', () => {
  const guild = {
    name: 'The Saltwake',
    tag: 'SWK',
    motto: '',
    rank: 'Founder',
    members: [
      { ...person('Ada'), rank: 'Founder' },
      { ...person('Ben'), rank: 'Admin' },
    ],
    invited: [],
  };
  const lists = roster({ friends: [person('Ben')], guild });
  assert.deepEqual(labels(lists, 'Ben'), [
    'Details',
    'Join company',
    'Invite to company',
    'Remove friend',
    'Make member',
    'Make founder',
    'Remove from guild',
    'Block',
    'Report',
  ]);
  assert.ok(actionsFor(lists, person('Ben')).filter((action) => action.held).length >= 4);
  assert.deepEqual(
    labels(lists, 'Cal', null),
    ['Details', 'Add friend', 'Invite to guild', 'Block', 'Report'],
    'away: no join',
  );
  assert.deepEqual(labels(lists, 'Ada'), ['Details', 'Leave guild'], 'oneself');
  const full = roster({ company: { leader: 'Ada', members: [person('Ada'), person('Ben'), person('Cal')] } });
  assert.ok(!labels(full, 'Dee').includes('Invite to company'), 'a full company invites no one');
  assert.ok(labels(full, 'Ben').includes('Remove from company'), 'its leader removes');
  assert.ok(!labels(full, 'Ben').includes('Go to them'), 'in the same room');
  assert.ok(labels(full, 'Cal', 'node-saltgrass-downs').includes('Go to them'), 'a member playing elsewhere');
  assert.ok(!labels(full, 'Cal', null).includes('Go to them'), 'a member away');
});

test('the Guild column ranks each member, playing first, then those invited', () => {
  const guild = {
    name: 'The Saltwake',
    tag: 'SWK',
    motto: '',
    rank: 'Member',
    members: [
      { ...person('Zed', null), rank: 'Member' },
      { ...person('Ada'), rank: 'Founder' },
    ],
    invited: [person('Eve', null)],
  };
  assert.deepEqual(
    guildRows(roster({ guild })).map((row) => row.words),
    ['Founder · Overlook', 'Member · Away', 'Invited to the guild'],
  );
  assert.equal(pagesOf(new Array(29)), 3, 'fourteen a page');
  assert.equal(pagesOf([]), 1);
});
