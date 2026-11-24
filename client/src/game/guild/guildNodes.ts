// The guild pages' own parts, drawn by the game as Destiny 2's clan screen stands them: the banner hung on its staff,
// the guild's level as a diamond on a rule with its XP, a meter, a checked line of a list, and the small presses down
// the page's edge, each a pixel picture in the kit's brass; and the Journal's heads, panels and page arrows, with a
// column that says when more of it lies below.

import { type Pixels, svgOf } from '../../plus/emblems.ts';
import { TONES } from '../../plus/tones.ts';
import type { Child, Node } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import { INK, words } from '../gearNodes.ts';
import { iconNode as journalIcon, pixelNode } from '../journalIcons.ts';
import {
  CLOTH_HEIGHT,
  CLOTH_WIDTH,
  STANDARD_HEIGHT,
  STANDARD_WIDTH,
  bannerKey,
  clothPixels,
  standardPixels,
} from './bannerArt.ts';
import type { Banner } from './bannerLaw.ts';

/** The banner hung on its staff, each of its cells `scale` pixels square. */
export function standardNode(banner: Banner, scale: number): Node {
  return {
    width: STANDARD_WIDTH * scale,
    height: STANDARD_HEIGHT * scale,
    picture: {
      key: `guild standard ${bannerKey(banner)}`,
      source: { pixels: () => new Uint8Array(standardPixels(banner).buffer) },
      pixel: { width: STANDARD_WIDTH, height: STANDARD_HEIGHT },
    },
  };
}

/** The banner's cloth alone, each of its cells `scale` pixels square: for a small face, beside a name. */
export function clothNode(banner: Banner, scale: number): Node {
  return {
    width: CLOTH_WIDTH * scale,
    height: CLOTH_HEIGHT * scale,
    picture: {
      key: `guild cloth ${bannerKey(banner)}`,
      source: { pixels: () => new Uint8Array(clothPixels(banner).buffer) },
      pixel: { width: CLOTH_WIDTH, height: CLOTH_HEIGHT },
    },
  };
}

/** The diamond a level stands in, as Destiny 2's clan level: a teal stone in a dark setting, lit along its top. */
const DIAMOND_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 34"><path d="M17 1L33 17L17 33L1 17Z" fill="#0b1416"/>' +
  '<path d="M17 4L30 17L17 30L4 17Z" fill="#2c7c84"/><path d="M17 4L30 17H4Z" fill="#3c99a1"/>' +
  '<path d="M17 9L25 17L17 25L9 17Z" fill="#1d5a61"/></svg>';
/** How tall the level's diamond stands, in pixels, at the menu's smaller and larger steps. */
const DIAMOND_PX = [40, 52] as const;

/** A guild's level as its tab heads its week: the diamond with the level in it, riding a rule filled as far as the XP
 *  has brought it toward the next, "GUILD LEVEL" and the XP over its far end, and `under` beneath it. */
export function levelNode(level: number, share: number, xpWords: string, size: number, under: Child = null): Node {
  const filled = Math.round(Math.max(0, Math.min(1, share)) * 100);
  const diamond = DIAMOND_PX[size > 1 ? 1 : 0];
  return {
    width: 'grow',
    direction: 'column',
    gap: 4,
    label: `Guild level ${level}, ${xpWords}`,
    children: [
      {
        width: 'grow',
        alignX: 'end',
        gap: 16,
        children: [words('GUILD LEVEL', size, INK.faint, { tracking: 2 }), words(xpWords, size, INK.word)],
      },
      {
        width: 'grow',
        alignY: 'center',
        children: [
          {
            width: diamond,
            height: diamond,
            alignX: 'center',
            alignY: 'center',
            picture: { key: 'guild level diamond', source: { svg: DIAMOND_SVG } },
            children: [words(String(level), size, INK.word, { edge: 'halo', edgeColour: '#061012' })],
          },
          {
            width: 'grow',
            height: 4 + 2 * size,
            padding: 1,
            role: 'well',
            children: [{ width: `${filled}%`, height: 'grow', fill: '#3c99a1' }],
          },
        ],
      },
      under,
    ],
  };
}

/** A meter filled `share` of its length, in `colour`. */
export function meterNode(share: number, colour: string, label: string): Node {
  const filled = Math.round(Math.max(0, Math.min(1, share)) * 100);
  return {
    width: 'grow',
    height: 8,
    padding: 1,
    role: 'well',
    label,
    children: [{ width: `${filled}%`, height: 'grow', fill: colour }],
  };
}

/** A line of a checklist: its box, filled in brass once done, its words and, at the right, how far it has come. */
export function checkNode(done: boolean, said: string, beside: Child, size: number): Node {
  return {
    width: 'grow',
    gap: 8,
    alignY: 'center',
    label: `${said}${done ? ', done' : ''}`,
    children: [
      {
        width: 12,
        height: 12,
        outline: { width: 1, colour: done ? TONES.brassHi : INK.faint },
        padding: 2,
        children: [done && { width: 'grow', height: 'grow', fill: TONES.brass }],
      },
      { width: 'grow', ...words(said, size, done ? INK.word : INK.faint, { ellipsis: true }) },
      beside,
    ],
  };
}

