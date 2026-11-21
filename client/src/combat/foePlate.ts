// A foe's plate, one layout for every bar of a foe: its level in a square at the left and, to its right, its
// name above a thin bar of its health, the fill in its rank's colour over a dark trough with a hairline edge; its
// debuffs' icons beside the bar. Over a figure its size goes with its rank, as Destiny's bars do: a Minor's short and
// thin, so the crowd's fodder stays quiet, and an Elite's and up long and marked in thirds, so they stand out.
import { PLATES } from '../plus/barLayout.ts';
import { EMBLEM_PIXELS, markPicture } from '../plus/emblems.ts';
import { motionReduced } from '../plus/kit.ts';
import { BEVELS, FILLS, TONES } from '../plus/tones.ts';
import { ELEMENTS } from '../player/gear.ts';
import type { Node, Picture } from '../ui/node.ts';
import type { FoeShield, FoeStatuses } from '../network/messages.ts';
import type { FighterView } from '../rules/fighters.ts';
import { type RankBand, rankBand, rankMark } from '../rules/roster.ts';
import { PIECE_LEAST } from '../plus/barLoss.ts';
import { Meter } from '../plus/meter.ts';
import { bands, drawMeter, edges, faded, grownBy, hatch, markAt, paintBox, ring, span } from './barDraw.ts';
import { foeDebuffs, StatusRow } from './statusIcons.ts';

/** A foe as the display marks it: its number, its type's name, its glance (its place as it is drawn), its rank (1 Minor
 *  to 5 Boss), its faction's name, the phase it fights in (1 to 3) and how alert it is (0 idle, 1 suspicious, 2 alert,
 *  3 searching); its faction's number, which picks its emblem (none without it); its level (0 for a foe of none,
 *  whose square stands empty); its shield, if it stands with one; its debuffs; and whether it is a companion. */
export interface MarkedFoe {
  readonly id: number;
  readonly name: string;
  readonly view: FighterView;
  readonly rank: number;
  readonly faction: string;
  readonly phase: number;
  readonly alert: number;
  readonly factionNumber?: number;
  readonly level?: number;
  readonly shield?: FoeShield | null;
  readonly statuses?: FoeStatuses;
  /** A companion fighting beside the players, whose plate is drawn in the players' colour. */
  readonly ally?: boolean;
}

/** A plate's tier by its foe's rank: a Minor's, a Major's, or an Elite's and up. */
export type PlateTier = 'minor' | 'major' | 'elite';
export function plateTier(rank: number): PlateTier {
  return rank <= 1 ? 'minor' : rank === 2 ? 'major' : 'elite';
}

/** A plate's width and its bar's height over a figure, by its tier, in CSS pixels, each as tall as its level's square
 *  (`PLATES.overhead.height`), and the share of the room under the name its bar runs. A Major's is the size a ship's
 *  plate is drawn at; a Minor's as wide, which "? Crossbowman", the longest name a Minor has, fills in the game's face,
 *  so only its bar is short. A Minor's bar is 6 px: drawn far off at three quarters, it still holds a row of its red
 *  and of a shield's colour. */
export const OVERHEAD_SIZES: Readonly<
  Record<PlateTier, { readonly width: number; readonly bar: number; readonly barShare: number }>
> = {
  minor: { width: PLATES.overhead.width, bar: 6, barShare: 0.6 },
  major: { width: PLATES.overhead.width, bar: PLATES.overhead.bar, barShare: 1 },
  elite: { width: 176, bar: 10, barShare: 1 },
};

/** Where an Elite's and up's bar over a figure is marked, as shares of its whole health: its thirds. */
export const THIRDS: readonly number[] = [1 / 3, 2 / 3];

/** A shield's ward over a foe's health, as DFO's Enhanced HUD laid a boss's: from the bar's left end, as long as the
 *  share of the foe's whole health it holds still, in its element's colour (by the gear crate's number); none once
 *  it is broken or for a foe with none. */
export function wardOf(
  foe: Pick<MarkedFoe, 'shield' | 'view'>,
): { readonly share: number; readonly element: number } | null {
  const shield = foe.shield;
  if (!shield || shield.left <= 0) return null;
  return { share: Math.min(1, shield.left / Math.max(1, foe.view.healthMax)), element: shield.element };
}

/** The colour a plate's health is drawn in: green for an ally fighting on the players' side, as the Brig's crew do,
 *  else its rank's band. */
