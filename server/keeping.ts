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
import { guildKey } from './accounts/outpostStores.ts';
import { weekOf } from '../client/src/game/guild/guildLaw.ts';
import { NO_WAY_HERE } from './arrival.ts';
import { askedAgain, carriedOf } from './outpostHost.ts';
import { nodeRoom, runFull } from './roomNames.ts';

/** What a room keeps characters with: claiming, saving and letting go, and a player's companions. */
type Characters = Pick<
  Kept,
  'look' | 'claim' | 'save' | 'release' | 'companions' | 'launched' | 'guild' | 'deposit' | 'deliver' | 'takeStores'
>;

/** Why a run's room sends a player away who is in no company of those kept in it. */
export const ANOTHER_COMPANY = "This run is another company's.";
/** Why a guild's outpost's room sends away a player in neither its guild nor a company with a member in it. */
export const ANOTHER_GUILD = "This outpost is another guild's.";
/** Why a playlist's run sends away a first player the server never started it for: its dungeon is the server's draw. */
export const FROM_THE_PLAYLIST = 'Start this run from the Playlist.';
/** Why a room sends away a player it cannot keep: their token is no session, or none came in time. */
export const SIGN_IN = 'Sign in to play online.';
export const SIGN_IN_FOR_RUN = 'Sign in to enter this run.';
/** Why a run's room sends a player away while the accounts do not answer: joining again may find them back. */
export const ACCOUNTS_TROUBLE = 'Something went wrong. Try again.';

/** What the keeper needs of the room. */
export interface KeptRoom {
  /** A player's character as kept with the account's vault and Aurem apart (`RoomDoor.keptApart`). */
  keptApart(player: number): { body: string; vault: string } | null;
  /** Whether what a player's arrival in the next room is judged by moved since this was last asked; asking clears it. */
  judgedMoved(player: number): boolean;
  /** Opens a leaving player's chests and posts what lies for them to their mail (`partFrom`). */
  mailLying?(player: number): void;
  /** Gives a player their character with the account's vault and Aurem joined in (`RoomDoor.restoreJoined`). */
  restoreJoined(player: number, body: string, vault: string | null): boolean;
  /** Notes the account that keeps a player's character. */
  own(player: number, account: string): boolean;
  /** Names a player by their account's username, which others read over their head. */
  name(player: number, name: string): boolean;
  /** Gives a player their guild's tag, read after their name; '' for none. */
  tag(player: number, tag: string): boolean;
  /** Tells the room a player's guild as the accounts tell it, as text; '' for none. */
  guild(player: number, told: string): boolean;
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

/** What a character and the account's vault were saved as, to compare with what the room holds now. */
const savedKey = (body: string, vault: string | null) => JSON.stringify([body, vault]);

/** A session's token, as a browser sends it. */
export const TOKEN = /^[0-9a-f]{64}$/;

interface Held {
  readonly account: string;
  /** The session's token they signed in with, which reads their guild's tag again when their guild changes. */
  readonly token: string;
  readonly holder: string;
  /** The room that held the character before this one, and whether it left that room by a dungeon's way out. */
  readonly from: string | null;
  readonly out: boolean;
  changed: boolean;
  savedAt: number;
  saving: boolean;
  /** The character and vault as last saved (`savedKey`), so a change that changed nothing (a refused ask) is not
   *  saved again. */
  saved: string | null;
  /** How many moves of what the next room judges their arrival by (`KeptRoom.judgedMoved`) the room has told of,
   *  and how many of those a save holds. */
  moves: number;
  movesSaved: number;
  /** The save under way, which a leaving player's last save waits for so it is never overtaken by an older one. */
  inFlight: Promise<unknown> | null;
  /** When the room was last told the player's guild, and which it was told (undefined before it was). */
  guildAt: number;
  guild?: string | null;
}

/** How often a room is told each kept player's guild again: which of the week's bounties it has done. Every player's
 *  is told at once besides as the week turns, so a claim waits a moment at most for the new week's word. */
export const GUILD_EVERY_MS = 30_000;

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
  private arrives: ((from: string | null, body: string | null) => boolean | string) | null = null;
  /** Whether no one comes in by their company playing here alone, as a passage zone takes only its dives. */
  private alone = false;
  /** A gate the room keeps shut until another room says otherwise: why it is shut, '' once open. */
  private gate: (() => Promise<string>) | null = null;
  /** Whether a player came by another way the accounts must say: launched for a Breach's run at its gate here. */
  private launchedHere: ((player: number, account: string) => Promise<boolean>) | null = null;
  /** The accounts a run has let in, for as long as it lives: one back after the rest left a while finds it theirs. */
  private readonly admitted = new Set<string>();
  /** At a guild's outpost, its guild's key, and the accounts found to be its members. */
  private guild: string | null = null;
  private readonly members = new Set<string>();
  /** The week the room was last told everyone's guild in. */
  private toldWeek: number | null = null;

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

