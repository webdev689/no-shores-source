// The Discord Gateway's protocol as plain data and pure functions: opcodes, intents, close codes, the payloads the bot
// sends, and the timing it keeps. No socket and no clock lives here, so every rule can be tested without Discord.

export const GATEWAY_VERSION = 10;

export const OPCODE = Object.freeze({
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  PRESENCE_UPDATE: 3,
  VOICE_STATE_UPDATE: 4,
  RESUME: 6,
  RECONNECT: 7,
  REQUEST_GUILD_MEMBERS: 8,
  INVALID_SESSION: 9,
  HELLO: 10,
  HEARTBEAT_ACK: 11,
});

export const INTENT = Object.freeze({
  GUILDS: 1 << 0,
  GUILD_MEMBERS: 1 << 1,
  GUILD_MODERATION: 1 << 2,
  GUILD_EXPRESSIONS: 1 << 3,
  GUILD_INTEGRATIONS: 1 << 4,
  GUILD_WEBHOOKS: 1 << 5,
  GUILD_INVITES: 1 << 6,
  GUILD_VOICE_STATES: 1 << 7,
  GUILD_PRESENCES: 1 << 8,
  GUILD_MESSAGES: 1 << 9,
  GUILD_MESSAGE_REACTIONS: 1 << 10,
  GUILD_MESSAGE_TYPING: 1 << 11,
  DIRECT_MESSAGES: 1 << 12,
  DIRECT_MESSAGE_REACTIONS: 1 << 13,
  DIRECT_MESSAGE_TYPING: 1 << 14,
  MESSAGE_CONTENT: 1 << 15,
  GUILD_SCHEDULED_EVENTS: 1 << 16,
  AUTO_MODERATION_CONFIGURATION: 1 << 20,
  AUTO_MODERATION_EXECUTION: 1 << 21,
  GUILD_MESSAGE_POLLS: 1 << 24,
});

// Presences are left out on purpose: they are the noisiest stream Discord sends and no feature reads them.
// GUILD_MEMBERS and MESSAGE_CONTENT are privileged: the application must have both turned on in Discord's Developer
// Portal. GUILD_EXPRESSIONS keeps the server's emoji for the panel's picker.
export const BOT_INTENTS =
  INTENT.GUILDS |
  INTENT.GUILD_MEMBERS |
  INTENT.GUILD_MODERATION |
  INTENT.GUILD_EXPRESSIONS |
  INTENT.GUILD_INVITES |
  INTENT.GUILD_VOICE_STATES |
  INTENT.GUILD_MESSAGES |
  INTENT.GUILD_MESSAGE_REACTIONS |
  INTENT.MESSAGE_CONTENT |
  INTENT.GUILD_SCHEDULED_EVENTS |
  INTENT.AUTO_MODERATION_EXECUTION;

/** Close codes after which Discord will never accept the same identify again: retrying only burns the daily budget. */
const FATAL_CLOSE = new Set([4004, 4010, 4011, 4012, 4013]);
/** Intents the Developer Portal has not allowed yet: a person's switch there, so the bot asks again after a wait. */
const LATER_CLOSE = new Set([4014]);
/** How long the bot waits before asking again with intents Discord refused. */
export const INTENTS_WAIT_MS = 60 * 60 * 1000;
/** Close codes that end the session itself: the next connection must identify, not resume. */
const FRESH_CLOSE = new Set([4003, 4007, 4009]);

/** What to do after the socket closed with `code`. */
export function closePolicy(code: number): 'resume' | 'identify' | 'fatal' | 'later' {
  if (FATAL_CLOSE.has(code)) return 'fatal';
  if (LATER_CLOSE.has(code)) return 'later';
  if (FRESH_CLOSE.has(code)) return 'identify';
  return 'resume';
}

/** Words for a fatal close, for the panel's health card. */
export function fatalReason(code: number): string {
  switch (code) {
    case 4004:
      return 'The bot token was refused. Rotate DISCORD_BOT_TOKEN.';
    case 4013:
    case 4014:
      return 'Discord refused the intents. Turn on Server Members and Message Content for the application.';
    default:
      return `Discord closed the Gateway with code ${code}.`;
  }
}

export function identifyPayload(token: string, intents: number) {
  return {
    op: OPCODE.IDENTIFY,
    d: {
      token,
      intents,
      properties: { os: 'cloudflare', browser: 'noshores-bot', device: 'noshores-bot' },
      presence: { since: null, activities: [], status: 'online', afk: false },
    },
  };
}

export function resumePayload(token: string, sessionId: string, seq: number | null) {
  return { op: OPCODE.RESUME, d: { token, session_id: sessionId, seq } };
}

export function heartbeatPayload(seq: number | null) {
  return { op: OPCODE.HEARTBEAT, d: seq };
}

/**
 * The Gateway URL to open: the resume URL Discord gave the session when resuming, else the one it named for bots.
 * Workers open an outbound WebSocket with an https fetch, so the scheme is rewritten.
 */
export function gatewayUrl(base: string): string {
  const url = new URL(base.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:'));
  url.searchParams.set('v', String(GATEWAY_VERSION));
  url.searchParams.set('encoding', 'json');
  return url.toString();
}

// Discord asks the first beat to land at a random point in the first interval, so a fleet of clients that reconnect
// together do not beat together.
/** `chance` is in [0, 1). */
export function firstBeatDelay(intervalMs: number, chance: number): number {
  return Math.max(250, Math.floor(intervalMs * chance));
}

export const RECONNECT_MIN_MS = 1_000;
export const RECONNECT_MAX_MS = 60_000;

/**
 * Back-off before the next connection attempt: doubling from a second, capped at a minute, with up to a quarter of
 * jitter so a Discord outage does not get a synchronised wave of reconnects when it ends. `attempt` is 0 for the
 * first retry; `chance` is in [0, 1).
 */
export function reconnectDelay(attempt: number, chance: number): number {
  const base = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * 2 ** Math.max(0, Math.min(attempt, 16)));
  return Math.floor(base * (1 + chance * 0.25));
}

/**
 * Whether the last beat went unanswered when the next one is due: a zombied connection, which Discord says to drop
 * and resume.
 */
export function isZombie(beats: { readonly lastBeatAt: number; readonly lastAckAt: number }): boolean {
  return beats.lastBeatAt > 0 && beats.lastAckAt < beats.lastBeatAt;
}

/** One Gateway frame: its opcode, data, sequence and event name, as Discord names them. */
export interface Frame {
  readonly op: number;
  readonly d: unknown;
  readonly s: number | null;
  readonly t: string | null;
}

/** Parse one Gateway frame. Answers null for anything that is not a JSON object with a numeric opcode. */
export function parseFrame(data: unknown): Frame | null {
  if (typeof data !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const value = parsed as Record<string, unknown>;
  if (typeof value.op !== 'number' || !Number.isInteger(value.op)) return null;
  return {
    op: value.op,
    d: value.d ?? null,
    s: typeof value.s === 'number' && Number.isSafeInteger(value.s) ? value.s : null,
    t: typeof value.t === 'string' ? value.t : null,
  };
}
