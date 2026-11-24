// An outpost's plot from above, as the Outposts page draws it: its cells, each structure in its own colour with its
// name or mark and its tier, a bar on its front, a scaffold's hatched while it is built and banded while it rises, and
// the decoration as small marks. Pressing a structure chooses it; a founder or admin standing there chooses a kind to
// build instead, turned a quarter at a time, and the cells it would take light green where the law and the treasury
// let it stand and red where not, the law's words beneath. The grid is one stop for Tab, its arrows moving a cursor.

import type { KeptPlot } from '../../network/accounts.ts';
import type { Child, Node } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import { INK, label, pressNode, words } from '../gearNodes.ts';
import { counted } from './guildHome.ts';
import {
  CELL_M,
  KINDS,
  PLOT_CELLS,
  type Kind,
  amountOf,
  kindOf,
  placeRefusal,
  rectOf,
  tierName,
} from './outpostLaw.ts';

export const cellId = (x: number, y: number) => `outpost-cell-${x}-${y}`;
export const kindId = (kind: string) => `outpost-kind-${kind}`;
export const TURN_ID = 'outpost-turn';
/** The grid itself, the one stop the keys and the pad take on the plan. */
export const PLAN_ID = 'outpost-plan';
export const FACINGS = ['south', 'west', 'north', 'east'] as const;

/** Each kind's colour on the plan, its mark, and its short name for a block too narrow for its whole one. Every colour
 *  keeps 4.5:1 against the dark ink on it and against the blueprint's ground beneath it. */
export const LOOKS: Readonly<Record<string, readonly [string, string, string]>> = {
  hall: ['#b9843c', 'H', 'Hall'],
  standard: ['#8a6fc4', 'S', 'S'],
  counting: ['#d2ad48', 'C', 'Counting'],
  'war-table': ['#bc685c', 'W', 'War'],
  camp: ['#6f9a52', 'I', 'Island'],
  dock: ['#5483ab', 'D', 'Dock'],
  gate: ['#847b90', 'G', 'Gate'],
  lodge: ['#4c9a90', 'L', 'Lodge'],
  horn: ['#c66d39', 'N', 'Horn'],
  assay: ['#a89366', 'A', 'Assay'],
};
export const DARK_INK = '#0a0c0e';
export const BLUEPRINT = '#11140f';
const GROUND = '#1b1f17';
const GROUND_LIT = '#20251b';
/** About how wide a letter of the plan's words is, so a block takes the longest name it holds. */
const CHAR_PX = 7.5;
const GHOST_FITS = '#4c9a5c';
const GHOST_REFUSED = '#9a4c4c';
const CELL_IDS = Array.from({ length: PLOT_CELLS * PLOT_CELLS }, (_unused, cell) =>
  cellId(cell % PLOT_CELLS, Math.floor(cell / PLOT_CELLS)),
);
const MOVES: Readonly<Record<string, readonly [number, number]>> = {
  arrowleft: [-1, 0],
  arrowright: [1, 0],
  arrowup: [0, -1],
  arrowdown: [0, 1],
};

/** What the plan holds across frames: the kind being placed and its turn, the structure chosen, and the cell the
 *  keys' cursor stands on, by its place in the grid. */
export interface PlanState {
  choosing: string | null;
  turn: number;
  chosen: number | null;
  cursor?: number;
}

/** The plan's answer this frame: a structure to build there, if a cell took one. */
export interface Placing {
  readonly kind: string;
  readonly x: number;
  readonly y: number;
  readonly turn: number;
}

type Standing = KeptPlot['structures'][number];

/** A read plot's cells worked out once: what stands on each, and its rows of cells at a cell's size. */
interface Grid {
  readonly cells: readonly (Standing | undefined)[];
  readonly rows: Map<number, Node[]>;
}
const GRIDS = new WeakMap<KeptPlot, Grid>();

