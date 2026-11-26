// The island's tiles, over an island docked at or gone ashore on, in place of marks on the map: rectangles of one size
// in a grid with space between them, a little transparent, so the island shows between and through them. The island's
// own with its chart and the way back to the sea, its port's snapshot, the Playlist's banner with its crests, and its
// places by kind, each with its details; a click, or Enter on the one lit, does what its tile does.
import { CANVAS_FACE } from '../face.ts';
import type { Point2 } from '../overworld/ground.ts';
import { TONES } from '../plus/tones.ts';
import type { Child, Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { DIM } from './hudPieces.ts';
import { hudPress, said } from './hudParts.ts';
import {
  type IslandEntry,
  type IslandFacts,
  type IslandPanel,
  type PlaylistBanner,
  entriesOf,
  islandPanelOf,
} from './islandWords.ts';
import { iconNode } from './journalIcons.ts';
import { drawCrest } from './playlistCrest.ts';
import { scrolledNode } from './playlistParts.ts';
import type { Landmass } from './landmass.ts';
import type { Sea } from './sea.ts';
import type { NodeInfo } from './worldData.ts';

const BRASS = '#f3cf86';
/** A tile's ground: a little transparent, so the island shows through it; lit, a touch warmer. */
const GROUND = 'rgba(10,12,16,0.74)';
const LIT = 'rgba(30,25,18,0.84)';
const EDGE = 'rgba(192,138,62,0.45)';
/** Where the grid stands (in from each side, under the place's name, over the view's foot) and how it is laid: tiles
 *  `least` to `most` wide, up to `columns` a row with `gap` between, as tall as three rows fit (`short` to `tall`). */
const GRID = { side: 24, top: 104, foot: 24, gap: 16, least: 280, most: 340, columns: 5, rows: 3 } as const;
const TILE_TALL = { short: 176, tall: 220 } as const;
/** The scroll bar's room beside the grid (`scrolledNode`). */
const BAR_ROOM = 8;
/** A Playlist crest's side on its tile. */
const CREST = 30;
/** What a tile is laid at. */
interface TileSize {
  readonly width: number;
  readonly height: number;
}

/** What the panel shows the island on: its coast, its harbour and where the ship lies. */
export interface IslandChart {
  readonly id: string;
  readonly outline: readonly Point2[];
  readonly harbour: Point2 | null;
  readonly ship: Point2;
}

/** What the tiles do: light one for Enter, do what one does, and go back to the sea. */
export interface IslandActs {
  readonly choose: (id: string) => void;
  readonly act: (entry: IslandEntry) => void;
  readonly back: () => void;
}

/** Draws the island's chart `width` by `height` pixels: its coast filled as land over the sea, the harbour as a brass
 *  ring and the ship as a pale dot. */
function drawChart(chart: IslandChart) {
  return (context: OffscreenCanvasRenderingContext2D, width: number, height: number): void => {
    const eastings = chart.outline.map((point) => point[0]);
    const southings = chart.outline.map((point) => point[1]);
    const [left, top, right, bottom] = [
      Math.min(...eastings),
      Math.min(...southings),
      Math.max(...eastings),
      Math.max(...southings),
    ];
    const margin = 8 * (width / 360);
    const scale = Math.min(
      (width - 2 * margin) / Math.max(1, right - left),
      (height - 2 * margin) / Math.max(1, bottom - top),
    );
    const [offsetX, offsetY] = [(width - (right - left) * scale) / 2, (height - (bottom - top) * scale) / 2];
    const onChart = ([x, y]: Point2): Point2 => [offsetX + (x - left) * scale, offsetY + (y - top) * scale];
    context.fillStyle = 'rgba(28,52,74,0.9)';
    context.fillRect(0, 0, width, height);
    context.beginPath();
    chart.outline.forEach((point, place) => {
      const [x, y] = onChart(point);
      if (place === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.closePath();
    context.fillStyle = 'rgba(74,86,62,0.95)';
    context.fill();
    context.lineWidth = Math.max(1, width / 360);
    context.strokeStyle = TONES.brass;
    context.stroke();
    const dot = (point: Point2, radius: number, fill: string, ring: boolean) => {
      const [x, y] = onChart(point);
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fillStyle = fill;
      context.fill();
      if (!ring) return;
      context.lineWidth = Math.max(1, width / 240);
      context.strokeStyle = '#050608';
      context.stroke();
    };
    if (chart.harbour) dot(chart.harbour, 5 * (width / 360), BRASS, true);
    dot(chart.ship, 3.5 * (width / 360), '#efe8d6', true);
    context.font = `${11 * (width / 360)}px ${CANVAS_FACE}`;
    context.fillStyle = 'rgba(239,232,214,0.8)';
    context.fillText('N', width - margin * 2, margin * 2.4);
  };
}

/** An entry's details: each label and its value, a line each. */
const rowsNode = (rows: IslandEntry['rows']): Node => ({
  width: 'grow',
  direction: 'column',
  gap: 3,
  children: rows.map(([label, value]): Node => ({
    width: 'grow',
    gap: 8,
    children: [
      { width: 90, children: [said(label, { colour: DIM })] },
      { width: 'grow', children: [said(value)] },
    ],
  })),
});

/** A tile's foot: what a click does, a chevron before it, brass while lit; dim behind a lock while it is shut. */
const footNode = (entry: IslandEntry, lit: boolean): Node => ({
  width: 'grow',
  gap: 6,
  alignY: 'center',
  children:
    entry.shut === null
      ? [said('›', { colour: lit ? BRASS : DIM }), said(entry.act.words, { colour: lit ? BRASS : TONES.ink })]
      : [iconNode('locked', 12), said(entry.act.words, { colour: DIM })],
});

/** One entry's tile: its name, its line and its details, `more` under its line; a click does what it does, and the
 *  pointer or the focus on it lights it for Enter. */
function entryTile(
  ui: Interface,
  [entry, size]: readonly [IslandEntry, TileSize],
  lit: boolean,
  acts: IslandActs,
  more: Child[] = [],
): Node {
  const id = `island:${entry.id}`;
  if (ui.clicked(id)) {
    // Let go of the focus, so Enter is the game's and never presses this tile again.
    ui.focusOn(null);
    if (entry.shut === null) acts.act(entry);
  }
  if ((ui.hovered(id) || ui.focused(id)) && !lit) acts.choose(entry.id);
  return {
    id,
    press: true,
    label: `${entry.name}. ${entry.line}. ${entry.shut ?? entry.act.words}`,
    ...size,
    direction: 'column',
    gap: 6,
    padding: [10, 12],
    clip: true,
    fill: lit ? LIT : GROUND,
    outline: { width: 1, colour: lit ? TONES.brass : EDGE },
    ...(entry.shut !== null && { opacity: 0.7 }),
    children: [
      {
        width: 'grow',
        gap: 8,
        alignY: 'center',
        children: [
          entry.shut !== null && iconNode('locked', 12),
          { width: 'grow', children: [said(entry.name, { colour: BRASS })] },
        ],
      },
      said(entry.line, { colour: DIM }),
      ...more,
      entry.rows.length > 0 && rowsNode(entry.rows),
      { height: 'grow' },
      footNode(entry, lit),
    ],
  };
}

/** The Playlist's crests in a row, grey while shut. */
function crestsNode(banner: PlaylistBanner): Node {
  return {
    width: 'grow',
    gap: 10,
    children: banner.crests.map((crest): Node => ({
      width: CREST,
      height: CREST,
      label: crest.name,
      picture: {
        key: `island crest ${crest.kind} ${crest.shut} ${CREST}`,
        source: { draw: drawCrest(crest.kind, crest.shut, false) },
      },
    })),
  };
}

/** The island's own tile, first in the grid: its name, where the ship lies, its levels, its chart, and the way back. */
function islandTile(ui: Interface, panel: IslandPanel, size: TileSize, chart: IslandChart | null, back: () => void) {
  // The chart takes what the tile leaves under its words and over its press.
  const chartTall = Math.max(0, size.height - 136);
  return {
    id: 'island:island',
    ...size,
    direction: 'column',
    gap: 6,
    padding: [10, 12],
    clip: true,
    fill: GROUND,
    outline: { width: 1, colour: EDGE },
    children: [
      said(panel.title, { size: 2, colour: BRASS }),
      said(panel.where),
      panel.band !== null && said(`${panel.band} at Normal`, { colour: DIM }),
      chart &&
        chartTall >= 32 && {
          width: 'grow',
          height: chartTall,
          picture: {
            key: `island chart ${chart.id} ${size.width} ${chartTall} ${chart.harbour !== null} ${Math.round(chart.ship[0] / 500)} ${Math.round(chart.ship[1] / 500)}`,
            source: { draw: drawChart(chart) },
          },
        },
      { height: 'grow' },
      hudPress(ui, 'island:back', 'Back to the sea  Esc', back, { padding: [6, 12] }),
    ],
  } satisfies Node;
}

/** How the grid is laid on a view `width` by `height`: its columns, and each tile's size. */
export function gridOf(width: number, height: number): { readonly columns: number; readonly tile: TileSize } {
  const room = { width: width - 2 * GRID.side - BAR_ROOM, height: height - GRID.top - GRID.foot };
  const columns = Math.max(1, Math.min(GRID.columns, Math.floor((room.width + GRID.gap) / (GRID.least + GRID.gap))));
  const across = Math.floor((room.width - (columns - 1) * GRID.gap) / columns);
  const down = Math.floor((room.height - (GRID.rows - 1) * GRID.gap) / GRID.rows);
  return {
    columns,
    tile: {
      width: Math.max(1, Math.min(GRID.most, across)),
      height: Math.min(TILE_TALL.tall, Math.max(TILE_TALL.short, down)),
    },
  };
}

/** The island's tiles over the view, `chosen` the one Enter does (the first place's while none is). */
export function islandPanelNode(
  ui: Interface,
  panel: IslandPanel,
  chosen: string | null,
  chart: IslandChart | null,
  acts: IslandActs,
): Node {
  const { width, height } = ui.size;
  const { columns, tile } = gridOf(width, height);
  const shown = chosen ?? entriesOf(panel)[0]?.id ?? null;
  const tileOf = (entry: IslandEntry, more: Child[] = []) =>
    entryTile(ui, [entry, tile], shown === entry.id, acts, more);
  const tiles: Node[] = [
    islandTile(ui, panel, tile, chart, acts.back),
    ...(panel.port ? [tileOf(panel.port)] : []),
    ...(panel.playlist ? [tileOf(panel.playlist, [crestsNode(panel.playlist)])] : []),
    ...panel.groups.flatMap((group) => group.entries.map((entry) => tileOf(entry))),
  ];
  const rows: Node[] = [];
  for (let first = 0; first < tiles.length; first += columns)
    rows.push({ gap: GRID.gap, children: tiles.slice(first, first + columns) });
  return {
    id: 'island-panel',
    width: columns * tile.width + (columns - 1) * GRID.gap + BAR_ROOM,
    height: Math.max(TILE_TALL.short, height - GRID.top - GRID.foot),
    solid: true,
    label: `${panel.title}. ${panel.where}`,
    float: { to: 'screen', at: [0.5, 0], anchor: [0.5, 0], y: GRID.top },
    children: [
      scrolledNode(ui, 'island-list', { width: 'grow', height: 'grow' }, { direction: 'column', gap: GRID.gap }, rows),
    ],
  };
}

/** What the island's panel reads off the game, and what its entries do. */
export interface IslandGame {
  readonly landmass: () => Pick<Landmass, 'id' | 'plan' | 'nodes' | 'outline'>;
  readonly sea: () => Pick<Sea, 'position' | 'view'> | null;
  readonly chosen: () => string | null;
  readonly facts: () => Omit<IslandFacts, 'named'> | null;
  readonly named: (id: string) => string;
  readonly choose: (id: string) => void;
  readonly back: () => void;
  readonly does: {
    readonly land: (id: string) => void;
    readonly dungeon: (node: NodeInfo) => void;
    readonly playlist: (city: string) => void;
  };
}

/** The island's tiles as the game shows them while a landing is chosen, and what Enter does: the lit tile's press,
 *  the first place's while none is lit. */
export function islandScreen(game: IslandGame): {
  readonly node: (ui: Interface) => Node | null;
  readonly act: (id: string | null) => void;
} {
  const panelNow = (): IslandPanel | null => {
    const sea = game.sea();
    if (!sea) return null;
    const facts = game.facts();
    const read = { activities: facts?.activities ?? null, gates: facts?.gates ?? null, named: game.named };
    return islandPanelOf(game.landmass(), sea.view.docked, read);
  };
  const act = (entry: IslandEntry) => {
    if (entry.shut !== null) return;
    const landmass = game.landmass();
    // The flow lands only at the node chosen, so a landing chooses its node first.
    if (entry.act.does === 'land') return (game.choose(entry.id), game.does.land(entry.id));
    if (entry.act.does === 'playlist') return landmass.plan && game.does.playlist(landmass.plan.id);
    const node = landmass.nodes.find((each) => each.id === entry.id);
    if (node) game.does.dungeon(node);
  };
  return {
    node: (ui) => {
      const [panel, sea] = [panelNow(), game.sea()];
      if (!panel || !sea) return null;
      const landmass = game.landmass();
      const harbour = landmass.plan && !landmass.plan.ruined ? landmass.plan.harbour : null;
      const chart = { id: landmass.id, outline: landmass.outline, harbour, ship: sea.position };
      return islandPanelNode(ui, panel, game.chosen(), chart, {
        choose: game.choose,
        act,
        back: game.back,
      });
    },
    act: (id) => {
      const panel = panelNow();
      const entries = panel ? entriesOf(panel) : [];
      const entry = entries.find((each) => each.id === id) ?? (id === null ? entries[0] : undefined);
      if (entry) act(entry);
    },
  };
}
