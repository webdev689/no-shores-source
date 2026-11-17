/**
 * Each player's character, kept by the accounts while they play in a room on land. A browser sends its session's
 * token once it has joined; the room claims the character with it, gives it to the player, saves it soon after it
 * changes and now and then besides (which keeps the room's hold), and lets it go with a last save when they leave. A
 * player who sends no token, or whose token is no session, plays a character that is not kept. Should another room
 * take the character (the same player joined elsewhere), this room's next save learns it, and the player is let go.
 */

import type { Characters } from './accounts/characters.ts';

/** What the keeper needs of the room. */
export interface KeptRoom {
  character(player: number): string | null;
  restoreCharacter(player: number, kept: string): boolean;
}

/** How soon a change is saved, and how often a character is saved unchanged, to keep the room's hold. */
export const SAVE_AFTER_CHANGE_MS = 2_000;
export const SAVE_UNCHANGED_MS = 20_000;

/** A session's token, as a browser sends it. */
export const TOKEN = /^[0-9a-f]{64}$/;

interface Held {
  readonly account: string;
  readonly holder: string;
  changed: boolean;
  savedAt: number;
  saving: boolean;
}

export class Keeper {
  private readonly characters: Characters | null;
  private readonly room: KeptRoom;
  private readonly name: string;
  /** Called for a player whose character another room took. */
  private readonly lost: (player: number) => void;
  private readonly held = new Map<number, Held>();

  constructor(characters: Characters | null, room: KeptRoom, name: string, lost: (player: number) => void) {
    this.characters = characters;
    this.room = room;
    this.name = name;
    this.lost = lost;
  }

  /** Claims a player's character with their session's token and gives it to them; whether it is now kept. `here`
   *  says whether the player is still in the room once the claim is answered. */
  async signIn(player: number, token: string, now: () => number, here: () => boolean): Promise<boolean> {
    const characters = this.characters;
    if (!characters || this.held.has(player) || this.room.character(player) === null) return false;
    const holder = `${this.name}:${crypto.randomUUID()}`;
    const claimed = await characters.claim(token, holder).catch(() => null);
    if (!claimed) return false;
    const given = claimed.body === null || this.room.restoreCharacter(player, claimed.body);
    if (!here() || !given || this.held.has(player)) {
      // Gone already, or kept as nothing this room can read: let it go untouched rather than save over it.
      await characters.release(claimed.account, holder, null).catch(() => false);
      return false;
    }
    this.held.set(player, {
      account: claimed.account,
      holder,
      changed: claimed.body === null,
      savedAt: now(),
      saving: false,
    });
    return true;
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
      held.saving = true;
      held.changed = false;
      const saved = await characters.save(held.account, held.holder, body).catch(() => null);
      held.saving = false;
      if (saved === false && this.held.get(player) === held) {
        this.held.delete(player);
        this.lost(player);
      } else if (saved === true) {
        held.savedAt = now;
      } else {
        // The accounts could not be reached: try again soon.
        held.changed = true;
      }
    });
    await Promise.all(saves);
  }

  /** Lets a player's character go with a last save; call it before the room lets the player go. */
  async leave(player: number): Promise<void> {
    const held = this.held.get(player);
    if (!held || !this.characters) return;
    this.held.delete(player);
    await this.characters.release(held.account, held.holder, this.room.character(player)).catch(() => false);
  }
}