  /** Keeps this room to a guild's members, by its key, and those in a company with a member playing here. */
  forGuild(key: string): this {
    this.guild = key;
    return this;
  }

  /** Judges where each kept character comes from: one that came by no way leading here is let go untouched, its
   *  player sent away saying so, unless one of their company plays here (the Roster's join brings them in) and the
   *  room is not `alone`; one the judge answers with words is sent away saying them, whoever plays here. */
  judgingArrivals(arrives: (from: string | null, body: string | null) => boolean | string, alone = false): this {
    this.arrives = arrives;
    this.alone = alone;
    return this;
  }

  /** Keeps a gate: a character is let in only once `shut` says '' (a Breach's run, once its gate's zone says its
   *  company woke it), and any other is let go untouched with its words. */
  behindGate(shut: () => Promise<string>): this {
    this.gate = shut;
    return this;
  }

  /** Lets in a character come by no way leading here that `launched` says came for a run started here: a Breach's,
   *  whose company is launched to its gate from wherever they are. */
  arrivingLaunched(launched: (player: number, account: string) => Promise<boolean>): this {
    this.launchedHere = launched;
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

  /** Names a kept player by the username their session's account keeps now, as one taken since they signed in, and
   *  the tag of the guild they are in now; their token must still be their account's. */
  async rename(player: number, token: string): Promise<void> {
    const held = this.held.get(player);
    const looked = held ? await this.characters?.look(token) : null;
    if (!held || !looked || looked.account !== held.account) return;
    if (looked.name !== null) this.room.name(player, looked.name);
    this.room.tag(player, looked.tag ?? '');
    await this.tellGuild(player, held);
  }

  /** Claims a player's character with their session's token and gives it to them; whether it is now kept. `here`
   *  says whether the player is still in the room once the claim is answered. */
  async signIn(player: number, token: string, now: () => number, here: () => boolean): Promise<boolean> {
    const characters = this.characters;
    if (!characters || this.held.has(player) || this.room.keptApart(player) === null) return false;
    const holder = `${this.name}:${crypto.randomUUID()}`;
    // Every room judges a character before it claims it, so one turned away (by its gate, its company or the way it
    // came) is never taken from the room that plays it (a second tab plays on, its unsaved progress kept); the claim is
    // judged again, as the character may have moved on meanwhile.
    const looked = await this.tried(() => characters.look(token), here);
    const judgedFirst = looked ? await this.judged(player, looked, here) : looked === null ? this.unsigned : undefined;
    // Outside a run, accounts that do not answer leave the player to play unkept, as a claim unanswered does, and
    // claim nothing: a claim judged after them could take the character from the room that plays it.
    if (judgedFirst === undefined && !this.closed) return false;
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
      if ((this.closed || !passing) && here()) this.lost(player, passing ? ACCOUNTS_TROUBLE : this.unsigned, passing);
      return false;
    }
    // Accounts older than the account's vault answer none: kept here, the first save would part the vault out of the
    // body into nothing, so the character is let go untouched and played unkept, as with accounts that do not answer.
    if ((claimed as { readonly vault?: unknown }).vault === undefined) {
      await characters.release(claimed.account, holder, null, null).catch(() => false);
      if (this.closed && here()) this.lost(player, ACCOUNTS_TROUBLE, true);
      return false;
    }
    const shut = await this.judged(player, claimed, here);
    if (shut === undefined) {
      // The company cannot be judged: refused for now, with nothing of this room saved over the character.
      await characters.release(claimed.account, holder, null, null).catch(() => false);
      if (here()) this.lost(player, ACCOUNTS_TROUBLE, true);
      return false;
    }
    if (shut !== '') {
      // Left as kept: the gate shuts here, so nothing of this room may be saved over it.
      await characters.release(claimed.account, holder, null, null).catch(() => false);
      if (here()) this.lost(player, shut);
      return false;
    }
    // A new account's character is the one the room holds, given back so the room keeps it as any other.
    // Either way, the account's vault and Aurem are joined in while the room holds it; a vault this room cannot read
    // leaves the character untouched, new or kept, so no save writes an empty one over it.
    const body = claimed.body === null ? null : await this.answered(claimed.account, claimed.body, here);
    // Another sign-in may have been kept while the errand was asked again: the room is judged full again, at last,
    // before it is given the character, so a player turned away is never sent it as kept.
    const full = this.fullWith(claimed.account);
    const own = full === null && claimed.body === null ? this.room.keptApart(player) : null;
    const joined =
      full === null && (own === null || this.room.restoreJoined(player, own.body, claimed.vault ?? own.vault));
    const given = joined && (body === null || this.room.restoreJoined(player, body, claimed.vault));
    if (!here() || !given || this.held.has(player) || full !== null) {
      // Gone already, full now, or kept as nothing this room can read: let it go untouched rather than save over it.
      await characters.release(claimed.account, holder, null, null).catch(() => false);
      // A run keeps no one unkept, and joining again would find the same body.
      if (full !== null && here()) this.lost(player, full);
      else if (this.closed && !given && here()) this.lost(player, ACCOUNTS_TROUBLE, false);
      return false;
    }
    // One account plays one player here: its older socket (a rejoin the room has not seen close, or a second tab) goes.
    // While the accounts hold what this room last saved of it, and gave nothing back to it since (an errand's answer),
    // the room's own body of it is the newest, with what it gained since that save: this player takes that on.
    let takenOn = false;
    for (const [other, kept] of this.held)
      if (kept.account === claimed.account) {
        const lastSaved = claimed.body === null ? null : savedKey(claimed.body, claimed.vault);
        const takeOn = kept.saved === lastSaved && body === claimed.body;
        if (takeOn) this.room.mailLying?.(other);
        const newest = takeOn ? this.room.keptApart(other) : null;
        this.held.delete(other);
        this.lost(other);
        if (newest !== null && savedKey(newest.body, newest.vault) !== lastSaved)
          takenOn ||= this.room.restoreJoined(player, newest.body, newest.vault);
      }
    this.room.own(player, claimed.account);
    if (claimed.name !== null) this.room.name(player, claimed.name);
    if (claimed.tag) this.room.tag(player, claimed.tag);
    if (this.company) this.admitted.add(claimed.account);
    this.held.set(player, {
      account: claimed.account,
      token,
      holder,
      from: claimed.from,
      out: leftByWayOut(claimed.body),
      // One kept before the vault was the account's holds its own until its first save parts it.
      changed: claimed.body === null || claimed.vault === null || body !== claimed.body || takenOn,
      savedAt: now(),
      saving: false,
      saved: claimed.body === null ? null : savedKey(claimed.body, claimed.vault),
      moves: 0,
      movesSaved: 0,
      inFlight: null,
      guildAt: 0,
    });
    return true;
  }

