import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ACCOUNT_SOCKETS_MOST,
  BUSY,
  Hall,
  type HallDeps,
  NAME_FIRST,
  NOT_ALLOWED,
  NOT_AT_SEA,
  NOWHERE,
  ON_LAND,
  SESSION_KEPT_MS,
  SIGN_IN,
  SILENT_FROM_ONE,
  STRIKES_MOST,
  TOO_FAST,
  TOO_MANY,
  UNSENT,
  WORLD_A_SECOND,
} from './chatHall.ts';
import { starred } from './chatWords.ts';
import { TOKEN_WAIT_MS } from '../keeping.ts';

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

type Person = { account: string; name: string | null; room: string | null; water: string | null };

/** Players by token: Ada and Ben in Overlook; Cal and Dee at sea in the Lantern Sea and Eve in the Elmwater; a guest in
 *  Overlook; and Fay, playing nowhere yet. Cal blocks Ada, and Ben mutes Dee. */
function hall() {
  const clock = { now: 1_000_000 };
  const person = (account: string, name: string | null, room: string | null, water: string | null = null) => ({
    account,
    name,
    room,
    water,
  });
  const people: Record<string, Person> = {
    ['a'.repeat(64)]: person('ada', 'Ada', 'node-overlook-social'),
    ['b'.repeat(64)]: person('ben', 'Ben', 'node-overlook-social'),
    ['c'.repeat(64)]: person('cal', 'Cal', 'sea', 'The Lantern Sea'),
    ['d'.repeat(64)]: person('dee', 'Dee', 'sea--elite', 'The Lantern Sea'),
    ['e'.repeat(64)]: person('eve', 'Eve', 'sea', 'The Elmwater'),
    ['f'.repeat(64)]: person('fay', 'Fay', null),
    ['9'.repeat(64)]: person('guest', null, 'node-overlook-social'),
  };
  const blocking = [['cal', 'ada']];
  const failing = { places: false, everyone: false, blocks: false };
  const muting = [['ben', 'dee']];
  const signedOut = new Set<string>();
  const accounts = Object.values(people);
  const deps: HallDeps = {
    now: () => clock.now,
    speaker: async (token) => {
      const found = people[token];
      return found && !signedOut.has(token) ? { account: found.account, name: found.name } : null;
    },
    places: async (asked) => {
      if (failing.places || (failing.everyone && asked.length > 1)) throw new Error('the accounts did not answer');
      await new Promise((resolve) => setImmediate(resolve));
      return new Map(
        asked.map((id) => {
          const found = accounts.find((each) => each.account === id);
          return [id, { room: found?.room ?? null, water: found?.water ?? null }];
        }),
      );
    },
    apart: async (account) =>
      blocking.flatMap(([blocker, blocked]) =>
        blocker === account ? [blocked] : blocked === account ? [blocker] : [],
      ),
    mutedBy: async (account) => muting.filter(([, muted]) => muted === account).map(([muter]) => muter ?? ''),
    named: async (name) => {
      const found = accounts.find((each) => each.name?.toLowerCase() === name.toLowerCase());
      return found?.name ? { account: found.account, name: found.name } : null;
    },
    blocks: async (blocker, blocked) => {
      if (failing.blocks) throw new Error('the accounts did not answer');
      return blocking.some(([one, two]) => one === blocker && two === blocked);
    },
  };
  const chat = new Hall(deps);
  const join = async (letters: string) => {
    const held = socket();
    const number = chat.opened(held, 'home');
    await chat.heard(number, letters.repeat(64 / letters.length));
    held.sent.length = 0;
    return { ...held, number, say: (said: object) => chat.heard(number, JSON.stringify(said)) };
  };
  return { chat, clock, failing, join, people, signedOut };
}

const lines = (sent: readonly unknown[]) =>
  sent.flatMap((each) => {
    const line = (each as { line?: { text: string } }).line;
    return line ? [line.text] : [];
  });
const told = (sent: readonly unknown[]) => (sent.at(-1) as { told?: string } | undefined)?.told;

test('a token signs a socket in and names its player; anything else first is let go', async () => {
  const { chat } = hall();
  const held = socket();
  const number = chat.opened(held, 'home');
  await chat.heard(number, 'a'.repeat(64));
  assert.deepEqual(held.sent, [{ welcome: { name: 'Ada' } }]);
  await chat.heard(number, 'a'.repeat(64));
  assert.equal(held.closed[0]?.code, 1008, 'a second token is no line');
  const stranger = socket();
  await chat.heard(chat.opened(stranger, 'home'), '0'.repeat(64));
  assert.deepEqual(stranger.closed, [{ code: 4003, reason: SIGN_IN }]);
  const rude = socket();
  await chat.heard(chat.opened(rude, 'home'), 'hello');
  assert.equal(rude.closed[0]?.code, 1008);
  const big = socket();
  await chat.heard(chat.opened(big, 'home'), 'x'.repeat(5_000));
  assert.equal(big.closed[0]?.code, 1008, 'a message past its most');
});

