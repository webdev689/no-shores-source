/**
 * Each player's character, kept by the accounts while they play in a room on land. A browser sends its session's
 * token once it has joined; the room claims the character with it, gives it to the player, saves it soon after it
 * changes and now and then besides (which keeps the room's hold), and lets it go with a last save when they leave. A
 * player who sends no token, or whose token is no session, plays a character that is not kept. Should another room
 * take the character (the same player joined elsewhere), this room's next save learns it, and the player is let go.
 * A run's room is kept to one company (`forCompany`), and keeps no one unkept.
 */

import type { Characters as Kept } from './accounts/characters.ts';

/** What a room keeps characters with: claiming, saving and letting go, and a player's companions. */
type Characters = Pick<Kept, 'claim' | 'save' | 'release' | 'companions'>;

/** Why a run's room sends a player away who is in no company of those kept in it. */
export const ANOTHER_COMPANY = "This run is another company's.";
/** Why a run's room sends away a player it cannot keep: their token is no session, or none came in time. */
export const SIGN_IN_FOR_RUN = 'Sign in to enter this run.';
/** Why a run's room sends a player away while the accounts do not answer: joining again may find them back. */
export const ACCOUNTS_TROUBLE = 'Something went wrong. Try again.';

/** What the keeper needs of the room. */
export interface KeptRoom {
  character(player: number): string | null;
  restoreCharacter(player: number, kept: string): boolean;
  /** Notes the account that keeps a player's character. */
  own(player: number, account: string): boolean;
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
/** How long a run's room waits for a joined player's token: as long as a claim's own waits. */
const TOKEN_WAIT_MS = CLAIM_WAITS_MS.reduce((total, millis) => total + millis, 0);
const sleep = (millis: number) => new Promise<void>((resolve) => setTimeout(resolve, millis));

/** A session's token, as a browser sends it. */
export const TOKEN = /^[0-9a-f]{64}$/;

interface Held {
  readonly account: string;
  readonly holder: string;
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
   *  one in the company of someone let in; any other is let go untouched, its player sent away with the reason. A player it cannot keep
   *  is sent away too, since one unkept could play in it unseen by the company's check. */
  forCompany(): this {
    this.company = true;
    return this;
  }

  /** Claims a player's character with their session's token and gives it to them; whether it is now kept. `here`
   *  says whether the player is still in the room once the claim is answered. */
  async signIn(player: number, token: string, now: () => number, here: () => boolean): Promise<boolean> {
    const characters = this.characters;
    if (!characters || this.held.has(player) || this.room.character(player) === null) return false;
    const holder = `${this.name}:${crypto.randomUUID()}`;
    let claimed = await characters.claim(token, holder).catch(() => undefined);
    for (const millis of CLAIM_WAITS_MS) {
      if (claimed !== undefined || !here()) break;
      await this.wait(millis);
      claimed = await characters.claim(token, holder).catch(() => undefined);
    }
    if (!claimed) {
      // A claim the accounts never answered (undefined) may be answered on a join again; no session never is.
      const passing = claimed === undefined;
      if (this.company && here()) this.lost(player, passing ? ACCOUNTS_TROUBLE : SIGN_IN_FOR_RUN, passing);
      return false;
    }
    // Asked before the checks, so nothing waits between judging the company and keeping the character.
    const companions = this.company
      ? await characters.companions(claimed.account).catch(() => [claimed.account])
      : null;
    const shut =
      this.room.shut(player, claimed.body) || (companions && !this.admits(companions) ? ANOTHER_COMPANY : '');
    if (shut !== '') {
      // Left as kept: the gate shuts here, so nothing of this room may be saved over it.
      await characters.release(claimed.account, holder, null).catch(() => false);
      if (here()) this.lost(player, shut);
      return false;
    }
    const given = claimed.body === null || this.room.restoreCharacter(player, claimed.body);
    if (!here() || !given || this.held.has(player)) {
      // Gone already, or kept as nothing this room can read: let it go untouched rather than save over it.
      await characters.release(claimed.account, holder, null).catch(() => false);
      return false;
    }
    this.room.own(player, claimed.account);
    if (this.company) this.admitted.add(claimed.account);
    this.held.set(player, {
      account: claimed.account,
      holder,
      changed: claimed.body === null,
      savedAt: now(),
      saving: false,
      saved: claimed.body,
      inFlight: null,
    });
    return true;
  }

  /** In a run's room, sends away a player who has sent no token (`signed`) once a claim's own waits have passed. */
  async tokenDue(player: number, signed: () => boolean, here: () => boolean): Promise<void> {
    if (!this.company || !this.characters) return;
    await this.wait(TOKEN_WAIT_MS);
    if (here() && !signed()) this.lost(player, SIGN_IN_FOR_RUN, false);
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
