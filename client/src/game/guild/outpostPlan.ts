// An outpost's plot from above, as the Outposts page draws it: its cells, each structure in its own colour with its
// mark in its first cell, a scaffold's hatched while it is built. Pressing a structure chooses it; a founder or admin
// standing there chooses a kind to build instead, turned a quarter at a time, and the cells it would take light green
// where the law lets it stand and red where not, the law's words beneath. The law is the accounts' own (`outpostLaw.ts`).

import type { KeptPlot } from '../../network/accounts.ts';
import type { Child, Node } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import { INK, label, pressNode, words } from '../gearNodes.ts';
import { counted } from './guildHome.ts';
import { KINDS, PLOT_CELLS, type Kind, amountOf, kindOf, placeRefusal, rectOf, tierName } from './outpostLaw.ts';

export const cellId = (x: number, y: number) => `outpost-cell-${x}-${y}`;
export const kindId = (kind: string) => `outpost-kind-${kind}`;
export const TURN_ID = 'outpost-turn';

/** Each kind's colour on the plan, its mark, and its short name for a block too narrow for its whole one. */

const LOOKS: Readonly<Record<string, readonly [string, string, string]>> = {
  hall: ['#b9843c', 'H', 'Hall'],
  standard: ['#8a6fc4', 'S', 'S'],
  counting: ['#d2ad48', 'C', 'Coin'],
  'war-table': ['#b4574a', 'W', 'War'],
  camp: ['#6f9a52', 'I', 'Camp'],
  dock: ['#4f7fa8', 'D', 'Dock'],
  gate: ['#6b6079', 'G', 'Gate'],
  lodge: ['#4c9a90', 'L', 'Lodge'],
  horn: ['#c66d39', 'N', 'Horn'],
  assay: ['#a89366', 'A', 'Assay'],
};
const GROUND = '#1b1f17';
const GROUND_LIT = '#20251b';
/** About how wide a letter of the plan's words is, so a block takes the longest name it holds. */
const CHAR_PX = 7.5;
const GHOST_FITS = '#4c9a5c';
const GHOST_REFUSED = '#9a4c4c';

/** What the plan holds across frames: the kind being placed and its turn, and the structure chosen. */
export interface PlanState {
  choosing: string | null;
  turn: number;
  chosen: number | null;
}

/** The plan's answer this frame: a structure to build there, if a cell took one. */
export interface Placing {
  readonly kind: string;
  readonly x: number;
  readonly y: number;
  readonly turn: number;
}

/** The structure standing on a cell, if any. */
function standingAt(plot: KeptPlot, x: number, y: number) {
  return plot.structures.find((standing) => {
    const [west = 0, north = 0, east = 0, south = 0] = rectOf(standing);
    return x >= west && x < east && y >= north && y < south;
  });
}

/** The plan's grid, and what a press on it did this frame: chose a structure, or placed the kind being placed. */
export function planNode(
  ui: Interface,
  plot: KeptPlot,
  state: PlanState,
  level: number,
  cellPx: number,
): { readonly node: Node; readonly placing: Placing | null; readonly refusal: string | null } {
  let hovered: readonly [number, number] | null = null;
  let pressed: readonly [number, number] | null = null;
  for (let y = 0; y < PLOT_CELLS; y++)
    for (let x = 0; x < PLOT_CELLS; x++) {
      if (ui.hovered(cellId(x, y))) hovered = [x, y];
      if (ui.clicked(cellId(x, y))) pressed = [x, y];
    }
  const choosing = state.choosing;
  const spot = pressed ?? hovered;
  const refusal =
    choosing && spot ? placeRefusal(plot, choosing, { x: spot[0], y: spot[1], turn: state.turn }, level) : null;
  const ghost = choosing && spot ? rectOf({ kind: choosing, x: spot[0], y: spot[1], turn: state.turn }) : null;
  let placing: Placing | null = null;
  if (pressed && choosing) {
    if (refusal === null) placing = { kind: choosing, x: pressed[0], y: pressed[1], turn: state.turn };
  } else if (pressed) state.chosen = standingAt(plot, pressed[0], pressed[1])?.id ?? null;
  const rows: Node[] = [];
  for (let y = 0; y < PLOT_CELLS; y++) {
    const cells: Node[] = [];
    for (let x = 0; x < PLOT_CELLS; x++) {
      const standing = standingAt(plot, x, y);
      cells.push({
        id: cellId(x, y),
        press: true,
        width: cellPx,
        height: cellPx,
        fill: (x + y) % 2 === 0 ? GROUND : GROUND_LIT,
        label: standing
          ? `${kindOf(standing.kind)?.name ?? standing.kind}, cell ${x + 1}, ${y + 1}`
          : `Cell ${x + 1}, ${y + 1}`,
      });
    }
    rows.push({ children: cells });
  }
  // Each structure one block over its cells, and the ghost of one being placed; presses pass through to the cells.
  const blocks = plot.structures.map((standing) =>
    blockNode(standing, rectOf(standing), cellPx, state.chosen === standing.id),
  );
  const ghostNode: Child = ghost && {
    width: ((ghost[2] ?? 0) - (ghost[0] ?? 0)) * cellPx,
    height: ((ghost[3] ?? 0) - (ghost[1] ?? 0)) * cellPx,
    float: { to: 'parent', x: (ghost[0] ?? 0) * cellPx, y: (ghost[1] ?? 0) * cellPx, z: 2 },
    through: true,
    fill: refusal === null ? GHOST_FITS : GHOST_REFUSED,
    opacity: 0.7,
    outline: { width: 2, colour: refusal === null ? '#9be0a8' : '#e8968a' },
  };
  return {
    node: {
      direction: 'column',
      outline: { width: 2, colour: INK.stoneHi },
      children: [...rows, ...blocks, ghostNode],
    },
    placing,
    refusal,
  };
}

