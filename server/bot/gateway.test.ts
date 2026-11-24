import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BOT_INTENTS,
  INTENT,
  INTENTS_WAIT_MS,
  OPCODE,
  closePolicy,
  firstBeatDelay,
  gatewayUrl,
  isZombie,
  parseFrame,
  reconnectDelay,
} from './gatewayLaw.ts';
import {
  BEAT_EARLY,
  CLOSE_RESUME,
  DISPATCH_HOLD_MS,
  GatewayCore,
  type GatewayDeps,
  HELLO_WAIT_MS,
  type SocketLike,
} from './gatewayCore.ts';
import { MEMORY_KEEP_MS, pruneMemory } from './kit.ts';

test('gateway law: the bot asks for members and message content, and never presences', () => {
  assert.ok(BOT_INTENTS & INTENT.GUILD_MEMBERS);
  assert.ok(BOT_INTENTS & INTENT.MESSAGE_CONTENT);
  assert.ok(BOT_INTENTS & INTENT.GUILD_MESSAGES);
  assert.equal(BOT_INTENTS & INTENT.GUILD_PRESENCES, 0);
});

test('gateway law: fatal closes stop, intents not allowed yet wait, session-ending closes identify, the rest resume', () => {
  for (const code of [4004, 4010, 4011, 4012, 4013]) assert.equal(closePolicy(code), 'fatal', String(code));
  assert.equal(closePolicy(4014), 'later', "the Developer Portal's switch is a person's: asked again after a wait");
  for (const code of [4003, 4007, 4009]) assert.equal(closePolicy(code), 'identify', String(code));
  for (const code of [1000, 1001, 1006, 4000, 4001, 4002, 4005, 4008, CLOSE_RESUME])
    assert.equal(closePolicy(code), 'resume', String(code));
});

test('gateway law: a Gateway URL opens over https with the version and JSON', () => {
  const url = new URL(gatewayUrl('wss://gateway-us-east1-b.discord.gg'));
  assert.equal(url.protocol, 'https:');
  assert.equal(url.searchParams.get('v'), '10');
  assert.equal(url.searchParams.get('encoding'), 'json');
});

test('gateway law: back-off doubles from a second, caps at a minute, and jitters by at most a quarter', () => {
  assert.equal(reconnectDelay(0, 0), 1_000);
  assert.equal(reconnectDelay(3, 0), 8_000);
  assert.equal(reconnectDelay(30, 0), 60_000);
  assert.ok(reconnectDelay(30, 0.999) <= 75_000);
  assert.ok(firstBeatDelay(41_250, 0) >= 250);
  assert.ok(firstBeatDelay(41_250, 0.999) < 41_250);
});

test('gateway law: a zombie is a beat sent and not answered', () => {
  assert.equal(isZombie({ lastBeatAt: 0, lastAckAt: 0 }), false);
  assert.equal(isZombie({ lastBeatAt: 10, lastAckAt: 12 }), false);
  assert.equal(isZombie({ lastBeatAt: 12, lastAckAt: 10 }), true);
});

test('gateway law: frames that are not JSON objects with an opcode are dropped', () => {
  assert.equal(parseFrame('nope'), null);
  assert.equal(parseFrame(new Uint8Array(2)), null);
  assert.equal(parseFrame('{"d":1}'), null);
  assert.deepEqual(parseFrame('{"op":0,"t":"READY","s":1,"d":{}}'), { op: 0, d: {}, s: 1, t: 'READY' });
});

/** A socket the test drives: what was sent, how it was closed, and events emitted into it. */
interface FakeSocket extends SocketLike {
  readonly url: string;
  readonly sent: Array<{ op: number; d: Readonly<Record<string, unknown>> }>;
  closed: number | null;
  emit(type: string, event: unknown): Promise<void>;
  frame(op: number, data: unknown, type?: string | null, seq?: number | null): Promise<void>;
}

const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

function fakeSocket(url: string): FakeSocket {
  const listeners: Record<string, Array<(event: never) => void>> = {};
  const socket: FakeSocket = {
    url,
    sent: [],
    closed: null,
    addEventListener: (type: string, listener: (event: never) => void) => {
      (listeners[type] ??= []).push(listener);
    },
    send: (data: string) => void socket.sent.push(JSON.parse(data)),
    close: (code?: number) => {
      socket.closed = code ?? null;
    },
    async emit(type, event) {
      for (const listener of listeners[type] ?? []) listener(event as never);
      await nextTurn();
    },
    frame: (code, data, type = null, seq = null) =>
      socket.emit('message', { data: JSON.stringify({ op: code, d: data, t: type, s: seq }) }),
  };
  return socket;
}

