/**
 * The chat's hall: every page's chat socket, and where each line goes. A socket's first message is its session's
 * token; a guest hears but has no name to speak with. Local goes to everyone whose character the same room holds
 * (each page keeps only the lines of those near enough to hear), Region to every ship in the same water at sea, World
 * to everyone, and a Whisper to one player by name; each also back to the one who said it. A line never reaches anyone
 * who blocks its speaker, whom its speaker blocks, or who mutes its speaker; a Whisper to one of them is answered as
 * sent and never arrives, as the Roster's asks are. Lines are cleaned, a blocked word starred letter for letter, and
 * each account held to two a second, however many sockets it opens.
 */

import { type ChatLine, LINES_A_SECOND, NAME_MOST, cleanLine, saidOf } from './chatLaw.ts';
import { starred } from './chatWords.ts';
import { TOKEN, TOKEN_WAIT_MS } from '../keeping.ts';
import { seaRoom } from '../roomNames.ts';

/** How many sockets the hall holds signed in, and silent beside them; how many one account may hold; and how many
 *  lines the whole of World carries a second. */
export const HALL_MOST = 2048;
export const SILENT_MOST = 256;
/** How many sockets one address may hold before they sign in: enough for a household's tabs, too few to fill the hall. */
export const SILENT_FROM_ONE = 8;
export const ACCOUNT_SOCKETS_MOST = 4;
export const WORLD_A_SECOND = 20;
/** How many lines in a row may come too fast before the account's sockets are let go. */
export const STRIKES_MOST = 20;
/** How long where each player plays, and whom each is kept apart from, are kept before they are asked again; and how
 *  often each socket's session is asked again, so one signed out everywhere stops speaking. */
export const PLACES_KEPT_MS = 5_000;
export const APART_KEPT_MS = 30_000;
export const SESSION_KEPT_MS = 60_000;
/** The longest message a page sends: a line and its channel, far past any line's most. */
const MESSAGE_MOST = 2_048;

export const SIGN_IN = 'Sign in to chat.';
export const NAME_FIRST = 'Add a username in Settings to chat.';
export const TOO_FAST = 'You are sending lines too quickly.';
export const NOT_ALLOWED = 'That line is not allowed.';
export const NOWHERE = 'You are not in a place to speak in yet.';
export const NOT_AT_SEA = 'Region is heard at sea.';
export const ON_LAND = 'Local is heard on land. At sea, say it to your water with /sea.';
export const BUSY = 'World is busy. Try again in a moment.';
export const TOO_MANY = 'You are chatting in too many tabs.';
export const UNSENT = 'That line could not be sent. Try again.';

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

/** Where a player plays: the room that holds their character or last said they were there, and at sea the water. */
export interface Place {
  readonly room: string | null;
  readonly water: string | null;
}

/** What the hall asks the accounts, and its clock. */
export interface HallDeps {
  speaker(token: string): Promise<Speaker | null>;
  places(accounts: readonly string[]): Promise<ReadonlyMap<string, Place>>;
  /** The accounts one blocks or is blocked by, and those who mute it. */
  apart(account: string): Promise<readonly string[]>;
  mutedBy(account: string): Promise<readonly string[]>;
  /** The account a username names, however it is typed, and the name as it is kept. */
  named(name: string): Promise<{ readonly account: string; readonly name: string } | null>;
  /** Whether `blocker` blocks `blocked`. */
  blocks(blocker: string, blocked: string): Promise<boolean>;
  readonly now: () => number;
}

interface Held {
  readonly socket: HallSocket;
  readonly address: string;
  readonly since: number;
  speaker: Speaker | null;
  token: string;
  checked: number;
  /** Its messages, each taken once the one before is done, so a player's lines go out in the order said. */
  taking: Promise<void>;
}

/** Lines an account may send now, as a bucket fills, when it was last filled, and lines in a row sent too fast. */
interface Allowance {
  lines: number;
  filled: number;
  strikes: number;
}

export class Hall {
  private readonly deps: HallDeps;
  private readonly sockets = new Map<number, Held>();
  private readonly allowances = new Map<string, Allowance>();
  private next = 1;
  private places: { at: number; of: ReadonlyMap<string, Place> } = { at: -Infinity, of: new Map() };
  private placing: Promise<ReadonlyMap<string, Place>> | null = null;
  private readonly kept = new Map<string, { at: number; apart: ReadonlySet<string>; muters: ReadonlySet<string> }>();
  private world = { lines: WORLD_A_SECOND, filled: 0 };

  constructor(deps: HallDeps) {
    this.deps = deps;
  }

  /** A socket opened from `address`: its number. */
  opened(socket: HallSocket, address: string): number {
    const number = this.next++;
    const now = this.deps.now();
    const held = { socket, address, since: now, speaker: null, token: '', checked: now, taking: Promise.resolve() };
    this.sockets.set(number, held);
    return number;
  }

  /** A message from socket `number`: first its token, then each line it says, each in its turn. */
  heard(number: number, message: string | ArrayBuffer): Promise<void> {
    const held = this.sockets.get(number);
    if (!held) return Promise.resolve();
    const taken = held.taking.then(() => this.take(number, message));
    held.taking = taken.catch(() => undefined);
    return taken;
  }

