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
import { type BindId, CONTROLS } from '../player/binds.ts';
import { speaking } from '../speech/dialogue.ts';
import { askedKey } from './controls.ts';
import { keeperSpeaking } from './npc/npcSpeech.ts';
import { INK, keycap, svgNode, words } from './gearNodes.ts';
import { keycap as padKeycap } from './hudParts.ts';

/** How long a notice stands, seconds, and one with a key to press, which takes longer to read and act on. */
export const NOTICE_S = 4.5;
export const WITH_KEY_S = 6.5;
/** How long a notice takes to come in and to go, seconds. */
const COME_S = 0.25;
const GO_S = 0.35;
/** The reference's cyan: the band's top edge and the icon's ring. */
const CYAN = '#4fd8f0';
/** The band's ground: the reference's translucent grey, the screen showing through it, dark enough that its line still
 *  reads at 4.5:1 over white. */
export const NOTICE_FILL = 'rgba(24,28,34,0.72)';
/** The ink of a notice's line and of the key and what it opens at the right: the menu's word ink at 0.86. */
export const LINE_INK = 'rgba(239,232,214,0.86)';
/** Over every window and card the game lays, under the pad's cursor alone (`padCursor.ts`). */
const NOTICE_Z = 900;
/** The narrowest view whose band keeps the key and what it opens at its far right: under it the middle needs the
 *  room, and its line names the key already (measured by `obtained.test.ts` from 412 to 1920 px). */
const HINT_FROM = 900;
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

/** The key bound to a notice's control as a keycap draws it, on the keys or the pad played last (`pad:` before a pad's
 *  button), as the tracker's lessons name theirs; '' where none is bound there (the pad opens no inventory). */
const capOf = (notice: Notice): string =>
  notice.key === undefined ? '' : notice.key in CONTROLS ? askedKey(notice.key as BindId, true) : notice.key;
/** A notice's line as it stands: where its key is bound to nothing, the sentence asking for that key left out. */
const lineOf = (notice: Notice): string =>
  notice.key !== undefined && capOf(notice) === ''
    ? notice.line.replace(/\s*[^.]*\{key\}[^.]*\.?/, '').trim()
    : notice.line;
/** A notice's line in words alone, its key named. */
const lineWords = (notice: Notice): string => lineOf(notice).replace('{key}', capOf(notice).replace(/^pad:/, ''));
/** A notice as a screen reader hears it: its title and its line, its key named. */
const said = (notice: Notice): string => [notice.title, lineWords(notice)].filter(Boolean).join('. ');
/** A key on its keycap, or the pad's button drawn as the pad's. */
const capNode = (cap: string, size: number): Node =>
  cap.startsWith('pad:') ? padKeycap(cap, size) : keycap(cap, size);
const same = (one: Notice, other: Notice) => one.title === other.title && one.line === other.line;
const whileOf = (notice: Notice): number => (notice.key === undefined ? NOTICE_S : WITH_KEY_S);

/** The notices waiting and the one standing, on a clock of seconds the caller gives. */
export class Obtained {
  private readonly queue: Notice[] = [];
  /** The notice standing: since when on the clock (put on while held), and how far a hold has faded it out, 0 to 1. */
  private standing: { readonly notice: Notice; since: number; hidden: number } | null = null;
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

