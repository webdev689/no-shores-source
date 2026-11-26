// The frame every keeper's screen stands in, after Destiny 2's vendor screen (the Gunsmith's, in the owner's
// reference): the keeper large at the left, cut off below the waist, over a ground lit in their colour and darkened
// toward its edges; at the foot of that side their role in small spaced capitals, their name in large bold capitals
// over a thin white rule, and a line about them in small dim words; at the top right their crest (an emblem in a
// diamond with a bar running from it, the bar's name over its far end) with the player's currencies under it; and the
// screen's own body at the right. On a phone the keeper stands over the rest, a third of its height.
import type { Child, Node } from '../../ui/node.ts';
import { INK, rgba, words } from '../gearNodes.ts';

/** A room narrower than this, in pixels, stands the keeper over the rest. */
export const NARROW = 600;
/** The share of a wide room the keeper's side takes. */
const STAGE_SHARE = 0.4;
/** The keeper's whole height against the room's, and how far down their head stands: so the room's foot cuts them off
 *  below the waist. On a phone, the third they stand in shows their head and shoulders. */
const FIGURE_TALL = 1.4;
const FIGURE_TOP = 0.05;
const NARROW_TALL = 2.9;
/** The share of the figure's height drawn: the rest is under the room's foot. */
export const FIGURE_KEPT = 0.62;

/** What a frame shows of whom it is for: their figure (drawn at `figureHeight`'s height), their colour, the line they
 *  are saying (stood over their name, as a film's words are), their role, their name and a line about them, their
 *  crest, and the screen's body. */
export interface FrameParts {
  readonly glow: string;
  readonly figure: Node | null;
  readonly speech?: Node;
  readonly role: string;
  readonly name: string;
  readonly about: string;
  readonly crest: Node;
  /** A quest acquired here, as its small tile: at the crest's left, or under it on a phone or where `questUnder`
   *  says the two would not share the row. */
  readonly quest?: Child;
  readonly questUnder?: boolean;
  readonly body: readonly Child[];
}

/** How a frame lays a room: whether the keeper stands over the rest, and the width and height of their side. */
export function stageOf(room: { readonly width: number; readonly height: number }) {
  const narrow = room.width < NARROW;
  const width = narrow ? room.width : Math.floor(room.width * STAGE_SHARE);
  const height = narrow ? Math.floor(room.height / 3) : room.height;
  return { narrow, width, height };
}

/** The height a keeper's whole figure is drawn at in a room: its foot well under the room's, so it shows to the waist. */
export function figureHeight(room: { readonly width: number; readonly height: number }): number {
  const stage = stageOf(room);
  return Math.round(stage.height * (stage.narrow ? NARROW_TALL : FIGURE_TALL));
}

/** The room kept clear at the screen's edges and between its sides, pixels. */
const gutterOf = (narrow: boolean, text: number): number => (narrow ? 16 : text > 1 ? 48 : 32);

/** The width the body has at the right (on a phone, under the keeper), inside its padding. */
export function bodyWidth(room: { readonly width: number; readonly height: number }, text: number): number {
  const stage = stageOf(room);
  const gutter = gutterOf(stage.narrow, text);
  return Math.max(0, stage.narrow ? room.width - 2 * gutter : room.width - stage.width - Math.round(gutter * 1.5));
}

/** `css` ("#rrggbb") as channels "r,g,b". */
const channels = (css: string) => [1, 3, 5].map((start) => parseInt(css.slice(start, start + 2), 16)).join(',');

/** The ground under the whole screen, `height` pixels of the room tall: dark; lit in `glow` behind the keeper, at
 *  `stage` of its width; a slab a shade lighter at the right, where the body stands, edged by a slanting line as the
 *  reference's is; darkened toward every edge, and deepest at the foot, where the name stands. */
