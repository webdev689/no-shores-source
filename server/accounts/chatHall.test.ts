import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Hall, type HallDeps, NAME_FIRST, NOT_ALLOWED, SIGN_IN, STRIKES_MOST, TOO_FAST, starred } from './chatHall.ts';

/** A socket that keeps what it is sent, and how it was closed. */
function socket() {
  const sent: unknown[] = [];
  const closed: { code: number; reason: string }[] = [];
  return {
    sent,
    closed,
    send: (text: string) => sent.push(JSON.parse(text)),
    close: (code: number, reason: string) => closed.push({ code, reason }),
  };
}

/** Three players by token: Ada and Ben in Overlook, Cal at sea; a guest in Overlook; Cal blocks Ada. */
function hall() {
  const clock = { now: 1_000 };
  const people: Record<string, { account: string; name: string | null; place: string | null }> = {
    ['a'.repeat(64)]: { account: 'ada', name: 'Ada', place: 'node-overlook-social' },
    ['b'.repeat(64)]: { account: 'ben', name: 'Ben', place: 'node-overlook-social' },
    ['c'.repeat(64)]: { account: 'cal', name: 'Cal', place: 'sea' },
    ['d'.repeat(64)]: { account: 'guest', name: null, place: 'node-overlook-social' },
  };
  const blocking = [['cal', 'ada']];
  const accounts = Object.values(people);
  const deps: HallDeps = {
    now: () => clock.now,
    speaker: async (token) => {
      const found = people[token];
      return found ? { account: found.account, name: found.name } : null;
    },
    places: async (asked) =>
      new Map(asked.map((id) => [id, accounts.find((each) => each.account === id)?.place ?? null])),
    apart: async (account) =>
      blocking.flatMap(([blocker, blocked]) =>
        blocker === account ? [blocked] : blocked === account ? [blocker] : [],
      ),
    named: async (name) => {
      const found = accounts.find((each) => each.name?.toLowerCase() === name.toLowerCase());
      return found?.name ? { account: found.account, name: found.name } : null;
    },
    blocks: async (blocker, blocked) => blocking.some(([one, two]) => one === blocker && two === blocked),
  };
  const chat = new Hall(deps);
  const join = async (letter: string) => {
    const held = socket();
    const number = chat.opened(held);
    await chat.heard(number, letter.repeat(64));
    held.sent.length = 0;
    return { ...held, say: (said: object) => chat.heard(number, JSON.stringify(said)) };
  };
  return { chat, clock, join };
}

const lines = (sent: readonly unknown[]) =>
  sent.flatMap((each) =>
    (each as { line?: { text: string } }).line ? [(each as { line: { text: string } }).line.text] : [],
  );

test('a token signs a socket in and names its player; anything else first is let go', async () => {
  const { chat } = hall();
  const held = socket();
  await chat.heard(chat.opened(held), 'a'.repeat(64));
  assert.deepEqual(held.sent, [{ welcome: { name: 'Ada' } }]);
  const stranger = socket();
  await chat.heard(chat.opened(stranger), 'e'.repeat(64));
  assert.deepEqual(stranger.closed, [{ code: 4003, reason: SIGN_IN }]);
  const rude = socket();
  await chat.heard(chat.opened(rude), 'hello');
  assert.equal(rude.closed[0]?.code, 1008);
});

test('Local reaches those in the same room, World everyone, and neither anyone kept apart', async () => {
  const { join } = hall();
  const [ada, ben, cal, guest] = [await join('a'), await join('b'), await join('c'), await join('d')];
  await ada.say({ say: '  hello   there ', channel: 'local' });
  assert.deepEqual(ada.sent, [{ line: { channel: 'local', from: 'Ada', text: 'hello there' } }]);
  assert.deepEqual(lines(ben.sent), ['hello there']);
  assert.deepEqual(lines(guest.sent), ['hello there'], 'a guest hears Local');
  assert.deepEqual(lines(cal.sent), [], 'at sea is another place');
  await ben.say({ say: 'all aboard', channel: 'world' });
  assert.deepEqual(lines(cal.sent), ['all aboard']);
  await ada.say({ say: 'anyone?', channel: 'world' });
  assert.deepEqual(lines(cal.sent), ['all aboard'], 'Cal blocks Ada, so hears none of her lines');
  await guest.say({ say: 'hi', channel: 'world' });
  assert.deepEqual(guest.sent.at(-1), { told: NAME_FIRST });
});

test('a Whisper reaches one player and comes back to its speaker; one who blocks them hears nothing', async () => {
  const { join } = hall();
  const [ada, ben, cal] = [await join('a'), await join('b'), await join('c')];
  await ben.say({ say: 'psst', channel: 'whisper', to: 'ada' });
  const sent = { line: { channel: 'whisper', from: 'Ben', to: 'Ada', text: 'psst' } };
  assert.deepEqual([ada.sent, ben.sent], [[sent], [sent]]);
  assert.deepEqual(cal.sent, []);
  await ada.say({ say: 'hello', channel: 'whisper', to: 'Cal' });
  assert.deepEqual(lines(ada.sent).at(-1), 'hello', 'answered as sent');
  assert.deepEqual(cal.sent, [], 'and never arrives');
  await cal.say({ say: 'hello', channel: 'whisper', to: 'Ada' });
  assert.match(String((cal.sent.at(-1) as { told?: string } | undefined)?.told), /^You blocked Ada/);
  await ada.say({ say: 'hello', channel: 'whisper', to: 'Nobody' });
  assert.deepEqual(ada.sent.at(-1), { told: 'Nobody is not online.' });
});

test('two lines a second in a burst of two; past that refused, and a flood let go', async () => {
  const { join, clock } = hall();
  const ada = await join('a');
  for (const word of ['one', 'two', 'three']) await ada.say({ say: word, channel: 'local' });
  assert.deepEqual(lines(ada.sent), ['one', 'two']);
  assert.deepEqual(ada.sent.at(-1), { told: TOO_FAST });
  clock.now += 500;
  await ada.say({ say: 'four', channel: 'local' });
  assert.deepEqual(lines(ada.sent).at(-1), 'four', 'half a second gives one more');
  for (let strike = 0; strike <= STRIKES_MOST; strike++) await ada.say({ say: 'spam', channel: 'local' });
  assert.equal(ada.closed[0]?.code, 1008);
});

test('a blocked word is starred letter for letter, and a line spelling one across its words is refused', async () => {
  assert.equal(starred('a fine day'), 'a fine day');
  const { join } = hall();
  const ada = await join('a');
  await ada.say({ say: 'f u c k', channel: 'local' });
  assert.deepEqual(ada.sent.at(-1), { told: NOT_ALLOWED });
});