type Info = { url: string; remaining: number; resetAfterMs: number } | null;

/** A fake Durable Object world: storage, an alarm, a clock, and sockets the test drives. */
function world({ gatewayInfo = { url: 'wss://gateway.discord.gg', remaining: 999, resetAfterMs: 0 } as Info } = {}) {
  const store = new Map<string, unknown>();
  const w = {
    t: 1_000_000,
    alarm: 0,
    sockets: [] as FakeSocket[],
    dispatched: [] as string[],
    opens: 0,
    openFails: 0,
    gatewayInfo,
    store,
    storage: {
      get: async <T>(key: string) => structuredClone(store.get(key)) as T | undefined,
      put: async (key: string, value: unknown) => void store.set(key, structuredClone(value)),
      delete: async (key: string) => store.delete(key),
    },
    deps: (): GatewayDeps => ({
      token: 'tok',
      storage: w.storage,
      now: () => w.t,
      chance: () => 0.5,
      setAlarm: (when) => {
        w.alarm = when;
      },
      gatewayBot: async () => w.gatewayInfo,
      openSocket: async (url) => {
        w.opens++;
        if (w.openFails > 0) {
          w.openFails--;
          throw new Error('refused');
        }
        const socket = fakeSocket(url);
        w.sockets.push(socket);
        return socket;
      },
      onDispatch: (type) => void w.dispatched.push(type),
      log: () => {},
    }),
  };
  return w;
}
type World = ReturnType<typeof world>;

const lastSocket = (w: World): FakeSocket => {
  const socket = w.sockets.at(-1);
  assert.ok(socket, 'a socket was opened');
  return socket;
};

async function readyCore(w: World) {
  const core = new GatewayCore(w.deps());
  await core.ensure();
  const socket = lastSocket(w);
  await socket.frame(OPCODE.HELLO, { heartbeat_interval: 40_000 });
  const ready = {
    session_id: 'sess1',
    resume_gateway_url: 'wss://resume.discord.gg',
    user: { id: '1', username: 'Bot' },
    guilds: [{}],
  };
  await socket.frame(OPCODE.DISPATCH, ready, 'READY', 1);
  return { core, socket };
}

test('gateway core: hello, identify with the bot intents, then ready', async () => {
  const w = world();
  const { core, socket } = await readyCore(w);
  assert.equal(socket.url.startsWith('https://gateway.discord.gg'), true);
  const identify = socket.sent.find((payload) => payload.op === OPCODE.IDENTIFY);
  assert.equal(identify?.d.token, 'tok');
  assert.equal(identify?.d.intents, BOT_INTENTS);
  assert.equal(core.status.state, 'ready');
  assert.equal(core.status.guilds, 1);
  assert.deepEqual(w.dispatched, ['READY']);
  assert.equal((await w.storage.get<{ id: string; seq: number; intents: number }>('session'))?.id, 'sess1');
});

test('gateway core: the alarm beats with the last sequence and re-arms itself just inside the interval', async () => {
  const w = world();
  const { core, socket } = await readyCore(w);
  await socket.frame(OPCODE.DISPATCH, { id: '5' }, 'MESSAGE_CREATE', 7);
  w.t += 20_000;
  await core.alarm();
  const beat = socket.sent.filter((payload) => payload.op === OPCODE.HEARTBEAT).at(-1);
  assert.equal(beat?.d, 7);
  assert.equal(w.alarm, w.t + Math.floor(40_000 * BEAT_EARLY));
  await socket.frame(OPCODE.HEARTBEAT_ACK, null);
  w.t += 36_000;
  await core.alarm();
  assert.equal(socket.closed, null, 'an answered beat keeps the socket');
});

test('gateway core: a beat left unanswered drops the socket and resumes the session', async () => {
  const w = world();
  const { core, socket } = await readyCore(w);
  await core.alarm();
  w.t += 36_000;
  await core.alarm();
  assert.equal(socket.closed, CLOSE_RESUME);
  assert.equal(core.status.state, 'waiting');
  w.t = w.alarm;
  await core.alarm();
  const next = lastSocket(w);
  assert.notEqual(next, socket);
  assert.ok(next.url.startsWith('https://resume.discord.gg'), 'the resume URL is used');
  await next.frame(OPCODE.HELLO, { heartbeat_interval: 40_000 });
  const resume = next.sent.find((payload) => payload.op === OPCODE.RESUME);
  assert.deepEqual(resume?.d, { token: 'tok', session_id: 'sess1', seq: 1 });
  await next.frame(OPCODE.DISPATCH, null, 'RESUMED', 2);
  assert.equal(core.status.state, 'ready');
});

