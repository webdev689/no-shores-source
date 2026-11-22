// The page's way to the chat's hall in the accounts (server/accounts/chatHall.ts): a socket that sends the session's
// token, hears lines and notices, and says lines. It joins again by itself when the socket closes, waiting a little
// longer each time, and starts afresh when the account changes.
import { type FromHall, type Said, fromHallOf } from '../../../../server/accounts/chatLaw.ts';

/** The socket the chat speaks through. */
export type ChatSocket = Pick<WebSocket, 'send' | 'close' | 'addEventListener' | 'readyState'>;

/** How long the link waits before joining again, in milliseconds: doubling from the first to the most. */
const AGAIN_FIRST_MS = 2_000;
const AGAIN_MOST_MS = 30_000;
/** The close the hall gives a reason the player reads with. */
const SAID = 4003;

export class ChatLink {
  private socket: ChatSocket | null = null;
  private wait = AGAIN_FIRST_MS;
  private again: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  /** The player's username as the hall named them; null for a guest, or before it has. */
  name: string | null = null;
  /** Whether the hall has welcomed the player. */
  welcomed = false;

  private readonly address: string;
  private readonly token: () => Promise<string | null>;
  private readonly heard: (said: FromHall) => void;
  private readonly open: (address: string) => ChatSocket;

  /** A link to the hall at `address`, signing in with `token`, telling `heard` what the hall says. */
  constructor(
    address: string,
    token: () => Promise<string | null>,
    heard: (said: FromHall) => void,
    open: (address: string) => ChatSocket = (where) => new WebSocket(where),
  ) {
    [this.address, this.token, this.heard, this.open] = [address, token, heard, open];
  }

  /** Joins the hall, once the session's token is known; a page with none joins nothing. */
  async start(): Promise<void> {
    const token = await this.token();
    if (token === null || this.stopped) return;
    const socket = this.open(this.address);
    this.socket = socket;
    socket.addEventListener('open', () => socket.send(token));
    socket.addEventListener('message', (event) => {
      const said = typeof event.data === 'string' ? fromHallOf(event.data) : null;
      if (!said || socket !== this.socket) return;
      if ('welcome' in said) [this.name, this.welcomed, this.wait] = [said.welcome.name, true, AGAIN_FIRST_MS];
      this.heard(said);
    });
    socket.addEventListener('close', (event) => {
      if (socket !== this.socket) return;
      [this.socket, this.welcomed] = [null, false];
      if (event.code === SAID && event.reason) this.heard({ told: event.reason });
      if (this.stopped || event.code === SAID) return;
      this.again = setTimeout(() => void this.start(), this.wait);
      this.wait = Math.min(AGAIN_MOST_MS, this.wait * 2);
    });
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
    this.stopped = false;
    void this.start();
  }

  close(): void {
    this.stopped = true;
    if (this.again) clearTimeout(this.again);
    const socket = this.socket;
    [this.socket, this.welcomed, this.name] = [null, false, null];
    socket?.close(1000, 'left');
  }
}