  private async take(number: number, message: string | ArrayBuffer): Promise<void> {
    const held = this.sockets.get(number);
    if (!held) return;
    if (typeof message !== 'string' || message.length > MESSAGE_MOST) return this.letGo(number, 1008, 'not a line');
    if (held.token === '') return this.signIn(number, held, message);
    const said = saidOf(message);
    const speaker = held.speaker;
    if (!said || !speaker) return this.letGo(number, 1008, 'not a line');
    if (!this.allowed(speaker.account, held)) return;
    if (speaker.name === null) return this.tell(held, { told: NAME_FIRST });
    const text = cleanLine(said.say);
    if (text === '') return;
    const shown = starred(text);
    if (shown === null) return this.tell(held, { told: NOT_ALLOWED });
    const from = { account: speaker.account, name: speaker.name };
    if (said.channel === 'whisper') return this.whisper(held, from, said.to ?? '', shown);
    if (said.channel === 'world') {
      if (!this.worldAllows()) return this.tell(held, { told: BUSY });
      return this.toEach({ channel: 'world', from: from.name, text: shown }, from.account, () => true);
    }
    const [own, places] = await Promise.all([this.deps.places([from.account]).catch(() => null), this.listeners()]);
    if (!own) return this.tell(held, { told: UNSENT });
    const here = own.get(from.account) ?? { room: null, water: null };
    const atSea = here.room !== null && seaRoom(here.room) !== null;
    if (said.channel === 'region') {
      if (!atSea || here.water === null) return this.tell(held, { told: NOT_AT_SEA });
      const line: ChatLine = { channel: 'region', from: from.name, region: here.water, text: shown };
      return this.toEach(line, from.account, (account) => {
        const there = places.get(account);
        return there?.room === here.room && there.water === here.water;
      });
    }
    if (here.room === null) return this.tell(held, { told: NOWHERE });
    if (atSea) return this.tell(held, { told: ON_LAND });
    const line: ChatLine = { channel: 'local', from: from.name, text: shown };
    return this.toEach(line, from.account, (account) => places.get(account)?.room === here.room);
  }

  /** A socket closed; whom its account is kept apart from is forgotten once it holds no other. What it may still say
   *  is kept until it has filled again (`tick`), so closing and opening again gives no fresh lines. */
  closed(number: number): void {
    const account = this.sockets.get(number)?.speaker?.account;
    this.sockets.delete(number);
    if (account && !this.holds(account)) this.kept.delete(account);
  }

  /** Each second: lets go each socket that sent no token in time, and each whose session has ended since it signed
   *  in, as its session is asked again once a minute. */
  tick(): void {
    const now = this.deps.now();
    for (const [account, allowance] of this.allowances)
      if (now - allowance.filled >= 1000) this.allowances.delete(account);
    for (const [number, held] of this.sockets) {
      if (held.token === '' && held.since <= now - TOKEN_WAIT_MS) this.letGo(number, 4003, SIGN_IN);
      else if (held.speaker && now - held.checked >= SESSION_KEPT_MS) {
        held.checked = now;
        void this.deps
          .speaker(held.token)
          .then((still) => {
            if (still === null && this.sockets.get(number) === held) this.letGo(number, 4003, SIGN_IN);
          })
          .catch(() => undefined);
      }
    }
  }

  /** How many sockets it holds. */
  get open(): number {
    return this.sockets.size;
  }

  /** Whether it takes one more socket from `address`: not while it holds as many in all as it takes beside the
   *  silent, nor while that address holds as many silent as one may. */
  admits(address: string): boolean {
    if (this.sockets.size >= HALL_MOST + SILENT_MOST) return false;
    let silent = 0;
    for (const held of this.sockets.values()) if (!held.speaker && held.address === address) silent += 1;
    return silent < SILENT_FROM_ONE;
  }

  private get signedIn(): number {
    let count = 0;
    for (const held of this.sockets.values()) if (held.speaker) count += 1;
    return count;
  }

  private holds(account: string): boolean {
    return [...this.sockets.values()].some((held) => held.speaker?.account === account);
  }

  /** A socket's token: its player welcomed, or the socket let go when it is no session, or its account already holds
   *  as many sockets as one may. */
  private async signIn(number: number, held: Held, message: string): Promise<void> {
    if (!TOKEN.test(message)) return this.letGo(number, 1008, 'not a token');
    held.token = message;
    const speaker = await this.deps.speaker(message).catch(() => undefined);
    if (this.sockets.get(number) !== held) return;
    if (speaker === undefined) return this.letGo(number, 1011, 'the accounts did not answer');
    if (speaker === null) return this.letGo(number, 4003, SIGN_IN);
    const theirs = [...this.sockets.values()].filter((each) => each.speaker?.account === speaker.account).length;
    if (theirs >= ACCOUNT_SOCKETS_MOST) return this.letGo(number, 4003, TOO_MANY);
    if (this.signedIn >= HALL_MOST) return this.letGo(number, 1013, 'the chat is full');
    [held.speaker, held.checked] = [speaker, this.deps.now()];
    this.tell(held, { welcome: { name: speaker.name } });
  }