test('a socket silent too long, or whose session ended, is let go; one account holds a few sockets at most', async () => {
  const { chat, clock, join, signedOut } = hall();
  const silent = socket();
  chat.opened(silent, 'home');
  clock.now += TOKEN_WAIT_MS;
  chat.tick();
  assert.deepEqual(silent.closed, [{ code: 4003, reason: SIGN_IN }]);
  const ada = await join('a');
  signedOut.add('a'.repeat(64));
  clock.now += SESSION_KEPT_MS;
  chat.tick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(ada.closed, [{ code: 4003, reason: SIGN_IN }], 'signed out everywhere');
  for (let tab = 0; tab < ACCOUNT_SOCKETS_MOST; tab++) await join('b');
  const more = await join('b');
  assert.deepEqual(more.closed, [{ code: 4003, reason: TOO_MANY }]);
});

test('Local reaches those in the same room, Region the ships in the same water, World everyone', async () => {
  const { join } = hall();
  const [ada, ben, cal, dee, eve, guest] = [
    await join('a'),
    await join('b'),
    await join('c'),
    await join('d'),
    await join('e'),
    await join('9'),
  ];
  await ada.say({ say: '  hello   there ', channel: 'local' });
  assert.deepEqual(ada.sent, [{ line: { channel: 'local', from: 'Ada', text: 'hello there' } }]);
  assert.deepEqual([lines(ben.sent), lines(guest.sent), lines(cal.sent)], [['hello there'], ['hello there'], []]);
  await cal.say({ say: 'ahoy', channel: 'region' });
  const ahoy = { line: { channel: 'region', from: 'Cal', region: 'The Lantern Sea', text: 'ahoy' } };
  assert.deepEqual(cal.sent.at(-1), ahoy);
  assert.deepEqual(lines(dee.sent), [], 'the same water at another difficulty is another sea');
  assert.deepEqual(lines(eve.sent), [], 'another water');
  await ada.say({ say: 'ahoy', channel: 'region' });
  assert.equal(told(ada.sent), NOT_AT_SEA);
  await eve.say({ say: 'hi', channel: 'local' });
  assert.equal(told(eve.sent), ON_LAND);
  await ben.say({ say: 'all aboard', channel: 'world' });
  assert.equal(lines(cal.sent).at(-1), 'all aboard');
  await ada.say({ say: 'anyone?', channel: 'world' });
  assert.notEqual(lines(cal.sent).at(-1), 'anyone?', 'Cal blocks Ada, so hears none of her lines');
  await cal.say({ say: 'and you?', channel: 'world' });
  assert.notEqual(lines(ada.sent).at(-1), 'and you?', 'nor she his');
  await dee.say({ say: 'hello all', channel: 'world' });
  assert.notEqual(lines(ben.sent).at(-1), 'hello all', 'Ben mutes Dee');
  assert.equal(lines(eve.sent).at(-1), 'hello all');
  await guest.say({ say: 'hi', channel: 'world' });
  assert.equal(told(guest.sent), NAME_FIRST);
});

test('a player who plays nowhere yet is told so', async () => {
  const { join } = hall();
  const fay = await join('f');
  await fay.say({ say: 'hi', channel: 'local' });
  assert.equal(told(fay.sent), NOWHERE);
});

test('a Whisper reaches one player and comes back to its speaker; one who blocks or mutes them hears nothing', async () => {
  const { join, clock } = hall();
  const [ada, ben, cal, dee] = [await join('a'), await join('b'), await join('c'), await join('d')];
  await ben.say({ say: 'psst', channel: 'whisper', to: 'ada' });
  const sent = { line: { channel: 'whisper', from: 'Ben', to: 'Ada', text: 'psst' } };
  assert.deepEqual([ada.sent, ben.sent], [[sent], [sent]]);
  assert.deepEqual(cal.sent, []);
  await ada.say({ say: 'hello', channel: 'whisper', to: 'Cal' });
  assert.equal(lines(ada.sent).at(-1), 'hello', 'answered as sent');
  assert.deepEqual(cal.sent, [], 'and never arrives');
  await dee.say({ say: 'hello', channel: 'whisper', to: 'Ben' });
  assert.deepEqual(lines(ben.sent), ['psst'], 'muted, so it never arrives either');
  await cal.say({ say: 'hello', channel: 'whisper', to: 'Ada' });
  assert.match(String(told(cal.sent)), /^You blocked Ada/);
  clock.now += 1_000;
  await ada.say({ say: 'hello', channel: 'whisper', to: 'Nobody' });
  assert.equal(told(ada.sent), 'Nobody is not online.');
  clock.now += 1_000;
  await ada.say({ say: 'hello', channel: 'whisper', to: 'x'.repeat(30) });
  assert.equal(told(ada.sent), `${'x'.repeat(30)} is not online.`, 'a name too long is no one, and the socket stays');
  assert.deepEqual(ada.closed, []);
  clock.now += 1_000;
  await ada.say({ say: 'hello', channel: 'whisper', to: 'Ada' });
  assert.equal(told(ada.sent), 'You cannot whisper to yourself.');
});