function gridOf(plot: KeptPlot): Grid {
  let grid = GRIDS.get(plot);
  if (grid) return grid;
  const cells: (Standing | undefined)[] = Array.from({ length: PLOT_CELLS * PLOT_CELLS }, () => undefined);
  for (const standing of plot.structures) {
    const [west = 0, north = 0, east = 0, south = 0] = rectOf(standing);
    for (let y = Math.max(0, north); y < Math.min(PLOT_CELLS, south); y++)
      for (let x = Math.max(0, west); x < Math.min(PLOT_CELLS, east); x++) cells[y * PLOT_CELLS + x] = standing;
  }
  grid = { cells, rows: new Map() };
  GRIDS.set(plot, grid);
  return grid;
}

/** Why the treasury cannot pay `amount` for `what`, as the accounts say it; null when it can. */
export function lacksWords(treasury: number, amount: number, what: string): string | null {
  return treasury >= amount ? null : `The treasury lacks the ${counted(amount)} Aurem ${what} takes.`;
}

/** A cell in words, as a screen reader hears it: its place and what stands on it. */
function cellWords(grid: Grid, cell: number): string {
  const standing = grid.cells[cell];
  const place = `cell ${(cell % PLOT_CELLS) + 1}, ${Math.floor(cell / PLOT_CELLS) + 1}`;
  return standing ? `${standingWords(standing)}, ${place}` : `Empty ${place}`;
}

function rowsOf(grid: Grid, cellPx: number): Node[] {
  const kept = grid.rows.get(cellPx);
  if (kept) return kept;
  const rows: Node[] = [];
  for (let y = 0; y < PLOT_CELLS; y++) {
    const cells: Node[] = [];
    for (let x = 0; x < PLOT_CELLS; x++)
      cells.push({
        id: CELL_IDS[y * PLOT_CELLS + x] ?? '',
        width: cellPx,
        height: cellPx,
        fill: (x + y) % 2 === 0 ? GROUND : GROUND_LIT,
      });
    rows.push({ children: cells });
  }
  grid.rows.set(cellPx, rows);
  return rows;
}

/** The cell under the pointer, by its place in the grid, worked out from where the grid was laid; -1 for none. */
function pointedAt(ui: Interface, cellPx: number): number {
  const point = ui.pointerAt;
  const box = ui.boxOf(PLAN_ID);
  if (!point || !box || !ui.hovered(PLAN_ID)) return -1;
  const x = Math.floor((point.x - box.x) / cellPx);
  const y = Math.floor((point.y - box.y) / cellPx);
  return x >= 0 && y >= 0 && x < PLOT_CELLS && y < PLOT_CELLS ? y * PLOT_CELLS + x : -1;
}

/** The plan's grid, and what a press on it did this frame: chose a structure, or placed the kind being placed; the
 *  treasury's `treasury` Aurem weighed against the kind's first tier as the accounts weigh it. */
