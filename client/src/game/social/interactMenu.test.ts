import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Person, Roster } from '../../network/accounts.ts';
import { interactRows } from './interactMenu.ts';

const person = (name: string, more: Partial<Person> = {}): Person => ({
  name,
  tag: null,
  emblem: null,
  level: 6,
  place: 'node-overlook-social',
  ...more,
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
const shown = (rows: ReturnType<typeof interactRows>) => rows.map((row) => [row.label, row.path ?? row.why ?? '']);

test('a stranger may be asked as a friend and invited to the company; the guild needs one', () => {
  assert.deepEqual(shown(interactRows(roster(), person('Ben'), '')), [
    ['Add friend', 'friend/ask'],
    ['Invite to company', 'company/invite'],
    ['Invite to guild', 'You are in no guild'],
    ['Whisper', ''],
    ['Inspect', ''],
    ['Mute', 'mute'],
  ]);
  assert.deepEqual(shown(interactRows(roster({ muted: ['Ben'] }), person('Ben'), '')).at(-1), ['Unmute', 'unmute']);
});

test('what cannot be done now stands greyed with why', () => {
  const guild = {
    name: 'The Saltwake',
    tag: 'SWK',
    motto: '',
    rank: 'Founder',
    members: [{ ...person('Ada'), rank: 'Founder' }],
    invited: [],
  };
  const ben = person('Ben');
  const known = roster({ friends: [ben], company: { leader: 'Ada', members: [person('Ada'), ben] }, guild });
  assert.deepEqual(shown(interactRows(known, ben, '')).slice(0, 3), [
    ['Add friend', 'Already friends'],
    ['Invite to company', 'In your company'],
    ['Invite to guild', 'guild/invite'],
  ]);
  const led = roster({ company: { leader: 'Cal', members: [person('Ada'), person('Cal')] } });
  assert.deepEqual(shown(interactRows(led, ben, ''))[1], ['Invite to company', 'Only the leader invites']);
});

test('with no Roster, only whispering and inspecting are offered', () => {
  const rows = interactRows(null, null, 'Add a username in Settings');
  assert.deepEqual(
    rows.filter((row) => !row.why).map((row) => row.label),
    ['Whisper', 'Inspect'],
  );
});