test("two lines a second across an account's sockets, a guest's too; past that refused, and a flood let go", async () => {
  const { join, clock } = hall();
  const [ada, again] = [await join('a'), await join('a')];
  await ada.say({ say: 'one', channel: 'local' });
  await again.say({ say: 'two', channel: 'local' });
  await ada.say({ say: 'three', channel: 'local' });
  assert.deepEqual(lines(ada.sent), ['one', 'two']);
  assert.equal(told(ada.sent), TOO_FAST);
  clock.now += 500;
  await ada.say({ say: 'four', channel: 'local' });
  assert.equal(lines(ada.sent).at(-1), 'four', 'half a second gives one more');
  for (let strike = 0; strike < STRIKES_MOST; strike++) await ada.say({ say: 'spam', channel: 'local' });
  assert.deepEqual([ada.closed[0]?.code, again.closed[0]?.code], [1008, 1008], 'every socket of the account');
  const guest = await join('9');
  for (let strike = 0; strike <= STRIKES_MOST + 2; strike++) await guest.say({ say: 'x', channel: 'world' });
  assert.equal(guest.closed[0]?.code, 1008, "a guest's are held too");
});

test('joining again gives no fresh lines, until the second they would have filled in', async () => {
  const { chat, clock, join } = hall();
  const ada = await join('a');
  await ada.say({ say: 'one', channel: 'world' });
  await ada.say({ say: 'two', channel: 'world' });
  chat.closed(ada.number);
  const again = await join('a');
  await again.say({ say: 'three', channel: 'world' });
  assert.equal(told(again.sent), TOO_FAST);
  clock.now += 1_000;
  chat.tick();
  await again.say({ say: 'four', channel: 'world' });
  assert.equal(lines(again.sent).at(-1), 'four');
});

test("one address may hold a few sockets before they sign in; the hall takes others' still", async () => {
  const { chat } = hall();
  for (let tab = 0; tab < SILENT_FROM_ONE; tab++) chat.opened(socket(), 'crowd');
  assert.equal(chat.admits('crowd'), false);
  assert.equal(chat.admits('home'), true);
});

test("a player's lines go out in the order said, and a failed ask is told, not lost", async () => {
  const { clock, failing, join } = hall();
  const [ada, ben] = [await join('a'), await join('b')];
  await Promise.all([ada.say({ say: 'first', channel: 'local' }), ada.say({ say: 'second', channel: 'world' })]);
  assert.deepEqual(lines(ada.sent), ['first', 'second']);
  clock.now += 10_000;
  failing.everyone = true;
  await ada.say({ say: 'still here', channel: 'local' });
  assert.equal(lines(ben.sent).at(-1), 'still here', 'where everyone plays, as last answered');
  clock.now += 1_000;
  failing.places = true;
  await ada.say({ say: 'and now?', channel: 'local' });
  assert.equal(told(ada.sent), UNSENT);
  failing.blocks = true;
  clock.now += 1_000;
  await ada.say({ say: 'psst', channel: 'whisper', to: 'Ben' });
  assert.equal(told(ada.sent), UNSENT, 'not "You blocked Ben"');
});

test('World carries twenty lines a second in all, and tells a speaker past them so', async () => {
  const { join, people } = hall();
  const tokens = Array.from({ length: 12 }, (unused, index) => (index + 16).toString(16).repeat(32));
  for (const [index, token] of tokens.entries())
    people[token] = { account: `p${index}`, name: `P${index}`, room: 'node-overlook-social', water: null };
  const speakers = [];
  for (const token of tokens) speakers.push(await join(token.slice(0, 2)));
  for (const speaker of speakers) for (const line of ['one', 'two']) await speaker.say({ say: line, channel: 'world' });
  const heard = lines(speakers[0]?.sent ?? []).length;
  assert.equal(heard, WORLD_A_SECOND, 'twenty of the twenty-four said within the same moment');
  assert.equal(told(speakers.at(-1)?.sent ?? []), BUSY);
});

test('a blocked word is starred letter for letter, look-alike letters too; one spelled out in letters is refused', async () => {
  assert.equal(starred('a fine day'), 'a fine day');
  assert.equal(starred('lets go ok'), 'lets go ok', 'words side by side are not read as one');
  assert.equal(starred('the pen is mighty'), 'the pen is mighty');
  assert.equal(starred('well shit'), 'well ****');
  assert.equal(starred('well shіt'), 'well ****', 'a Cyrillic і reads as an i');
  const { join } = hall();
  const ada = await join('a');
  await ada.say({ say: 'f u c k', channel: 'local' });
  assert.equal(told(ada.sent), NOT_ALLOWED);
});