export function planNode(
  ui: Interface,
  plot: KeptPlot,
  state: PlanState,
  given: { readonly level: number; readonly treasury: number; readonly cellPx: number },
): { readonly node: Node; readonly placing: Placing | null; readonly refusal: string | null } {
  const { level, treasury, cellPx } = given;
  const grid = gridOf(plot);
  let cursor = state.cursor ?? (PLOT_CELLS / 2) * PLOT_CELLS + PLOT_CELLS / 2;
  for (const key of ui.keysOn(PLAN_ID)) {
    const [across, down] = MOVES[key] ?? [0, 0];
    const x = Math.max(0, Math.min(PLOT_CELLS - 1, (cursor % PLOT_CELLS) + across));
    const y = Math.max(0, Math.min(PLOT_CELLS - 1, Math.floor(cursor / PLOT_CELLS) + down));
    cursor = y * PLOT_CELLS + x;
    ui.speak(cellWords(grid, cursor));
  }
  const hovered = pointedAt(ui, cellPx);
  const focused = ui.focused(PLAN_ID);
  // The keys' cursor leads while the keys hold the focus; else the pointer's cell, or the cursor where it left.
  const spotted = focused && ui.keyFocused ? cursor : hovered >= 0 ? hovered : focused ? cursor : -1;
  if (ui.clicked(PLAN_ID) && spotted >= 0) cursor = spotted;
  state.cursor = cursor;
  const spot = spotted >= 0 ? { x: spotted % PLOT_CELLS, y: Math.floor(spotted / PLOT_CELLS), turn: state.turn } : null;
  const choosing = state.choosing;
  const kind = choosing ? kindOf(choosing) : undefined;
  const refusal =
    choosing && spot
      ? (placeRefusal(plot, choosing, spot, level) ??
        (kind ? lacksWords(treasury, kind.tiers[0]?.aurem ?? 0, `the ${kind.name}`) : null))
      : null;
  let placing: Placing | null = null;
  if (ui.clicked(PLAN_ID) && spot) {
    if (choosing && refusal === null) placing = { kind: choosing, ...spot };
    else if (!choosing) state.chosen = grid.cells[spotted]?.id ?? null;
  }
  const ghost = choosing && spot ? rectOf({ kind: choosing, ...spot }) : null;
  const ghostNode: Child = ghost && {
    width: ((ghost[2] ?? 0) - (ghost[0] ?? 0)) * cellPx,
    height: ((ghost[3] ?? 0) - (ghost[1] ?? 0)) * cellPx,
    float: { to: 'parent', x: (ghost[0] ?? 0) * cellPx, y: (ghost[1] ?? 0) * cellPx },
    through: true,
    fill: refusal === null ? GHOST_FITS : GHOST_REFUSED,
    opacity: 0.7,
    outline: { width: 2, colour: refusal === null ? '#9be0a8' : '#e8968a' },
    children: [frontNode(state.turn, cellPx, '#e8e0cc')],
  };
  // The keys' cursor, ringed where the keys hold the focus.
  const ring: Child = focused &&
    ui.keyFocused && {
      width: cellPx,
      height: cellPx,
      float: { to: 'parent', x: (cursor % PLOT_CELLS) * cellPx, y: Math.floor(cursor / PLOT_CELLS) * cellPx },
      through: true,
      outline: { width: 2, colour: INK.brassLit },
    };
  // Blocks, marks, the ghost and the ring float over the cells without a z of their own, so each is drawn just above
  // whatever holds the plan: the menu's window floats high, and a fixed low z would draw them under it.
  return {
    node: {
      id: PLAN_ID,
      press: true,
      keys: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'],
      label: `The plan, ${cellWords(grid, cursor)}${refusal ? `: ${refusal}` : ''}`,
      direction: 'column',
      outline: { width: 2, colour: INK.stoneHi },
      children: [
        ...rowsOf(grid, cellPx),
        ...plot.structures.map((standing) => blockNode(standing, cellPx, state.chosen === standing.id)),
        ...plot.decor.map((decor) => decorNode(decor, cellPx)),
        ghostNode,
        ring,
      ],
    },
    placing,
    refusal,
  };
}

/** A bar along a block's front, the side it faces as it is turned. */
function frontNode(turn: number, cellPx: number, colour: string): Node {
  const bar = Math.max(3, Math.round(cellPx / 6));
  const facing = FACINGS[turn % 4];
  const across = facing === 'south' || facing === 'north';
  return {
    width: across ? 'grow' : bar,
    height: across ? bar : 'grow',
    float: {
      to: 'parent',
      anchor: [facing === 'east' ? 1 : 0, facing === 'south' ? 1 : 0],
      at: [facing === 'east' ? 1 : 0, facing === 'south' ? 1 : 0],
    },
    through: true,
    fill: colour,
    opacity: 0.8,
  };
}

/** A piece of decoration as a small mark at its middle. */
function decorNode(decor: KeptPlot['decor'][number], cellPx: number): Node {
  const mark = Math.max(4, Math.round(cellPx / 3));
  return {
    width: mark,
    height: mark,
    float: {
      to: 'parent',
      x: Math.round((decor.x / CELL_M) * cellPx - mark / 2),
      y: Math.round((decor.y / CELL_M) * cellPx - mark / 2),
    },
    through: true,
    fill: '#d8cfb8',
    outline: { width: 1, colour: DARK_INK },
  };
}