export function frameGround(glow: string, stage: number, narrow: boolean): NonNullable<Node['picture']> {
  const rgb = channels(glow);
  return {
    key: `keeper frame ${rgb} ${Math.round(stage * 100)} ${narrow}`,
    source: {
      draw: (drawing, across, down) => {
        drawing.fillStyle = '#0a0b0e';
        drawing.fillRect(0, 0, across, down);
        const middle = narrow ? across / 2 : across * stage * 0.5;
        const lit = drawing.createRadialGradient(middle, down * 0.38, 0, middle, down * 0.38, across * 0.42);
        lit.addColorStop(0, rgba(rgb, 0.36));
        lit.addColorStop(0.55, rgba(rgb, 0.12));
        lit.addColorStop(1, rgba(rgb, 0));
        drawing.fillStyle = lit;
        drawing.fillRect(0, 0, across, down);
        if (!narrow) {
          // The body's slab: from a slanting edge just past the keeper's side to the right.
          const edge = across * (stage + 0.04);
          drawing.fillStyle = 'rgba(214,206,186,0.045)';
          drawing.beginPath();
          drawing.moveTo(edge + down * 0.12, 0);
          drawing.lineTo(across, 0);
          drawing.lineTo(across, down);
          drawing.lineTo(edge, down);
          drawing.closePath();
          drawing.fill();
          drawing.strokeStyle = 'rgba(214,206,186,0.08)';
          drawing.lineWidth = Math.max(1, down / 540);
          drawing.stroke();
        }
        // Darker toward every edge.
        const edges = drawing.createRadialGradient(
          across / 2,
          down / 2,
          Math.min(across, down) * 0.35,
          across / 2,
          down / 2,
          Math.max(across, down) * 0.75,
        );
        edges.addColorStop(0, 'rgba(0,0,0,0)');
        edges.addColorStop(1, 'rgba(0,0,0,0.6)');
        drawing.fillStyle = edges;
        drawing.fillRect(0, 0, across, down);
        // The foot, deepest, so the name over it reads.
        const foot = drawing.createLinearGradient(0, down * 0.62, 0, down);
        foot.addColorStop(0, 'rgba(5,6,8,0)');
        foot.addColorStop(1, 'rgba(5,6,8,0.88)');
        drawing.fillStyle = foot;
        drawing.fillRect(0, down * 0.62, narrow ? across : across * (stage + 0.08), down * 0.38);
      },
    },
  };
}

/** The shade over the foot of the keeper's side, clear at its top and near black at the room's foot. */
const FOOT_SHADE: NonNullable<Node['picture']> = {
  key: 'keeper foot shade',
  source: {
    draw: (drawing, across, down) => {
      const shade = drawing.createLinearGradient(0, 0, 0, down);
      shade.addColorStop(0, 'rgba(5,6,8,0)');
      shade.addColorStop(0.55, 'rgba(5,6,8,0.62)');
      shade.addColorStop(1, 'rgba(5,6,8,0.92)');
      drawing.fillStyle = shade;
      drawing.fillRect(0, 0, across, down);
    },
  },
};

/** The keeper's name at the foot of their side: their role in small spaced capitals, their name in large bold
 *  capitals over a thin white rule, and a line about them in small dim words, at most `width` wide. */
export function nameBlock(
  parts: Pick<FrameParts, 'role' | 'name' | 'about'>,
  text: number,
  width: number,
  narrow = false,
): Node {
  // On a phone a step smaller, so the longest name keeps to its one line.
  const big = narrow ? 2 : text > 1 ? 4 : 3;
  return {
    direction: 'column',
    gap: text > 1 ? 6 : 4,
    maxWidth: width,
    children: [
      words(parts.role.toUpperCase(), text, 'rgba(239,232,214,0.86)', { tracking: 4 }),
      {
        direction: 'column',
        gap: text > 1 ? 4 : 3,
        children: [
          {
            text: {
              words: [{ words: parts.name.toUpperCase(), style: 'bold' }],
              size: big,
              colour: INK.word,
              wrap: false,
              edge: 'shadow',
              edgeColour: '#050608',
            },
          },
          { width: 'grow', height: 2, fill: 'rgba(239,232,214,0.92)' },
        ],
      },
      { width: 'grow', text: { words: parts.about, size: text, colour: 'rgba(168,159,136,0.82)' } },
    ],
  };
}

/** A keeper's screen in a room `room` pixels, its words at `text`: the keeper's side with their figure and name, the
 *  crest at the top right, and the body under it at the right; on a phone, the keeper over the crest and the body.
 *  With an `id`, the screen takes it and its keeper's side its `-stage`. */
