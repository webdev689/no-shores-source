// The page's way to the chat's hall in the accounts (server/accounts/chatHall.ts): a socket that sends the session's
// token, hears lines and notices, and says lines. It joins again by itself when the socket closes, or when the page
// has no session yet, waiting a little longer each time and a little more or less than that, so a hall restarted for
// a deploy is not met by every page at once; and it starts afresh when the account changes.
import { type FromHall, type Said, fromHallOf } from '../../../../server/accounts/chatLaw.ts';

/** The socket the chat speaks through. */
export type ChatSocket = Pick<WebSocket, 'send' | 'close' | 'addEventListener'>;

/** How long the link waits before joining again, in milliseconds: doubling from the first to the most, a fifth more
 *  or less at random. */
const AGAIN_FIRST_MS = 2_000;
const AGAIN_MOST_MS = 30_000;
const AGAIN_SPREAD = 0.2;
/** The close the hall gives a reason the player reads with. */
const SAID = 4003;

/** Where the link stands: joining (or between tries), welcomed, or refused by the hall for a reason it gave. */
export type ChatState = 'joining' | 'welcomed' | 'refused';

export class ChatLink {
  private socket: ChatSocket | null = null;
  private wait = AGAIN_FIRST_MS;
  private again: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  /** Each start's number: a start overtaken by a later one (the account changed meanwhile) opens nothing. */
  private runs = 0;
  /** The player's username as the hall named them; null for a guest, or before it has. */
  name: string | null = null;
  state: ChatState = 'joining';

  private readonly address: string;
  private readonly token: () => Promise<string | null>;
  private readonly heard: (said: FromHall) => void;
  private readonly open: (address: string) => ChatSocket;
  private readonly spread: () => number;

  /** A link to the hall at `address`, signing in with `token`, telling `heard` what the hall says. */
  constructor(
    address: string,
    token: () => Promise<string | null>,
    heard: (said: FromHall) => void,
    open: (address: string) => ChatSocket = (where) => new WebSocket(where),
    spread: () => number = Math.random,
  ) {
    [this.address, this.token, this.heard, this.open, this.spread] = [address, token, heard, open, spread];
  }

  /** Whether the hall has welcomed the player. */
  get welcomed(): boolean {
    return this.state === 'welcomed';
  }

  /** Joins the hall once the session's token is known; with none yet, tries again after a wait. */
  async start(): Promise<void> {
    const run = ++this.runs;
    const token = await this.token().catch(() => null);
    if (this.stopped || run !== this.runs) return;
    if (token === null) return this.later();
    const socket = this.open(this.address);
    this.socket = socket;
    socket.addEventListener('open', () => socket.send(token));
    socket.addEventListener('message', (event) => {
      const said = typeof event.data === 'string' ? fromHallOf(event.data) : null;
      if (!said || socket !== this.socket) return;
      if ('welcome' in said) [this.name, this.state, this.wait] = [said.welcome.name, 'welcomed', AGAIN_FIRST_MS];
      this.heard(said);
    });
    socket.addEventListener('close', (event) => {
      if (socket !== this.socket) return;
      [this.socket, this.state] = [null, 'joining'];
      if (event.code === SAID && event.reason) {
        this.state = 'refused';
        this.heard({ told: event.reason });
        return;
      }
      if (!this.stopped) this.later();
    });
  }

  /** Joins again after the wait, which grows for the next. */
  private later(): void {
    const wait = this.wait * (1 + (this.spread() * 2 - 1) * AGAIN_SPREAD);
    this.again = setTimeout(() => void this.start(), wait);
    this.wait = Math.min(AGAIN_MOST_MS, this.wait * 2);
  }

  /** Says a line; false while the hall does not hear the page. */
  say(said: Said): boolean {
    if (!this.socket || !this.welcomed) return false;
    this.socket.send(JSON.stringify(said));
    return true;
  }

  /** Lets the socket go and joins again at once: the account changed. */
  restart(): void {
    this.close();
    [this.stopped, this.wait] = [false, AGAIN_FIRST_MS];
    void this.start();
  }

  close(): void {
    this.stopped = true;
    this.runs += 1;
    if (this.again) clearTimeout(this.again);
    const socket = this.socket;
    [this.socket, this.state, this.name] = [null, 'joining', null];
    socket?.close(1000, 'left');
  }
}
