// The island's tiles, over an island docked at or gone ashore on, in place of marks on the map: rectangles of one size
// in a grid with space between them, each a painted scene of its place (`islandArt.ts`) with its name and levels at its
// foot and its details as glyphs at its head, the island seen between them. The island's own with its chart and the
// way back to the sea, its port, the Playlist, and its places by kind; they rise into place as the view opens, and a
// click, or Enter on the one lit, does what a tile does.
import type { Point2 } from '../overworld/ground.ts';
import { motionReduced } from '../plus/kit.ts';
import { TONES } from '../plus/tones.ts';
import type { Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { noKey } from './controls.ts';
import { DIM } from './hudPieces.ts';
import { hudPress, said } from './hudParts.ts';
import {
  type IslandEntry,
  type IslandFacts,
  type IslandPanel,
  type OutpostSlot,
  type OutpostsEntry,
  type PlaylistBanner,
  entriesOf,
  islandPanelOf,
  KIND_WORDS,
  tagOf,
} from './islandWords.ts';
import { iconNode } from './journalIcons.ts';
import { CREST_SPOTS, type Scene, sceneSheet, TEXEL } from './islandArt.ts';
import { rgbaOf } from '../art/sheet.ts';
import { drawCrest } from './playlistCrest.ts';
import { scrolledNode } from './playlistParts.ts';
import type { Landmass } from './landmass.ts';
import type { Sea } from './sea.ts';
import type { NodeInfo } from './worldData.ts';

const BRASS = '#f3cf86';
/** A tile's scene drawn 90% opaque, so the island shows through it a little; and its edge at rest. */
const SEEN = 'rgba(255,255,255,0.9)';
const EDGE = 'rgba(192,138,62,0.45)';
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
  mission: 'mission',
  boss: 'boss',
  outpost: 'outpost',
  outposts: 'outpost',
};

/** How far tile `place` has risen into place `opened` seconds after the view opened, 0 to 1, eased to a stop. */
export function risenTile(place: number, opened: number, still: boolean): number {
  if (still) return 1;
  const share = Math.min(1, Math.max(0, (opened - place * RISE.after) / RISE.seconds));
  return 1 - (1 - share) ** 3;
}

/** A tile's motion and light: how far it has risen, whether it is lit, and whether the keys or the pad have focused
 *  any tile. */
interface TileState {
  readonly rise: number;
  readonly lit: boolean;
  readonly keyed?: boolean;
}

/** What a tile stands with as it rises and is lit: faded and lowered as it rises, the pointer passing through it
 *  until it stands, so nothing unseen is lit or pressed; a step up and a brass edge lit. */