/** One structure as a block over its cells: its colour, its name where it is wide enough and its mark where not,
 *  faint and hatched in words while it is built, ringed when chosen. */
function blockNode(
  standing: KeptPlot['structures'][number],
  rect: readonly number[],
  cellPx: number,
  chosen: boolean,
): Node {
  const [west = 0, north = 0, east = 0, south = 0] = rect;
  const [colour, mark, short] = LOOKS[standing.kind] ?? ['#777777', '?', '?'];
  const kind = kindOf(standing.kind);
  const across = east - west;
  const fits = (said: string) => said.length * CHAR_PX <= across * cellPx - 8;
  const named = kind && standing.tier > 0 ? tierName(kind, standing.tier) : (kind?.name ?? mark);
  const said = [named, kind?.name ?? mark, short].find(fits) ?? mark;
  const tier =
    standing.tier > 1 && !said.includes(' I') && !kind?.tierNames ? ['', 'I', 'II', 'III'][standing.tier] : '';
  // A structure being built is its plan drawn in its colour, as a blueprint is, till it stands.
  const building = standing.building > 0;
  const ink = building ? colour : '#0a0c0e';
  return {
    width: across * cellPx - 2,
    height: (south - north) * cellPx - 2,
    float: { to: 'parent', x: west * cellPx + 1, y: north * cellPx + 1, z: 1 },
    through: true,
    fill: building ? '#11140f' : colour,
    bevel: building ? 0 : 2,
    outline: { width: chosen ? 3 : building ? 2 : 1, colour: chosen ? INK.brassLit : building ? colour : '#07080a' },
    direction: 'column',
    alignX: 'center',
    alignY: 'center',
    gap: 2,
    children: [
      words(said, 1, ink),
      tier !== '' && words(tier ?? '', 1, ink),
      building && (south - north) * cellPx >= 40 && fits('building') && words('building', 1, ink),
    ],
  };
}

/** What a kind's next tier costs, in the plan's plain words. */
export function costWords(kind: Kind, tier: number): string {
  const cost = kind.tiers[tier - 1];
  if (!cost) return '';
  const materials = Object.entries(cost.materials).map(([stuff, amount]) => `${amount} ${stuffName(stuff)}`);
  return [`${counted(cost.aurem)} Aurem`, ...materials].join(', ');
}

/** A material's name on the page; the island's own is named by the island where it is known. */
export function stuffName(stuff: string, island = 'island goods'): string {
  return stuff === 'island' ? island : stuff.charAt(0).toUpperCase() + stuff.slice(1);
}

/** The kinds a founder or admin may build now, each a press that chooses it to place, its first tier's cost beside
 *  it; those the guild's level has not opened are named after them, with the level that does. */
export function kindsNode(ui: Interface, plot: KeptPlot, state: PlanState, level: number): Node {
  const full = (kind: Kind) => plot.structures.filter((standing) => standing.kind === kind.id).length >= kind.most;
  const open = KINDS.filter((kind) => kind.id !== 'hall' && kind.level <= level && !full(kind));
  const later = KINDS.filter((kind) => kind.level > level);
  const presses: Child[] = open.map((kind) => {
    if (ui.clicked(kindId(kind.id))) {
      state.choosing = state.choosing === kind.id ? null : kind.id;
      state.chosen = null;
    }
    const [colour = GROUND] = LOOKS[kind.id] ?? [];
    return {
      id: kindId(kind.id),
      press: true,
      role: state.choosing === kind.id ? 'primary' : 'button',
      label: kind.name,
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
          children: [words(kind.name, 1), words(costWords(kind, 1), 1, INK.faint, { wrap: true })],
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
        children: [
          pressNode(TURN_ID, `Turn it: facing ${['south', 'west', 'north', 'east'][state.turn]}`),
          words('Press a cell for its corner.', 1, INK.faint),
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
export function standingWords(standing: KeptPlot['structures'][number]): string {
  const kind = kindOf(standing.kind);
  if (!kind) return standing.kind;
  if (standing.tier === 0) return `${kind.name}, being built`;
  const name = tierName(kind, standing.tier);
  return standing.building > 0 ? `${name}, rising to tier ${standing.building}` : name;
}