  /** A Whisper to the player named `to`: to every socket of theirs and back to the speaker's. One who blocks or mutes
   *  the speaker is answered as sent; one the speaker blocks, or who is not online, is told. */
  private async whisper(held: Held, from: { account: string; name: string }, to: string, text: string): Promise<void> {
    const found = to.length > NAME_MOST ? null : await this.deps.named(to).catch(() => null);
    if (!found || !this.holds(found.account)) return this.tell(held, { told: `${found?.name ?? to} is not online.` });
    if (found.account === from.account) return this.tell(held, { told: 'You cannot whisper to yourself.' });
    const blocks = await this.deps.blocks(from.account, found.account).catch(() => null);
    if (blocks === null) return this.tell(held, { told: UNSENT });
    if (blocks) return this.tell(held, { told: `You blocked ${found.name}. Unblock them in Settings to whisper.` });
    const { apart, muters } = await this.keptFrom(from.account);
    const heard = !apart.has(found.account) && !muters.has(found.account);
    const line: ChatLine = { channel: 'whisper', from: from.name, to: found.name, text };
    const said = JSON.stringify({ line });
    for (const each of this.sockets.values()) {
      const account = each.speaker?.account;
      if (account === from.account || (heard && account === found.account)) this.send(each, said);
    }
  }

  /** `line` to every signed-in socket whose account `hears`, never one kept apart from or muting the speaker's, and
   *  always back to the speaker's own. */
  private async toEach(line: ChatLine, speaker: string, hears: (account: string) => boolean): Promise<void> {
    const { apart, muters } = await this.keptFrom(speaker);
    const said = JSON.stringify({ line });
    for (const each of this.sockets.values()) {
      const account = each.speaker?.account;
      if (account === undefined) continue;
      if (account === speaker || (!apart.has(account) && !muters.has(account) && hears(account))) this.send(each, said);
    }
  }

  /** Whether `account` may say a line now: two a second, a burst of two, across all its sockets; one past that is
   *  refused, and twenty refused in a row let every socket of it go. */
  private allowed(account: string, held: Held): boolean {
    const now = this.deps.now();
    const allowance = this.allowances.get(account) ?? { lines: LINES_A_SECOND, filled: now, strikes: 0 };
    this.allowances.set(account, allowance);
    allowance.lines = Math.min(LINES_A_SECOND, allowance.lines + ((now - allowance.filled) / 1000) * LINES_A_SECOND);
    allowance.filled = now;
    if (allowance.lines >= 1) {
      allowance.lines -= 1;
      allowance.strikes = 0;
      return true;
    }
    allowance.strikes += 1;
    if (allowance.strikes < STRIKES_MOST) this.tell(held, { told: TOO_FAST });
    else
      for (const [number, each] of this.sockets)
        if (each.speaker?.account === account) this.letGo(number, 1008, 'too many lines');
    return false;
  }

  /** Whether World carries one more line now: twenty a second across everyone. */
  private worldAllows(): boolean {
    const now = this.deps.now();
    const world = this.world;
    world.lines = Math.min(WORLD_A_SECOND, world.lines + ((now - world.filled) / 1000) * WORLD_A_SECOND);
    world.filled = now;
    if (world.lines < 1) return false;
    world.lines -= 1;
    return true;
  }

  /** Where everyone signed in plays, asked again once older than PLACES_KEPT_MS, one ask at a time. */
  private async listeners(): Promise<ReadonlyMap<string, Place>> {
    const now = this.deps.now();
    if (now - this.places.at < PLACES_KEPT_MS) return this.places.of;
    this.placing ??= (async () => {
      const accounts = [...new Set([...this.sockets.values()].flatMap((each) => each.speaker?.account ?? []))];
      // An ask that fails keeps the last answer, to be asked again with the next line.
      const found = await this.deps.places(accounts).then(
        (of) => (this.places = { at: this.deps.now(), of }).of,
        () => this.places.of,
      );
      this.placing = null;
      return found;
    })();
    return this.placing;
  }

  /** Those kept apart from `account` and those who mute it, asked again once older than APART_KEPT_MS; kept only
   *  while it holds a socket. */
  private async keptFrom(account: string): Promise<{ apart: ReadonlySet<string>; muters: ReadonlySet<string> }> {
    const now = this.deps.now();
    const kept = this.kept.get(account);
    if (kept && now - kept.at < APART_KEPT_MS) return kept;
    const [apart, muters] = await Promise.all([
      this.deps.apart(account).catch(() => []),
      this.deps.mutedBy(account).catch(() => []),
    ]);
    const fresh = { at: now, apart: new Set(apart), muters: new Set(muters) };
    if (this.holds(account)) this.kept.set(account, fresh);
    return fresh;
  }

  private tell(held: Held, message: unknown): void {
    this.send(held, JSON.stringify(message));
  }

  private send(held: Held, said: string): void {
    try {
      held.socket.send(said);
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
