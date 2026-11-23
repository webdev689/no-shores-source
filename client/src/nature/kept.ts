// Things made once and shared by key: each kept while anyone holds it, and the last few let go kept besides, for the
// next to ask to take without making them again; past those, the longest unheld is dropped.

export class Kept<Key, Value> {
  private readonly entries = new Map<Key, { readonly value: Value; holders: number }>();
  private readonly idle: number;
  private readonly drop: (value: Value) => void;

  /** `idle` unheld values are kept at most; `drop` lets one go. */
  constructor(idle: number, drop: (value: Value) => void) {
    [this.idle, this.drop] = [idle, drop];
  }

  /** The value kept for `key`, held once more, or undefined when none is. */
  take(key: Key): Value | undefined {
    const entry = this.entries.get(key);
    if (entry) entry.holders += 1;
    return entry?.value;
  }

  /** Keeps a value just made for `key`, held once. */
  keep(key: Key, value: Value): void {
    this.entries.set(key, { value, holders: 1 });
  }

  /** Lets go of one hold on `key`'s value: unheld, it is kept as the newest idle one. */
  give(key: Key): void {
    const entry = this.entries.get(key);
    if (!entry || --entry.holders > 0) return;
    // Taken out and put back, so the map's order runs from the longest unheld to the newest.
    this.entries.delete(key);
    this.entries.set(key, entry);
    let unheld = [...this.entries.values()].filter((each) => each.holders === 0).length;
    for (const [each, kept] of this.entries) {
      if (unheld <= this.idle) break;
      if (kept.holders > 0) continue;
      this.entries.delete(each);
      this.drop(kept.value);
      unheld -= 1;
    }
  }
}
