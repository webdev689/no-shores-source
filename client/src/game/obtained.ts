// What the player obtains, announced as Destiny 2's notice at the foot of the screen (the owner's reference): a band
// across the foot edged at its top by a thin cyan line, a round icon in a cyan ring, a title and a line (the key to
// press on a keycap where there is one), and, dim at the far right, the key and what it opens. A keeper's gift, a
// road's reward, a quest acquired, a step done, an Art, a Tenet or a fragment to choose, loot of the finest rarities
// and a tip each come here (quests/questNews.ts, acquiredFeed.ts); DFO's messages stay toasts. One stands at a time,
// in the order they came, a repeat merged with the one waiting; none stands while a named speaker's words are up, its
// while held until they end. It stands over every layer, the menu's among them, and lets the pointer through.
import { announce } from '../ui/announce.ts';
import type { Child, Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { motionReduced } from '../plus/kit.ts';
import { INK, boundKey, keycap, svgNode, words } from './gearNodes.ts';

/** How long a notice stands, seconds, and one with a key to press, which takes longer to read and act on. */
export const NOTICE_S = 4.5;
export const WITH_KEY_S = 6.5;
/** How long a notice takes to come in and to go, seconds. */
const COME_S = 0.25;
const GO_S = 0.35;
/** The reference's cyan: the band's top edge and the icon's ring. */
const CYAN = '#4fd8f0';
/** Over every window and card the game lays, under the pad's cursor alone (`padCursor.ts`). */
const NOTICE_Z = 900;
/** The most notices kept waiting: past it the oldest waiting goes, so a flood never stands for minutes. */
const MOST_WAITING = 12;

/** A notice: its title, its line (where `{key}` stands, the key bound to control `key`), its icon as SVG markup by
 *  its key, and what the key opens, said dim at the far right. */
export interface Notice {
  readonly title: string;
  readonly line: string;
  readonly icon: { readonly key: string; readonly svg: string } | null;
  readonly key?: string;
  readonly opens?: string;
}

/** A notice as it stands: how far in it has come and how far gone, 0 to 1 each. */
export interface Standing {
  readonly notice: Notice;
  readonly come: number;
  readonly gone: number;
}

/** A notice's line in words alone, its key named. */
const lineWords = (notice: Notice): string =>
  notice.key === undefined ? notice.line : notice.line.replace('{key}', boundKey(notice.key));
const same = (one: Notice, other: Notice) => one.title === other.title && one.line === other.line;
const whileOf = (notice: Notice): number => (notice.key === undefined ? NOTICE_S : WITH_KEY_S);

/** The notices waiting and the one standing, on a clock of seconds the caller gives. */
export class Obtained {
  private readonly queue: Notice[] = [];
  private standing: { readonly notice: Notice; since: number } | null = null;
  private last: number | null = null;
  private readonly say: (said: string) => void;

  constructor(say: (said: string) => void = announce) {
    this.say = say;
  }

  /** Notices `notices`, after those waiting; one the same as one standing or waiting is merged into it. */
  notify(...notices: readonly Notice[]): void {
    for (const notice of notices) {
      const shown = this.standing && same(this.standing.notice, notice);
      if (!shown && !this.queue.some((each) => same(each, notice))) this.queue.push(notice);
    }
    this.queue.splice(0, Math.max(0, this.queue.length - MOST_WAITING));
  }

  /** How many notices wait, the one standing among them. */
  get waiting(): number {
    return this.queue.length + (this.standing ? 1 : 0);
  }

  /** The notice standing at `clock` seconds; none while `held` (a named speaker's words are up), its while held. */
  shown(clock: number, held: boolean): Standing | null {
    const passed = this.last === null ? 0 : Math.max(0, clock - this.last);
    this.last = clock;
    if (held) {
      if (this.standing) this.standing.since += passed;
      return null;
    }
    if (this.standing && clock - this.standing.since >= whileOf(this.standing.notice)) this.standing = null;
    if (!this.standing) {
      const next = this.queue.shift();
      if (!next) return null;
      this.standing = { notice: next, since: clock };
      this.say(`${next.title}. ${lineWords(next)}`);
    }
    const stood = clock - this.standing.since;
    const left = whileOf(this.standing.notice) - stood;
    return {
      notice: this.standing.notice,
      come: Math.min(1, stood / COME_S),
      gone: Math.max(0, 1 - left / GO_S),
    };
  }
}

/** The round icon: a dark disc in a cyan ring, `size` pixels across, the notice's icon inside it. */
function iconNode(notice: Notice, size: number): Node {
  const inner = Math.round(size * 0.52);
  return {
    width: size,
    height: size,
    alignX: 'center',
    alignY: 'center',
    picture: {
      key: `notice ring ${size}`,
      source: {
        draw: (drawing, across, down) => {
          const ring = Math.max(2, across / 22);
          drawing.beginPath();
          drawing.arc(across / 2, down / 2, across / 2 - ring, 0, Math.PI * 2);
          drawing.fillStyle = '#0b1418';
          drawing.fill();
          drawing.lineWidth = ring;
          drawing.strokeStyle = CYAN;
          drawing.stroke();
        },
      },
    },
    children: [notice.icon && svgNode(`notice ${notice.icon.key}`, notice.icon.svg, inner)],
  };
}

/** The line, its key on a keycap where `{key}` stands. */
function lineNode(notice: Notice, size: number): Node {
  const colour = 'rgba(239,232,214,0.86)';
  const [before, after] = notice.key === undefined ? [notice.line, null] : notice.line.split('{key}');
  return {
    gap: 6,
    alignY: 'center',
    wrap: true,
    children: [
      before?.trim() ? words(before.trim(), size, colour) : null,
      notice.key !== undefined && keycap(boundKey(notice.key), size),
      after?.trim() ? words(after.trim(), size, colour) : null,
    ],
  };
}

/** The band for `notice` across the foot of a view `view` pixels, `come` of the way in (it rises and brightens as
 *  it comes): its cyan edge, its icon, title and line in the middle, and dim at the far right the key and what it
 *  opens. On a phone (under 600 pixels) its words a step smaller and the right's hint left out. */
export function noticeNode(
  notice: Notice,
  view: { readonly width: number; readonly height: number },
  come: number,
): Node {
  const narrow = view.width < 600;
  const size = narrow ? 1 : 2;
  const tall = narrow ? 84 : 128;
  const hint: Child =
    !narrow && notice.key !== undefined && notice.opens !== undefined
      ? {
          float: { to: 'parent', at: [1, 1], anchor: [1, 1], x: -40, y: -22 },
          gap: 8,
          alignY: 'center',
          opacity: 0.5,
          children: [keycap(boundKey(notice.key), 1), words(notice.opens, 2, INK.faint)],
        }
      : null;
  return {
    width: view.width,
    height: tall,
    through: true,
    float: { to: 'screen', at: [0, 1], anchor: [0, 1], y: Math.round((1 - come) * 12), z: NOTICE_Z },
    opacity: come,
    direction: 'column',
    fill: 'rgba(9,11,14,0.94)',
    label: `${notice.title}. ${lineWords(notice)}`,
    children: [
      { width: 'grow', height: 2, fill: CYAN },
      {
        width: 'grow',
        height: 'grow',
        alignX: 'center',
        alignY: 'center',
        gap: narrow ? 12 : 24,
        padding: [0, 16],
        children: [
          iconNode(notice, narrow ? 52 : 88),
          {
            direction: 'column',
            gap: narrow ? 4 : 8,
            maxWidth: Math.min(760, view.width - (narrow ? 96 : 360)),
            children: [words(notice.title, size, INK.word), lineNode(notice, size)],
          },
        ],
      },
      hint,
    ],
  };
}

/** The game's notices: one queue for the whole page. */
export const OBTAINED = new Obtained();

/** Notices `notices` on the game's queue. */
export const notify = (...notices: readonly Notice[]): void => OBTAINED.notify(...notices);

/** The notices' layer, over every other: the one standing, none while `held` says a named speaker's words are up, on
 *  `clock`'s seconds (the page's own unless said, as a picture's still one is). */
export function obtainedLayer(
  held: () => boolean,
  obtained: Obtained = OBTAINED,
  clock: () => number = () => performance.now() / 1000,
): (ui: Interface) => Child {
  return (ui) => {
    const standing = obtained.shown(clock(), held());
    if (!standing) return null;
    const come = motionReduced() ? 1 : Math.min(standing.come, 1 - standing.gone);
    return noticeNode(standing.notice, ui.size, come);
  };
}
