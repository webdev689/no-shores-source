/**
 * Each player's character, kept by the accounts while they play in a room on land or at sea. A browser sends its session's
 * token once it has joined; the room claims the character with it, gives it to the player, saves it soon after it
 * changes and now and then besides (which keeps the room's hold), and lets it go with a last save when they leave. A
 * player who sends no token in time, or whose token is no session, is sent away, since one who never signs in would
 * hold a place in the room for good; one whose claim the accounts do not answer plays a character that is not kept.
 * Should another room take the character (the same player joined elsewhere), this room's next save learns it, and the
 * player is let go. A run's room is kept to one company of four accounts at most (`forCompany`), and keeps no one
 * unkept. A node's room judges where each character comes from (`judgingArrivals`).
 */

import type { Claimed, Characters as Kept } from './accounts/characters.ts';
import { NO_WAY_HERE } from './arrival.ts';
import { nodeRoom, runFull } from './roomNames.ts';

/** What a room keeps characters with: claiming, saving and letting go, and a player's companions. */
type Characters = Pick<Kept, 'look' | 'claim' | 'save' | 'release' | 'companions' | 'launched'>;

/** Why a run's room sends a player away who is in no company of those kept in it. */
export const ANOTHER_COMPANY = "This run is another company's.";
/** Why a playlist's run sends away a first player the server never started it for: its dungeon is the server's draw. */
export const FROM_THE_PLAYLIST = 'Start this run from the Playlist.';
/** Why a room sends away a player it cannot keep: their token is no session, or none came in time. */
export const SIGN_IN = 'Sign in to play online.';
export const SIGN_IN_FOR_RUN = 'Sign in to enter this run.';
/** Why a run's room sends a player away while the accounts do not answer: joining again may find them back. */
export const ACCOUNTS_TROUBLE = 'Something went wrong. Try again.';

/** What the keeper needs of the room. */
export interface KeptRoom {
  character(player: number): string | null;
  restoreCharacter(player: number, kept: string): boolean;
  /** Notes the account that keeps a player's character. */
  own(player: number, account: string): boolean;
  /** Names a player by their account's username, which others read over their head. */
  name(player: number, name: string): boolean;
  /** Why the room's gate shuts to a player's kept character, or to a new one (null), with the story the player already
   *  holds in the room carried forward; empty when it may enter. */
  shut(player: number, kept: string | null): string;
}

/** How soon a change is saved, and how often a character is saved unchanged, to keep the room's hold. */
export const SAVE_AFTER_CHANGE_MS = 2_000;
export const SAVE_UNCHANGED_MS = 20_000;
/** How long a leaving player's release, or a joining player's claim the accounts did not answer, waits before each
 *  try after the first: through a blip, a redeploy and a minute's outage. Then a leaver's last save is made on its own,
 *  and a joiner plays on unkept. */
const LEAVE_WAITS_MS = [1_000, 4_000, 15_000, 40_000];
const CLAIM_WAITS_MS = [1_000, 4_000];
/** How long a room that keeps characters, and Find a Company, wait for a joined socket's token: as long as a claim's
 *  own waits. */
export const TOKEN_WAIT_MS = CLAIM_WAITS_MS.reduce((total, millis) => total + millis, 0);
const sleep = (millis: number) => new Promise<void>((resolve) => setTimeout(resolve, millis));

/** Whether a kept character's body says it left its room by a dungeon's way out (`gear::left`'s `out`). */
export function leftByWayOut(body: string | null): boolean {
  if (body === null) return false;
  try {
    return (JSON.parse(body) as { left?: { out?: unknown } }).left?.out === true;
  } catch {
    return false;
  }
}

/** A session's token, as a browser sends it. */
export const TOKEN = /^[0-9a-f]{64}$/;

interface Held {
  readonly account: string;
  readonly holder: string;
  /** The room that held the character before this one, and whether it left that room by a dungeon's way out. */
  readonly from: string | null;
  readonly out: boolean;
  changed: boolean;
  savedAt: number;
  saving: boolean;
  /** The character as last saved, so a change that changed nothing (a refused ask) is not saved again. */
  saved: string | null;
  /** The save under way, which a leaving player's last save waits for so it is never overtaken by an older one. */
  inFlight: Promise<unknown> | null;
}

