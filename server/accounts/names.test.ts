import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { accounts } from './accountsForTests.ts';
import { BLOCKED } from './blockedWords.ts';
import { blocked, refusalOf, reserved, skeleton } from './names.ts';

const SWAPPED: Readonly<Record<string, string>> = { a: '4', e: '3', i: '1', o: '0', s: '5', t: '7' };

/** The ways a player might dress a root to slip it past: the words are built here, so the test shows none. */
function dressed(root: string): string[] {
  const upper = root.toUpperCase();
  const ways = [
    root,
    upper,
    root.replace(/[aeiost]/g, (letter) => SWAPPED[letter] ?? letter),
    root.replace(/a/g, '@').replace(/s/g, '$'),
    `${root}${root.at(-1) ?? ''}${root.at(-1) ?? ''}`,
    [...root].join(' '),
    [...root].join('-'),
    [...root].join('.'),
    [...root].join('_'),
    `${root.slice(0, 2)} ${root.slice(2)}`,
    `${root.slice(0, 3)} ${root.slice(3)}`,
    `${upper.slice(0, 2)}${root.slice(2)}`,
    `Big_${upper[0] ?? ''}${root.slice(1)}`,
    `Big${upper[0] ?? ''}${root.slice(1)}`,
    `the ${root} crew`,
  ];
  return root.length >= 4 ? [...ways, `x${root}y`, `Sir${root}alot`, `${root[0] ?? ''} ${root.slice(1)}ers`] : ways;
}

test('a blocked word is found however it is dressed', () => {
  assert.ok(BLOCKED.length >= 50 && BLOCKED.length <= 80, `${BLOCKED.length} roots`);
  for (const root of BLOCKED) for (const way of dressed(root)) assert.ok(blocked(way), JSON.stringify(way));
});

test('ordinary words and names pass, those that hold a short root among them', () => {
  const ordinary = [
    'Cassandra',
    'Bassoon',
    'Classic',
    'Assassin',
    'Embassy',
    'Mass Effect',
    'Sussex',
    'Middlesex',
    'Sextant',
    'Document',
    'Cucumber',
    'Cumbria',
    'Japan',
    'Fagan',
    'Wogan',
    'Swoop',
    'Yiddish',
    'Fukuoka',
    'Niger',
    'Nigeria',
    'Mississippi',
    'Arsenal',
    'Analyst',
    'Therapist',
    'Hancock',
    'Dickens',
    'Raccoon',
    'Conspicuous',
    'Squawk',
    'Lesbos',
    'Shih Tzu',
    'Nightwatch',
    'Saltwater Dogs',
    'Bit Chasers',
    'Mole Strike',
    "O'Neil's Sea-Dogs 2",
    'Old_Salt',
    'Mariner',
    'We push it to the limit.',
    'Crush it, then rest!',
    'This hit the mark.',
    'Wash it down with grog.',
    'Sail as one, fight as one.',
  ];
  for (const text of ordinary) assert.equal(blocked(text), false, text);
});

test('a name may not claim to speak for the game, whole or at its start or end', () => {
  const claims = ['Admin', 'ADMIN', 'Adm1n', '4dmin', 'Adrnin', 'Ad_min', 'Overlook Staff', 'Admin_Ray', 'Ray_Admin'];
  const ours = ['No Shores', 'NoShores_Ray', 'Ray_N0_Sh0res', 'No_Shores_Crew', 'N0Sh0r3s'];
  for (const name of [...claims, ...ours, 'AdminRay', 'Moderator', 'GM', 'Gm_Ray', 'Dev', 'Official_Overlook', 'Null'])
    assert.ok(reserved(name), name);
  const fair = ['Ray_Admin_Bob', 'Adminton', 'Modesty', 'Mood', 'Devon', 'Staffordshire', 'Guesthouse', 'Overlooked'];
  const nearOurs = ['Shores', 'No_Ray', 'Ray_No_Shoresmen', 'G_M_Hopkins', 'Mo_D_Ray'];
  for (const name of [...fair, ...nearOurs]) assert.equal(reserved(name), false, name);
  assert.equal(refusalOf('username', 'Overlook_Staff'), 'That name is not allowed. Choose another.');
  assert.equal(refusalOf('guild', 'The Moderators'), null, 'only the words as they are');
  assert.equal(refusalOf('tag', 'GM'), 'That tag is not allowed. Choose another.');
  assert.equal(refusalOf('motto', 'Support each other.'), null, 'a motto claims no name');
});