export function plateBand(foe: Pick<MarkedFoe, 'rank' | 'view'>): RankBand | 'green' {
  return foe.view.side === 'players' ? 'green' : rankBand(foe.rank);
}

/** What the poise track under a foe's health says: nothing to say (not drawn), its poise filling toward a break, an
 *  iron blow wound up (no poise stops it), staggered, or open after a blow that found no one. */
export type PoiseState = 'empty' | 'filling' | 'iron' | 'staggered' | 'open';

/** The poise track's reading of a foe: its state, how full it stands (0 to 1) and the word under it. A feint reads
 *  as any wind-up: the track tells no more than the ground does. */
export function poiseTrackOf(view: FighterView): { state: PoiseState; fill: number; word: string } {
  const { action } = view;
  if (action.kind === 'staggered') {
    return { state: 'staggered', fill: 1, word: action.cause === 'charged' ? 'Charged' : 'Staggered' };
  }
  if (action.kind === 'overreach') return { state: 'open', fill: 0, word: 'Open' };
  if (action.kind === 'telegraph' && action.iron) return { state: 'iron', fill: 1, word: 'Iron' };
  const fill = Math.max(0, Math.min(1, view.poise / Math.max(1, view.poiseMax)));
  return action.kind === 'telegraph' || fill > 0
    ? { state: 'filling', fill, word: '' }
    : { state: 'empty', fill: 0, word: '' };
}

/** Each plate's level square, as large as a ship's emblem square at the same scale, inside a 2 px edge. */
const SQUARE_SCALE = { overhead: 2, target: 3, boss: 4 } as const;
/** Where a plate stands: over a figure, the target's at the top, or the boss bar. */
export type PlateKind = keyof typeof SQUARE_SCALE;
/** The light either side of a third's dark mark, so it reads over a bar's empty trough as well as over its fill. */
const THIRD_EDGE = faded(TONES.wordDim, 0.6);
/** How long the poise track flashes as its foe breaks into a stagger, in seconds. */
const POISE_FLASH = 0.45;

/** The poise track: a thin bar under the health, its word centred under it. It flashes only as the foe it shows breaks
 *  into a stagger, never as the plate turns onto one already staggered. */
class PoiseTrack {
  private last: { id: number; state: PoiseState } | null = null;
  private reading: { state: PoiseState; fill: number; word: string } = { state: 'empty', fill: 0, word: '' };
  /** Seconds since the shown foe broke, Infinity before. */
  private broke = Infinity;

  /** What the track says, and whether it flashes as its foe breaks. */
  get shown(): { readonly state: PoiseState; readonly breaking: boolean } {
    return { state: this.reading.state, breaking: this.broke < POISE_FLASH };
  }

  show(id: number, view: FighterView, seconds: number): void {
    this.reading = poiseTrackOf(view);
    const { state } = this.reading;
    if (this.last?.id !== id || this.last.state !== state) {
      this.broke = state === 'staggered' && this.last?.id === id ? 0 : Infinity;
      this.last = { id, state };
    } else this.broke += seconds;
  }

  /** The track, `scale` times its size; it keeps its room while it has nothing to say, so the plate never jumps. */
  node(scale: number): Node {
    const { state, fill, word } = this.reading;
    const colour =
      state === 'iron' ? '#ff6a5a' : state === 'staggered' ? '#ffffff' : state === 'open' ? '#f1c04f' : undefined;
    const flash =
      state === 'staggered' && !motionReduced() && this.broke < POISE_FLASH ? 1 - this.broke / POISE_FLASH : 0;
    return {
      width: 'grow',
      height: 6 * scale,
      draw:
        state === 'empty'
          ? undefined
          : (ui, box, unit, clip, fade) => {
              const pen = { ui, box, scale: unit * scale, clip, fade };
              ring(pen, box, TONES.outline);
              const edge = pen.scale;
              const inner = grownBy(box, -edge);
              const sunk = BEVELS.sunk.match(/rgba?\([^)]*\)|#[0-9a-f]+/gi) ?? [];
              edges(pen, box, state === 'open' ? ['rgba(241,192,79,0.9)'] : sunk);
              paintBox(pen, inner, TONES.groundTrack);
              const filled = span({ ...pen, box: inner }, 0, fill);
              if (state === 'iron') hatch(pen, filled);
              else if (state !== 'open') paintBox(pen, filled, state === 'staggered' ? '#ffffff' : FILLS.poise);
              for (let step = 1; flash > 0 && step <= 3; step++)
                ring(
                  pen,
                  grownBy(filled, (step - 1) * edge),
                  `rgba(255,255,255,${(0.9 * flash * flash * (4 - step)) / 3})`,
                );
            },
      children: word
        ? [
            {
              text: { words: word.toUpperCase(), colour, edge: 'halo', wrap: false },
              float: { at: [0.5, 1], anchor: [0.5, 0], y: 3, z: 1 },
            },
          ]
        : [],
    };
  }
}

