import numbers from '../../../../content/guilds/outposts.json' with { type: 'json' };

/**
 * A guild's outposts, as the accounts keep them and the page shows them (`content/guilds/outposts.json`). An outpost's
 * plot is a square of cells; each structure stands on its own cells, turned a quarter at a time, and rises tier by
 * tier as the guild's level and its hall allow; decoration stands anywhere on the plot off every structure. One law
 * judges every change on the page and in the accounts, so the two never disagree.
 */

/** A material a structure is built from: the ship's four, or the outpost's island's own resource. */
export type Stuff = 'timber' | 'canvas' | 'iron' | 'heartwood' | 'island';
export const STUFFS: readonly Stuff[] = ['timber', 'canvas', 'iron', 'heartwood', 'island'];

/** What a structure does, by its tier. */
export type Effect =
  | { readonly kind: 'hall' | 'banner' | 'dungeon' | 'boss' }
  | { readonly kind: 'income'; readonly amounts: readonly number[] }
  | { readonly kind: 'boon'; readonly boon: 'xp' | 'aurem' | 'reputation'; readonly amounts: readonly number[] }
  | { readonly kind: 'stores'; readonly stuff: 'island' | 'ship'; readonly amounts: readonly number[] };

/** A kind of structure: its name, its cells, the level that opens it, how many an outpost holds, and its tiers. */
export interface Kind {
  readonly id: string;
  readonly name: string;
  readonly tierNames?: readonly string[];
  readonly cells: readonly number[];
  readonly level: number;
  readonly most: number;
  readonly words: string;
  readonly effect: Effect;
  readonly tiers: readonly { readonly aurem: number; readonly materials: Readonly<Partial<Record<Stuff, number>>> }[];
}

/** A piece of decoration: its module, its name, and how far it reaches from its middle, metres. */
export interface Piece {
  readonly piece: string;
  readonly name: string;
  readonly reach: number;
}

/** A structure standing on a plot: its kind, the tier built, and the tier being built over it (0 for none), at its
 *  corner cell, turned so many quarters. */
export interface Standing {
  readonly id: number;
  readonly kind: string;
  readonly tier: number;
  readonly building: number;
  readonly x: number;
  readonly y: number;
  readonly turn: number;
}

/** A piece of decoration on a plot: at metres from the plot's corner, turned so many fifteenths of a half turn. */
export interface Decor {
  readonly id: number;
  readonly piece: string;
  readonly x: number;
  readonly y: number;
  readonly turn: number;
}

/** An outpost's plot as it stands. */
export interface Plot {
  readonly structures: readonly Standing[];
  readonly decor: readonly Decor[];
}

export const KINDS: readonly Kind[] = numbers.structures as readonly Kind[];
export const PIECES: readonly Piece[] = numbers.decor;
/** The plot's side in cells, and a cell's side in metres. */
export const PLOT_CELLS: number = numbers.plotCells;
export const CELL_M: number = numbers.cellM;
export const PLOT_M = PLOT_CELLS * CELL_M;
export const RAISE_AUREM: number = numbers.raiseAurem;
export const TREASURY_MOST: number = numbers.treasuryMost;
export const STORES_TAKE_A_DAY: number = numbers.storesTakeADay;
export const STORES_HOLD_DAYS: number = numbers.storesHoldDays;
export const STRONGBOX_HOURS: number = numbers.strongboxHours;
/** The steps a piece of decoration turns in, a full turn. */
export const DECOR_TURNS = 24;

/** A kind by its id. */
export function kindOf(id: string): Kind | undefined {
  return KINDS.find((kind) => kind.id === id);
}

/** A kind's name at a tier: the hall's by its own words, the rest by number. */
export function tierName(kind: Kind, tier: number): string {
  return (
    kind.tierNames?.[tier - 1] ??
    (kind.tiers.length > 1 ? `${kind.name} ${['I', 'II', 'III'][tier - 1] ?? ''}` : kind.name)
  );
}

/** How many outposts a guild of this level may hold. */
export function outpostsAllowed(level: number): number {
  return numbers.outpostsAtLevels.filter((opens) => opens <= level).length;
}

/** The highest tier a guild of this level may build. */
export function tierAllowed(level: number): number {
  return numbers.tierLevels.filter((opens) => opens <= level).length;
}

/** A structure's cells across and down, turned so many quarters. */
export function footprint(kind: Kind, turn: number): readonly [number, number] {
  const [across = 1, down = 1] = kind.cells;
  return turn % 2 === 0 ? [across, down] : [down, across];
}

/** The hall's tier on a plot: none before it is raised. */
export function hallTier(plot: Plot): number {
  return plot.structures.find((standing) => standing.kind === 'hall')?.tier ?? 0;
}

/** Whether two rects of cells overlap. */
const overlap = (one: readonly number[], two: readonly number[]) =>
  (one[0] ?? 0) < (two[2] ?? 0) &&
  (two[0] ?? 0) < (one[2] ?? 0) &&
  (one[1] ?? 0) < (two[3] ?? 0) &&
  (two[1] ?? 0) < (one[3] ?? 0);

/** A structure's rect of cells: west, north, east, south. */
export function rectOf(standing: Pick<Standing, 'kind' | 'x' | 'y' | 'turn'>): readonly number[] {
  const kind = kindOf(standing.kind);
  const [across, down] = kind ? footprint(kind, standing.turn) : [1, 1];
  return [standing.x, standing.y, standing.x + across, standing.y + down];
}

