// The bounty board's stage, where a keeper's screen stands its keeper: its gold mark and title above, and the board
// itself drawn in the game's pixels on a floor lit in its gold, as the city builds it (`board.rs`): two posts, a
// planked face under a shingled gable with its lamp, and its notices in two rows of three, the town's under their red
// seals above and the factions' under their own colours below, as the screen's two rows of tiles are.
import { OUTLINE } from '../combat/dropPictures.ts';
import { type Pixels, svgOf } from '../plus/emblems.ts';
import type { Node } from '../ui/node.ts';
import { INK, svgNode, words } from './gearNodes.ts';
import { pixelNode } from './journalIcons.ts';
import { keeperMarkSvg } from './npc/npcMarks.ts';
import { litGround } from './npc/npcScreen.ts';

/** The board's gold, as its mark over it in the world is drawn. */
const GOLD = '#e0a526';

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
/** A stage narrower than this, in pixels, sets its title a step smaller, so it keeps clear of the board. */
const NARROW_TITLE = 320;
/** What the stage keeps clear around the board: its title above, the floor's margin below. */
const AROUND = [44, 120] as const;

/** The board's stage `width` by `height`: its mark and title at its top left, the board on its lit floor, drawn at
 *  the largest whole step of its cells that fits, from one to twelve; its title a step smaller on a stage too narrow
 *  for it. */
export function boardStage(title: string, width: number, height: number, wide: boolean): Node {
  const step = Math.max(
    1,
    Math.min(12, Math.floor((width - AROUND[0]) / BOARD_CELLS[0]), Math.floor((height - AROUND[1]) / BOARD_CELLS[1])),
  );
  const mark = wide ? 63 : 42;
  return {
    id: 'board-stage',
    width,
    height,
    clip: true,
    direction: 'column',
    alignX: 'center',
    alignY: 'end',
    picture: litGround(GOLD, height),
    children: [
      {
        gap: 11,
        alignY: 'center',
        float: { to: 'parent', x: 22, y: 22 },
        children: [
          svgNode('keeper mark board', keeperMarkSvg('board'), mark),
          words(title.toUpperCase(), wide ? 3 : width < NARROW_TITLE ? 1 : 2, INK.word, { tracking: 2 }),
        ],
      },
      {
        padding: [0, 0, 22, 0],
        children: [
          pixelNode('bounty board picture', BOARD_SVG, BOARD_CELLS, BOARD_CELLS[0] * step, BOARD_CELLS[1] * step),
        ],
      },
    ],
  };
}