/** What a plate holds besides its level, name and health: a poise track under the health; and whether its health breaks
 *  off in pieces and remembers each foe's, for a plate that turns from foe to foe, taking a foe it first shows as
 *  whole (a plate that comes with the first blow, after it lands) or as found (one that comes before any blow). */
export interface PlateParts {
  readonly poise?: boolean;
  readonly remembers?: 'whole' | 'found';
}

/** How a plate is drawn this frame: where it stands, `zoom` times its first size (and, over a figure, `scale` times
 *  that as its figure stands farther), how wide, words after the name, and marks across its health. */
export interface PlateLook {
  readonly kind: PlateKind;
  readonly width: number;
  readonly zoom?: number;
  readonly scale?: number;
  readonly words?: readonly Node[];
  readonly marks?: readonly number[];
}

/** A foe's plate on the display. */
export class FoePlate {
  readonly health: Meter;
  private readonly poise: PoiseTrack | null;
  private readonly debuffs = new StatusRow('Debuffs');
  /** The share of health the plate last showed of each foe it remembers, so a foe it turns back to loses from where
   *  its bar stood; and the share a foe first shown is taken at (null for as found). */
  private readonly seen: Map<number, number> | null;
  private readonly firstSeen: number | null;
  /** The foe the plate showed last, so its bars forget another's losses, and its alert's mark. */
  private foe: MarkedFoe | null = null;
  private alert = '';

  constructor(parts: PlateParts = {}) {
    this.health = new Meter({ pieceLeast: parts.remembers ? PIECE_LEAST.foe : null });
    this.poise = parts.poise ? new PoiseTrack() : null;
    this.seen = parts.remembers ? new Map() : null;
    this.firstSeen = parts.remembers === 'whole' ? 1 : null;
  }

  /** What the poise track says, if the plate has one. */
  get poiseShown(): { readonly state: PoiseState; readonly breaking: boolean } | null {
    return this.poise?.shown ?? null;
  }

  /** The foe shown last. */
  get shown(): MarkedFoe | null {
    return this.foe;
  }

  /** Shows `foe` `seconds` on, with its alert's mark ('' for none). */
  show(foe: MarkedFoe, seconds: number, alert = ''): void {
    const share = foe.view.health / Math.max(1, foe.view.healthMax);
    if (this.foe?.id !== foe.id) this.health.forget(this.seen?.get(foe.id) ?? this.firstSeen);
    [this.foe, this.alert] = [foe, alert];
    this.health.set(share, seconds);
    this.seen?.set(foe.id, Math.max(0, Math.min(1, share)));
    this.poise?.show(foe.id, foe.view, seconds);
    this.debuffs.show(foe.id, foeDebuffs(foe.statuses));
  }

  /** Forgets the foes not in `present`, whose numbers may come again for others. */
  keep(present: ReadonlySet<number>): void {
    for (const id of this.seen?.keys() ?? []) if (!present.has(id)) this.seen?.delete(id);
    this.debuffs.keep(present);
  }