  /** A claimed body with the outpost errand it carries answered: asked again under its id (the accounts answer as they
   *  did), the answer written in for the room to settle as it reads the body (`gear::errand`), and the room that asked
   *  it first given nothing (its save no longer holds, or the body it saves settled it). As kept when it carries none,
   *  or the accounts do not answer: it is carried on, for this room's outpost to answer or the next room to ask. */
  private async answered(account: string, body: string, here: () => boolean): Promise<string> {
    const characters = this.characters;
    const carried = carriedOf(account, body);
    if (!characters || !carried) return body;
    const answer = await this.tried(() => askedAgain(characters, carried), here);
    if (answer === undefined) return body;
    const kept = JSON.parse(body) as { errand: object };
    return JSON.stringify({ ...kept, errand: { ...kept.errand, answer } });
  }

  /** Tells the room a kept player's guild as the accounts tell it now, and at an outpost notes whether they are still
   *  its member, so one who left it no longer admits their company; nothing if they cannot be reached. A guild that
   *  changed since the room was last told reads the tag over their head again (none for no guild). In the outpost's
   *  own room, one whose own guild changed away from it (they left, or were removed) is sent away unless one of their
   *  company who is a member plays here; a guest let in with a member stays until they leave, and a guild dungeon's
   *  run sends no one away, as leaving it brings them back to the outpost, where its gate judges them. */
  private async tellGuild(player: number, held: Held): Promise<void> {
    const told = await this.characters?.guild(held.account).catch(() => undefined);
    if (told === undefined) return;
    const wasMember = this.members.has(held.account);
    if (this.guild !== null && told !== null && guildKey(told.id) === this.guild) this.members.add(held.account);
    else this.members.delete(held.account);
    if (this.held.get(player) !== held) return;
    this.room.guild(player, told === null ? '' : JSON.stringify(told));
    const [was, now] = [held.guild, told?.id ?? null];
    held.guild = now;
    const here = () => this.held.get(player) === held;
    if (was !== now && now === null) this.room.tag(player, '');
    else if (was !== now && was !== undefined) {
      const looked = await this.characters?.look(held.token).catch(() => null);
      if (looked?.account === held.account && here()) this.room.tag(player, looked.tag ?? '');
    }
    const left = wasMember && !this.members.has(held.account) && !this.company;
    if (left && (await this.outsider(held.account, here)) && here()) this.lost(player, ANOTHER_GUILD);
  }

