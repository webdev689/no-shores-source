/**
 * The chat's hall: every page's chat socket, and where each line goes. A socket's first message is its session's
 * token; a guest hears Local and World but has no name to speak with. Local goes to everyone whose character the same
 * room holds (each page keeps only the lines of those near enough to hear), World to everyone, and a Whisper to one
 * player by name; each also back to the one who said it. A line never reaches anyone who blocks its speaker or whom
 * its speaker blocks, and a Whisper to one who blocks the speaker is answered as sent and never arrives, as the
 * Roster's asks are. Lines are cleaned, a blocked word starred letter for letter, and held to two a second.
 */

import { type ChatLine, LINES_A_SECOND, cleanLine, saidOf } from './chatLaw.ts';
import { TOKEN, TOKEN_WAIT_MS } from '../keeping.ts';
import { blocked } from './names.ts';

/** How many sockets the hall holds, signed in or not, and how many lines the whole of World carries a second. */
export const HALL_MOST = 2048;
export const WORLD_A_SECOND = 20;
/** How many lines in a row may come too fast before the socket is let go. */
export const STRIKES_MOST = 20;
/** How long where each player plays, and whom each player is kept apart from, are kept before they are asked again. */
export const PLACES_KEPT_MS = 5_000;
export const APART_KEPT_MS = 30_000;
/** The longest message a page sends: a line and its channel, far past any line's most. */
const MESSAGE_MOST = 2_048;

export const SIGN_IN = 'Sign in to chat.';
export const NAME_FIRST = 'Add a username in Settings to chat.';
export const TOO_FAST = 'You are sending lines too quickly.';
export const NOT_ALLOWED = 'That line is not allowed.';
export const NOWHERE = 'You are not in a place to speak in yet.';

/** A page's chat socket, as the hall speaks to it. */
export interface HallSocket {
  send(text: string): void;
  close(code: number, reason: string): void;
}

/** A signed-in player: their account, and their username (null for a guest). */
export interface Speaker {
  readonly account: string;
  readonly name: string | null;
}

/** What the hall asks the accounts, and its clock. */
export interface HallDeps {
  speaker(token: string): Promise<Speaker | null>;
  /** Where each account plays now: its room, or null while it plays nowhere. */
  places(accounts: readonly string[]): Promise<ReadonlyMap<string, string | null>>;
  /** The accounts one blocks or is blocked by. */
  apart(account: string): Promise<readonly string[]>;
  /** The account a username names, however it is typed, and the name as it is kept. */
  named(name: string): Promise<{ readonly account: string; readonly name: string } | null>;
  /** Whether `blocker` blocks `blocked`. */
  blocks(blocker: string, blocked: string): Promise<boolean>;
  readonly now: () => number;
}

/** A line's words with each word that holds a blocked root starred letter for letter, so it is never longer; null
 *  where the words still spell one across them. */
export function starred(text: string): string | null {
  const shown = text
    .split(' ')
    .map((word) => (blocked(word) ? word.replace(/[\p{L}\p{N}]/gu, '*') : word))
    .join(' ');
  return blocked(shown) ? null : shown;
}

interface Held {
  readonly socket: HallSocket;
  readonly since: number;
  speaker: Speaker | null;
  heard: boolean;
  /** Lines it may send now, as a bucket fills, and when it was last filled; and lines in a row sent too fast. */
  allowance: number;
  filled: number;
  strikes: number;
}

export class Hall {
  private readonly deps: HallDeps;
  private readonly sockets = new Map<number, Held>();
  private next = 1;
  private places: { at: number; of: ReadonlyMap<string, string | null> } = { at: -Infinity, of: new Map() };
  private readonly apart = new Map<string, { at: number; of: ReadonlySet<string> }>();
  private world = { allowance: WORLD_A_SECOND, filled: 0 };

  constructor(deps: HallDeps) {
    this.deps = deps;
  }

  /** A socket opened: its number. */
  opened(socket: HallSocket): number {
    const number = this.next++;
    const now = this.deps.now();
    this.sockets.set(number, {
      socket,
      since: now,
      speaker: null,
      heard: false,
      allowance: 2,
      filled: now,
      strikes: 0,
    });
    return number;
  }

  /** A message from socket `number`: first its token, then each line it says. */
  async heard(number: number, message: string | ArrayBuffer): Promise<void> {
    const held = this.sockets.get(number);
    if (!held) return;
    if (typeof message !== 'string' || message.length > MESSAGE_MOST) return this.letGo(number, 1008, 'not a line');
    if (!held.heard) {
      if (!TOKEN.test(message)) return this.letGo(number, 1008, 'not a token');
      held.heard = true;
      const speaker = await this.deps.speaker(message).catch(() => undefined);
      if (this.sockets.get(number) !== held) return;
      if (speaker === undefined) return this.letGo(number, 1011, 'the accounts did not answer');
      if (speaker === null) return this.letGo(number, 4003, SIGN_IN);
      held.speaker = speaker;
      return this.tell(held, { welcome: { name: speaker.name } });
    }
    const said = saidOf(message);
    if (!said || !held.speaker) return this.letGo(number, 1008, 'not a line');
    if (held.speaker.name === null) return this.tell(held, { told: NAME_FIRST });
    if (!this.allowed(held)) return;
    const text = cleanLine(said.say);
    if (text === '') return;
    const shown = starred(text);
    if (shown === null) return this.tell(held, { told: NOT_ALLOWED });
    const from = { account: held.speaker.account, name: held.speaker.name };
    if (said.channel === 'whisper') return this.whisper(held, from, said.to ?? '', shown);
    if (said.channel === 'world') {
      if (!this.worldAllows()) return;
      return this.toEach({ channel: 'world', from: from.name, text: shown }, from.account, () => true);
    }
    const places = await this.placesNow(from.account);
    const here = places.get(from.account) ?? null;
    if (here === null) return this.tell(held, { told: NOWHERE });
    const line: ChatLine = { channel: 'local', from: from.name, text: shown };
    return this.toEach(line, from.account, (account) => places.get(account) === here);
  }