  /** The notice standing at `clock` seconds; none while `held` (a named speaker's words are up), its while held: one
   *  standing as they begin fades out as it would go, and back in as they end. */
  shown(clock: number, held: boolean): Standing | null {
    const passed = this.last === null ? 0 : Math.max(0, clock - this.last);
    this.last = clock;
    if (held) {
      if (!this.standing) return null;
      this.standing.since += passed;
      this.standing.hidden = Math.min(1, this.standing.hidden + passed / GO_S);
      if (this.standing.hidden >= 1) return null;
    } else if (this.standing) this.standing.hidden = Math.max(0, this.standing.hidden - passed / COME_S);
    if (this.standing && clock - this.standing.since >= whileOf(this.standing.notice)) this.standing = null;
    if (!this.standing) {
      const next = this.queue.shift();
      if (!next) return null;
      this.standing = { notice: next, since: clock, hidden: 0 };
      this.say(said(next));
    }
    const stood = clock - this.standing.since;
    const left = whileOf(this.standing.notice) - stood;
    return {
      notice: this.standing.notice,
      come: Math.min(1, stood / COME_S),
      gone: Math.max(this.standing.hidden, 1 - left / GO_S),
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

/** The line, its key on a keycap where `{key}` stands; none where nothing of it is left to say. */
function lineNode(notice: Notice, size: number): Node | null {
  const colour = LINE_INK;
  const line = lineOf(notice);
  if (line === '') return null;
  // Without a key, one text the column's width, so a long line wraps inside a phone's view instead of running off it.
  if (!line.includes('{key}')) return { width: 'grow', text: { words: line, size, colour } };
  const [before = '', after = ''] = line.split('{key}');
  // Word by word, so the row wraps between any two of them as a text would, the keycap among them.
  const each = (said: string) =>
    said
      .split(/\s+/)
      .filter(Boolean)
      .map((one) => words(one, size, colour));
  // A mark straight after the key (its comma or full stop) stays on the keycap's line, against it.
  const [mark = '', rest = ''] = /^([,.;:!?]*)(.*)$/s.exec(after.trimStart())?.slice(1) ?? [];
  const cap = capNode(capOf(notice), size);
  return {
    width: 'grow',
    gap: 6,
    alignY: 'center',
    wrap: true,
    children: [
      ...each(before),
      mark ? { alignY: 'center', gap: 1, children: [cap, words(mark, size, colour)] } : cap,
      ...each(rest),
    ],
  };
}

/** The band for `notice` across the foot of a view `view` pixels, `come` of the way in (it rises and brightens as
 *  it comes): its cyan edge, its icon, title and line in the middle, and at the far right the key and what it
 *  opens. On a phone (under 600 pixels) its words a step smaller; under 900 the right's hint left out. The hint stands in
 *  the row's flow, with an empty match at its left, so the middle stays centred while there is room for both and
 *  moves left of the hint, never under it, where there is not. */
export function noticeNode(
  notice: Notice,
  view: { readonly width: number; readonly height: number },
  come: number,
): Node {
  const narrow = view.width < 600;
  const size = narrow ? 1 : 2;
  const tall = narrow ? 84 : 128;
  const cap = capOf(notice);
  const hint: Node | null =
    view.width >= HINT_FROM && cap !== '' && notice.opens !== undefined
      ? {
          width: 'grow',
          height: 'grow',
          alignX: 'end',
          // At the band's top: a window's footer presses (the menu's Close) stand in the screen's bottom 77 px.
          alignY: 'start',
          padding: [10, 24, 0, 0],
          children: [
            {
              gap: 8,
              alignY: 'center',
              // The line's ink, not a dimmer one: over a white scene through the translucent band a dimmer reads under 4.5:1.
              children: [capNode(cap, 2), { text: { words: notice.opens, size: 2, colour: LINE_INK, wrap: false } }],
            },
          ],
        }
      : null;
  return {
    width: view.width,
    height: tall,
    through: true,
    float: { to: 'screen', at: [0, 1], anchor: [0, 1], y: Math.round((1 - come) * 12), z: NOTICE_Z },
    opacity: come,
    direction: 'column',
    fill: NOTICE_FILL,
    label: said(notice),
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
          hint && { width: 'grow' },
          iconNode(notice, narrow ? 52 : 88),
          {
            direction: 'column',
            gap: narrow ? 4 : 8,
            maxWidth: 760,
            // The title bold over a lighter line, as the reference's.
            children: [
              { text: { words: [{ words: notice.title, style: 'bold' }], size, colour: INK.word } },
              lineNode(notice, size),
            ],
          },
          hint,
        ],
      },
    ],
  };
}

/** The game's notices: one queue for the whole page. */
export const OBTAINED = new Obtained();

/** Notices `notices` on the game's queue. */
export const notify = (...notices: readonly Notice[]): void => OBTAINED.notify(...notices);

/** Whether a named speaker's words are up: in the dialogue box or in a keeper's screen. */
const wordsUp = (): boolean => speaking() || keeperSpeaking();

/** The notices' layer, over every other: the one standing, none while `held` says a named speaker's words are up (the
 *  game's speakers unless said), on `clock`'s seconds (the page's own unless said, as a picture's still one is). */
export function obtainedLayer(
  held: () => boolean = wordsUp,
  obtained: Obtained = OBTAINED,
  clock: () => number = () => performance.now() / 1000,
): (ui: Interface) => Child {
  return (ui) => {
    const holding = held();
    const standing = obtained.shown(clock(), holding);
    // With less motion nothing fades: a notice goes at once as the words come up.
    if (!standing || (holding && motionReduced())) return null;
    const come = motionReduced() ? 1 : Math.min(standing.come, 1 - standing.gone);
    return noticeNode(standing.notice, ui.size, come);
  };
}
