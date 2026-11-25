// The marks on the screen (`ScreenMark`): at sea each node or port a ring in its kind's colour round its glyph, a
// hostile ship's in its rank's colour round its faction's emblem, a Miniboss's mark over it; on foot the houses' roads'
// next goal (quests/quests.ts); its name under it and its kind and distance under that, gold with a glow when chosen,
// grey with a lock when locked, and an arrow on its ring's edge pointing the way while it is held at the picture's
// edge. Each is a press: choosing it calls `chosen`.
import { CANVAS_FACE } from '../face.ts';
import { motionReduced } from '../plus/kit.ts';
import { EMBLEM_PIXELS, markPicture } from '../plus/emblems.ts';
import { TONES } from '../plus/tones.ts';
import type { Child, Node, Picture } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { ownOutpostColours } from './guild/guildHeld.ts';
import { KIND_WORDS, type MarkKind } from './hudLaw.ts';
import { drawMarkDial, drawMarkRipple, drawPlaylistEmblem } from './playlistMark.ts';
import type { HostileLook } from './seaHostiles.ts';

/** A mark on the screen: a node, a port or a hostile ship, where it stands in CSS pixels, its size there, and what it
 *  says. */
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
  /** A hostile ship's emblem, rank colour and rank mark. */
  readonly hostile?: HostileLook;
  /** Its node is locked: greyed, with a lock for its glyph. */
  readonly locked: boolean;
}

const GLYPHS: Record<MarkKind, string> = {
  social: '⌂',
  patrol: '◇',
  mission: '◆',
  dungeon: '▼',
  boss: '☠',
  outpost: '⚑',
  port: '⚓︎',
  playlist: 'playlist',
  hostile: '',
  quest: '!',
};
/** A locked node's glyph, in the place of its kind's: drawn as a padlock (`lockAt`), since no face the page loads holds
 *  one and a system's would come in its own colours. */
const LOCK_GLYPH = 'lock';
/** The Playlist's glyph: its shield drawn (`playlistMark.ts`), as the Playlist screen's crests are. */
const PLAYLIST_GLYPH = GLYPHS.playlist;
/** The Playlist's mark moves: its dial's ticks turning, degrees a second, dim at rest and bright under the pointer or
 *  chosen; and a ring spreading from it every so many seconds, to so many times the ring's size, at its brightest. */
const PLAYLIST_MOTION = { turn: 8, rest: 0.55, lit: 1, every: 2.4, reach: 1.9, ripple: 0.5 } as const;

/** Each kind's colour, and a locked node's. */
const KIND_COLOURS: Record<MarkKind | 'locked', string> = {
  social: '#f3cf6a',
  patrol: '#8ed081',
  mission: '#7fb4ee',
  dungeon: '#c193e6',
  boss: '#ee7c6e',
  outpost: '#6fd3c9',
  port: '#e8e4d6',
  playlist: '#e0a458',
  // A hostile ship's mark wears its rank's colour, so its kind's own colour is the ink's.
  hostile: TONES.ink,
  // The houses' roads' mark, in the brass of the tracker that names its goal.
  quest: TONES.brassHi,
  locked: '#8a8f96',
};
const GOLD = '#f3cf6a';
const DIM = 'rgba(242,239,230,0.68)';
/** How far a chosen mark's glow reaches past its ring, CSS pixels. */
const GLOW = 18;

/** A glyph's size in a ring `size` across: half of it, down to a whole step of the face's grid, never under one. */
const glyphPx = (size: number): number => Math.max(11, Math.floor(size / 2 / 11) * 11);

/** The texels a mark's picture is drawn at for `size` CSS pixels: twice a size rounded up to 8, so a mark growing as
 *  the ship nears it reuses a few pictures rather than laying a new one in the atlas at every pixel it grows. */
const texels = (size: number) => Math.ceil(size / 8) * 16;

/** A padlock round `middle` in `colour`, on the face's 11-cell grid of `cell` pixels: its body and its shackle. */
function lockAt(
  context: OffscreenCanvasRenderingContext2D,
  middle: readonly [number, number],
  cell: number,
  colour: string,
): void {
  const [x, y] = middle;
  context.fillRect(x - 3.5 * cell, y - 0.5 * cell, 7 * cell, 5 * cell);
  context.beginPath();
  context.arc(x, y - 0.5 * cell, 2.25 * cell, Math.PI, 0);
  context.lineWidth = 1.5 * cell;
  context.strokeStyle = colour;
  context.stroke();
}

