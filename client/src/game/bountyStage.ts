// The bounty board where a keeper's screen stands its keeper (npc/keeperFrame.ts), and its mark in the crest's diamond:
// the board itself drawn in the game's pixels, as the city builds it (`board.rs`): two posts, a planked face under a
// shingled gable with its lamp, and its notices in two rows of three, the town's under their red seals above and the
// factions' under their own colours below, as the screen's two rows of tiles are.
import { OUTLINE } from '../combat/dropPictures.ts';
import { type Pixels, svgOf } from '../plus/emblems.ts';
import type { Node } from '../ui/node.ts';
import { svgNode } from './gearNodes.ts';
import { pixelNode } from './journalIcons.ts';
import { keeperMarkSvg } from './npc/npcMarks.ts';

/** The board's gold, as its mark over it in the world is drawn: the ground its screen is lit in. */
export const GOLD = '#e0a526';

/** The board, 44 cells by 42. */
const BOARD: Pixels = {
  rows: [
    '...............aaaQQQQQQQQaaa...............',
    '............aaaRRRkRRRkRRRkRRaaa............',
    '.........aaakrrrkrrrkrrrkrrrkrrraaa.........',
    '......aaaRkRRRkRRRkRRRkRRRkRRRkRRRkaaa......',
    '...aaarrkrrrkrrrkrrrkrrrkrrrkrrrkrrrkraaa...',
    'aaaRRRkRRRkRRRkRRRkRRRkRRRkRRRkRRRkRRRkRRaaa',
    'krrrkrrrkrrrkrrrkrrrkrrrkrrrkrrrkrrrkrrrkrrr',
    'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
    'aaaTtuaaaaaaaaaaaaaaLLLLaaaaaaaaaaaaaaTtuaaa',
    '..aTtWWWWWWWWWWWWWWhLFFLhWWWWWWWWWWWWWTtua..',
    '..aTtvWwwwGWwwwvWwwwLGfLwvWwwwvWGwwvWwTtua..',
    '..aTtvWPPPPPPpwvWwPPPPPPpvWwwPPPPPPpWwTtua..',
    '..aTtvWPPPPPPpwvWwPPPPPPpvWwwPPPPPPpWwTtua..',
    '..aTtvWPiiiiPpwvWwPiiiiPpvWwwPiiiiPpWwTtua..',
    '..aTtvWPPPPPPpwvWwPPPPPPpvWwwPPPPPPpWwTtua..',
    '..aTtvWPiiiSSpwvWwPiiiSSpvWwwPiiiSSpWwTtua..',
    '..aTtvWPPPPsSpwvWwPPPPsSpvWwwPPPPsSpWwTtua..',
    '..aTtvWpppppppwvWwpppppppvWwwpppppppWwTtua..',
    '..aTtvWwwwvWwwwvWwwwvWwwwvWwwwvWwwwvWwTtua..',
    '..aTtvWwwwvWwwwvWwwwvWwwwvWwwwvWwwwvWwTtua..',
    '..aTtvWwwwGWwwwvWwwwvGwwwvWwwwvWGwwvWwTtua..',
    '..aTtvWPPPPPPpwvWwPPPPPPpvWwwPPPPPPpWwTtua..',
    '..aTtvWPPPPPPpwvWwPPPPPPpvWwwPPPPPPpWwTtua..',
    '..aTtvWPiiiiPpwvWwPiiiiPpvWwwPiiiiPpWwTtua..',
    '..aTtvWPPPPPPpwvWwPPPPPPpvWwwPPPPPPpWwTtua..',
    '..aTtvWPiiiBBpwvWwPiiiAApvWwwPiiiVVpWwTtua..',
    '..aTtvWPPPPbBpwvWwPPPPcApvWwwPPPPnVpWwTtua..',
    '..aTtvWpppppppwvWwpppppppvWwwpppppppWwTtua..',
    '..aTtvWwwwvWwwwvWwwwvWwwwvWwwwvWwwwvWwTtua..',
    '..aTtvWwwwvWwwwvWwwwvWwwwvWwwwvWwwwvWwTtua..',
    '..aTtvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvTtua..',
    '..aTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTa..',
    '..auuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuua..',
    '..aTtuaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaTtua..',
    '..aTtua..............................aTtua..',
    '..aTtua..............................aTtua..',
    '..aTtua..............................aTtua..',
    '..aTtua..............................aTtua..',
    '..aTtua..............................aTtua..',
    '..aTtua..............................aTtua..',
    '..aTtua..............................aTtua..',
    '...aaa................................aaa...',
  ],
  tones: {
    A: '#f0b049',
    B: '#5aa8ec',
    F: '#fff1c4',
    G: '#f3cf86',
    L: GOLD,
    P: '#efe4c4',
    Q: '#b8644a',
    R: '#8e4630',
    S: '#d8553c',
    T: '#8a6238',
    V: '#a77de0',
    W: '#62452a',
    a: OUTLINE,
    b: '#1f5a99',
    c: '#9c5a12',
    f: '#ffe27a',
    h: '#7a5a24',
    i: '#4a3b2a',
    k: '#2a1410',
    n: '#4e2a86',
    p: '#cdb98c',
    r: '#6e3322',
    s: '#8e2a18',
    t: '#6b4a2b',
    u: '#43301c',
    v: '#36250f',
    w: '#4f3720',
  },
};
const BOARD_CELLS = [44, 42] as const;
const BOARD_SVG = svgOf(BOARD);
/** What the board keeps clear across its side and under it, where the name stands. */
const AROUND = [88, 0.4] as const;

/** The board on a keeper's side `width` by `height`: drawn at the largest whole step of its cells that fits clear of
 *  the name at the foot, from one to twelve. */
export function boardFigure(width: number, height: number): Node {
  const step = Math.max(
    1,
    Math.min(
      12,
      Math.floor((width - AROUND[0]) / BOARD_CELLS[0]),
      Math.floor((height * (1 - AROUND[1])) / BOARD_CELLS[1]),
    ),
  );
  return pixelNode('bounty board picture', BOARD_SVG, BOARD_CELLS, BOARD_CELLS[0] * step, BOARD_CELLS[1] * step);
}

/** The board's mark, `size` pixels a side, in the crest's diamond. */
export const boardMark = (size: number): Node => svgNode('keeper mark board', keeperMarkSvg('board'), size);
