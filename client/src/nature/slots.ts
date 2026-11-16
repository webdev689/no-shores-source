/** An instance as the GPU stores it: its foot from its tile's north-west corner (east, south), the foot's height and
 *  its turn; its width and height scales, tint (-1..1) and rank (0..1); the ground's rise a metre east and south under
 *  it, its tile's number and the ground's height at its foot. */
export const SLOT_FLOATS = 12;
/** Slots are handed out a page at a time: a tile's layer takes whole pages, anywhere in the store. */
export const PAGE_SHIFT = 4;
export const PAGE_SLOTS = 1 << PAGE_SHIFT;
const PAGE_FLOATS = PAGE_SLOTS * SLOT_FLOATS;

/**
 * Every kept instance, each in a slot that stays put while its tile is kept, mirrored for the GPU. A tile's
 * instances go in when it is scattered and leave when it is let go, so the eye stepping into another tile moves
 * nothing that is already there: only the list of which slots to draw is made again.
 */
export class SlotStore {
  /** The store's floats, page by page; replaced, larger, when it fills. */
  data = new Float32Array(PAGE_FLOATS * 256);
  /** The store was replaced since the GPU last took it: all of it must be sent again. */
  replaced = true;
  private readonly free: number[] = [];
  private readonly retired: number[] = [];
  private used = 0;
  private readonly dirty = new Set<number>();

  /** Puts instances (SLOT_FLOATS each) in pages of their own, and answers the pages, in order. */
  store(values: Float32Array): number[] {
    const pages: number[] = [];
    for (let start = 0; start < values.length; start += PAGE_FLOATS) {
      const page = this.free.pop() ?? this.used++;
      if ((page + 1) * PAGE_FLOATS > this.data.length) {
        const grown = new Float32Array(Math.max(this.data.length * 2, (page + 1) * PAGE_FLOATS));
        grown.set(this.data);
        this.data = grown;
        this.replaced = true;
      }
      this.data.fill(0, page * PAGE_FLOATS, (page + 1) * PAGE_FLOATS);
      this.data.set(values.subarray(start, Math.min(values.length, start + PAGE_FLOATS)), page * PAGE_FLOATS);
      this.dirty.add(page);
      pages.push(page);
    }
    return pages;
  }

  /** Gives pages back. They are handed out again only after `recycle`: until then the list drawn may still name
   *  their slots. */
  release(pages: readonly number[]): void {
    this.retired.push(...pages);
  }

  /** Lets the released pages be handed out again, once no list drawn names them. */
  recycle(): void {
    this.free.push(...this.retired);
    this.retired.length = 0;
  }

  /** How many pages are in use. */
  get pagesInUse(): number {
    return this.used - this.free.length - this.retired.length;
  }

  /** The changed runs of pages since the last call, as [first float, float count] pairs: the GPU's to copy. */
  takeChanges(): number[] {
    const pages = [...this.dirty].sort((a, b) => a - b);
    this.dirty.clear();
    const runs: number[] = [];
    for (const page of pages) {
      const last = runs.length - 2;
      if (last >= 0 && (runs[last] ?? 0) + (runs[last + 1] ?? 0) === page * PAGE_FLOATS) {
        runs[last + 1] = (runs[last + 1] ?? 0) + PAGE_FLOATS;
      } else runs.push(page * PAGE_FLOATS, PAGE_FLOATS);
    }
    return runs;
  }
}

/** The slot of the `index`th instance of a layer stored in `pages`. */
export const slotOf = (pages: readonly number[], index: number): number =>
  (pages[Math.floor(index / PAGE_SLOTS)] ?? 0) * PAGE_SLOTS + (index % PAGE_SLOTS);
