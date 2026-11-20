// The notices in the Plus kit, after DFO's toasts (ui/enhanced/enhancedNotice.js, its sheet in enhancedStyle.js
// `.notice.notice-toast`): a line of what happened, in a panel against the screen's right edge, sliding in from it.
// The words' own model keeps their time (the fight's messages, editor/fighting.ts): the stack shows what it is given
// and drops what it is no longer given, so it holds no timer of its own.
import { ROLES } from './kit.ts';
import { HALO } from './tones.ts';

/** The most notices shown at once, the newest kept: clear of the Acquired feed under them at the right. */
export const NOTICES_MOST = 3;

/** The stack: made once, given its lines each frame. */
export class NoticeStack {
  readonly root: HTMLElement;
  private readonly rows = new Map<string, HTMLElement>();

  constructor(parent: HTMLElement) {
    const page = parent.ownerDocument;
    this.root = page.createElement('div');
    this.root.className = 'plus-notices';
    this.root.setAttribute('role', 'log');
    this.root.setAttribute('aria-label', 'Notices');
    parent.append(this.root);
    wearNotices(page);
  }

  /** Shows `lines`, the newest last: a line still given keeps its row, a new one slides in, one gone leaves. */
  show(lines: readonly string[]): void {
    const kept = new Set(lines.slice(-NOTICES_MOST));
    for (const [text, row] of this.rows)
      if (!kept.has(text)) {
        row.remove();
        this.rows.delete(text);
      }
    for (const text of kept) {
      if (this.rows.has(text)) continue;
      const row = this.root.ownerDocument.createElement('div');
      row.className = `plus-notice ${ROLES.panel}`;
      row.textContent = text;
      this.rows.set(text, row);
      this.root.append(row);
    }
    this.root.hidden = this.rows.size === 0;
  }
}

/** The stack's sheet: under the status line at the top right, each notice a panel hugging its line, its edge in the
 *  toast's yellow, sliding in from the right in steps (none with less motion asked for). */
export function noticesCss(): string {
  return `
.plus-notices { position: absolute; right: 0; top: 64px; display: flex; flex-direction: column; align-items: flex-end;
  gap: 6px; pointer-events: none; }
.plus-notice { max-width: min(420px, 60vw); padding: 6px 18px 6px 12px; border-style: solid; border-width: 2px 0 2px 4px;
  border-left-color: rgba(243,239,44,0.55); font-size: 14px; color: rgb(243,239,44); text-shadow: ${HALO};
  animation: plus-notice-in 0.26s steps(4, end); }
@keyframes plus-notice-in { from { transform: translateX(110%); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .plus-notice { animation: none; } }
`;
}

const SHEET_ID = 'plus-notices';

/** Lays the stack's sheet on `page`, once. */
function wearNotices(page: Document): void {
  if (page.getElementById(SHEET_ID)) return;
  const sheet = page.createElement('style');
  sheet.id = SHEET_ID;
  sheet.textContent = noticesCss();
  page.head.append(sheet);
}