export class Keeper {
  private readonly characters: Characters | null;
  private readonly room: KeptRoom;
  private readonly name: string;
  /** Called for a player whose character another room took, or, with why, one the room's gate shuts to or a run
   *  cannot keep: `rejoinable` where joining again may let them in. */
  private readonly lost: (player: number, why?: string, rejoinable?: boolean) => void;
  private readonly held = new Map<number, Held>();
  private readonly wait: (millis: number) => Promise<void>;
  private company = false;
  /** Whether a character that came from a room, kept as it was claimed, may arrive here by a way that needs no one
   *  here (`arrival.ts`); null where the room judges no arrival. */
  private arrives: ((from: string | null, body: string | null) => boolean) | null = null;
  /** The accounts a run has let in, for as long as it lives: one back after the rest left a while finds it theirs. */
  private readonly admitted = new Set<string>();

  constructor(
    characters: Characters | null,
    room: KeptRoom,
    name: string,
    lost: (player: number, why?: string, rejoinable?: boolean) => void,
    wait: (millis: number) => Promise<void> = sleep,
  ) {
    this.characters = characters;
    this.room = room;
    this.name = name;
    this.lost = lost;
    this.wait = wait;
  }

  /** Keeps this room to one company: a character is given while no one was let in yet, to one let in before, or to
   *  one in the company of someone let in; any other is let go untouched, its player sent away with the reason. A
   *  player it cannot keep is sent away too, since one unkept could play in it unseen by the company's check. */
  forCompany(): this {
    this.company = true;
    return this;
  }

  /** Judges where each kept character comes from: one that came by no way leading here is let go untouched, its
   *  player sent away saying so, unless one of their company plays here (the Roster's join brings them in). */
  judgingArrivals(arrives: (from: string | null, body: string | null) => boolean): this {
    this.arrives = arrives;
    return this;
  }

  /** Whether a kept player's character left the room it came from by a dungeon's way out: its exit door, or its open
   *  return portal, as that room kept it (`gear::left`'s `out`). */
  leftByWayOut(player: number): boolean {
    return this.held.get(player)?.out ?? false;
  }

  /** The room a kept player's character came from; null for one not kept here, or a character no room held before. */
  cameFrom(player: number): string | null {
    return this.held.get(player)?.from ?? null;
  }

  /** Names a kept player by the username their session's account keeps now, as one taken since they signed in; their
   *  token must still be their account's. */
  async rename(player: number, token: string): Promise<void> {
    const held = this.held.get(player);
    const looked = held ? await this.characters?.look(token) : null;
    if (held && looked && looked.account === held.account && looked.name !== null) this.room.name(player, looked.name);
  }