test('gateway core: an evicted object wakes on its alarm, finds no socket, and resumes from storage', async () => {
  const w = world();
  await readyCore(w);
  const fresh = new GatewayCore(w.deps());
  w.t += 45_000;
  await fresh.alarm();
  const next = lastSocket(w);
  await next.frame(OPCODE.HELLO, { heartbeat_interval: 40_000 });
  assert.equal(next.sent.at(-1)?.op, OPCODE.RESUME);
  assert.equal(next.sent.at(-1)?.d.session_id, 'sess1');
});

test('gateway core: a session saved under other intents is not resumed - a deploy that changes them identifies afresh', async () => {
  const w = world();
  await readyCore(w);
  const saved = await w.storage.get<{ intents: number }>('session');
  assert.equal(saved?.intents, BOT_INTENTS, 'the session keeps the intents it was identified with');
  await w.storage.put('session', { ...saved, intents: BOT_INTENTS & ~INTENT.GUILD_EXPRESSIONS });
  const fresh = new GatewayCore(w.deps());
  w.t += 45_000;
  await fresh.alarm();
  const next = lastSocket(w);
  await next.frame(OPCODE.HELLO, { heartbeat_interval: 40_000 });
  assert.equal(next.sent.at(-1)?.op, OPCODE.IDENTIFY);
  assert.equal(next.sent.at(-1)?.d.intents, BOT_INTENTS);
});

test('gateway core: a fatal close stops while the settings stand and names the cause; force, or a new token, starts again', async () => {
  const w = world();
  const { core, socket } = await readyCore(w);
  await socket.emit('close', { code: 4004 });
  assert.equal(core.status.state, 'fatal');
  assert.match(core.status.lastError, /token was refused/);
  assert.equal(await w.storage.get('session'), undefined);
  assert.ok(core.status.fatalKey && !JSON.stringify(core.status).includes('tok"'), 'a digest, never the token');
  const opens = w.opens;
  await core.ensure();
  await core.alarm();
  assert.equal(w.opens, opens, 'nothing reconnects with the token refused');
  await core.ensure({ force: true });
  assert.equal(w.opens, opens + 1);
  // a token rotated since: the clock's next check starts again, in a fresh object as after a deploy
  await lastSocket(w).emit('close', { code: 4004 });
  const rotated = new GatewayCore({ ...w.deps(), token: 'tok2' });
  await rotated.ensure();
  assert.equal(w.opens, opens + 2);
});

test("gateway core: with no token the first deploy waits for it, and the owner's own stop holds whatever changes", async () => {
  const w = world();
  const none = new GatewayCore({ ...w.deps(), token: '' });
  await none.ensure();
  assert.deepEqual([none.status.state, none.status.lastError], ['fatal', 'The bot token is not set.']);
  await none.ensure();
  assert.equal(w.opens, 0);
  const put = new GatewayCore(w.deps());
  await put.ensure();
  assert.equal(w.opens, 1, 'the token the deploy put is used at the next check');
  await put.stop();
  const later = new GatewayCore({ ...w.deps(), token: 'tok3' });
  await later.ensure();
  assert.equal(w.opens, 1, 'stopped from the panel, it stays stopped');
});

test('gateway core: intents Discord has not allowed yet wait an hour, said by their cause, then ask again', async () => {
  const w = world();
  const { core, socket } = await readyCore(w);
  await socket.emit('close', { code: 4014 });
  assert.deepEqual([core.status.state, w.alarm - w.t], ['waiting', INTENTS_WAIT_MS]);
  assert.match(core.status.lastError, /intents/);
  const opens = w.opens;
  await core.ensure();
  assert.equal(w.opens, opens, 'the wait stands');
  w.t = w.alarm;
  await core.alarm();
  assert.equal(w.opens, opens + 1);
});