  /** Why a run, or a public passage zone, is full with `account` kept too; null while it has room. It is full by the
   *  accounts it keeps, so a member's own older socket never counts against them. */
  private fullWith(account: string): string | null {
    const others = new Set([...this.held.values()].map((held) => held.account).filter((one) => one !== account));
    return runFull(this.name, others.size + 1);
  }

  /** Why this room turns a character away ('' when it lets it in): its gate, in a run its four accounts and its
   *  company, its gate, and where it came from; undefined when the accounts cannot say who the company is. Nothing waits
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
    const full = this.fullWith(account);
    // A playlist's run is the server's: its first player must be one the server drew it for (`finding.ts`).
    const named = nodeRoom(this.name.slice('node-'.length));
    const drawn =
      this.admitted.size === 0 && characters && ((named?.playlist ?? null) !== null || (named?.breach ?? null) !== null)
        ? await this.tried(() => characters.launched(account, this.name), here)
        : true;
    if (drawn === undefined) return undefined;
    const outsider = await this.outsider(account, here);
    if (outsider === undefined) return undefined;
    const gate = this.gate;
    const gated = gate ? await this.tried(gate, here) : '';
    if (gated === undefined) return undefined;
    const shut =
      this.room.shut(player, body) ||
      (full ?? (companions && !this.admits(companions) ? ANOTHER_COMPANY : '')) ||
      (drawn ? '' : FROM_THE_PLAYLIST) ||
      (outsider ? ANOTHER_GUILD : '') ||
      gated;
    if (shut !== '' || !characters || !this.arrives) return shut;
    // A judge that throws (the room's module failing to lay the web) cannot judge: refused for now, as accounts that
    // do not answer are, and said in the room's log.
    let came: boolean | string;
    try {
      came = this.arrives(from, body);
    } catch (error) {
      console.error('arrival judge:', error);
      return undefined;
    }
    if (came === true) return '';
    if (came !== false) return came;
    if (this.alone) return NO_WAY_HERE;
    const launchedHere = this.launchedHere;
    const launched = launchedHere ? await this.tried(() => launchedHere(player, account), here) : false;
    if (launched === undefined) return undefined;
    if (launched) return '';
    // Come by no way that leads here, a player may still join one of their company who plays here.
    const company = companions ?? (await this.tried(() => characters.companions(account, this.name), here));
    if (company === undefined) return undefined;
    const playing = new Set([...this.held.values()].map((held) => held.account));
    return company.some((one) => one !== account && playing.has(one)) ? '' : NO_WAY_HERE;
  }

  /** At a guild's outpost, whether an account is neither in its guild nor in a company with a member playing here;
   *  false anywhere else, and undefined when the accounts cannot say. */
  private async outsider(account: string, here: () => boolean): Promise<boolean | undefined> {
    const characters = this.characters;
    if (this.guild === null || !characters) return false;
    const told = await this.tried(() => characters.guild(account), here);
    if (told === undefined) return undefined;
    if (told !== null && guildKey(told.id) === this.guild) {
      this.members.add(account);
      return false;
    }
    const company = await this.tried(() => characters.companions(account, this.name), here);
    if (company === undefined) return undefined;
    const playing = new Set([...this.held.values()].map((held) => held.account));
    return !company.some((one) => one !== account && playing.has(one) && this.members.has(one));
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

  /** Whether this room keeps no one it has not judged: a run, a guild's outpost, or a passage zone. */
  private get closed(): boolean {
    return this.company || this.guild !== null || this.alone;
  }

  /** Why this room sends away a player it cannot keep. */
  private get unsigned(): string {
    return this.company ? SIGN_IN_FOR_RUN : SIGN_IN;
  }

  /** Whether no one was let in yet, or someone among `companions` (a player and their company) was. */
  private admits(companions: readonly string[]): boolean {
    return this.admitted.size === 0 || companions.some((account) => this.admitted.has(account));
  }

  /** Notes that a player's character changed. A move of what the next room judges their arrival by (a dive begun,
   *  gone on, lit, gone home or ended; a lamp lit this week) is saved at once, not after SAVE_AFTER_CHANGE_MS, and so
   *  is any change while such a move is still unsaved: the next room judges the arrival by the saved body. The room
   *  tells of a move without the character being read. */
  changed(player: number): void {
    const held = this.held.get(player);
    if (!held) return;
    held.changed = true;
    if (this.room.judgedMoved(player)) held.moves++;
    else if (held.moves === held.movesSaved || held.saving) return;
    void this.saveNow(player);
  }

  /** Saves each character that changed a while ago, or has gone unsaved long enough. */
  async due(now: number): Promise<void> {
    const characters = this.characters;
    if (!characters) return;
    const turned = this.toldWeek !== null && weekOf(now) !== this.toldWeek;
    this.toldWeek = weekOf(now);
    for (const [player, held] of this.held)
      if (turned || now - held.guildAt >= GUILD_EVERY_MS) {
        held.guildAt = now;
        void this.tellGuild(player, held);
      }
    const saves = [...this.held].map(async ([player, held]) => {
      const waited = now - held.savedAt;
      if (held.saving || (waited < SAVE_UNCHANGED_MS && !(held.changed && waited >= SAVE_AFTER_CHANGE_MS))) return;
      const kept = this.room.keptApart(player);
      if (kept === null) return;
      held.changed = false;
      // Unchanged, it is saved only to keep the hold.
      if (savedKey(kept.body, kept.vault) === held.saved && waited < SAVE_UNCHANGED_MS) return;
      await this.store(characters, player, held, kept, now);
    });
    await Promise.all(saves);
  }

  /** Saves a kept player's character as the room holds it now, after any save under way; whether the save holds. An
   *  outpost's errand that takes from the character goes only once it does, so no claim elsewhere finds it whole. */
  async saveNow(player: number): Promise<boolean> {
    const held = this.held.get(player);
    const characters = this.characters;
    const kept = this.room.keptApart(player);
    if (!held || !characters || kept === null) return false;
    return (await this.store(characters, player, held, kept, held.savedAt)) === true;
  }

  /** Saves a character and the account's vault after the save under way, if any, so an older one never lands last;
   *  what the accounts answered. */
  private async store(
    characters: Characters,
    player: number,
    held: Held,
    { body, vault }: { body: string; vault: string },
    now: number,
  ) {
    held.saving = true;
    const moves = held.moves;
    const before = held.inFlight;
    const saving = (async () => {
      await before;
      return characters.save(held.account, held.holder, body, vault).catch(() => null);
    })();
    held.inFlight = saving;
    const saved = await saving;
    if (held.inFlight === saving) {
      held.saving = false;
      held.inFlight = null;
    }
    if (saved === false && this.held.get(player) === held) {
      this.held.delete(player);
      this.lost(player);
    } else if (saved === true) {
      held.savedAt = Math.max(held.savedAt, now);
      held.saved = savedKey(body, vault);
      held.movesSaved = Math.max(held.movesSaved, moves);
    } else {
      // The accounts could not be reached: try again soon.
      held.changed = true;
    }
    return saved;
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
    const kept = this.room.keptApart(player);
    await held.inFlight;
    for (const millis of [0, ...LEAVE_WAITS_MS]) {
      if (millis > 0) await this.wait(millis);
      const released = await characters
        .release(held.account, held.holder, kept?.body ?? null, kept?.vault ?? null)
        .catch(() => null);
      if (released !== null) return;
    }
    if (kept !== null) await characters.save(held.account, held.holder, kept.body, kept.vault).catch(() => false);
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
