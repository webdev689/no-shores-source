// A bounty as a tile and as a card, after Destiny's Bounty Tracker, drawn by the game; the board's screen and the
// Journal's column both show them. A tile has no words: its face says who posts it (the town's writ, or a faction's
// emblem), every bounty of one kind alike, and its edge and marks its state. The card, which the menu floats beside the
// tile pointed at or holding the keys, says the rest: its name and kind, its task and count, what it pays, what a
// faction's asks of the player, and at the board its press.
import { edged } from '../combat/barDraw.ts';
import type { Child, Node } from '../ui/node.ts';
import type { BountyRow, Pay } from './bountyBoard.ts';
import { bountyFaceNode, factionNamed, posterEmblem } from './bountyFaces.ts';
import { SIGN_CELLS } from './emblemArt.ts';
import { cardFrame, type Tone } from './gearCard.ts';
import { type Hint, INK, type Sizes, emblemNode, glyphNode, label, words } from './gearNodes.ts';
import { type IconName, iconNode } from './journalIcons.ts';

/** Each pool's kind, as a town's card names it under the bounty's name, with its mark. */
export const BOUNTY_KINDS: readonly string[] = ['Land bounty', 'Sea bounty', 'Dungeon bounty'];
const KIND_MARKS: readonly IconName[] = ['land', 'sea', 'dungeon'];
/** A tile's edge, in pixels, around its face. */
const EDGE = 2;
/** A tile's edge at rest, taken, and done: the kit's stone, its brass, and a gilded edge. */
const STONE = [INK.stoneHi, INK.stoneLo, INK.stoneLo, INK.stoneHi];
const BRASS = [INK.brassLit, INK.brass, INK.brass, INK.brassLit];
const GILT = ['#f3cf86', '#7a5424', '#5c3f1a', '#c08a3e'];
/** The tile pointed at or holding the keys: ringed in white just outside its edge, as Destiny marks what its cursor
 *  is on, so its state's edge still shows inside the ring. */
const RING = '#f2efe6';
const RING_OUT = 3;
/** A tile shut before the prologue: its face greyed. */
const SHUT_TINT = 'rgb(110,110,110)';

/** A tile's face, two or three times its sign's 24 cells where the menu is wide, and the tile with its edge. */
export const faceSide = (wide: boolean): number => (wide ? 3 : 2) * SIGN_CELLS;
export const tileSide = (wide: boolean): number => faceSide(wide) + 2 * EDGE;

/** What a bounty is, as its card says under its name: a town's by where it counts ("Land bounty"), a faction's by
 *  the faction ("Stormcallers bounty"). */
export function kindOf(row: Pick<BountyRow, 'pool' | 'faction'>): string {
  const faction = row.faction === 0 ? null : factionNamed(row.faction);
  return faction ? `${faction.name.replace(/^The /, '')} bounty` : (BOUNTY_KINDS[row.pool] ?? 'Bounty');
}

/** How a tile stands: under the pointer or the keys, shut before the prologue, and whether it is pressed (at the
 *  board) or only shows its card (in the Journal). */
export interface TileLook {
  readonly lit: boolean;
  readonly shut: boolean;
  readonly press: boolean;
}

/** A gauge of a count toward its target, `height` pixels tall, filled in `colour`. */
function gauge(count: number, target: number, height: number, colour: string, width: Node['width'] = 'grow'): Node {
  const share = Math.round((100 * Math.min(count, target)) / Math.max(1, target));
  return {
    role: 'track',
    width,
    height,
    bevel: 1,
    padding: 1,
    children: [{ width: `${share}%`, height: 'grow', fill: colour }],
  };
}

/** A bounty's state in words: its count while held, done, turned in, or not taken. */
export function stateWords(row: Pick<BountyRow, 'state' | 'progress'>): string {
  const said = { open: 'Not taken', done: 'Done. Turn it in at the board.', paid: 'Turned in' } as const;
  return row.state === 'held' ? row.progress : said[row.state];
}

/** A bounty's tile: its poster's face in an edge of its state (stone open, brass taken, gilt done), a gauge of its
 *  count along its foot while counted, dimmed with a tick once turned in, ringed while pointed at or holding the
 *  keys. At the board E, Enter or a click presses it; in the Journal it only takes the focus for its card. */
export function bountyTileNode(row: BountyRow, id: string, wide: boolean, look: TileLook): Node {
  const [face, size] = [faceSide(wide), tileSide(wide)];
  const counting = row.state === 'held' || row.state === 'done';
  const drawn = bountyFaceNode(row.faction, face);
  return {
    id,
    ...(look.press ? { press: true, keys: ['e'] } : { focusable: true }),
    label: `${row.name}, ${kindOf(row)}: ${row.words} ${stateWords(row)}`,
    width: size,
    height: size,
    padding: EDGE,
    fill: INK.well,
    draw: edged(row.state === 'done' ? GILT : row.state === 'held' ? BRASS : STONE, EDGE),
    children: [
      {
        ...drawn,
        ...(look.shut && drawn.picture && { picture: { ...drawn.picture, tint: SHUT_TINT } }),
        opacity: row.state === 'paid' || look.shut ? 0.4 : 1,
      },
      look.lit && {
        width: size + 2 * RING_OUT,
        height: size + 2 * RING_OUT,
        outline: { width: 2, colour: RING },
        float: { to: 'parent', anchor: [0.5, 0.5], at: [0.5, 0.5] },
      },
      counting && {
        ...gauge(row.count, row.target, 4, row.state === 'done' ? INK.gain : INK.brassLit, face - 6),
        float: { to: 'parent', anchor: [0.5, 1], at: [0.5, 1], y: -EDGE - 3 },
      },
      row.state === 'paid' && {
        ...iconNode('taken', 24),
        float: { to: 'parent', anchor: [1, 1], at: [1, 1], x: -1, y: -1 },
      },
    ],
  };
}