test('names told apart only by look-alike letters share a skeleton', () => {
  for (const name of ['Mar1ner', 'MARlNER', 'Mari_ner', 'Mariner'])
    assert.equal(skeleton(name), skeleton('Mariner'), name);
  assert.equal(skeleton('VVade'), skeleton('Wade'));
  assert.equal(skeleton('Barn'), skeleton('Bam'));
  assert.equal(skeleton('5ea D0gs'), skeleton("Sea-Dog's"));
  assert.notEqual(skeleton('Mariner'), skeleton('Marina'));
});

/** A world with a way to register a name, and to found a guild or set a motto as its own player. */
function world() {
  const { ask } = accounts();
  const named = async (username: string) => {
    const token = (await ask('POST', '/v1/guest')).body['token'] as string;
    const answer = await ask('POST', '/v1/register', { username, password: 'long enough' }, token);
    const social = (path: string, body: object) => ask('POST', `/v1/social/guild/${path}`, body, token);
    return { ...answer, social };
  };
  return { named };
}

test('a username is refused when blocked, reserved, taken or too like another', async () => {
  const { named } = world();
  const notAllowed = { error: 'That name is not allowed. Choose another.' };
  assert.deepEqual((await named(`Sir_${BLOCKED[0] ?? ''}`)).body, notAllowed);
  assert.deepEqual((await named('Admin_Ray')).body, notAllowed);
  assert.equal((await named('Mariner')).status, 200);
  assert.deepEqual((await named('MARINER')).body, { error: 'That username is taken.' });
  for (const like of ['Mar1ner', 'Mari_ner', 'Marlner'])
    assert.deepEqual((await named(like)).body, { error: "That name is too like another player's." }, like);
  assert.equal((await named('Marina')).status, 200);
});

test("a guild's name, tag and motto are judged as a username is", async () => {
  const { named } = world();
  const [ada, ben] = [await named('Ada'), await named('Ben')];
  assert.deepEqual((await ada.social('found', { name: 'Overlook Staff', tag: 'OS' })).body, {
    error: 'That name is not allowed. Choose another.',
  });
  assert.deepEqual((await ada.social('found', { name: 'Sea Dogs', tag: 'GM' })).body, {
    error: 'That tag is not allowed. Choose another.',
  });
  assert.equal((await ada.social('found', { name: 'Sea Dogs', tag: 'SD' })).status, 200);
  for (const like of ['Sea-Dogs', 'Sea D0gs', "Sea Dog's"])
    assert.deepEqual(
      (await ben.social('found', { name: like, tag: 'XY' })).body,
      { error: "That name is too like another guild's." },
      like,
    );
  assert.deepEqual((await ben.social('found', { name: 'sea dogs', tag: 'XY' })).body, {
    error: 'That name or tag is taken.',
  });
  const motto = `We are ${[...(BLOCKED[0] ?? '')].join(' ')} proud`;
  assert.deepEqual((await ada.social('motto', { motto })).body, { error: 'That motto is not allowed.' });
  assert.equal((await ada.social('motto', { motto: 'We push it to the limit!' })).status, 200);
});

test('the migration gives each kept username its skeleton, and a later look-alike none', () => {
  const sqlite = new DatabaseSync(':memory:');
  const folder = new URL('migrations/', import.meta.url);
  const names = readdirSync(folder)
    .filter((each) => each.endsWith('.sql'))
    .sort();
  const skeletons = names.findIndex((each) => each.endsWith('_name_skeletons.sql'));
  for (const name of names.slice(0, skeletons)) sqlite.exec(readFileSync(new URL(name, folder), 'utf8'));
  const kept = ['Mariner', 'VVarnl0ck_15', 'Old_Salt5', 'Mar1ner', null];
  const insert = sqlite.prepare('INSERT INTO accounts (id, username, created_at) VALUES (?, ?, ?)');
  kept.forEach((username, order) => insert.run(`account-${order}`, username, order));
  sqlite.exec(readFileSync(new URL(names[skeletons] ?? '', folder), 'utf8'));
  const rows = sqlite.prepare('SELECT username, name_skeleton FROM accounts ORDER BY created_at').all();
  const firsts = ['Mariner', 'VVarnl0ck_15', 'Old_Salt5'].map(skeleton);
  assert.deepEqual(
    rows.map((row) => row['name_skeleton']),
    [...firsts, null, null],
  );
});
