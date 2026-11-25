// The Gateway connection's state machine. It owns one outbound WebSocket to Discord and keeps it alive across the
// Durable Object's life: the heartbeat runs on the object's alarm, not a timer, because an alarm is an event that
// keeps the object resident, while a timer is not and an outbound socket alone holds it for fifteen minutes at most.
// When the object is evicted or redeployed, the next alarm wakes a fresh instance that resumes the stored session,
// so Discord replays what was missed.
//
// Everything with a side effect comes in through `deps`, so tests drive it with a fake socket and a fake clock.

import { errorWords } from './kit.ts';
import {
  OPCODE,
  BOT_INTENTS,
  closePolicy,
  fatalReason,
  INTENTS_WAIT_MS,
  firstBeatDelay,
  gatewayUrl,
  heartbeatPayload,
  identifyPayload,
  isZombie,
  parseFrame,
  reconnectDelay,
  resumePayload,
} from './gatewayLaw.ts';

/** How long to wait for Discord's HELLO after the socket opens before giving up on that socket. */
export const HELLO_WAIT_MS = 15_000;
/** The outbound WebSocket, as the runtime gives it. */
export interface SocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'message', listener: (event: { readonly data: unknown }) => void): void;
  addEventListener(type: 'close', listener: (event: { readonly code: number }) => void): void;
  addEventListener(type: 'error', listener: () => void): void;
}
/** The Durable Object's key-value storage. */
export interface StorageLike {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean | void>;
}
/** A Gateway session, kept so a fresh object resumes it: its sequence is the last event handled. */
export interface Session {
  id: string;
  resumeUrl: string;
  seq: number | null;
  intents: number;
  /** Connections opened on the resume URL since Discord last said RESUMED. */
  resumeTries?: number;
}
/** Beat a little early: an alarm can land late, and a beat after the interval lets Discord close the socket. */
export const BEAT_EARLY = 0.9;
/** How long the URL from GET /gateway/bot is kept before asking again. */
export const GATEWAY_URL_TTL_MS = 24 * 3600_000;
/** Our own close code for a socket we drop to resume: outside 1000/1001, which would end the session. */
export const CLOSE_RESUME = 4900;
/** How long one event's handlers may hold the queue before the next is let through. */
export const DISPATCH_HOLD_MS = 30_000;
/**
 * How many connections a session's resume URL is given without a RESUMED before the session is dropped and the bot
 * identifies afresh: enough to ride out a blip, never a dead host retried for good.
 */
export const RESUME_TRIES = 5;

/** What the panel's health card shows of the connection. */
export interface Status {
  state: 'idle' | 'connecting' | 'identifying' | 'resuming' | 'ready' | 'waiting' | 'fatal';
  readyAt: number;
  latencyMs: number;
  attempts: number;
  lastError: string;
  retryAt: number;
  fatalKey: string;
}

export const blankStatus = (): Status => ({
  state: 'idle',
  readyAt: 0,
  latencyMs: 0,
  attempts: 0,
  lastError: '',
  retryAt: 0,
  fatalKey: '',
});

/**
 * What the core is given: the token and intents, the object's storage and alarm, a clock, a source of chance, the
 * way out to Discord, and where events go.
 */
export interface GatewayDeps {
  readonly token: string;
  readonly intents?: number;
  readonly storage: StorageLike;
  readonly setAlarm: (at: number) => Promise<void> | void;
  readonly now: () => number;
  readonly chance: () => number;
  readonly openSocket: (url: string) => Promise<SocketLike>;
  readonly gatewayBot: () => Promise<{ url: string; remaining: number; resetAfterMs: number } | null>;
  readonly onDispatch: (type: string, data: unknown) => Promise<void> | void;
  readonly log?: (line: string) => void;
}

export class GatewayCore {
  readonly deps: GatewayDeps;
  readonly log: (line: string) => void;
  socket: SocketLike | null = null;
  /** Which socket the listeners belong to, so a late event from a dropped socket is ignored. */
  generation = 0;
  helloAt = 0;
  openedAt = 0;
  intervalMs = 0;
  lastBeatAt = 0;
  lastAckAt = 0;
  session: Session | null = null;
  status: Status = blankStatus();
  loaded = false;
  settingsKey = '';
  connecting: Promise<void> | null = null;
  pendingSeq: number | null = null;
  /** The last event handled, which the stored session names (`onDispatch`). */
  handled: number | null = null;
  /** Events are handled one after another, in Discord's order: a handler that reads and then writes is never run
   *  beside another event's. The heartbeat and the socket's own frames do not wait in it. */
  queue: Promise<void> = Promise.resolve();

