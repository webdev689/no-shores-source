// The marks on the screen at sea (`ScreenMark`): each node or port a ring in its kind's colour round its glyph, its
// name under it and its kind and distance under that, gold with a glow when chosen, grey with a lock when locked, and
// an arrow on its ring's edge pointing the way while it is held at the picture's edge. Each is a press: choosing it
// calls `chosen`.
import { TONES } from '../plus/tones.ts';
import type { Child, Node, Picture } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { KIND_WORDS, type MarkKind } from './hudLaw.ts';

/** A mark on the screen: a node or a port, where it stands in CSS pixels, its size there, and what it says. */
export interface ScreenMark {
  readonly id: string;
  readonly kind: MarkKind;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly sizePx: number;
  readonly note: string;
  readonly chosen: boolean;
  /** Whether its name and note show: off where they would print over a nearer mark's. */
  readonly named: boolean;
  /** Held at the picture's edge: the way its arrow points, degrees clockwise from up. */
  readonly arrowDegrees: number | null;
  /** Its node is locked: greyed, with a lock for its glyph. */
  readonly locked: boolean;
}

export const GLYPHS: Record<MarkKind, string> = {
  social: '⌂',
  patrol: '◇',
  mission: '◆',
  dungeon: '▼',
  boss: '☠',
  port: '⚓︎',
};
/** A locked node's glyph, in the place of its kind's. */
export const LOCK_GLYPH = '🔒︎';

/** Each kind's colour, and a locked node's. */
export const KIND_COLOURS: Record<MarkKind | 'locked', string> = {
  social: '#f3cf6a',
  patrol: '#8ed081',
  mission: '#7fb4ee',
  dungeon: '#c193e6',
  boss: '#ee7c6e',
  port: '#e8e4d6',
  locked: '#8a8f96',
};
const GOLD = '#f3cf6a';
const DIM = 'rgba(242,239,230,0.68)';
/** How far a chosen mark's glow reaches past its ring, CSS pixels. */
const GLOW = 18;

/** A glyph's size in a ring `size` across: half of it, down to a whole step of the face's grid, never under one. */
export const glyphPx = (size: number): number => Math.max(11, Math.floor(size / 2 / 11) * 11);

/** The ring and its glyph, drawn in the page's own face, which holds the glyphs Pixelify lacks. */
function ring(glyph: string, colour: string, size: number, hovered: boolean, chosen: boolean): Picture {
  const edge = chosen ? GOLD : colour;
  return {
    key: `mark ${glyph} ${colour} ${size} ${hovered} ${chosen}`,
    source: {
      draw: (context, width, height) => {
        const unit = width / size;
        const middle = [width / 2, height / 2] as const;
        context.beginPath();
        context.arc(middle[0], middle[1], width / 2 - unit, 0, Math.PI * 2);
        context.fillStyle = hovered ? 'rgba(30,36,44,0.85)' : 'rgba(10,13,17,0.6)';
        context.fill();
        context.lineWidth = 2 * unit;
        context.strokeStyle = edge;
        context.stroke();
        context.fillStyle = colour;
        context.font = `${glyphPx(size) * unit}px sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(glyph, middle[0], middle[1]);
      },
    },
  };
}

/** A chosen ring's glow: a gold band 3 pixels round it and a soft light past that. */
function glow(size: number): Picture {
  return {
    key: `mark glow ${size}`,
    source: {
      draw: (context, width, height) => {
        const unit = width / (size + 2 * GLOW);
        const [x, y] = [width / 2, height / 2];
        const radius = (size / 2) * unit;
        const light = context.createRadialGradient(x, y, radius, x, y, radius + GLOW * unit);
        light.addColorStop(0, 'rgba(243,207,106,0.6)');
        light.addColorStop(1, 'rgba(243,207,106,0)');
        context.fillStyle = light;
        context.fillRect(0, 0, width, height);
        context.beginPath();
        context.arc(x, y, radius + 1.5 * unit, 0, Math.PI * 2);
        context.lineWidth = 3 * unit;
        context.strokeStyle = 'rgba(243,207,106,0.35)';
        context.stroke();
      },
    },
  };
}

/** The arrow a held mark points with, in its colour. */
function arrow(colour: string): Picture {
  return {
    key: `mark arrow ${colour}`,
    source: {
      draw: (context, width, height) => {
        context.fillStyle = colour;
        context.font = `${height}px sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('▲', width / 2, height / 2);
      },
    },
  };
}

/** The marks as nodes on the screen, the later over the earlier; a press on one calls `chosen` with its id. */
export function markNodes(ui: Interface, marks: readonly ScreenMark[], chosen: (id: string) => void): Node[] {
  return marks.flatMap((mark): Node[] => {
    const id = `mark:${mark.id}`;
    if (ui.clicked(id)) {
      ui.focusOn(null);
      chosen(mark.id);
    }
    const size = Math.round(mark.sizePx);
    const [x, y] = [Math.round(mark.x), Math.round(mark.y)];
    const colour = mark.locked ? KIND_COLOURS.locked : KIND_COLOURS[mark.kind];
    const held = mark.arrowDegrees !== null;
    const glyph = mark.locked ? LOCK_GLYPH : GLYPHS[mark.kind];
    const turn = ((mark.arrowDegrees ?? 0) * Math.PI) / 180;
    const reach = size / 2 + 9;
    const words = (text: string, colourOf: string, down: number, size = 1): Node => ({
      float: { at: [0.5, 1], anchor: [0.5, 0], y: down },
      text: { words: text, size, colour: colourOf, edge: 'shadow', edgeColour: '#000', wrap: false },
    });
    const shown: Child[] = [
      mark.chosen && {
        width: size + 2 * GLOW,
        height: size + 2 * GLOW,
        through: true,
        float: { to: 'screen', anchor: [0.5, 0.5], x, y },
        picture: glow(size),
      },
      {
        id,
        press: true,
        label: `${mark.name}, ${KIND_WORDS[mark.kind]}, ${mark.note}`,
        width: size,
        height: size,
        float: { to: 'screen', anchor: [0.5, 0.5], x, y },
        picture: ring(glyph, colour, size, ui.hovered(id), mark.chosen),
        children: [
          held && {
            width: 12,
            height: 12,
            float: {
              at: [0.5, 0.5],
              anchor: [0.5, 0.5],
              x: Math.round(Math.sin(turn) * reach),
              y: Math.round(-Math.cos(turn) * reach),
            },
            picture: { ...arrow(colour), turn: mark.arrowDegrees ?? 0 },
          },
          mark.named && words(mark.name, mark.chosen ? GOLD : mark.locked ? DIM : TONES.ink, 4),
          mark.named && !held && words(`${KIND_WORDS[mark.kind]} · ${mark.note}`, DIM, 22),
        ],
      },
    ];
    return shown.filter((node): node is Node => Boolean(node));
  });
}