/** A flag round `middle`, 8 cells of `cell` pixels wide and 9 high, for the guild's own outposts: its pole and its
 *  cloth in `cloth` with a band of `device` along its foot, edged in light so a dark cloth still reads on the ring.
 *  Drawn, since the face's flag glyph reads as a "P" at a mark's size and shows its colour only as a line. */
function flagAt(
  context: OffscreenCanvasRenderingContext2D,
  middle: readonly [number, number],
  cell: number,
  cloth: string,
  device: string,
): void {
  const [x, y] = middle;
  const box = (fill: string, left: number, top: number, wide: number, high: number) => {
    context.fillStyle = fill;
    context.fillRect(x + left * cell, y + top * cell, wide * cell, high * cell);
  };
  box(TONES.ink, -4, -4.5, 1, 9);
  box(TONES.ink, -3, -4.5, 7, 5.5);
  box(cloth, -3, -4, 6.5, 4.5);
  box(device, -3, -1.5, 6.5, 2);
}

/** The ring and its glyph (in `ink`, the ring's colour unless given), the glyph in the mended face, which holds the ones Pixelify lacks. */
function ring(
  glyph: string,
  colour: string,
  size: number,
  state: { readonly hovered: boolean; readonly chosen: boolean; readonly outlined: boolean },
  ink = colour,
): Picture {
  const { hovered, chosen, outlined } = state;
  const edge = chosen ? GOLD : colour;
  const side = texels(size);
  return {
    key: `mark ${glyph} ${colour} ${ink} ${side} ${glyphPx(size)} ${hovered} ${chosen} ${outlined}`,
    pixel: { width: side, height: side },
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
        // An outlined ring (the guild's own, in its banner's colours) is edged in light, its flag too, so a dark or
        // sea-coloured cloth still reads against the sea.
        if (outlined) {
          context.beginPath();
          context.arc(middle[0], middle[1], width / 2 - unit / 2, 0, Math.PI * 2);
          context.lineWidth = unit;
          context.strokeStyle = TONES.ink;
          context.stroke();
        }
        const cell = (glyphPx(size) * unit) / 11;
        if (outlined) return flagAt(context, middle, (size * unit) / 16, colour, ink);
        context.fillStyle = ink;
        if (glyph === LOCK_GLYPH) return lockAt(context, middle, cell, ink);
        if (glyph === PLAYLIST_GLYPH) return drawPlaylistEmblem(context, middle, width);
        context.font = `${glyphPx(size) * unit}px ${CANVAS_FACE}`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(glyph, middle[0], middle[1]);
      },
    },
  };
}

/** A chosen ring's glow: a gold band 3 pixels round it and a soft light past that. */
function glow(size: number): Picture {
  const side = texels(size + 2 * GLOW);
  return {
    key: `mark glow ${side}`,
    pixel: { width: side, height: side },
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
        // A box's shadow is never drawn under the box, so the ring's own ground stays clear of the glow.
        context.globalCompositeOperation = 'destination-out';
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
        context.globalCompositeOperation = 'source-over';
        context.beginPath();
        context.arc(x, y, radius + 1.5 * unit, 0, Math.PI * 2);
        context.lineWidth = 3 * unit;
        context.strokeStyle = 'rgba(243,207,106,0.35)';
        context.stroke();
      },
    },
  };
}

