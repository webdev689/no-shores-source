// The island's tiles, over an island docked at or gone ashore on, in place of marks on the map: rectangles of one size
// in a grid with space between them, each a painted scene of its place (`islandArt.ts`) in a carved frame, with its
// name and levels at its foot and its details as glyphs at its head, the island seen between them. The tile lit by
// the pointer, the keys or the pad opens a card beside it saying every glyph's meaning at once. The island's own with
// its chart and the way back to the sea, its port, the Playlist, and its places by kind; they rise into place as the
// view opens, and a click, or Enter on the one lit, does what a tile does.
import type { Point2 } from '../overworld/ground.ts';
import { motionReduced } from '../plus/kit.ts';
import { TONES } from '../plus/tones.ts';
import type { Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { noKey } from './controls.ts';
import { DIM } from './hudPieces.ts';
import { hudPress, said } from './hudParts.ts';
import {
  type DepthsEntry,
  type IslandEntry,
  type IslandFacts,
  type IslandPanel,
  type PlaylistBanner,
  entriesOf,
  islandPanelOf,
  kindOf,
  tagOf,
} from './islandWords.ts';
import { drawFrame, frameKey } from './islandFrame.ts';
import { iconNode, skullsNode } from './journalIcons.ts';
import { CREST_SPOTS, type Scene, sceneSheet, TEXEL } from './islandArt.ts';
import { rgbaOf } from '../art/sheet.ts';
import { drawCrest } from './playlistCrest.ts';
import { scrolledNode } from './playlistParts.ts';
import type { Landmass } from './landmass.ts';
import type { Sea } from './sea.ts';
import type { NodeInfo } from './worldData.ts';

const BRASS = '#f3cf86';
/** A tile's scene drawn 90% opaque, so the island shows through it a little. */
const SEEN = 'rgba(255,255,255,0.9)';
/** Where the grid stands (in from each side, under the place's name, over the view's foot) and how it is laid: tiles
 *  `least` to `most` wide, up to `columns` a row with `gap` between, as tall as three rows fit (`short` to `tall`),
 *  their sides in steps of `step`, even so each texel of a scene is two pixels, and a resize paints a few sizes. */
const GRID = { side: 24, top: 104, foot: 24, gap: 16, least: 280, most: 340, columns: 5, rows: 3, step: 4 } as const;
const TILE_TALL = { short: 176, tall: 220 } as const;
/** The scroll bar's room beside the grid (`scrolledNode`). */
const BAR_ROOM = 8;
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

/** The tiles rise into place as the island's view opens: each this many seconds after the one before, over this
 *  many, from this many pixels below. */
const RISE = { after: 0.04, seconds: 0.35, from: 14 } as const;
/** How far a lit tile steps up. */
const LIT_STEP = 2;
/** The scene each kind of place is painted as. */
const SCENES: Readonly<Record<IslandEntry['kind'], Scene['kind']>> = {
  social: 'port',
  playlist: 'playlist',
  patrol: 'patrol',
  dungeon: 'dungeon',
  depths: 'depths',
  mission: 'dungeon',
  boss: 'dungeon',
  outpost: 'dungeon',
};

/** How far tile `place` has risen into place `opened` seconds after the view opened, 0 to 1, eased to a stop. */
export function risenTile(place: number, opened: number, still: boolean): number {
  if (still) return 1;
  const share = Math.min(1, Math.max(0, (opened - place * RISE.after) / RISE.seconds));
  return 1 - (1 - share) ** 3;
}

/** A tile's motion and light: how far it has risen, whether it is lit, whether the keys or the pad have focused
 *  any tile, and which side of it its card opens on. */
interface TileState {
  readonly rise: number;
  readonly lit: boolean;
  readonly keyed?: boolean;
  readonly cardSide?: 'left' | 'right';
}

/** What a tile stands with as it rises and is lit: faded and lowered as it rises, the pointer passing through it
 *  until it stands, so nothing unseen is lit or pressed; a step up lit. Its edge is its frame (`islandFrame.ts`). */
const standing = ({ rise, lit }: TileState): Partial<Node> => ({
  ...(rise < 1 && { opacity: rise, through: true }),
  ...((rise < 1 || lit) && { offset: [0, Math.round((1 - rise) * RISE.from) - (lit ? LIT_STEP : 0)] as const }),
});

/** A tile's carved frame over its scene, in its tier's tone, lit or at rest. */
const frameOver = (size: TileSize, lit: boolean, tier: number | null): Node => ({
  ...size,
  through: true,
  float: { to: 'parent', at: [0, 0], anchor: [0, 0], z: 2 },
  picture: { key: frameKey(size, lit, tier), source: { draw: drawFrame(lit, tier) } },
});

/** A tile's scene in pixels, `TEXEL` of the screen's to each, painted once at its size. */
function sceneOf(scene: Scene, size: TileSize, look: string): Node['picture'] {
  const [width, height] = [Math.max(1, Math.round(size.width / TEXEL)), Math.max(1, Math.round(size.height / TEXEL))];
  return {
    key: `island scene ${scene.kind} ${scene.id} ${width}x${height} ${look}`,
    source: { pixels: () => rgbaOf(sceneSheet(scene, width, height)) },
    pixel: { width, height },
    tint: SEEN,
  };
}

/** A tile's box: its scene over the whole of it, its words kept in from its edges by `WITHIN`, so the scene is drawn
 *  at the size it was painted. */
const tileOf = (scene: Scene, size: TileSize, look: string): Partial<Node> => ({
  ...size,
  direction: 'column',
  clip: true,
  picture: sceneOf(scene, size, look),
});
const WITHIN: Node = { width: 'grow', height: 'grow', direction: 'column', padding: [10, 12] };

/** The Playlist's crests set over its night where its constellation's lines meet, grey where shut. */
const crestsOver = (banner: PlaylistBanner, size: TileSize): Node[] => {
  const side = Math.round(Math.min(size.width * 0.17, size.height * 0.3));
  return banner.crests.map((crest, place): Node => {
    const [x, y] = CREST_SPOTS[place] ?? [0.5, 0.5];
    return {
      width: side,
      height: side,
      through: true,
      float: { to: 'parent', at: [x, y], anchor: [0.5, 0.5], clipped: true },
      picture: {
        key: `island crest ${crest.kind} ${crest.shut} ${side}`,
        source: { draw: drawCrest(crest.kind, crest.shut, false) },
      },
    };
  });
};

/** Its glyphs in a row at the tile's head, a padlock first while it is shut. Nine fit a tile at its narrowest; more
 *  wrap onto a second row under the first, never past the tile's edge. What each means the lit tile's card says. */
function glyphsNode(entry: IslandEntry): Node {
  return {
    width: 'grow',
    gap: 4,
    alignX: 'end',
    wrap: true,
    children: [
      entry.shut !== null && iconNode('locked', 24),
      ...entry.glyphs.map((each) => ({ ...iconNode(each.icon, 24, each.tones), ...(each.dim && { opacity: 0.4 }) })),
    ],
  };
}

/** An entry's name, and beside it a dungeon's tier as skulls where it has one. */
function nameRow(entry: IslandEntry): Node {
  const name = said(entry.name, { size: 2, colour: entry.shut === null ? BRASS : DIM });
  if (entry.tier === undefined) return name;
  return { width: 'grow', gap: 8, alignY: 'center', wrap: true, children: [name, skullsNode(entry.tier, 12)] };
}

/** The tile's card, beside the lit tile: its name, its kind and levels, each glyph with what it means, why it is shut
 *  if it is, and what a click does. Kept on the screen and never clipped by the list. */
const CARD_WIDE = 264;
function detailsCard(entry: IslandEntry, side: 'left' | 'right'): Node {
  const tag = tagOf(entry.name, entry.levels, kindOf(entry));
  const row = (icon: Node, says: string, dim = false): Node => ({
    width: 'grow',
    gap: 8,
    alignY: 'center',
    children: [
      { ...icon, ...(dim && { opacity: 0.45 }) },
      { width: 'grow', ...said(says, { colour: TONES.word }) },
    ],
  });
  return {
    id: `island:card:${entry.id}`,
    width: CARD_WIDE,
    direction: 'column',
    gap: 6,
    padding: [10, 12],
    fill: 'rgba(8,10,14,0.94)',
    outline: { width: 1, colour: 'rgba(192,138,62,0.55)' },
    through: true,
    float: {
      to: 'parent',
      ...(side === 'right' ? { anchor: [0, 0], at: [1, 0], x: 10 } : { anchor: [1, 0], at: [0, 0], x: -10 }),
      z: 30,
      clipped: false,
      kept: true,
    },
    children: [
      nameRow(entry),
      tag !== '' && said(tag, { colour: DIM }),
      { width: 'grow', height: 1, fill: 'rgba(192,138,62,0.35)' },
      entry.shut !== null && row(iconNode('locked', 18), entry.shut),
      ...entry.glyphs.map((each) => row(iconNode(each.icon, 18, each.tones), each.says, each.dim === true)),
      { width: 'grow', height: 1, fill: 'rgba(192,138,62,0.35)' },
      said(entry.shut === null ? `Click or Enter: ${entry.act.words}` : 'Shut', { colour: DIM }),
    ],
  };
}

/** One entry's tile: its scene, its glyphs, and at its foot its name over its levels; a click does what it does, and
 *  the pointer or the focus on it lights it for Enter. */
function entryTile(
  ui: Interface,
  [entry, size]: readonly [IslandEntry, TileSize],
  state: TileState,
  acts: IslandActs,
): Node {
  const id = `island:${entry.id}`;
  // A click lets go of the focus, so Enter is the game's and never presses this tile again; so does a press dragged
  // off it, so only the keys and the pad leave a tile focused.
  if (ui.clicked(id) || (ui.focused(id) && !ui.keyFocused)) ui.focusOn(null);
  if (ui.clicked(id) && entry.shut === null) acts.act(entry);
  // The tile the keys or the pad focused is lit, as it is what Enter and A press; else the one under the pointer.
  const lights = state.keyed ? ui.focused(id) : ui.hovered(id);
  if (lights && !state.lit) acts.choose(entry.id);
  const banner = 'crests' in entry ? (entry as PlaylistBanner) : null;
  const style = entry.kind === 'depths' ? (entry as DepthsEntry).dungeon.style : undefined;
  const scene: Scene = {
    ...{ kind: SCENES[entry.kind], id: entry.id, abyss: entry.abyss ?? false },
    ...(style && { style, tier: entry.tier ?? 0 }),
  };
  const look = `${entry.abyss === true} ${entry.tier ?? '-'}`;
  const tag = tagOf(entry.name, entry.levels, kindOf(entry));
  const details = [
    ...entry.glyphs.map((glyph) => glyph.says),
    ...entry.rows.map(([label, value]) => `${label}: ${value}`),
  ];
  return {
    id,
    press: true,
    // A shut entry's line is why it is shut already, so the reason is read once.
    label: [...new Set([entry.name, entry.line, ...details, entry.shut ?? entry.act.words])].join('. '),
    ...tileOf(scene, size, look),
    ...standing(state),
    children: [
      ...(banner ? crestsOver(banner, size) : []),
      frameOver(size, state.lit, entry.tier ?? null),
      // Its card only where the pointer, the keys or the pad are on it, not for the first tile lit by default.
      state.lit &&
        state.rise >= 1 &&
        (ui.hovered(id) || ui.focused(id)) &&
        detailsCard(entry, state.cardSide ?? 'right'),
      {
        ...WITHIN,
        children: [
          glyphsNode(entry),
          { height: 'grow' },
          {
            width: 'grow',
            gap: 8,
            alignY: 'end',
            children: [
              {
                width: 'grow',
                direction: 'column',
                gap: 3,
                children: [nameRow(entry), tag !== '' && said(tag, { colour: DIM })],
              },
              entry.shut === null && { ...iconNode('next', 24), opacity: state.lit ? 1 : 0.45 },
            ],
          },
        ],
      },
    ],
  };
}

/** The island's own tile, first in the grid: its chart painted, its name, where the ship lies, and the way back. */
function islandTile(
  ui: Interface,
  [panel, size]: readonly [IslandPanel, TileSize],
  chart: IslandChart | null,
  state: TileState,
  back: () => void,
): Node {
  const scene: Scene = { kind: 'island', id: chart?.id ?? panel.title, ...(chart && { chart }) };
  const look = chart
    ? `${chart.harbour !== null} ${Math.round(chart.ship[0] / 500)} ${Math.round(chart.ship[1] / 500)}`
    : '';
  return {
    id: 'island:island',
    ...tileOf(scene, size, look),
    ...standing({ ...state, lit: false }),
    children: [
      frameOver(size, false, null),
      {
        ...WITHIN,
        gap: 4,
        children: [
          { height: 'grow' },
          said(panel.title, { size: 2, colour: BRASS }),
          said(tagOf(panel.title, panel.levels, 'Island'), { colour: DIM }),
          {
            width: 'grow',
            gap: 8,
            alignY: 'center',
            children: [
              { width: 'grow', children: [said(panel.where, { colour: DIM })] },
              hudPress(ui, 'island:back', `Back  ${noKey()}`, back, { padding: [5, 10] }),
            ],
          },
        ],
      },
    ],
  };
}

/** How the grid is laid on a view `width` by `height`: its columns, and each tile's size. */
export function gridOf(width: number, height: number): { readonly columns: number; readonly tile: TileSize } {
  const room = { width: width - 2 * GRID.side - BAR_ROOM, height: height - GRID.top - GRID.foot };
  const columns = Math.max(1, Math.min(GRID.columns, Math.floor((room.width + GRID.gap) / (GRID.least + GRID.gap))));
  const stepped = (pixels: number) => Math.max(GRID.step, Math.floor(pixels / GRID.step) * GRID.step);
  const across = (room.width - (columns - 1) * GRID.gap) / columns;
  const down = (room.height - (GRID.rows - 1) * GRID.gap) / GRID.rows;
  return {
    columns,
    tile: {
      width: stepped(Math.min(GRID.most, across)),
      height: stepped(Math.min(TILE_TALL.tall, Math.max(TILE_TALL.short, down))),
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
  const entries = entriesOf(panel);
  const shown = chosen ?? entries[0]?.id ?? null;
  const [opened, still] = [ui.age('island-panel'), motionReduced()];
  const keyed = ui.keyFocused && entries.some((entry) => ui.focused(`island:${entry.id}`));
  const tiles: Node[] = [
    islandTile(ui, [panel, tile], chart, { rise: risenTile(0, opened, still), lit: false }, acts.back),
    ...entries.map((entry, place) => {
      // Its card opens toward the middle of the grid, so it stays clear of the view's edge.
      const cardSide = (place + 1) % columns < columns / 2 ? 'right' : 'left';
      const state = { rise: risenTile(place + 1, opened, still), lit: shown === entry.id, keyed, cardSide } as const;
      return entryTile(ui, [entry, tile], state, acts);
    }),
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
      // Room above the first row for a lit tile's step up, so the list never cuts its edge; no fade at its foot, which
      // would paint a card's ground over the island between the tiles.
      scrolledNode(
        ui,
        'island-list',
        { width: 'grow', height: 'grow' },
        { direction: 'column', gap: GRID.gap, padding: [LIT_STEP, 0, 0, 0] },
        rows,
        false,
      ),
    ],
  };
}

/** What the island's panel reads off the game, and what its entries do. */
export interface IslandGame {
  readonly landmass: () => Pick<Landmass, 'id' | 'plan' | 'nodes' | 'outline' | 'regions'>;
  readonly sea: () => Pick<Sea, 'position' | 'view'> | null;
  readonly chosen: () => string | null;
  readonly facts: () => Omit<IslandFacts, 'named'> | null;
  readonly named: (id: string) => string;
  /** A dungeon's name by its seed and its style's key, as the rooms name it. */
  readonly dungeonName?: (seed: number, style: string) => string;
  readonly choose: (id: string) => void;
  readonly back: () => void;
  readonly does: {
    readonly land: (id: string) => void;
    readonly dungeon: (node: NodeInfo) => void;
    readonly depths: (entry: DepthsEntry) => void;
    readonly playlist: (city: string) => void;
  };
}

/** The island's tiles as the game shows them while a landing is chosen, and what Enter does: the lit tile's press,
 *  the first place's while none is lit. */
export function islandScreen(game: IslandGame): {
  readonly node: (ui: Interface) => Node | null;
  readonly act: (id: string | null) => void;
  readonly back: () => boolean;
} {
  const panelNow = (): IslandPanel | null => {
    const sea = game.sea();
    if (!sea) return null;
    const facts = game.facts();
    const read = {
      ...{ activities: facts?.activities ?? null, gates: facts?.gates ?? null, named: game.named },
      ...(game.dungeonName && { dungeonName: game.dungeonName }),
    };
    return islandPanelOf(game.landmass(), sea.view.docked, read, sea.position);
  };
  // The flow lands only at the node chosen, so a landing chooses its node first.
  const landAt = (id: string) => (game.choose(id), game.does.land(id));
  const act = (entry: IslandEntry) => {
    if (entry.shut !== null) return;
    const landmass = game.landmass();
    if (entry.act.does === 'land') return landAt(entry.id);
    if (entry.act.does === 'depths') return game.does.depths(entry as DepthsEntry);
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
      return islandPanelNode(ui, panel, game.chosen(), chart, { choose: game.choose, act, back: game.back });
    },
    act: (id) => {
      const panel = panelNow();
      const entries = panel ? entriesOf(panel) : [];
      const entry = entries.find((each) => each.id === id) ?? (id === null ? entries[0] : undefined);
      if (entry) act(entry);
    },
    // Escape and the pad's B go back to the sea, as the island's own tile's Back does: nothing over the tiles to close.
    back: () => false,
  };
}