const ICON_TONES = { h: TONES.brassHi, B: TONES.brass, b: TONES.brassLo };
/** The small presses down the page's edge, twelve cells square: the banner, the guild's details, its outposts and its
 *  treasury. */
export const ICONS: Readonly<Record<'banner' | 'details' | 'outposts' | 'treasury', Pixels>> = {
  banner: {
    rows: [
      'h...........',
      'hBBBBBBBBB..',
      'hBbbbbbbbB..',
      'hBb.hh.bB...',
      'hBb.hh.bBB..',
      'hBbbbbbbbB..',
      'hBBBB.BBBB..',
      'hBBB...BBB..',
      'h...........',
      'h...........',
      'h...........',
      'hh..........',
    ],
    tones: ICON_TONES,
  },
  details: {
    rows: [
      '.BBBBBBBBBB.',
      'B.hhhhhhhh.B',
      '.Bh......hB.',
      '..h.bbbb.h..',
      '..h......h..',
      '..h.bbbbbh..',
      '..h......h..',
      '..h.bbb..h..',
      '..h......h..',
      '.Bhhhhhhhh.B',
      'B.BBBBBBBBB.',
      '............',
    ],
    tones: ICON_TONES,
  },
  outposts: {
    rows: [
      '..h.h.h.h...',
      '..hhhhhhh...',
      '...hBBBh....',
      '...hBbBh....',
      '...hBBBh....',
      '...hBBBh....',
      '...hBbBh....',
      '...hBBBh....',
      '..hhhhhhh...',
      '.hhhhhhhhh..',
      'hhhhhhhhhhh.',
      '............',
    ],
    tones: ICON_TONES,
  },
  treasury: {
    rows: [
      '............',
      '....hhhh....',
      '..hhBBBBhh..',
      '.hBBhhhhBBh.',
      '..hhBBBBhh..',
      '.hBBhhhhBBh.',
      '..hhBBBBhh..',
      '.hBBhhhhBBh.',
      '..hhBBBBhh..',
      '.hBBbbbbBBh.',
      '..hhhhhhhh..',
      '............',
    ],
    tones: ICON_TONES,
  },
};

/** One of the edge's icons, `size` pixels square. */
export function iconNode(icon: keyof typeof ICONS, size: number): Node {
  return pixelNode(`guild icon ${icon}`, svgOf(ICONS[icon]), [12, 12], size);
}

/** A part's head as the Journal heads its quests and bounties: its name in large capitals spaced wide, a count in its
 *  chip, and anything beside it at the right. */
export function headNode(said: string, count: string | null = null, beside: Child = null): Node {
  return {
    width: 'grow',
    gap: 10,
    alignY: 'center',
    children: [
      words(said.toUpperCase(), 2, INK.word, { tracking: 3, ellipsis: true }),
      count !== null && { role: 'chip', padding: [1, 8], children: [words(count)] },
      { width: 'grow' },
      beside,
    ],
  };
}

/** A part framed as the Journal frames its bounties: the kit's panel with 10 by 12 px of room round what it holds. */
export const panelNode = (children: readonly Child[], more: Partial<Node> = {}): Node => ({
  role: 'panel',
  width: 'grow',
  direction: 'column',
  gap: 8,
  padding: [10, 12],
  ...more,
  children,
});

/** Page arrows as the Journal's: brass back and next, greyed at either end, with the page between them; `said`
 *  names what they turn for a screen reader. */
export function arrowsNode(ids: readonly [string, string], page: number, pages: number, said: string): Node {
  const arrow = (id: string, icon: 'back' | 'next', none: boolean, way: string): Node => ({
    id,
    press: true,
    disabled: none,
    role: 'button',
    label: `${said}: ${way}`,
    width: 33,
    height: 33,
    alignX: 'center',
    alignY: 'center',
    children: [{ ...journalIcon(icon, 24), opacity: none ? 0.4 : 1 }],
  });
  return {
    gap: 8,
    alignY: 'center',
    children: [
      arrow(ids[0], 'back', page === 0, 'the page before'),
      words(`${page + 1}/${pages}`, 1, INK.faint),
      arrow(ids[1], 'next', page >= pages - 1, 'the next page'),
    ],
  };
}

/** A column `height` pixels tall whose parts scroll inside it, with a chip at its foot while more of it lies below,
 *  read from where its last line was laid the frame before (the interface draws no scroll bar). */
export function scrollNode(ui: Interface, id: string, height: number, children: readonly Child[]): Node {
  const box = ui.boxOf(id);
  const end = ui.boxOf(`${id}-end`);
  const below = box !== null && end !== null && end.y > box.y + box.height + 1;
  return {
    width: 'grow',
    height,
    direction: 'column',
    gap: 4,
    children: [
      {
        id,
        width: 'grow',
        height: 'grow',
        direction: 'column',
        gap: 10,
        scroll: true,
        children: [...children, { id: `${id}-end`, width: 'grow', height: 1 }],
      },
      below && {
        width: 'grow',
        alignX: 'center',
        children: [{ role: 'chip', padding: [2, 10], children: [words('More below: scroll', 1, INK.word)] }],
      },
    ],
  };
}
