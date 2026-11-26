// The panel over an island docked at or gone ashore on, in place of marks on the map: down the left of the view and a
// little transparent, so the island stands beside it. Its port's snapshot with a chart of the island and its harbour,
// the Playlist's banner with its crests, and the island's places by kind; the one chosen opened to its details and its
// press, a second click or Enter doing what it does.
import { CANVAS_FACE } from '../face.ts';
import type { Point2 } from '../overworld/ground.ts';
import { TONES } from '../plus/tones.ts';
import type { Child, Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { withKey } from './controls.ts';
import { DIM } from './hudPieces.ts';
import { header, hudPress, said } from './hudParts.ts';
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
/** The panel's ground: a little transparent, so the island shows through it. */
const GROUND = 'rgba(10,12,16,0.74)';
const EDGE = 'rgba(192,138,62,0.45)';
/** Where the panel stands: in from the left, under the place's name, and over the foot of the view. */
const PLACE = { left: 24, top: 104, foot: 24, most: 400, share: 0.4 } as const;
/** The chart of the island in the port's snapshot, and a Playlist crest's side. */
const CHART_TALL = 110;
const CREST = 44;

/** What the panel shows the island on: its coast, its harbour and where the ship lies. */
export interface IslandChart {
  readonly id: string;
  readonly outline: readonly Point2[];
  readonly harbour: Point2 | null;
  readonly ship: Point2;
}

/** What the panel's presses do: choose an entry, do what it does, and go back to the sea. */
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
    gap: 10,
    children: [
      { width: 112, children: [said(label, { colour: DIM })] },
      { width: 'grow', children: [said(value)] },
    ],
  })),
});

/** An entry's press, Enter on it: dim, with why, while it is shut. */
function pressOf(ui: Interface, entry: IslandEntry, acts: IslandActs): Node {
  return {
    width: 'grow',
    direction: 'column',
    gap: 6,
    children: [
      entry.shut !== null && {
        gap: 6,
        alignY: 'center',
        children: [iconNode('locked', 12), said(entry.shut, { colour: DIM })],
      },
      hudPress(ui, `island:act:${entry.id}`, withKey(entry.act.words, 'confirm'), () => acts.act(entry), {
        role: 'primary',
        disabled: entry.shut !== null,
        ...(entry.shut !== null && { opacity: 0.45 }),
      }),
    ],
  };
}

/** One entry: its name and line, pressed to choose it; chosen, opened to its details and its press. */
function entryNode(ui: Interface, entry: IslandEntry, chosen: boolean, acts: IslandActs, more: Child[] = []): Node {
  const id = `island:${entry.id}`;
  if (ui.clicked(id)) {
    ui.focusOn(null);
    if (chosen && entry.shut === null) acts.act(entry);
    else acts.choose(entry.id);
  }
  const lit = chosen || ui.hovered(id);
  return {
    id,
    press: true,
    label: `${entry.name}. ${entry.line}`,
    width: 'grow',
    direction: 'column',
    gap: 6,
    padding: [8, 10],
    fill: chosen ? 'rgba(192,138,62,0.16)' : lit ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0)',
    outline: { width: 1, colour: chosen ? EDGE : 'rgba(163,152,128,0.18)' },
    children: [
      {
        width: 'grow',
        gap: 8,
        alignY: 'center',
        children: [
          entry.shut !== null && iconNode('locked', 12),
          { width: 'grow', children: [said(entry.name, { colour: chosen ? BRASS : TONES.ink })] },
        ],
      },
      said(entry.line, { colour: DIM }),
      ...more,
      chosen && entry.rows.length > 0 && rowsNode(entry.rows),
      chosen && pressOf(ui, entry, acts),
    ],
  };
}

/** The Playlist's crests in a row, each over its name, grey while shut. */
function crestsNode(banner: PlaylistBanner): Node {
  return {
    width: 'grow',
    gap: 4,
    children: banner.crests.map((crest): Node => ({
      width: 'grow',
      direction: 'column',
      alignX: 'center',
      gap: 2,
      children: [
        {
          width: CREST,
          height: CREST,
          picture: {
            key: `island crest ${crest.kind} ${crest.shut} ${CREST}`,
            source: { draw: drawCrest(crest.kind, crest.shut, false) },
          },
        },
        said(crest.name, { colour: DIM, wrap: false }),
      ],
    })),
  };
}

/** A small heading over a group of entries, in capitals. */
const heading = (words: string): Node => ({
  width: 'grow',
  padding: [6, 0, 0, 0],
  children: [said(words.toUpperCase(), { colour: DIM, tracking: 3 })],
});

/** The panel over the island, `chosen` the entry chosen (the first while none is), on a view `width` by `height`. */
export function islandPanelNode(
  ui: Interface,
  panel: IslandPanel,
  chosen: string | null,
  chart: IslandChart | null,
  acts: IslandActs,
): Node {
  const { width, height } = ui.size;
  const wide = Math.round(Math.min(PLACE.most, Math.max(280, width * PLACE.share)));
  const first = entriesOf(panel)[0]?.id ?? null;
  const shown = chosen ?? first;
  const chartNode: Child = chart && {
    width: 'grow',
    height: CHART_TALL,
    picture: {
      key: `island chart ${chart.id} ${wide} ${Math.round(chart.ship[0] / 500)} ${Math.round(chart.ship[1] / 500)}`,
      source: { draw: drawChart(chart) },
    },
  };
  const children: Child[] = [
    panel.port && entryNode(ui, panel.port, shown === panel.port.id, acts, [chartNode]),
    panel.playlist && entryNode(ui, panel.playlist, shown === panel.playlist.id, acts, [crestsNode(panel.playlist)]),
    ...panel.groups.flatMap((group) => [
      heading(group.title),
      ...group.entries.map((entry) => entryNode(ui, entry, shown === entry.id, acts)),
    ]),
  ];
  return {
    id: 'island-panel',
    direction: 'column',
    width: wide,
    height: Math.max(200, height - PLACE.top - PLACE.foot),
    fill: GROUND,
    outline: { width: 1, colour: EDGE },
    solid: true,
    label: `${panel.title}. ${panel.where}`,
    float: { to: 'screen', at: [0, 0], anchor: [0, 0], x: PLACE.left, y: PLACE.top },
    children: [
      {
        width: 'grow',
        gap: 10,
        padding: [10, 12],
        ...header(),
        children: [
          {
            width: 'grow',
            direction: 'column',
            gap: 2,
            children: [
              said(panel.title, { size: 2, colour: BRASS }),
              said(panel.where),
              panel.band !== null && said(`${panel.band} at Normal`, { colour: DIM }),
            ],
          },
          hudPress(ui, 'island:back', 'Back to the sea  Esc', acts.back, { padding: [7, 12] }),
        ],
      },
      scrolledNode(
        ui,
        'island-list',
        { width: 'grow', height: 'grow' },
        { direction: 'column', gap: 6, padding: [10, 6, 12, 12] },
        children,
      ),
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

/** The island's panel as the game shows it while a landing is chosen, and what Enter does: the chosen entry's press,
 *  the first entry's while none is chosen. */
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
    if (entry.act.does === 'land') return game.does.land(entry.id);
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
      return islandPanelNode(ui, panel, game.chosen(), sea.view.docked ? chart : null, {
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