test('gateway core: the stored sequence is the last event handled, so a lost object resumes from what it had not handled', async () => {
  const w = world();
  let release = () => {};
  const base = w.deps();
  const deps: GatewayDeps = {
    ...base,
    onDispatch: (type) =>
      type === 'TYPING_START'
        ? new Promise<void>((resolve) => (release = resolve))
        : type === 'GUILD_MEMBER_ADD'
          ? new Promise<void>(() => {})
          : undefined,
  };
  const core = new GatewayCore(deps);
  await core.ensure();
  const socket = lastSocket(w);
  await socket.frame(OPCODE.HELLO, { heartbeat_interval: 40_000 });
  await socket.frame(
    OPCODE.DISPATCH,
    {
      session_id: 'sess1',
      resume_gateway_url: 'wss://resume.discord.gg',
      user: { id: '1', username: 'Bot' },
      guilds: [],
    },
    'READY',
    1,
  );
  await socket.frame(OPCODE.DISPATCH, { id: '2' }, 'MESSAGE_CREATE', 2);
  assert.equal((await w.storage.get<{ id: string; seq: number; intents: number }>('session'))?.seq, 2);
  // the third's handler is still running when the fourth arrives, and finishes after it: it keeps its own, never the
  // fourth's, which was received but not handled
  void socket.frame(OPCODE.DISPATCH, { channel_id: '9' }, 'TYPING_START', 3);
  await nextTurn();
  void socket.frame(OPCODE.DISPATCH, { user: { id: '4' } }, 'GUILD_MEMBER_ADD', 4);
  await nextTurn();
  assert.equal(
    (await w.storage.get<{ id: string; seq: number; intents: number }>('session'))?.seq,
    2,
    'received but not handled: not kept',
  );
  release();
  for (let i = 0; i < 5; i++) await nextTurn();
  assert.equal(
    (await w.storage.get<{ id: string; seq: number; intents: number }>('session'))?.seq,
    3,
    'the third handled, the fourth still running',
  );
  // the object is lost: a fresh one resumes from the last event handled, and Discord sends the rest again
  const fresh = new GatewayCore(base);
  await fresh.ensure();
  const next = lastSocket(w);
  await next.frame(OPCODE.HELLO, { heartbeat_interval: 40_000 });
  assert.deepEqual(next.sent.at(-1), { op: OPCODE.RESUME, d: { token: 'tok', session_id: 'sess1', seq: 3 } });
});

test('gateway core: a session-ending close identifies afresh', async () => {
  const w = world();
  const { core, socket } = await readyCore(w);
  await socket.emit('close', { code: 4009 });
  assert.equal(core.session, null);
  w.t = w.alarm;
  await core.alarm();
  const next = lastSocket(w);
  assert.ok(next.url.startsWith('https://gateway.discord.gg'));
  await next.frame(OPCODE.HELLO, { heartbeat_interval: 40_000 });
  assert.equal(next.sent.at(-1)?.op, OPCODE.IDENTIFY);
});

test('gateway core: an invalid session that cannot resume clears it and waits one to five seconds', async () => {
  const w = world();
  const { core, socket } = await readyCore(w);
  await socket.frame(OPCODE.INVALID_SESSION, false);
  assert.equal(core.session, null);
  assert.ok(w.alarm - w.t >= 1_000 && w.alarm - w.t <= 5_000);
});

test('gateway core: Discord asking for a reconnect resumes', async () => {
  const w = world();
  const { core, socket } = await readyCore(w);
  await socket.frame(OPCODE.RECONNECT, null);
  assert.equal(socket.closed, CLOSE_RESUME);
  assert.equal(core.session?.id, 'sess1');
});

test('gateway core: no hello within the deadline drops the socket and tries again', async () => {
  const w = world();
  const core = new GatewayCore(w.deps());
  await core.ensure();
  const socket = lastSocket(w);
  assert.equal(w.alarm, w.t + HELLO_WAIT_MS);
  w.t += HELLO_WAIT_MS;
  await core.alarm();
  assert.equal(socket.closed, CLOSE_RESUME);
});

test('gateway core: a socket that will not open backs off, and the clock does not cut the back-off short', async () => {
  const w = world();
  w.openFails = 1;
  const core = new GatewayCore(w.deps());
  await core.ensure();
  assert.equal(core.status.state, 'waiting');
  const due = w.alarm;
  assert.ok(due > w.t);
  await core.ensure();
  assert.equal(w.opens, 1, 'the clock waits for the planned retry');
  w.t = due;
  await core.alarm();
  assert.equal(w.opens, 2);
});

test('gateway core: out of identifies waits for Discord to reset the count', async () => {
  const w = world({ gatewayInfo: { url: 'wss://gateway.discord.gg', remaining: 0, resetAfterMs: 3_600_000 } });
  const core = new GatewayCore(w.deps());
  await core.ensure();
  assert.equal(w.opens, 0);
  assert.equal(w.alarm, w.t + 3_600_000);
  assert.match(core.status.lastError, /identifies/);
});

