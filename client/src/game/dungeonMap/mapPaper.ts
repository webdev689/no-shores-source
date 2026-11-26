// What the interface lays over the inked dungeon: its name, the storey looked at, the chests found, each mark (the
// player's caret, the company's, the way in's staff, the portal, the stairs) and the name of the one under the pointer.
// No key's tip is written on the paper.
import type { Child, Node } from '../../ui/node.ts';
import type { MapShown, PaperMark } from './dungeonMap.ts';
import { INK as INKED } from './mapInk.ts';

/** What the interface lays over the map this frame (null while it is shut), and the dungeon's chests as counted for
 *  the player ("Chests 2 of 5"): the hook the dungeon chests' count is hung on once the gear carries it, none till
 *  then. */
export const PAPER: { node: Node | null; chests: () => string | null } = { node: null, chests: () => null };

/** The ink the words are written in, and each mark's colour. */
const INK = '#3a2816';
const COLOURS: Record<PaperMark['kind'], string> = {
  player: '#b8321e',
  company: '#2c5d8a',
  wayIn: '#3a2816',
  portal: '#6b3fa0',
  stairs: '#3a2816',
};
/** A mark's size (CSS px), how much a mark on another storey shows, and how fast the way in's staff pulses (a second). */
const MARK_PX = 18;
const FAINT = 0.4;
const PULSE_HZ = 0.8;

/** Each mark's drawing, 16 units square, in its colour, outlined in ink. */
function markSvg(kind: PaperMark['kind']): string {
  const colour = COLOURS[kind];
  const shapes: Record<PaperMark['kind'], string> = {
    player: `<path d="M8 1 L14 15 L8 11.5 L2 15 Z" fill="${colour}" stroke="${INK}" stroke-width="1"/>`,
    company: `<path d="M8 2 L13 14 L8 11 L3 14 Z" fill="${colour}" stroke="${INK}" stroke-width="1"/>`,
    wayIn: `<path d="M8 4 L8 16" stroke="${colour}" stroke-width="1.6"/><circle cx="8" cy="3" r="2.4" fill="#e2b450" stroke="${colour}"/>`,
    portal: `<path d="M3 15 L3 7 A5 5 0 0 1 13 7 L13 15 Z" fill="${colour}" fill-opacity="0.35" stroke="${colour}" stroke-width="1.4"/>`,
    stairs: `<path d="M1 15 L1 11 L5 11 L5 7 L9 7 L9 3 L15 3 L15 15 Z" fill="#d9c49a" stroke="${colour}" stroke-width="1.2"/>`,
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">${shapes[kind]}</svg>`;
}

const words = (text: string, size = 1): Node => ({
  text: { words: text, size, colour: INK, wrap: false },
});

/** The paper's words and marks for `shown`, of the dungeon `name`, the chests counted as `chests`, at `seconds`. */
export function paperNode(shown: MapShown, name: string, chests: string | null, seconds: number): Node {
  const storeyLine =
    shown.count > 1 &&
    (shown.every
      ? `All ${shown.count} storeys, you are on ${shown.playerStorey + 1}`
      : `Storey ${shown.storey + 1} of ${shown.count}, you are on ${shown.playerStorey + 1}`);
  const pulse = 0.65 + 0.35 * Math.sin(seconds * Math.PI * 2 * PULSE_HZ);
  const marks: Child[] = shown.marks.flatMap((mark): Child[] => {
    const [x, y] = [Math.round(mark.x), Math.round(mark.y)];
    const turns = mark.kind === 'player' || mark.kind === 'company';
    const shade = (mark.faint ? FAINT : 1) * (mark.kind === 'wayIn' ? pulse : 1);
    return [
      {
        width: MARK_PX,
        height: MARK_PX,
        through: true,
        opacity: shade,
        float: { to: 'screen', anchor: [0.5, 0.5], x, y },
        picture: {
          key: `dungeon map ${mark.kind}`,
          source: { svg: markSvg(mark.kind) },
          turn: turns ? (mark.turn * 180) / Math.PI : 0,
        },
      },
      mark.name !== null && {
        through: true,
        float: { to: 'screen', anchor: [0, 1], x: x + MARK_PX / 2 + 2, y: y - MARK_PX / 2 },
        children: [words(mark.name)],
      },
    ];
  });
  // North, past the compass needle's tip, where the ink pass draws the compass at the paper's upper right.
  const { yaw, pitch } = shown.view;
  const [middle, reach] = [INKED.compassRadius + INKED.compassGap, INKED.compassRadius + 9];
  const north: Child = {
    through: true,
    float: {
      to: 'screen',
      anchor: [0.5, 0.5],
      x: Math.round(shown.paperWidth - middle + Math.sin(yaw) * reach),
      y: Math.round(middle - Math.cos(yaw) * Math.sin(pitch) * reach),
    },
    children: [words('N')],
  };
  return {
    width: 'grow',
    height: 'grow',
    through: true,
    float: { to: 'screen' },
    children: [
      {
        through: true,
        direction: 'column',
        gap: 4,
        float: { to: 'screen', x: 24, y: 20 },
        children: [words(name, 2), storeyLine ? words(storeyLine) : null, chests ? words(chests) : null],
      },
      north,
      ...marks,
    ],
  };
}