/** What a block says: its name at its tier where it fits, a shorter name or its mark with the tier where not. */
export function blockWords(standing: Standing, room: number): string {
  const [, mark, short] = LOOKS[standing.kind] ?? ['', '?', '?'];
  const kind = kindOf(standing.kind);
  const fits = (said: string) => said.length * CHAR_PX <= room;
  if (!kind || standing.tier === 0) return [kind?.name ?? mark, short].find(fits) ?? mark;
  const tier = String(standing.tier);
  const named = kind.tierNames ? `${tierName(kind, standing.tier)} ${tier}` : `${kind.name} ${tier}`;
  return [named, `${short} ${tier}`].find(fits) ?? `${mark}${tier}`;
}

/** One structure as a block over its cells: its colour, its words, a bar on its front, hollow in its colour while it
 *  is built, banded while a tier rises over it, ringed when chosen. */
function blockNode(standing: Standing, cellPx: number, chosen: boolean): Node {
  const [west = 0, north = 0, east = 0, south = 0] = rectOf(standing);
  const [colour] = LOOKS[standing.kind] ?? ['#999999'];
  // A structure never built is its plan drawn in its colour, as a blueprint is, till it stands.
  const blueprint = standing.tier === 0;
  const rising = standing.tier > 0 && standing.building > 0;
  const ink = blueprint ? colour : DARK_INK;
  const tall = (south - north) * cellPx;
  return {
    width: (east - west) * cellPx - 2,
    height: tall - 2,
    float: { to: 'parent', x: west * cellPx + 1, y: north * cellPx + 1 },
    through: true,
    fill: blueprint ? BLUEPRINT : colour,
    bevel: blueprint ? 0 : 2,
    outline: { width: chosen ? 3 : blueprint ? 2 : 1, colour: chosen ? INK.brassLit : blueprint ? colour : '#07080a' },
    direction: 'column',
    alignX: 'center',
    alignY: 'center',
    gap: 2,
    children: [
      words(blockWords(standing, (east - west) * cellPx - 8), 1, ink),
      (blueprint || rising) && tall >= 40 && words(blueprint ? 'building' : 'rising', 1, ink),
      frontNode(standing.turn, cellPx, blueprint ? colour : DARK_INK),
      rising && {
        width: 'grow',
        height: Math.max(3, Math.round(cellPx / 5)),
        float: { to: 'parent', anchor: [0, 0], at: [0, 0] },
        through: true,
        fill: BLUEPRINT,
        opacity: 0.85,
      },
    ],
  };
}

/** The plan's key: each structure's colour and mark beside its name and tier, so a block too small for its words
 *  still says what it is. */
export function legendNode(plot: KeptPlot): Node {
  return {
    width: 'grow',
    gap: 10,
    wrap: true,
    children: plot.structures.map((standing) => {
      const [colour, mark] = LOOKS[standing.kind] ?? ['#999999', '?'];
      const tier = standing.tier > 0 ? String(standing.tier) : '';
      return {
        gap: 4,
        alignY: 'center',
        children: [
          { width: 10, height: 10, fill: colour },
          words(`${mark}${tier} ${standingWords(standing)}`, 1, INK.faint),
        ],
      };
    }),
  };
}

/** What a kind's next tier costs, in the plan's plain words, the island's own resource named `island`. */
export function costWords(kind: Kind, tier: number, island?: string): string {
  const cost = kind.tiers[tier - 1];
  if (!cost) return '';
  const materials = Object.entries(cost.materials).map(([stuff, amount]) => `${amount} ${stuffName(stuff, island)}`);
  return [`${counted(cost.aurem)} Aurem`, ...materials].join(', ');
}