export function keeperFrame(
  room: { readonly width: number; readonly height: number },
  text: number,
  parts: FrameParts,
  id?: string,
): Node {
  const stage = stageOf(room);
  const gutter = gutterOf(stage.narrow, text);
  const top = Math.round(stage.height * (stage.narrow ? 0.04 : FIGURE_TOP));
  const questUnder = stage.narrow || parts.questUnder === true;
  const side: Node = {
    ...(id !== undefined && { id: `${id}-stage` }),
    width: stage.width,
    height: stage.height,
    clip: true,
    children: [
      parts.figure && {
        ...parts.figure,
        float: { to: 'parent', at: [0.5, 0], anchor: [0.5, 0], y: top, clipped: true },
      },
      // The foot darkened over the figure too, so the words over it read.
      {
        width: 'grow',
        height: Math.round(stage.height * 0.45),
        float: { to: 'parent', at: [0, 1], anchor: [0, 1], clipped: true },
        picture: FOOT_SHADE,
      },
      {
        direction: 'column',
        gap: text > 1 ? 22 : 12,
        float: { to: 'parent', at: [0, 1], anchor: [0, 1], x: gutter, y: stage.narrow ? -12 : -gutter, clipped: true },
        // On a phone the line stands at the head of the body instead, clear of the keeper's face.
        children: [
          !stage.narrow && parts.speech,
          nameBlock(parts, stage.narrow ? 1 : text, stage.width - 2 * gutter, stage.narrow),
        ],
      },
    ],
  };
  const body: Node = {
    width: 'grow',
    height: 'grow',
    direction: 'column',
    gap: text > 1 ? 18 : 12,
    padding: stage.narrow
      ? [12, gutter, 12, gutter]
      : [Math.round(gutter * 0.75), gutter, Math.round(gutter * 0.5), Math.round(gutter * 0.5)],
    children: [
      // An acquired quest's tile takes the room left of the crest, so it stays in sight above the wares.
      { width: 'grow', alignX: 'end', children: [!questUnder && parts.quest, { width: 'grow' }, parts.crest] },
      questUnder && parts.quest,
      stage.narrow && parts.speech,
      ...parts.body,
    ],
  };
  return {
    ...(id !== undefined && { id }),
    width: room.width,
    height: room.height,
    direction: stage.narrow ? 'column' : 'row',
    picture: frameGround(parts.glow, stage.narrow ? 1 : stage.width / Math.max(1, room.width), stage.narrow),
    children: [side, body],
  };
}

/** The crest at the top right: `emblem` in its diamond with a bar running from it `width` wide, `share` of it full
 *  in `glow` (none, a plain rule), `named` over its far end; the player's currencies (`purse`) under it, at its right. */
export function crestNode(
  emblem: Node,
  bar: { readonly share: number | null; readonly named: string; readonly said?: string },
  purse: Node,
  glow: string,
  width: number,
  text: number,
): Node {
  const tall = text > 1 ? 12 : 8;
  const full = bar.share === null ? 0 : Math.round(Math.min(1, Math.max(0, bar.share)) * 100);
  return {
    direction: 'column',
    alignX: 'end',
    gap: text > 1 ? 12 : 8,
    maxWidth: width,
    children: [
      {
        alignY: 'center',
        children: [
          emblem,
          {
            width: Math.max(80, width - (text > 1 ? 96 : 72)),
            direction: 'column',
            gap: 6,
            padding: [0, 0, 0, 0],
            children: [
              {
                width: 'grow',
                alignX: 'end',
                children: [words(bar.named.toUpperCase(), text, INK.faint, { tracking: 2 })],
              },
              bar.share === null
                ? { width: 'grow', height: 2, fill: 'rgba(214,206,186,0.32)' }
                : {
                    width: 'grow',
                    height: tall,
                    fill: 'rgba(214,206,186,0.16)',
                    label: bar.said ?? bar.named,
                    children: [{ width: `${full}%`, height: 'grow', fill: glow }],
                  },
            ],
          },
        ],
      },
      purse,
    ],
  };
}