test('gateway core: two starts at once open one socket', async () => {
  const w = world();
  const core = new GatewayCore(w.deps());
  await Promise.all([core.ensure(), core.ensure(), core.alarm()]);
  assert.equal(w.opens, 1);
});

test('gateway core: a late event from a dropped socket changes nothing', async () => {
  const w = world();
  const { core, socket } = await readyCore(w);
  await socket.frame(OPCODE.RECONNECT, null);
  const before = core.status.state;
  await socket.emit('close', { code: 4014 });
  assert.equal(core.status.state, before, "the old socket's close is ignored");
});

test('gateway core: stop closes the socket and holds until forced', async () => {
  const w = world();
  const { core, socket } = await readyCore(w);
  await core.stop();
  assert.equal(socket.closed, 1000);
  assert.equal(core.status.state, 'fatal');
  await core.restart();
  assert.equal(w.sockets.length, 2, 'restart from a stop opens a new socket');
});

test('gateway core: a handler that throws is logged and the connection carries on', async () => {
  const w = world();
  const deps: GatewayDeps = {
    ...w.deps(),
    onDispatch: () => {
      throw new Error('boom');
    },
  };
  const core = new GatewayCore(deps);
  await core.ensure();
  const socket = lastSocket(w);
  await socket.frame(OPCODE.HELLO, { heartbeat_interval: 40_000 });
  await socket.frame(OPCODE.DISPATCH, { session_id: 's', resume_gateway_url: 'wss://r' }, 'READY', 1);
  assert.equal(core.status.state, 'ready');
});

test("gateway core: events are handled one after another in Discord's order, the sequence only moves forward, and a stuck one does not hold the rest", async () => {
  const w = world();
  const log: string[] = [];
  const release = { slow: () => {} };
  const base = w.deps;
  w.deps = () => ({
    ...base(),
    onDispatch: async (type) => {
      log.push(`start ${type}`);
      if (type === 'SLOW') await new Promise<void>((resolve) => (release.slow = resolve));
      log.push(`end ${type}`);
    },
  });
  const { core, socket } = await readyCore(w);
  log.length = 0;
  const first = socket.frame(OPCODE.DISPATCH, {}, 'SLOW', 5);
  await socket.frame(OPCODE.DISPATCH, {}, 'FAST', 6);
  assert.deepEqual(log, ['start SLOW'], 'the second waits for the first');
  assert.equal(core.session?.seq, 6, "the sequence is the newest frame's at once");
  release.slow();
  await first;
  for (let i = 0; i < 5; i++) await nextTurn();
  assert.deepEqual(log, ['start SLOW', 'end SLOW', 'start FAST', 'end FAST']);
  assert.equal(core.session?.seq, 6, 'the older frame, handled last, did not move it back');
  // a handler that never answers is let go after DISPATCH_HOLD_MS, and the queue goes on
  let timeout = () => {};
  const realSetTimeout = globalThis.setTimeout;
  const held = (callback: () => void, millis?: number) =>
    millis === DISPATCH_HOLD_MS ? ((timeout = callback), 0) : realSetTimeout(callback, millis);
  globalThis.setTimeout = held as unknown as typeof setTimeout;
  try {
    log.length = 0;
    void socket.frame(OPCODE.DISPATCH, {}, 'SLOW', 7);
    for (let i = 0; i < 3; i++) await nextTurn();
    const after = socket.frame(OPCODE.DISPATCH, {}, 'FAST', 8);
    timeout();
    await after;
    for (let i = 0; i < 5; i++) await nextTurn();
    assert.deepEqual(log, ['start SLOW', 'start FAST', 'end FAST']);
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
});

test('gateway object: its memory lets go of the members no window holds any more', () => {
  const memory = new Map<string, unknown>([
    ['levels:g:old', 1_000],
    ['levels:g:new', 900_000],
    ['automod:g:old', [{ at: 1_000, words: 'a' }]],
    [
      'automod:g:new',
      [
        { at: 1_000, words: 'a' },
        { at: 950_000, words: 'b' },
      ],
    ],
  ]);
  pruneMemory(memory, 1_000_000, MEMORY_KEEP_MS);
  assert.deepEqual([...memory.keys()].sort(), ['automod:g:new', 'levels:g:new']);
  assert.ok(MEMORY_KEEP_MS >= 600_000 + 60_000, 'past the longest level cooldown and flood window');
});