const standing = ({ rise, lit }: TileState): Partial<Node> => ({
  outline: { width: lit ? 2 : 1, colour: lit ? TONES.brass : EDGE },
  ...(rise < 1 && { opacity: rise, through: true }),
  ...((rise < 1 || lit) && { offset: [0, Math.round((1 - rise) * RISE.from) - (lit ? LIT_STEP : 0)] as const }),
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
 *  wrap onto a second row under the first, never past the tile's edge. The pointer on one says what it means, as a
 *  player asked, in a card over it. */
function glyphsNode(ui: Interface, id: string, entry: IslandEntry): Node {
  // The tile takes the pointer, so a glyph is under it where the tile is and the pointer is in the glyph's box.
  const under = (glyphId: string) => {
    const [box, spot] = [ui.boxOf(glyphId), ui.pointerAt];
    return (
      ui.hovered(id) &&
      !!box &&
      !!spot &&
      spot.x >= box.x &&
      spot.y >= box.y &&
      spot.x < box.x + box.width &&
      spot.y < box.y + box.height
    );
  };
  const glyph = (key: string, icon: Node, says: string): Node => {
    const glyphId = `${id}:glyph:${key}`;
    return { ...icon, id: glyphId, children: under(glyphId) ? [glyphCard(says)] : [] };
  };
  return {
    width: 'grow',
    gap: 4,
    alignX: 'end',
    wrap: true,
    children: [
      entry.shut !== null && glyph('locked', iconNode('locked', 24), `Shut: ${entry.shut}`),
      ...entry.glyphs.map((each, place) =>
        glyph(String(place), { ...iconNode(each.icon, 24, each.tones), ...(each.dim && { opacity: 0.4 }) }, each.says),
      ),
    ],
  };
}

/** What a glyph means, in a small dark card over it, kept on the screen and never clipped by its tile. */
const glyphCard = (says: string): Node => ({
  padding: [5, 8],
  fill: 'rgba(8,9,12,0.88)',
  float: { to: 'parent', anchor: [0.5, 1], at: [0.5, 0], y: -6, z: 30, clipped: false, kept: true },
  children: [said(says, { colour: TONES.word })],
});

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
  const scene: Scene = { kind: SCENES[entry.kind], id: entry.id, abyss: entry.abyss ?? false };
  const look = `${entry.abyss === true}`;
  const tag = tagOf(entry.name, entry.levels, KIND_WORDS[entry.kind]);
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
      {
        ...WITHIN,
        children: [
          glyphsNode(ui, id, entry),
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
                children: [
                  said(entry.name, { size: 2, colour: entry.shut === null ? BRASS : DIM }),
                  tag !== '' && said(tag, { colour: DIM }),
                ],
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
      const state = { rise: risenTile(place + 1, opened, still), lit: shown === entry.id, keyed };
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

/** A slot's card: its name, its chart and whether it is the guild's, as wide as this; its chart as tall as this. */
const CARD = { width: 260, chart: 140, padding: 10 } as const;
const PANEL_GROUND = 'rgba(10,14,22,0.94)';
const CARD_GROUND = 'rgba(22,28,40,0.92)';
/** The chart's sea and land, the coast's ink, and the slots' marks. */
const CHART = { sea: '#0c1724', land: '#2a3527', coast: '#8a6a3a', slot: '#7d8794', lit: BRASS, ours: '#9fd08a' };

/** Draws a small chart of the region on a card: the coast round its slots, every slot of the region a dot,
 *  the card's own brass in a ring, and one holding the player's guild's outpost green. */
function drawSlotChart(
  outline: readonly Point2[],
  entry: OutpostsEntry,
  lit: OutpostSlot,
): (context: OffscreenCanvasRenderingContext2D, width: number, height: number) => void {
  return (context, width, height) => {
    // Framed on the region's slots with a wide margin, so they stand apart on their stretch of coast (an island is
    // hundreds of kilometres across, its slots a few apart); never closer than 20 km across, so a lone slot sits in
    // its coast.
    const extent = (values: readonly number[]) => Math.max(...values) - Math.min(...values);
    const middleOf = (values: readonly number[]) => (Math.max(...values) + Math.min(...values)) / 2;
    const [eastings, southings] = [entry.slots.map((slot) => slot.at[0]), entry.slots.map((slot) => slot.at[1])];
    const middle = [middleOf(eastings), middleOf(southings)] as const;
    const span = Math.max(20_000, extent(eastings) * 4, (extent(southings) * 4 * width) / height);
    const scale = width / span;
    const onChart = ([x, y]: Point2): [number, number] => [
      width / 2 + (x - middle[0]) * scale,
      height / 2 + (y - middle[1]) * scale,
    ];
    context.fillStyle = CHART.sea;
    context.fillRect(0, 0, width, height);
    if (outline.length > 2) {
      context.beginPath();
      outline.forEach((point, place) => context[place ? 'lineTo' : 'moveTo'](...onChart(point)));
      context.closePath();
      context.fillStyle = CHART.land;
      context.fill();
      context.strokeStyle = CHART.coast;
      context.lineWidth = 1.5;
      context.stroke();
    }
    for (const slot of entry.slots) {
      const [x, y] = onChart(slot.at);
      context.beginPath();
      context.arc(x, y, slot === lit ? 5 : 3.5, 0, Math.PI * 2);
      context.fillStyle = slot.ours ? CHART.ours : slot === lit ? CHART.lit : CHART.slot;
      context.fill();
      if (slot !== lit) continue;
      context.beginPath();
      context.arc(x, y, 10, 0, Math.PI * 2);
      context.strokeStyle = CHART.lit;
      context.lineWidth = 2;
      context.stroke();
    }
  };
}

/** What the slots' panel does: light a slot for Enter, land at one, and close it back to the tiles. */
export interface SlotActs {
  readonly choose: (id: string) => void;
  readonly land: (slot: OutpostSlot) => void;
  readonly close: () => void;
}

/** One slot's card: its name, its place on the region's chart and whether the player's guild holds an outpost there;
 *  a click lands there, and the pointer or the focus on it lights it for Enter. */
function slotCard(
  ui: Interface,
  [entry, slot]: readonly [OutpostsEntry, OutpostSlot],
  [lit, keyed]: readonly [boolean, boolean],
  chart: IslandChart | null,
  acts: SlotActs,
): Node {
  const id = `outposts:${slot.id}`;
  if (ui.clicked(id) || (ui.focused(id) && !ui.keyFocused)) ui.focusOn(null);
  if (ui.clicked(id) && slot.shut === null) acts.land(slot);
  if ((keyed ? ui.focused(id) : ui.hovered(id)) && !lit) acts.choose(slot.id);
  const held = slot.ours ? "Your guild's outpost" : "No outpost of your guild's";
  const [width, height] = [CARD.width - 2 * CARD.padding, CARD.chart];
  return {
    id,
    press: true,
    label: [slot.name, held, slot.shut ?? 'Land here'].join('. '),
    width: CARD.width,
    direction: 'column',
    gap: 8,
    padding: CARD.padding,
    fill: CARD_GROUND,
    outline: { width: lit ? 2 : 1, colour: lit ? TONES.brass : EDGE },
    ...(lit && { offset: [0, -LIT_STEP] as const }),
    children: [
      said(slot.name, { size: 2, colour: slot.shut === null ? BRASS : DIM }),
      {
        width,
        height,
        picture: {
          key: `outpost chart ${entry.id} ${slot.id} ${slot.ours} ${chart?.id ?? ''} ${width}x${height}`,
          source: { draw: drawSlotChart(chart?.outline ?? [], entry, slot) },
        },
      },
      {
        gap: 6,
        alignY: 'center',
        children: [iconNode(slot.ours ? 'outpost' : 'slots', 24), said(held, { colour: DIM })],
      },
      slot.shut !== null && said(slot.shut, { colour: DIM }),
    ],
  };
}

/** The region's outpost slots over the view, in the tiles' place, as the Playlist's screen opens from its tile: its
 *  name and levels, a card for each slot, `chosen` the one Enter lands at (the first open one while none is), and
 *  the way back to the tiles. */
export function outpostsNode(
  ui: Interface,
  entry: OutpostsEntry,
  chosen: string | null,
  chart: IslandChart | null,
  acts: SlotActs,
): Node {
  const lit = litSlot(entry, chosen)?.id ?? null;
  const keyed = ui.keyFocused && entry.slots.some((slot) => ui.focused(`outposts:${slot.id}`));
  return {
    id: 'outposts-panel',
    solid: true,
    modal: true,
    label: `${entry.name}. ${entry.line}`,
    float: { to: 'screen', at: [0.5, 0], anchor: [0.5, 0], y: GRID.top },
    maxWidth: ui.size.width - 2 * GRID.side,
    direction: 'column',
    gap: 14,
    padding: 20,
    fill: PANEL_GROUND,
    outline: { width: 1, colour: EDGE },
    children: [
      said(entry.name, { size: 2, colour: BRASS }),
      said(`${tagOf(entry.name, entry.levels, KIND_WORDS.outposts)} · Choose a slot to land at`, { colour: DIM }),
      {
        gap: GRID.gap,
        wrap: true,
        padding: [LIT_STEP, 0, 0, 0],
        children: entry.slots.map((slot) => slotCard(ui, [entry, slot], [slot.id === lit, keyed], chart, acts)),
      },
      { width: 'grow', alignX: 'end', children: [hudPress(ui, 'outposts-back', `Back  ${noKey()}`, acts.close)] },
    ],
  };
}

/** The slot Enter lands at: the one chosen, else the first open one. */
const litSlot = (entry: OutpostsEntry, chosen: string | null): OutpostSlot | undefined =>
  entry.slots.find((slot) => slot.id === chosen) ?? entry.slots.find((slot) => slot.shut === null);

/** What the island's panel reads off the game, and what its entries do. */
export interface IslandGame {
  readonly landmass: () => Pick<Landmass, 'id' | 'plan' | 'nodes' | 'outline' | 'regions'>;
  readonly sea: () => Pick<Sea, 'position' | 'view'> | null;
  readonly chosen: () => string | null;
  readonly facts: () => Omit<IslandFacts, 'named'> | null;
  readonly named: (id: string) => string;
  /** The sites the player's guild holds outposts at. */
  readonly ours: () => readonly string[];
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
  readonly back: () => boolean;
} {
  /** The Outposts tile whose slots stand open, by its id; none while the tiles show. */
  let picking: string | null = null;
  const panelNow = (): IslandPanel | null => {
    const sea = game.sea();
    if (!sea) return null;
    const facts = game.facts();
    const read = {
      ...{ activities: facts?.activities ?? null, gates: facts?.gates ?? null },
      ...{ named: game.named, ours: game.ours() },
    };
    return islandPanelOf(game.landmass(), sea.view.docked, read, sea.position);
  };
  // The open slots' tile as the panel is now: none once the ship lies off another region.
  const pickedOf = (panel: IslandPanel | null): OutpostsEntry | undefined =>
    picking === null
      ? undefined
      : (panel?.groups.flatMap((group) => group.entries).find((entry) => entry.id === picking) as
          OutpostsEntry | undefined);
  // The flow lands only at the node chosen, so a landing chooses its node first.
  const landAt = (id: string) => ((picking = null), game.choose(id), game.does.land(id));
  // Closing the slots lights their tile again, so Enter on the tiles never holds a slot's id no tile has.
  const close = () => {
    if (picking !== null) game.choose(picking);
    picking = null;
  };
  const land = (slot: OutpostSlot) => void (slot.shut === null && landAt(slot.id));
  const act = (entry: IslandEntry) => {
    if (entry.shut !== null) return;
    const landmass = game.landmass();
    if (entry.act.does === 'land') return landAt(entry.id);
    if (entry.act.does === 'outposts') return void (picking = entry.id);
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
      const picked = pickedOf(panel);
      if (picked) {
        return outpostsNode(ui, picked, game.chosen(), chart, { choose: game.choose, land, close });
      }
      return islandPanelNode(ui, panel, game.chosen(), chart, {
        choose: game.choose,
        act,
        back: game.back,
      });
    },
    act: (id) => {
      const panel = panelNow();
      const picked = pickedOf(panel);
      if (picked) {
        const slot = litSlot(picked, id);
        return void (slot && land(slot));
      }
      const entries = panel ? entriesOf(panel) : [];
      const entry = entries.find((each) => each.id === id) ?? (id === null ? entries[0] : undefined);
      if (entry) act(entry);
    },
    // Escape and the pad's B close the slots first, back to the tiles.
    back: () => {
      const open = pickedOf(panelNow()) !== undefined;
      close();
      return open;
    },
  };
}