/** A sign drawn in a colour, filling its box: the arrow a held mark points with, the star over the guild's own. */
function signOf(sign: string, colour: string): Picture {
  return {
    key: `mark ${sign} ${colour}`,
    source: {
      draw: (context, width, height) => {
        context.fillStyle = colour;
        context.font = `${height}px ${CANVAS_FACE}`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(sign, width / 2, height / 2);
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
    const look = mark.hostile;
    // The guild's own outposts fly its banner's colours.
    const own = mark.kind === 'outpost' && !mark.locked ? ownOutpostColours(mark.id) : null;
    const colour = mark.locked ? KIND_COLOURS.locked : (look?.colour ?? own?.cloth ?? KIND_COLOURS[mark.kind]);
    // An emblem's ground stands as it is under the pointer too, so the emblem's own colours stay true.
    const hovered = ui.hovered(id) && !look?.emblem;
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
        label: `${mark.name}, ${own ? "your guild's outpost" : KIND_WORDS[mark.kind]}, ${mark.note}`,
        width: size,
        height: size,
        float: { to: 'screen', anchor: [0.5, 0.5], x, y },
        picture: ring(glyph, colour, size, { hovered, chosen: mark.chosen, outlined: own !== null }, own?.device),
        children: [
          ...(mark.kind === 'playlist' && !mark.locked
            ? playlistMotion(colour, size, ui.age(id), ui.hovered(id) || mark.chosen)
            : []),
          look?.emblem ? emblemNode(look.emblem, size) : null,
          look?.badge ? badgeNode(look.badge) : null,
          // Not by its colours alone: a light star over the ring marks the guild's own.
          own && {
            width: 18,
            height: 18,
            float: { at: [0.5, 0], anchor: [0.5, 1], y: 2 },
            picture: signOf('★', TONES.ink),
          },
          held && {
            width: 12,
            height: 12,
            float: {
              at: [0.5, 0.5],
              anchor: [0.5, 0.5],
              x: Math.round(Math.sin(turn) * reach),
              y: Math.round(-Math.cos(turn) * reach),
            },
            picture: { ...signOf('▲', colour), turn: mark.arrowDegrees ?? 0 },
          },
          mark.named && words(mark.name, mark.chosen ? GOLD : mark.locked ? DIM : TONES.ink, 4),
          mark.named &&
            !held &&
            words(`${own ? "Your guild's outpost" : KIND_WORDS[mark.kind]} · ${mark.note}`, DIM, 22),
        ],
      },
    ];
    return shown.filter((node): node is Node => Boolean(node));
  });
}

/** The Playlist's mark's motion over its ring, `size` pixels, `seconds` after it was first laid: its dial's ticks
 *  turning, brighter while `lit`, and the ring spreading from it; the ticks still and no ring under reduced motion. */
function playlistMotion(colour: string, size: number, seconds: number, lit: boolean): Node[] {
  const still = motionReduced();
  const side = texels(size);
  const { turn, rest, every, reach, ripple } = PLAYLIST_MOTION;
  const spread = (seconds % every) / every;
  const grown = Math.round(size * (1 + (reach - 1) * spread));
  const tint = (alpha: number) => `rgba(255,255,255,${Math.round(alpha * 100) / 100})`;
  const dial: Node = {
    width: size,
    height: size,
    through: true,
    float: { at: [0.5, 0.5], anchor: [0.5, 0.5] },
    picture: {
      key: `mark dial ${colour} ${side}`,
      pixel: { width: side, height: side },
      source: { draw: drawMarkDial(colour) },
      turn: still ? 0 : (seconds * turn) % 360,
      tint: tint(lit ? PLAYLIST_MOTION.lit : rest),
    },
  };
  if (still) return [dial];
  return [
    dial,
    {
      width: grown,
      height: grown,
      through: true,
      float: { at: [0.5, 0.5], anchor: [0.5, 0.5] },
      picture: {
        key: `mark ripple ${colour} ${side}`,
        pixel: { width: side, height: side },
        source: { draw: drawMarkRipple(colour) },
        tint: tint(ripple * (1 - spread)),
      },
    },
  ];
}

/** A hostile ship's emblem in its ring, 62% of it across and its pixels kept hard. */
function emblemNode(svg: string, size: number): Node {
  const side = Math.round(0.62 * size);
  return {
    width: side,
    height: side,
    float: { at: [0.5, 0.5], anchor: [0.5, 0.5] },
    picture: {
      key: `mark emblem ${svg}`,
      source: { svg },
      pixel: { width: EMBLEM_PIXELS, height: EMBLEM_PIXELS },
    },
  };
}

/** A Miniboss's mark over the ring, fitted into a box 14 by 8 px whose top stands 12 px above the ring's. */
function badgeNode(svg: string): Node {
  const { width, height } = markPicture('miniboss');
  const fit = Math.min(14 / width, 8 / height);
  return {
    width: 14,
    height: 8,
    alignX: 'center',
    alignY: 'center',
    float: { at: [0.5, 0], anchor: [0.5, 0], y: -12 },
    children: [
      {
        width: Math.round(width * fit),
        height: Math.round(height * fit),
        picture: { key: 'mark badge', source: { svg }, pixel: { width, height } },
      },
    ],
  };
}