  /** Claims a player's character with their session's token and gives it to them; whether it is now kept. `here`
   *  says whether the player is still in the room once the claim is answered. */
  async signIn(player: number, token: string, now: () => number, here: () => boolean): Promise<boolean> {
    const characters = this.characters;
    if (!characters || this.held.has(player) || this.room.character(player) === null) return false;
    const holder = `${this.name}:${crypto.randomUUID()}`;
    // Every room judges a character before it claims it, so one turned away (by its gate, its company or the way it
    // came) is never taken from the room that plays it (a second tab plays on, its unsaved progress kept); the claim is
    // judged again, as the character may have moved on meanwhile.
    const looked = await this.tried(() => characters.look(token), here);
    const judgedFirst = looked ? await this.judged(player, looked, here) : looked === null ? this.unsigned : undefined;
    // Outside a run, accounts that do not answer leave the player to play unkept, as a claim unanswered does, and
    // claim nothing: a claim judged after them could take the character from the room that plays it.
    if (judgedFirst === undefined && !this.company) return false;
    if (judgedFirst !== '') {
      const trouble = judgedFirst === undefined;
      if (here()) this.lost(player, judgedFirst ?? ACCOUNTS_TROUBLE, trouble);
      return false;
    }
    const claimed = await this.tried(() => characters.claim(token, holder), here);
    if (!claimed) {
      // A claim the accounts never answered (undefined) may be answered on a join again, and outside a run the player
      // plays on unkept meanwhile; no session never is.
      const passing = claimed === undefined;
      if ((this.company || !passing) && here()) this.lost(player, passing ? ACCOUNTS_TROUBLE : this.unsigned, passing);
      return false;
    }
    const shut = await this.judged(player, claimed, here);
    if (shut === undefined) {
      // The company cannot be judged: refused for now, with nothing of this room saved over the character.
      await characters.release(claimed.account, holder, null).catch(() => false);
      if (here()) this.lost(player, ACCOUNTS_TROUBLE, true);
      return false;
    }
    if (shut !== '') {
      // Left as kept: the gate shuts here, so nothing of this room may be saved over it.
      await characters.release(claimed.account, holder, null).catch(() => false);
      if (here()) this.lost(player, shut);
      return false;
    }
    // A new account's character is the one the room holds, given back so the room keeps it as any other.
    const own = claimed.body === null ? this.room.character(player) : null;
    if (own !== null) this.room.restoreCharacter(player, own);
    const given = claimed.body === null || this.room.restoreCharacter(player, claimed.body);
    if (!here() || !given || this.held.has(player)) {
      // Gone already, or kept as nothing this room can read: let it go untouched rather than save over it.
      await characters.release(claimed.account, holder, null).catch(() => false);
      // A run keeps no one unkept, and joining again would find the same body.
      if (this.company && !given && here()) this.lost(player, ACCOUNTS_TROUBLE, false);
      return false;
    }
    // One account plays one player here: its older socket (a rejoin the room has not seen close, or a second tab) goes
    // first, so the room keeps that body before this player is given it.
    for (const [other, kept] of this.held)
      if (kept.account === claimed.account) {
        this.held.delete(other);
        this.lost(other);
      }
    this.room.own(player, claimed.account);
    if (claimed.name !== null) this.room.name(player, claimed.name);
    if (this.company) this.admitted.add(claimed.account);
    this.held.set(player, {
      account: claimed.account,
      holder,
      from: claimed.from,
      out: leftByWayOut(claimed.body),
      changed: claimed.body === null,
      savedAt: now(),
      saving: false,
      saved: claimed.body,
      inFlight: null,
    });
    return true;
  }

  /** Why this room turns a character away ('' when it lets it in): its gate, in a run its four accounts and its
   *  company, and where it came from; undefined when the accounts cannot say who the company is. Nothing waits
   *  between this and keeping it. */
  private async judged(
    player: number,
    { account, body, from }: Claimed,
    here: () => boolean,
  ): Promise<string | undefined> {
    const characters = this.characters;
    const companions =
      this.company && characters ? await this.tried(() => characters.companions(account, this.name), here) : null;
    if (companions === undefined) return undefined;
    // A run is full by the accounts it keeps, so a member's own older socket never counts against them.
    const others = new Set([...this.held.values()].map((held) => held.account).filter((one) => one !== account));
    const full = this.company ? runFull(this.name, others.size + 1) : null;
    // A playlist's run is the server's: its first player must be one the server drew it for (`finding.ts`).
    const drawn =
      this.admitted.size === 0 && characters && (nodeRoom(this.name.slice('node-'.length))?.playlist ?? null) !== null
        ? await this.tried(() => characters.launched(account, this.name), here)
        : true;
    if (drawn === undefined) return undefined;
    const shut =
      this.room.shut(player, body) ||
      (full ?? (companions && !this.admits(companions) ? ANOTHER_COMPANY : '')) ||
      (drawn ? '' : FROM_THE_PLAYLIST);
    if (shut !== '' || !characters || !this.arrives || this.arrives(from, body)) return shut;
    // Come by no way that leads here, a player may still join one of their company who plays here.
    const company = companions ?? (await this.tried(() => characters.companions(account, this.name), here));
    if (company === undefined) return undefined;
    const playing = new Set([...this.held.values()].map((held) => held.account));
    return company.some((one) => one !== account && playing.has(one)) ? '' : NO_WAY_HERE;
  }

