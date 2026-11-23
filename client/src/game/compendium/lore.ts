// The lore a player has found, as the page keeps it between frames: which chapters they have read, kept in this
// browser for their account, and a toast for each chapter as it is found. What is found is the rules' word, the last
// the player's own character was sent (`kept`); the page judges nothing.
import type { GearState } from '../../network/gearMessages.ts';
import { type CategoryShown, LORE, type LoreFile, chapterAt, keyOf, shelfOf } from './loreBook.ts';

/** The browser's key for an account's chapters read. */
export const READ_KEY = 'overlook.lore.read';
/** How long a chapter found is toasted, milliseconds. */
const TOAST_MS = 6000;

/** What the lore keeps in the browser: the page's own storage, or a test's. */
export type Keeping = Pick<Storage, 'getItem' | 'setItem'>;

export class Lore {
  private readonly keeping: Keeping | null;
  private readonly account: () => string | null;
  private readonly now: () => number;
  private readonly lore: LoreFile;
  /** The chapters read, by key, for the account they were read under; and the account last read for. */
  private readSet = new Set<string>();
  private readFor: string | null | undefined = undefined;
  /** The chapters found as last heard, and the account they were heard for: a chapter new to them is toasted. */
  private heard: { readonly account: string | null; readonly found: ReadonlySet<number> } | null = null;
  private toasted: { readonly text: string; readonly until: number }[] = [];
  private foundNow: readonly number[] = [];

  constructor(
    keeping: Keeping | null,
    account: () => string | null,
    now: () => number = () => performance.now(),
    lore: LoreFile = LORE,
  ) {
    [this.keeping, this.account, this.now, this.lore] = [keeping, account, now, lore];
  }

  /** The room's word on the player's character, as kept (`kept`): its chapters found taken, and each found since the
   *  last word on the same account toasted. A word on a room's own starting character, not the player's, is passed
   *  over; the first on an account toasts nothing, as what it holds was found before. */
  hear(gear: GearState | null | undefined): void {
    const now = this.now();
    this.toasted = this.toasted.filter((toast) => toast.until > now);
    if (!gear || gear.quest?.claimed === false || !gear.lore) return;
    const account = this.account();
    // The same word heard again, as each frame hears it until the next comes.
    if (gear.lore === this.foundNow && this.heard?.account === account) return;
    const found = new Set(gear.lore);
    const before = this.heard?.account === account ? this.heard.found : null;
    this.heard = { account, found };
    this.foundNow = gear.lore;
    if (!before) return;
    for (const number of gear.lore) {
      const found = before.has(number) ? null : chapterAt(number, this.lore);
      const text = found && `Lore found: ${found.book.name}, ${found.chapter.title}`;
      if (text) this.toasted.push({ text, until: now + TOAST_MS });
    }
  }

  /** The toasts for the chapters found lately. */
  get toasts(): string[] {
    const now = this.now();
    return this.toasted.filter((toast) => toast.until > now).map((toast) => toast.text);
  }

  /** The lore as the player has found it, `found` their chapters' numbers (their gear's `lore`, or the last heard). */
  shelf(found: readonly number[] = this.foundNow): CategoryShown[] {
    return shelfOf(found, (key) => this.isRead(key), this.lore);
  }

  /** Whether a chapter found waits unread, of those `found`. */
  unread(found: readonly number[] = this.foundNow): boolean {
    return found.some((number) => {
      const found = chapterAt(number, this.lore);
      return found !== null && !this.isRead(keyOf(found.book, found.chapter));
    });
  }

  /** Whether a chapter, by its key, has been read on this account in this browser. */
  isRead(key: string): boolean {
    return this.readKeys().has(key);
  }

  /** Keeps a chapter read, by its key. */
  markRead(key: string): void {
    const read = this.readKeys();
    if (read.has(key)) return;
    read.add(key);
    try {
      this.keeping?.setItem(this.key, JSON.stringify([...read]));
    } catch {
      // A browser that keeps nothing shows the chapter new again in another page.
    }
  }

  /** The browser's key for the account's chapters read. */
  private get key(): string {
    return `${READ_KEY}.${this.account() ?? 'none'}`;
  }

  /** The chapters read on the account now, read from the browser once an account. */
  private readKeys(): Set<string> {
    const account = this.account();
    if (this.readFor === account) return this.readSet;
    this.readFor = account;
    try {
      const kept: unknown = JSON.parse(this.keeping?.getItem(this.key) ?? '[]');
      this.readSet = new Set(Array.isArray(kept) ? kept.filter((key): key is string => typeof key === 'string') : []);
    } catch {
      this.readSet = new Set();
    }
    return this.readSet;
  }
}