  constructor(deps: GatewayDeps) {
    this.deps = deps;
    this.log = deps.log ?? ((line) => console.log(line));
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    this.session = (await this.deps.storage.get<Session>('session')) ?? null;
    this.handled = this.session?.seq ?? null;
    this.status = { ...blankStatus(), ...((await this.deps.storage.get<Partial<Status>>('status')) ?? {}) };
    // a digest of the token and intents, never the token: what a fatal stop is met with (`fatal`)
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`${this.deps.token}|${this.deps.intents ?? ''}`),
    );
    this.settingsKey = [...new Uint8Array(digest).subarray(0, 8)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    this.loaded = true;
  }

  async saveStatus(): Promise<void> {
    await this.deps.storage.put('status', this.status);
  }

  async setState(state: Status['state']): Promise<void> {
    this.status.state = state;
    await this.saveStatus();
  }

  /**
   * Make sure a connection exists or is on its way. Safe to call as often as the clock likes.
   * `force` clears a fatal stop, after the owner fixed its cause.
   */
  async ensure(options: { readonly force?: boolean } = {}): Promise<Status> {
    await this.load();
    if (this.status.state === 'fatal' && !options.force) {
      // a stop met with other settings (a token put or rotated since, intents fixed by a deploy) is tried again; one
      // the owner pressed, which keeps no key, holds
      if (!this.status.fatalKey || this.status.fatalKey === this.settingsKey) return this.status;
      this.status.attempts = 0;
    }
    if (options.force && this.status.state === 'fatal') this.status.attempts = 0;
    if (this.socket) return this.status;
    // A back-off already planned stands: the clock's check must not turn an outage into a reconnect a minute.
    if (!options.force && this.status.state === 'waiting' && this.status.retryAt > this.deps.now()) {
      await this.deps.setAlarm(this.status.retryAt);
      return this.status;
    }
    await this.connect();
    return this.status;
  }

  /** Drop the socket and connect again, resuming the session: the owner's restart. */
  async restart(): Promise<Status> {
    await this.load();
    if (this.socket) await this.drop(CLOSE_RESUME, 'resume');
    else await this.ensure({ force: true });
    return this.status;
  }

  // Events reach a Durable Object while an await is pending, so the clock's check and an alarm can both arrive here
  // before the first socket exists. They share one attempt.
  connect(): Promise<void> {
    if (!this.connecting) {
      const attempt: Promise<void> = this.openOnce().finally(() => {
        if (this.connecting === attempt) this.connecting = null;
      });
      this.connecting = attempt;
    }
    return this.connecting;
  }

  async openOnce(): Promise<void> {
    const { deps } = this;
    if (!deps.token) return this.fatal('The bot token is not set.');
    // taken before any wait: a stop meanwhile moves it, and this attempt then gives way, setting no state and keeping
    // no socket
    const generation = ++this.generation;
    if (this.session && (this.session.resumeTries ?? 0) >= RESUME_TRIES) {
      this.log(`[gateway] ${RESUME_TRIES} tries on the resume URL without a RESUMED; identifying afresh`);
      await this.clearSession();
    }
    let base: string;
    if (this.session?.resumeUrl) {
      base = this.session.resumeUrl;
      this.session.resumeTries = (this.session.resumeTries ?? 0) + 1;
      await deps.storage.put('session', { ...this.session, seq: this.handled });
    } else {
      const info = await this.gatewayInfo();
      if (generation !== this.generation) return;
      if (!info) return this.retryLater('Discord did not say where the Gateway is.');
      if (info.remaining <= 0) return this.retryAt(deps.now() + info.resetAfterMs, 'Out of identifies for today.');
      base = info.url;
    }
    if (generation !== this.generation) return;
    await this.setState('connecting');
    let socket: SocketLike;
    try {
      socket = await deps.openSocket(gatewayUrl(base));
    } catch (error) {
      if (generation !== this.generation) return;
      return this.retryLater(`The Gateway did not open: ${error instanceof Error ? error.message : 'error'}`);
    }
    if (generation !== this.generation) {
      try {
        socket.close(1000, 'stopped');
      } catch {
        // Already closed.
      }
      return;
    }
    this.socket = socket;
    this.openedAt = deps.now();
    this.helloAt = 0;
    this.lastBeatAt = 0;
    this.lastAckAt = 0;
    socket.addEventListener('message', (event) => {
      if (generation === this.generation)
        this.onFrame(event.data).catch((error) => this.log(`[gateway] frame failed: ${errorWords(error)}`));
    });
    socket.addEventListener('close', (event) => {
      if (generation === this.generation) this.onClose(Number(event.code) || 1006).catch(() => {});
    });
    socket.addEventListener('error', () => {
      if (generation === this.generation) this.onClose(1006).catch(() => {});
    });
    await deps.setAlarm(deps.now() + HELLO_WAIT_MS);
  }

  async gatewayInfo(): Promise<{ url: string; remaining: number; resetAfterMs: number } | null> {
    const cached = await this.deps.storage.get<{ url: string; at: number }>('gatewayUrl');
    const info = await this.deps.gatewayBot();
    if (info) {
      await this.deps.storage.put('gatewayUrl', { url: info.url, at: this.deps.now() });
      return info;
    }
    // Discord's own advice is to cache this URL; an old one still works when the API is briefly away.
    if (cached && this.deps.now() - cached.at < GATEWAY_URL_TTL_MS)
      return { url: cached.url, remaining: 1, resetAfterMs: 0 };
    return null;
  }

  async onFrame(raw: unknown): Promise<void> {
    const frame = parseFrame(raw);
    if (!frame) return;
    const { deps } = this;
    if (frame.s !== null && this.session) this.session.seq = frame.s;
    else if (frame.s !== null) this.pendingSeq = frame.s;
    switch (frame.op) {
      case OPCODE.HELLO: {
        this.intervalMs = Number((frame.d as { heartbeat_interval?: unknown } | null)?.heartbeat_interval) || 41_250;
        this.helloAt = deps.now();
        await deps.setAlarm(deps.now() + firstBeatDelay(this.intervalMs * BEAT_EARLY, deps.chance()));
        // a session identified with other intents (a deploy changed them) would never carry the new ones: begin afresh
        const intents = deps.intents ?? BOT_INTENTS;
        if (this.session?.id && this.session.intents !== intents) this.session = null;
        if (this.session?.id) {
          await this.setState('resuming');
          this.sendJson(resumePayload(deps.token, this.session.id, this.session.seq));
        } else {
          await this.setState('identifying');
          this.sendJson(identifyPayload(deps.token, intents));
        }
        return;
      }
      case OPCODE.HEARTBEAT:
        this.beat();
        return;
      case OPCODE.HEARTBEAT_ACK:
        this.lastAckAt = deps.now();
        this.status.latencyMs = this.lastBeatAt ? this.lastAckAt - this.lastBeatAt : 0;
        return;
      case OPCODE.RECONNECT:
        await this.drop(CLOSE_RESUME, 'resume');
        return;
      case OPCODE.INVALID_SESSION:
        // Discord asks for a pause of one to five seconds before the next try.
        if (frame.d !== true) await this.clearSession();
        await this.drop(CLOSE_RESUME, 'wait', 1_000 + Math.floor(deps.chance() * 4_000));
        return;
      case OPCODE.DISPATCH: {
        const run = () => this.onDispatch(String(frame.t), frame.d, frame.s);
        this.queue = this.queue.then(() => this.held(run(), String(frame.t)));
        await this.queue;
        return;
      }
      default:
    }
  }

  async onDispatch(type: string, data: unknown, seq: number | null): Promise<void> {
    const { deps } = this;
    if (type === 'READY') {
      const ready = (data ?? {}) as {
        session_id?: unknown;
        resume_gateway_url?: unknown;
      };
      this.handled = null;
      this.session = {
        id: String(ready.session_id ?? ''),
        resumeUrl: String(ready.resume_gateway_url ?? ''),
        seq,
        intents: deps.intents ?? BOT_INTENTS,
      };
      this.status.readyAt = deps.now();
      this.status.attempts = 0;
      this.status.lastError = '';
      await this.setState('ready');
    } else if (type === 'RESUMED') {
      if (this.session) this.session.resumeTries = 0;
      this.status.attempts = 0;
      this.status.lastError = '';
      await this.setState('ready');
    }
    if (this.session) {
      // only ever forward: a later frame may have moved it while this one waited
      if (seq !== null && (this.session.seq === null || seq > this.session.seq)) this.session.seq = seq;
    }
    try {
      await deps.onDispatch(type, data);
    } catch (error) {
      this.log(`[gateway] ${type} handler failed: ${errorWords(error)}`);
    }
    // Kept only once handled: the sequence a resume after a lost object asks from is the last event handled, so
    // Discord sends again what was received but not yet handled. The heartbeat still names the last one received.
    if (this.session) {
      if (seq !== null && (this.handled === null || seq > this.handled)) this.handled = seq;
      await deps.storage.put('session', { ...this.session, seq: this.handled });
    }
  }

  /**
   * One event's work, given at most DISPATCH_HOLD_MS before the queue moves on: a handler waiting on something that
   * never answers is logged and left to finish alone, and the events after it are not held.
   */
  held(work: Promise<void>, type: string): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        this.log(`[gateway] ${type} took over ${DISPATCH_HOLD_MS} ms; the next events go on`);
        resolve();
      }, DISPATCH_HOLD_MS);
    });
    const done = work.catch((error) => this.log(`[gateway] ${type} failed: ${errorWords(error)}`));
    return Promise.race([done, late]).finally(() => {
      if (timer !== undefined) clearTimeout(timer);
    });
  }

  /** The object's alarm: the heartbeat, the hello deadline, and the reconnect after a drop or an eviction. */
  async alarm(): Promise<void> {
    await this.load();
    const { deps } = this;
    if (this.status.state === 'fatal') return;
    if (!this.socket) {
      await this.connect();
      return;
    }
    if (!this.helloAt) {
      if (deps.now() - this.openedAt >= HELLO_WAIT_MS) await this.drop(CLOSE_RESUME, 'resume');
      else await deps.setAlarm(this.openedAt + HELLO_WAIT_MS);
      return;
    }
    if (isZombie({ lastBeatAt: this.lastBeatAt, lastAckAt: this.lastAckAt })) {
      this.status.lastError = 'Discord stopped answering heartbeats.';
      await this.drop(CLOSE_RESUME, 'resume');
      return;
    }
    this.beat();
    await this.saveStatus();
    await deps.setAlarm(deps.now() + Math.floor(this.intervalMs * BEAT_EARLY));
  }

  beat(): void {
    this.lastBeatAt = this.deps.now();
    this.sendJson(heartbeatPayload(this.session?.seq ?? this.pendingSeq ?? null));
  }

  sendJson(payload: unknown): void {
    try {
      this.socket?.send(JSON.stringify(payload));
    } catch (error) {
      this.log(`[gateway] send failed: ${errorWords(error)}`);
    }
  }

  async onClose(code: number): Promise<void> {
    this.socket = null;
    this.generation++;
    this.helloAt = 0;
    const policy = closePolicy(code);
    if (policy === 'fatal') {
      await this.clearSession();
      await this.fatal(fatalReason(code));
      this.log(`[gateway] stopped: ${this.status.lastError}`);
      return;
    }
    if (policy === 'later') {
      await this.clearSession();
      await this.retryAt(this.deps.now() + INTENTS_WAIT_MS, fatalReason(code));
      return;
    }
    if (policy === 'identify') await this.clearSession();
    await this.retryLater(`The Gateway closed (${code}).`);
  }

  /** Close our own socket and plan the next connection. */
  async drop(code: number, how: 'resume' | 'wait', waitMs = 0): Promise<void> {
    const socket = this.socket;
    this.socket = null;
    this.generation++;
    this.helloAt = 0;
    try {
      socket?.close(code, 'reconnect');
    } catch {
      // A socket that is already gone has nothing to close.
    }
    if (how === 'wait') await this.retryAt(this.deps.now() + waitMs, '');
    else await this.retryAt(this.deps.now() + 250, '');
  }

  async retryLater(why: string): Promise<void> {
    const delay = reconnectDelay(this.status.attempts, this.deps.chance());
    this.status.attempts++;
    await this.retryAt(this.deps.now() + delay, why);
  }

  async retryAt(when: number, why: string): Promise<void> {
    if (why) this.status.lastError = why;
    this.status.retryAt = when;
    await this.setState('waiting');
    await this.deps.setAlarm(when);
  }

  /** Stop until the settings change or the owner presses Start. */
  async fatal(why: string): Promise<void> {
    this.status.lastError = why;
    this.status.fatalKey = this.settingsKey;
    await this.setState('fatal');
  }

  async clearSession(): Promise<void> {
    this.session = null;
    this.handled = null;
    this.pendingSeq = null;
    await this.deps.storage.delete('session');
  }

  /** Close for good until `ensure({ force: true })`: the owner's off switch. */
  async stop(): Promise<void> {
    await this.load();
    const socket = this.socket;
    this.socket = null;
    this.generation++;
    // an attempt still on its way gives way at its next step; a Start pressed meanwhile is not joined to it
    this.connecting = null;
    try {
      socket?.close(1000, 'stopped');
    } catch {
      // Already closed.
    }
    await this.clearSession();
    this.status.lastError = 'Stopped from the panel.';
    this.status.fatalKey = '';
    await this.setState('fatal');
  }
}