  /** A socket closed; whom its account is kept apart from is forgotten once it holds no other. */
  closed(number: number): void {
    const account = this.sockets.get(number)?.speaker?.account;
    this.sockets.delete(number);
    if (account && ![...this.sockets.values()].some((each) => each.speaker?.account === account))
      this.apart.delete(account);
  }

  /** Lets go each socket that sent no token in time. */
  tick(): void {
    const late = this.deps.now() - TOKEN_WAIT_MS;
    for (const [number, held] of this.sockets) if (!held.heard && held.since <= late) this.letGo(number, 4003, SIGN_IN);
  }

  /** How many sockets it holds. */
  get open(): number {
    return this.sockets.size;
  }

  get full(): boolean {
    return this.sockets.size >= HALL_MOST;
  }

  /** A Whisper to the player named `to`: to every socket of theirs and back to the speaker's, unless one blocks the
   *  other. One who blocks the speaker is answered as sent; one the speaker blocks, or who is not online, is told. */
  private async whisper(held: Held, from: { account: string; name: string }, to: string, text: string): Promise<void> {
    const found = await this.deps.named(to).catch(() => null);
    const online = found && [...this.sockets.values()].some((each) => each.speaker?.account === found.account);
    if (!found || !online) return this.tell(held, { told: `${found?.name ?? to} is not online.` });
    if (found.account === from.account) return this.tell(held, { told: 'You cannot whisper to yourself.' });
    if (await this.deps.blocks(from.account, found.account).catch(() => true))
      return this.tell(held, { told: `You blocked ${found.name}. Unblock them in Settings to whisper.` });
    const line: ChatLine = { channel: 'whisper', from: from.name, to: found.name, text };
    const theirs = !(await this.deps.blocks(found.account, from.account).catch(() => true));
    for (const each of this.sockets.values()) {
      const account = each.speaker?.account;
      if (account === from.account || (theirs && account === found.account)) this.tell(each, { line });
    }
  }

  /** `line` to every signed-in socket whose account `hears`, never one kept apart from the speaker's, and always
   *  back to the speaker's own. */
  private async toEach(line: ChatLine, speaker: string, hears: (account: string) => boolean): Promise<void> {
    const apart = await this.apartFrom(speaker);
    for (const each of this.sockets.values()) {
      const account = each.speaker?.account;
      if (account === undefined) continue;
      if (account === speaker || (!apart.has(account) && hears(account))) this.tell(each, { line });
    }
  }

  /** Whether `held` may say a line now: two a second, a burst of two; one past that is refused, and twenty in a row
   *  let the socket go. */
  private allowed(held: Held): boolean {
    const now = this.deps.now();
    held.allowance = Math.min(LINES_A_SECOND, held.allowance + ((now - held.filled) / 1000) * LINES_A_SECOND);
    held.filled = now;
    if (held.allowance >= 1) {
      held.allowance -= 1;
      held.strikes = 0;
      return true;
    }
    held.strikes += 1;
    if (held.strikes > STRIKES_MOST) {
      for (const [number, each] of this.sockets) if (each === held) this.letGo(number, 1008, 'too many lines');
    } else this.tell(held, { told: TOO_FAST });
    return false;
  }

  /** Whether World carries one more line now: twenty a second across everyone; one past it is dropped. */
  private worldAllows(): boolean {
    const now = this.deps.now();
    const world = this.world;
    world.allowance = Math.min(WORLD_A_SECOND, world.allowance + ((now - world.filled) / 1000) * WORLD_A_SECOND);
    world.filled = now;
    if (world.allowance < 1) return false;
    world.allowance -= 1;
    return true;
  }

  /** Where everyone signed in plays, asked again once it is older than PLACES_KEPT_MS; the speaker's always fresh. */
  private async placesNow(speaker: string): Promise<ReadonlyMap<string, string | null>> {
    const now = this.deps.now();
    const fresh = now - this.places.at < PLACES_KEPT_MS && this.places.of.has(speaker);
    if (!fresh) {
      const accounts = [...new Set([...this.sockets.values()].flatMap((each) => each.speaker?.account ?? []))];
      this.places = { at: now, of: await this.deps.places(accounts).catch(() => new Map()) };
    }
    return this.places.of;
  }

  /** The accounts kept apart from `account`, asked again once older than APART_KEPT_MS. */
  private async apartFrom(account: string): Promise<ReadonlySet<string>> {
    const now = this.deps.now();
    const kept = this.apart.get(account);
    if (kept && now - kept.at < APART_KEPT_MS) return kept.of;
    const others = new Set(await this.deps.apart(account).catch(() => []));
    this.apart.set(account, { at: now, of: others });
    return others;
  }

  private tell(held: Held, message: unknown): void {
    try {
      held.socket.send(JSON.stringify(message));
    } catch {
      // A socket that throws as it is spoken to has closed already.
    }
  }

  private letGo(number: number, code: number, reason: string): void {
    const held = this.sockets.get(number);
    this.closed(number);
    try {
      held?.socket.close(code, reason);
    } catch {
      // Closed already.
    }
  }
}
