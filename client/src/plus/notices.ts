// The notices in the Plus kit, after DFO's toasts (ui/enhanced/enhancedNotice.js, its sheet in enhancedStyle.js
// `.notice.notice-toast`): a line of what happened, in a panel against the screen's right edge, sliding in from it.
// The words' own model keeps their time (the fight's messages, editor/fighting.ts): the stack shows what it is given
// and drops what it is no longer given, so it holds no timer of its own, only when each row came, which its slide
// reads. The game draws it (`noticesNode`, game/hudPieces.ts).

/** The most notices shown at once, the newest kept: clear of the Acquired feed under them at the right. */
export const NOTICES_MOST = 3;

/** The stack's look, as DFO's sheet stood it: under the status line at the top right, each notice a panel hugging its
 *  line, its edge in the toast's yellow (lengths CSS pixels, its widest the less of `most` and `mostShare` of the
 *  view); sliding in from the right in `inSteps` steps over `inSeconds`. */
export const NOTICE_LOOK = {
  right: 28,
  top: 64,
  gap: 6,
  most: 420,
  mostShare: 0.6,
  /** Inside its edge: top, right, bottom, left. */
  padding: [6, 18, 6, 12],
  /** Its edge: top, right, bottom, left. */
  edge: [2, 0, 2, 4],
  edgeColour: 'rgba(243,239,44,0.55)',
  colour: 'rgb(243,239,44)',
  inSeconds: 0.26,
  inSteps: 4,
} as const;

/** A notice shown: its words and when its row came, seconds. */
export interface NoticeRow {
  readonly text: string;
  readonly since: number;
}

/** The stack: made once, given its lines each frame. */
export class NoticeStack {
  private shown: NoticeRow[] = [];

  /** The rows standing, the newest last. */
  get rows(): readonly NoticeRow[] {
    return this.shown;
  }

  /** Shows `lines` at `clock`, the newest last: a line still given keeps its row, a new one slides in (and is `told`,
   *  as a page's log is read out), one gone leaves. */
  show(lines: readonly string[], clock: number, told: (text: string) => void = () => undefined): void {
    const kept = [...new Set(lines.slice(-NOTICES_MOST))];
    const staying = this.shown.filter((row) => kept.includes(row.text));
    // In the order given, a line said again standing newest, last, as the fight's messages keep it; rows already in
    // order are left where they are, so none slides in again, and those moved after them slide in anew.
    const first = kept.findIndex((text, index) => staying[index]?.text !== text);
    this.shown = kept.map((text, index) => {
      const had = staying.find((row) => row.text === text);
      if (!had) told(text);
      return had && (first < 0 || index < first) ? had : { text, since: clock };
    });
  }
}

/** How far a row that came at `since` has slid in at `clock`, 0 to 1, in the look's steps; whole at once while motion
 *  is reduced (`still`). */
export function slidIn(since: number, clock: number, still: boolean): number {
  if (still) return 1;
  const share = Math.max(0, clock - since) / NOTICE_LOOK.inSeconds;
  return Math.min(1, Math.floor(share * NOTICE_LOOK.inSteps) / NOTICE_LOOK.inSteps);
}