/** A slot of the faction's row while the player is pledged to none: an empty well with a padlock, its card saying
 *  how it opens. */
export function lockedTileNode(id: string, wide: boolean): Node {
  const size = tileSide(wide);
  return {
    id,
    focusable: true,
    role: 'well',
    label: 'A faction’s bounty: pledge to a faction to take theirs.',
    width: size,
    height: size,
    alignX: 'center',
    alignY: 'center',
    children: [{ ...iconNode('locked', 24), opacity: 0.6 }],
  };
}

/** A card's tone by who posts the bounty: its emblem's accent lit, its ground's foot shaded. */
function toneOf(faction: number): Tone {
  const { ground, accent } = posterEmblem(faction).art;
  const rgb = [1, 3, 5].map((start) => Number.parseInt(accent.slice(start, start + 2), 16)).join(',');
  return { lit: accent, shade: ground[1] ?? ground[0] ?? INK.stoneLo, rgb };
}

/** A line of what a bounty pays: its mark, and the amount with what it is. */
const earnLine = (mark: Node, said: string, size: number, colour: string): Node => ({
  gap: 8,
  alignY: 'center',
  children: [mark, words(said, size, colour)],
});

/** What a bounty asks of the player, ticked while it is met: a faction's counts only while its cape is worn. */
function askLine(met: boolean, size: number): Node {
  return {
    gap: 8,
    alignY: 'center',
    children: [
      {
        width: 16,
        height: 16,
        alignX: 'center',
        alignY: 'center',
        outline: { width: 1, colour: met ? INK.gain : INK.faint },
        children: [met && iconNode('taken', 12)],
      },
      words('Counts while you wear their cape', size, met ? INK.word : INK.faint),
    ],
  };
}

/** What a card shows beyond the bounty: its press at the board (the keys along its foot), whether a faction's counts
 *  now, and a word on its state along its foot by its mark. */
export interface CardMore {
  readonly hints?: readonly Hint[];
  readonly serving?: boolean;
  readonly said?: { readonly words: string; readonly icon: IconName | null };
}

/** A bounty's card: its name and kind on a band of its poster's colour; its task and, once taken, its count; what
 *  it pays (XP, and the town's Aurem or the faction's reputation), resting once turned in; what a faction's asks;
 *  and along its foot its press, or a word on its state. */
export function bountyCardNode(row: BountyRow, pay: Pay, sizes: Sizes, more: CardMore = {}): Node {
  const size = sizes.label;
  const paid = row.state === 'paid';
  const shown = paid ? row.target : row.count;
  const colour = paid ? INK.faint : INK.gain;
  const faction = row.faction === 0 ? null : factionNamed(row.faction);
  const head: Child[] = [
    { width: 'grow', ...words(row.name.toUpperCase(), 2, INK.word, { tracking: 1, ellipsis: true }) },
    {
      gap: 6,
      alignY: 'center',
      children: [iconNode(KIND_MARKS[row.pool] ?? 'land', 24), words(kindOf(row), size, INK.faint)],
    },
  ];
  const pays: Node[] = [earnLine(iconNode('xp', 24), `+${pay.xp.toLocaleString('en')}`, size, colour)];
  if (faction)
    pays.push(
      earnLine(
        emblemNode(posterEmblem(row.faction), 'sign', 24, 24, 24),
        `+${pay.reputation.toLocaleString('en')} reputation`,
        size,
        colour,
      ),
    );
  else pays.push(earnLine(glyphNode('aurem', 24), `+${pay.aurem.toLocaleString('en')} Aurem`, size, colour));
  const body: Child[] = [
    { width: 'grow', text: { words: row.words, size, colour: INK.word } },
    row.state !== 'open' && {
      width: 'grow',
      gap: 8,
      alignY: 'center',
      padding: [2, 0, 0, 0],
      children: [gauge(shown, row.target, 6, INK.brassLit), words(`${shown}/${row.target}`, size, INK.word)],
    },
    { width: 'grow', padding: [4, 0], children: [{ width: 'grow', height: 1, fill: 'rgba(163,152,128,0.26)' }] },
    label('Rewards', size),
    { direction: 'column', gap: 4, opacity: paid ? 0.6 : 1, children: pays },
    faction && askLine(more.serving ?? false, size),
  ];
  const foot: Child = more.said && {
    width: 'grow',
    padding: [0, 12, 10, 12],
    children: [stateLine(more.said.words, more.said.icon, size)],
  };
  return { ...cardFrame(sizes, toneOf(row.faction), head, body, more.hints ?? [], foot), id: 'bounty-card' };
}

/** A card for a slot shut or locked: its name and why, by its mark. */
export function shutCardNode(name: string, said: string, sizes: Sizes): Node {
  return {
    ...cardFrame(
      sizes,
      toneOf(0),
      [{ width: 'grow', ...words(name.toUpperCase(), 2, INK.word, { tracking: 1 }) }],
      [stateLine(said, 'locked', sizes.label)],
    ),
    id: 'bounty-card',
  };
}

/** A word on a bounty's state under its card, by its mark where it has one. */
export function stateLine(said: string, icon: IconName | null, size = 1): Node {
  return {
    width: 'grow',
    gap: 6,
    alignY: 'center',
    children: [icon && iconNode(icon, 24), { width: 'grow', text: { words: said, size, colour: INK.faint } }],
  };
}