  /** What `ask` answers, asked again after each of a claim's waits while the accounts do not answer and the player is
   *  still here; undefined if they never did. */
  private async tried<T>(ask: () => Promise<T>, here: () => boolean): Promise<T | undefined> {
    let answer = await ask().catch(() => undefined);
    for (const millis of CLAIM_WAITS_MS) {
      if (answer !== undefined || !here()) break;
      await this.wait(millis);
      answer = await ask().catch(() => undefined);
    }
    return answer;
  }

  /** In a room that keeps characters, sends away a player who has sent no token (`signed`) once a claim's own waits
   *  have passed. */
  async tokenDue(player: number, signed: () => boolean, here: () => boolean): Promise<void> {
    if (!this.characters) return;
    await this.wait(TOKEN_WAIT_MS);
    if (here() && !signed()) this.lost(player, this.unsigned, false);
  }

  /** Why this room sends away a player it cannot keep. */
  private get unsigned(): string {
    return this.company ? SIGN_IN_FOR_RUN : SIGN_IN;
  }

  /** Whether no one was let in yet, or someone among `companions` (a player and their company) was. */
  private admits(companions: readonly string[]): boolean {
    return this.admitted.size === 0 || companions.some((account) => this.admitted.has(account));
  }

  /** Notes that a player's character changed. */
  changed(player: number): void {
    const held = this.held.get(player);
    if (held) held.changed = true;
  }

  /** Saves each character that changed a while ago, or has gone unsaved long enough. */
  async due(now: number): Promise<void> {
    const characters = this.characters;
    if (!characters) return;
    const saves = [...this.held].map(async ([player, held]) => {
      const waited = now - held.savedAt;
      if (held.saving || (waited < SAVE_UNCHANGED_MS && !(held.changed && waited >= SAVE_AFTER_CHANGE_MS))) return;
      const body = this.room.character(player);
      if (body === null) return;
      held.changed = false;
      // Unchanged, it is saved only to keep the hold.
      if (body === held.saved && waited < SAVE_UNCHANGED_MS) return;
      held.saving = true;
      const saving = characters.save(held.account, held.holder, body).catch(() => null);
      held.inFlight = saving;
      const saved = await saving;
      held.saving = false;
      held.inFlight = null;
      if (saved === false && this.held.get(player) === held) {
        this.held.delete(player);
        this.lost(player);
      } else if (saved === true) {
        held.savedAt = now;
        held.saved = body;
      } else {
        // The accounts could not be reached: try again soon.
        held.changed = true;
      }
    });
    await Promise.all(saves);
  }

  /** Lets a player's character go with a last save; call it, without waiting, before the room lets the player go. A
   *  release the accounts did not answer is tried again after a wait, then the last save is made on its own, so an
   *  outage of a minute loses none of it: the hold then lapses by itself. */
  async leave(player: number): Promise<void> {
    const held = this.held.get(player);
    const characters = this.characters;
    if (!held || !characters) return;
    this.held.delete(player);
    // Read before any wait: the room lets the player go in the same tick this is called.
    const body = this.room.character(player);
    await held.inFlight;
    for (const millis of [0, ...LEAVE_WAITS_MS]) {
      if (millis > 0) await this.wait(millis);
      const released = await characters.release(held.account, held.holder, body).catch(() => null);
      if (released !== null) return;
    }
    if (body !== null) await characters.save(held.account, held.holder, body).catch(() => false);
  }
}

/** Lets a player go from a room: their chests are opened for them, what still lies for them goes to their mail, then
 *  their character's last save reads it, and only then does the room let them go. `guarded` runs a call into the room,
 *  catching a fault in it. */
export function partFrom(
  room: { parting(player: number): void; mailLying(player: number): void; leave(player: number): void },
  keeper: Pick<Keeper, 'leave'> | null,
  player: number,
  guarded: (call: () => void) => void,
): void {
  guarded(() => room.parting(player));
  guarded(() => room.mailLying(player));
  void keeper?.leave(player);
  guarded(() => room.leave(player));
}