/** A material's name on the page; the island's own is named by the island where it is known. */
export function stuffName(stuff: string, island = 'island goods'): string {
  return stuff === 'island' ? island : stuff.charAt(0).toUpperCase() + stuff.slice(1);
}

/** The kinds a founder or admin may build now, each a press that chooses it to place, its first tier's cost beside
 *  it (the island's own resource named `island`); those the guild's level has not opened are named after them, with
 *  the level that does. */
export function kindsNode(ui: Interface, plot: KeptPlot, state: PlanState, level: number, island: string): Node {
  const full = (kind: Kind) => plot.structures.filter((standing) => standing.kind === kind.id).length >= kind.most;
  const open = KINDS.filter((kind) => kind.id !== 'hall' && kind.level <= level && !full(kind));
  const later = KINDS.filter((kind) => kind.level > level);
  const presses: Child[] = open.map((kind) => {
    if (ui.clicked(kindId(kind.id))) {
      state.choosing = state.choosing === kind.id ? null : kind.id;
      state.chosen = null;
    }
    const [colour = GROUND] = LOOKS[kind.id] ?? [];
    const cost = costWords(kind, 1, island);
    return {
      id: kindId(kind.id),
      press: true,
      role: state.choosing === kind.id ? 'primary' : 'button',
      label: `${kind.name}, ${cost}`,
      width: 'grow',
      padding: [8, 12],
      gap: 10,
      alignY: 'center',
      children: [
        { width: 12, height: 12, fill: colour },
        {
          width: 'grow',
          direction: 'column',
          gap: 3,
          children: [words(kind.name, 1), words(cost, 1, INK.faint, { wrap: true })],
        },
      ],
    };
  });
  if (ui.clicked(TURN_ID)) state.turn = (state.turn + 1) % 4;
  return {
    width: 'grow',
    direction: 'column',
    gap: 6,
    children: [
      label('Build'),
      ...(presses.length > 0 ? presses : [words('Everything open to your guild stands here.', 1, INK.faint)]),
      state.choosing !== null && {
        gap: 10,
        alignY: 'center',
        wrap: true,
        children: [
          pressNode(TURN_ID, `Turn it: facing ${FACINGS[state.turn]}`),
          words('Press a cell for its north-west corner.', 1, INK.faint),
        ],
      },
      later.length > 0 &&
        words(`Opens later: ${later.map((kind) => `${kind.name} at level ${kind.level}`).join(', ')}.`, 1, INK.faint, {
          wrap: true,
        }),
    ],
  };
}

/** What an outpost's built structures give, each in plain words: its island's resource named `island`. */
export function givesWords(plot: KeptPlot, island: string): string[] {
  const gives: string[] = [];
  for (const standing of plot.structures) {
    const effect = kindOf(standing.kind)?.effect;
    const amount = amountOf(standing);
    if (!effect || standing.tier < 1) continue;
    if (effect.kind === 'income') gives.push(`${counted(amount)} Aurem an hour`);
    if (effect.kind === 'boon')
      gives.push(`${amount}% more ${{ xp: 'XP', aurem: 'Aurem', reputation: 'reputation' }[effect.boon]}`);
    if (effect.kind === 'stores')
      gives.push(
        effect.stuff === 'island' ? `${amount} ${island} a day` : `${amount} each of Timber, Canvas and Iron a day`,
      );
    if (effect.kind === 'dungeon')
      gives.push(`the guild dungeon at ${['Normal', 'Elite', 'Abyss'][standing.tier - 1] ?? 'Abyss'}`);
    if (effect.kind === 'boss') gives.push('the guild boss once a week');
  }
  return gives;
}

/** A structure's name at the tier it stands at, or the words of the one being built. */
export function standingWords(standing: Standing): string {
  const kind = kindOf(standing.kind);
  if (!kind) return standing.kind;
  if (standing.tier === 0) return `${kind.name}, being built`;
  const name = tierName(kind, standing.tier);
  return standing.building > 0 ? `${name}, rising to tier ${standing.building}` : name;
}