/** Why a new structure may not stand at a corner cell, turned so, on a plot, for a guild of this level: the words a
 *  player reads, or null when it may. */
export function placeRefusal(plot: Plot, kind: string, spot: { x: number; y: number; turn: number }, level: number) {
  const found = kindOf(kind);
  if (!found || kind === 'hall') return 'There is no such structure to build.';
  if (found.level > level) return `Your guild opens the ${found.name} at level ${found.level}.`;
  if (plot.structures.filter((standing) => standing.kind === kind).length >= found.most)
    return `An outpost holds one ${found.name}.`;
  if (![0, 1, 2, 3].includes(spot.turn)) return 'Turn it a quarter at a time.';
  const rect = rectOf({ kind, ...spot });
  if (!rect.every((edge) => Number.isInteger(edge)) || (rect[0] ?? 0) < 0 || (rect[1] ?? 0) < 0)
    return 'Place it on the plot.';
  if ((rect[2] ?? 0) > PLOT_CELLS || (rect[3] ?? 0) > PLOT_CELLS) return 'Place it on the plot.';
  if (plot.structures.some((standing) => overlap(rect, rectOf(standing)))) return 'Something already stands there.';
  if (plot.decor.some((decor) => decorOver(decor, rect))) return 'Move the decoration there first.';
  return null;
}

/** Why a structure may not rise to its next tier, or null when it may: its kind's last tier, the guild's level, the
 *  hall's tier (which the hall itself rises past alone), or a tier already being built. */
export function riseRefusal(plot: Plot, standing: Standing, level: number): string | null {
  const kind = kindOf(standing.kind);
  const next = standing.tier + 1;
  if (!kind || next > kind.tiers.length) return 'It stands at its highest tier.';
  if (standing.building > 0) return 'Finish building it first.';
  if (next > tierAllowed(level)) return `Your guild builds tier ${next} at level ${numbers.tierLevels[next - 1]}.`;
  if (kind.id !== 'hall' && next > hallTier(plot)) return `Raise the hall to tier ${next} first.`;
  return null;
}

/** A piece of decoration by its module. */
export function pieceOf(piece: string): Piece | undefined {
  return PIECES.find((each) => each.piece === piece);
}

/** Whether a piece of decoration reaches into a rect of cells. */
function decorOver(decor: Pick<Decor, 'piece' | 'x' | 'y'>, rect: readonly number[]): boolean {
  const reach = pieceOf(decor.piece)?.reach ?? 0;
  const [west, north, east, south] = rect.map((edge) => edge * CELL_M);
  return (
    decor.x + reach > (west ?? 0) &&
    decor.x - reach < (east ?? 0) &&
    decor.y + reach > (north ?? 0) &&
    decor.y - reach < (south ?? 0)
  );
}

/** How many pieces of decoration a hall of this tier holds. */
export function decorCap(tier: number): number {
  return numbers.decorCaps[Math.max(0, tier - 1)] ?? 0;
}

/** What a piece of decoration costs, in Aurem: by how far it reaches. */
export function decorPrice(piece: string): number {
  const { perMetre, least, most } = numbers.decorAurem;
  return Math.min(most, Math.max(least, Math.round((pieceOf(piece)?.reach ?? 0) * perMetre)));
}

/** Why a piece of decoration may not stand there on a plot, or null when it may: on the plot, on a quarter metre,
 *  off every structure, and within what the hall holds. */
export function decorRefusal(plot: Plot, decor: Omit<Decor, 'id'>): string | null {
  const piece = pieceOf(decor.piece);
  if (!piece) return 'There is no such decoration.';
  if (plot.decor.length >= decorCap(hallTier(plot))) return 'Raise the hall to hold more decoration.';
  if (!Number.isInteger(decor.turn) || decor.turn < 0 || decor.turn >= DECOR_TURNS) return 'Turn it in steps.';
  const quarter = (value: number) => Number.isInteger(value * 4);
  if (!quarter(decor.x) || !quarter(decor.y)) return 'Place it on the plot.';
  const inside = (value: number) => value - piece.reach >= 0 && value + piece.reach <= PLOT_M;
  if (!inside(decor.x) || !inside(decor.y)) return 'Place it on the plot.';
  if (plot.structures.some((standing) => decorOver(decor, rectOf(standing)))) return 'A structure stands there.';
  return null;
}

/** What a guild's outposts give its members, the highest of each boon standing at any of them, in hundredths. */
export function boonsOf(plots: readonly Plot[]): { xp: number; aurem: number; reputation: number } {
  const boons = { xp: 0, aurem: 0, reputation: 0 };
  for (const standing of plots.flatMap((plot) => plot.structures)) {
    const effect = kindOf(standing.kind)?.effect;
    if (effect?.kind !== 'boon' || standing.tier < 1) continue;
    boons[effect.boon] = Math.max(boons[effect.boon], effect.amounts[standing.tier - 1] ?? 0);
  }
  return boons;
}

/** What a structure's effect gives at its tier: a rate, a share, or 0 for none. */
export function amountOf(standing: Standing): number {
  const effect = kindOf(standing.kind)?.effect;
  return effect && 'amounts' in effect && standing.tier > 0 ? (effect.amounts[standing.tier - 1] ?? 0) : 0;
}

/** The Aurem an outpost's strongbox gains an hour: its Counting House's rate at its tier. */
export function strongboxRateOf(plot: Plot): number {
  return plot.structures
    .filter((standing) => kindOf(standing.kind)?.effect.kind === 'income')
    .reduce((sum, standing) => sum + amountOf(standing), 0);
}