  /** The plate as `look` lays it: its level in a square at the left and, to its right, its name above its health and
   *  the poise track under that, its debuffs beside it. */
  node(look: PlateLook): Node | null {
    const foe = this.foe;
    if (!foe) return null;
    const zoom = look.zoom ?? 1;
    const scale = zoom * (look.scale ?? 1);
    const { kind } = look;
    const overhead = kind === 'overhead';
    const side = Math.round((EMBLEM_PIXELS * SQUARE_SCALE[kind] + 4) * scale);
    const tier = OVERHEAD_SIZES[plateTier(foe.rank)];
    const size = (overhead ? 1 : 2) * zoom;
    // A companion's plate shows no level square, so its name and bar take the whole plate.
    const level: Node | null = foe.ally
      ? null
      : {
          role: 'chip',
          width: side,
          height: side,
          alignX: 'center',
          alignY: 'center',
          children: foe.level ? [{ text: { words: String(foe.level), size, colour: TONES.word, edge: 'halo' } }] : [],
        };
    const mark = rankMark(foe.rank);
    const picture = mark ? markPicture(mark) : null;
    const markNode = (tint?: string): Picture | undefined =>
      picture
        ? {
            key: `rank ${mark}`,
            source: { svg: picture.svg },
            pixel: { width: picture.width, height: picture.height },
            ...(tint ? { tint } : {}),
          }
        : undefined;
    const title: Node = {
      direction: 'row',
      alignY: kind === 'boss' ? 'end' : 'center',
      gap: (kind === 'boss' ? 12 : 5) * zoom,
      width: 'grow',
      clip: true,
      ...(overhead ? { height: Math.round(15 * scale) } : {}),
      children: [
        this.alert !== '' && {
          text: {
            words: this.alert,
            size: overhead ? zoom : 2 * zoom,
            colour: this.alert === '!' ? '#ff5a4a' : '#ffd95a',
            edge: 'halo',
          },
        },
        {
          text: {
            words: foe.name,
            size: kind === 'boss' ? 2 * zoom : zoom,
            colour: foe.ally ? TONES.ally : TONES.word,
            edge: 'halo',
            ellipsis: true,
          },
        },
        picture && {
          width: picture.width * 2 * zoom,
          height: picture.height * 2 * zoom,
          children: [
            { width: 'grow', height: 'grow', picture: markNode(TONES.outline), float: { x: 1, y: 1, z: 1 } },
            { width: 'grow', height: 'grow', picture: markNode(), float: { z: 1 } },
          ],
        },
        ...(look.words ?? []),
      ],
    };
    const bar = overhead ? Math.round(tier.bar * scale) : kind === 'target' ? 12 * zoom : PLATES.boss.bar * zoom;
    const border = kind === 'boss' ? 2 : 1;
    const band = foe.ally ? 'ally' : plateBand(foe);
    const ward = wardOf(foe);
    const thirds = overhead && plateTier(foe.rank) === 'elite';
    const health: Node = {
      role: 'track',
      bevel: border * zoom,
      width: overhead ? `${tier.barShare * 100}%` : 'grow',
      height: bar,
      draw: (ui, box, unit, clip, fade) => {
        const pen = { ui, box, scale: unit * zoom, clip, fade };
        const inner = grownBy(box, -border * unit * zoom);
        const trough = { ...pen, box: inner };
        drawMeter(trough, this.health, FILLS[band], 'pale');
        if (ward) {
          const element = ELEMENTS[ward.element];
          const [dark = '#000', , lit = '#fff'] = element?.palette ?? [];
          bands({ ...trough, fade: 0.9 * (trough.fade ?? 1) }, span(trough, 0, ward.share), {
            top: lit,
            topDeep: 1,
            body: element?.colour ?? '#fff',
            foot: dark,
            footDeep: 1,
          });
        }
        if (thirds)
          for (const share of THIRDS) markAt(trough, share, { css: TONES.outline, width: 2, side: THIRD_EDGE });
        for (const share of look.marks ?? [])
          markAt(trough, share, { css: TONES.outline, width: 2, over: 4, side: TONES.groove, rightOnly: true });
      },
    };
    const poise = this.poise?.node(zoom);
    const spacer: Node = { height: 'grow' };
    const body: Node = {
      direction: 'column',
      width: overhead ? Math.round((tier.width - (level ? PLATES.overhead.height + 5 : 0)) * scale) : 'grow',
      height: overhead ? side : 'grow',
      gap: kind === 'target' ? 3 * zoom : 0,
      children: [
        title,
        overhead ? spacer : null,
        health,
        poise && { padding: [kind === 'boss' ? 3 * zoom : 0, 0, 0, 0], width: 'grow', children: [poise] },
      ],
    };
    const debuffs = this.debuffs.node(24 * zoom, 3 * zoom, zoom);
    return {
      direction: 'row',
      gap: 5 * zoom,
      width: overhead ? Math.round(tier.width * scale) : look.width,
      children: [level, body, debuffs && { ...debuffs, float: { at: [1, 1], anchor: [0, 1], x: 5 * zoom, z: 1 } }],
    };
  }
}
