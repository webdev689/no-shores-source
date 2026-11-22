// The sea fight's readout as the interface draws it, built as the on-foot display is (`plus/seaFight.ts` holds what it
// shows and its words): the player's ship's plate at the top left is the vitals' long thin bars (Hull over Sails over
// Crew, the hull's frame flashing low as health's does; a fire and a brace chip under them; and the battery rose of its
// sides' reloads); the target card under the compass is the target's plate (the faction's emblem, its name, one hull
// bar in its rank's colour, its class, distance and state as small words); the tally of the last volley under the
// view's middle; and DFO's warning under the card while a battery is run out at the player's ship.
import { BAR_TONES, CORNER, VITAL_SIZES } from '../plus/barFrame.ts';
import { PIECE_LEAST } from '../plus/barLoss.ts';
import { UNDER_COMPASS } from '../plus/compass.ts';
import { EMBLEM_PIXELS, emblemSvg } from '../plus/emblems.ts';
import { motionReduced } from '../plus/kit.ts';
import { lowShare, Meter } from '../plus/meter.ts';
import {
  type BoostRing,
  CARD_GAP,
  type RoseSide,
  SHIP_BARS,
  type SeaFightModel,
  seaFightWords,
} from '../plus/seaFight.ts';
import { FILLS, TONES } from '../plus/tones.ts';
import { announce } from '../ui/announce.ts';
import type { Drawing, Node, Text } from '../ui/node.ts';
import { lineHeight } from '../ui/text.ts';
import { drawCells, drawMeter, edges, faded, grownBy, paintBox, ring, thinBarNode } from './barDraw.ts';

/** The hull's low blink (on for its first half), a side's flash as it comes ready (two of 0.35 s, lit for the second
 *  half of each) and the warning's pulse (its lit look for the second half of each 0.5 s), in seconds. */
const LOW_BLINK = 0.9;
const FRESH_FLASH = 0.35;
const WARN_PULSE = 0.5;
/** The card's emblem square, the emblem at three screen pixels a pixel inside a 2 px edge, as the target plate's. */
const EMBLEM_SQUARE = EMBLEM_PIXELS * 3 + 4;
/** The card's height: its emblem's square, or with none (an ally's), its words over its 12 px bar. */
const cardTall = (ally: boolean) => (ally ? lineHeight(1) + 3 + 12 : EMBLEM_SQUARE);
/** The warning's height: its words' line, 3 px over and 4 under them, inside a 2 px edge. */
const WARN_TALL = lineHeight(1) + 3 + 4 + 4;
/** The letters of the card's name kept however long the words after it, as a browser's row shrinks them all. */
const NAME_KEPT = 3;
/** The rose's width, as wide as its longest words ("Heated 88s" a side), so it never shifts as they change. */
const ROSE_WIDE = 172;
/** The colours the palette does not name: the fire's chip, a state going down and a blow's edge, the warning's words
 *  and edges, the tally's miss. */
const INKS = {
  fire: '#ffb066',
  sinking: '#ee5745',
  blowWords: '#ffd0c8',
  warn: '#ffd9cf',
  warnLit: '#ff9c8a',
  miss: '#b3a684',
} as const;
/** The warning's edges, top, right, bottom and left, at rest and lit. */
const WARN_EDGES = {
  rest: ['#e0584a', '#5a130f', '#3d0d0a', '#b83a2e'],
  lit: ['#ff8a76', '#7a1a12', '#52110c', '#e0584a'],
} as const;

/** Words of the readout: in the face's 11 px, outlined as the display's words are, in capitals spaced `tracking` 22nds
 *  of the size apart where it is given. */
const words = (said: string, colour: string, tracking?: number): Text => ({
  words: tracking ? said.toUpperCase() : said,
  colour,
  edge: 'halo',
  wrap: false,
  ...(tracking ? { tracking } : {}),
});

/** The boost ring's look in each state, its lit part's ink and its word's colour: brass once ready, the words' white
 *  while it bursts, dim stone as it recharges. */
const BOOST_LOOKS = {
  ready: { ink: TONES.brassHi, word: TONES.brassHi },
  burst: { ink: TONES.word, word: TONES.word },
  charging: { ink: TONES.stoneMid, word: TONES.stoneLit },
} as const;
/** The ring's size in pixels, outline and all, and the steps its lit part moves in (so few pictures are made). */
const BOOST_SIZE = 16;
const BOOST_STEPS = 32;

/** The boost ring's pixels: an outline round a ring lit clockwise from the top as far as `lit` of it, the rest the
 *  bars' track, round a dark chip with its own outline. */
export function boostCells(ink: string, lit: number): (string | null)[] {
  const half = BOOST_SIZE / 2;
  return Array.from({ length: BOOST_SIZE * BOOST_SIZE }, (unused, index) => {
    const [across, down] = [(index % BOOST_SIZE) + 0.5 - half, Math.floor(index / BOOST_SIZE) + 0.5 - half];
    const far = Math.hypot(across, down);
    if (far > half) return null;
    if (far > half - 1 || (far > 4 && far <= 5)) return TONES.outline;
    if (far <= 4) return TONES.groundChip;
    const turned = (Math.atan2(across, -down) / (2 * Math.PI) + 1) % 1;
    return turned < lit ? ink : TONES.groundTrack;
  });
}

/** The ship's boost ring and its word, said to a reader as its state. */
function boostNode(boost: BoostRing, said: string, zoom: number): Node {
  const look = BOOST_LOOKS[boost.state];
  const lit = Math.round(Math.min(1, Math.max(0, boost.share)) * BOOST_STEPS) / BOOST_STEPS;
  return {
    direction: 'row',
    alignY: 'center',
    gap: 4 * zoom,
    label: said,
    children: [
      {
        width: BOOST_SIZE * zoom,
        height: BOOST_SIZE * zoom,
        draw: (ui, box, scale, clip, fade) =>
          drawCells(
            { ui, box, scale: scale * zoom, clip, fade },
            `boost ${look.ink} ${lit}`,
            BOOST_SIZE,
            BOOST_SIZE,
            () => boostCells(look.ink, lit),
          ),
      },
      { text: { ...words('Boost', look.word, 1), size: zoom } },
    ],
  };
}

/** The readout: the plate with its rose, the card and the tally, kept from frame to frame and drawn by the interface. */
export class SeaFightReadout {
  private readonly bars = {
    hull: new Meter({ pieceLeast: PIECE_LEAST.vital }),
    sail: new Meter({ pieceLeast: PIECE_LEAST.vital }),
    crew: new Meter({ pieceLeast: PIECE_LEAST.vital }),
  };
  private readonly cardHull = new Meter({ pieceLeast: PIECE_LEAST.foe });
  private model: SeaFightModel | null = null;
  /** When the readout was last shown, seconds, so its bars' losses drain in time. */
  private shownAt: number | null = null;
  private now = 0;
  /** The card's ship last shown, so its bar forgets another's losses. */
  private carded: string | null = null;
  /** Since when each side's flash, the hull's warning and the broadside's have run, seconds; null while none does. */
  private readonly since: Record<'port' | 'starboard' | 'low' | 'warn', number | null> = {
    port: null,
    starboard: null,
    low: null,
    warn: null,
  };
  private layout = { length: 0, wide: false, zoom: 1 };

  /** How far down the ships' plates may stand, CSS pixels: under the card and the warning while they show, else under
   *  the compass. */
  under = UNDER_COMPASS;

  /** Lays the bars as the vitals on foot are laid (`combat/hudLayout.ts`): their `length`, and whether they stand at
   *  the larger step or doubled. Unlaid, as in the World Editor, they stand at the first step, 160 px long. */
  lay(layout: { readonly length: number; readonly wide: boolean; readonly zoom: number }): void {
    this.layout = { length: layout.length, wide: layout.wide, zoom: layout.zoom };
  }

  /** Shows `model`, or hides the readout for none, at `now` seconds. */
  update(model: SeaFightModel | null, now = performance.now() / 1000): void {
    const seconds = this.shownAt === null ? 0 : Math.min(0.1, Math.max(0, now - this.shownAt));
    this.shownAt = model ? now : null;
    this.now = now;
    this.model = model;
    const { ship, card } = model ?? { ship: null, card: null };
    if (ship) {
      for (const kind of ['hull', 'sail', 'crew'] as const) this.bars[kind].set(ship[kind], seconds);
      this.mark('low', lowShare(ship.hull));
      this.mark('port', ship.port.fresh);
      this.mark('starboard', ship.starboard.fresh);
    }
    if (card) {
      if (this.carded !== card.name) this.cardHull.forget();
      this.carded = card.name;
      this.cardHull.set(card.hull, seconds);
    }
    // The warning is said as it comes, once, as a page's alert is.
    if (model?.warn && this.since.warn === null) announce(model.warn);
    this.mark('warn', !!model && model.warn !== null);
    // The warning under the card, or the compass while none shows: clear of the sight and the ship aimed at; the
    // ships' plates under both.
    this.under = UNDER_COMPASS + (model && card ? cardTall(card.band === 'ally') + CARD_GAP : 0);
    if (model && model.warn !== null) this.under += WARN_TALL + CARD_GAP;
  }

  private mark(what: keyof SeaFightReadout['since'], now: boolean): void {
    this.since[what] = now ? (this.since[what] ?? this.now) : null;
  }

  /** How long `what` has run, seconds; null while it does not. */
  private age(what: keyof SeaFightReadout['since']): number | null {
    const since = this.since[what];
    return since === null ? null : this.now - since;
  }

  /** The readout over the whole view, letting the pointer through; none while hidden. */
  node(): Node | null {
    const model = this.model;
    if (!model) return null;
    const said = seaFightWords(model);
    const cardTop = UNDER_COMPASS;
    return {
      width: 'grow',
      height: 'grow',
      through: true,
      children: [
        model.ship && this.plateNode(model.ship, said),
        model.card && {
          width: 'grow',
          direction: 'column',
          alignX: 'center',
          float: { to: 'screen', y: cardTop, z: 1 },
          children: [this.cardNode(model.card, said.state)],
        },
        said.tally !== '' && {
          text: words(said.tally, model.tally?.hits === 0 ? INKS.miss : TONES.brassHi, 2),
          float: { to: 'screen', at: [0.5, 0.5], anchor: [0.5, 0], y: 64, z: 1 },
        },
        model.warn !== null && this.warnNode(model.warn, this.under - WARN_TALL - CARD_GAP),
      ],
    };
  }

  /** The ship's plate at the top left: the thin bars, the chips under them and the rose. */
  private plateNode(ship: NonNullable<SeaFightModel['ship']>, said: ReturnType<typeof seaFightWords>): Node {
    const { length, wide, zoom } = this.layout;
    const sizes = wide ? VITAL_SIZES.wide : VITAL_SIZES.base;
    const still = motionReduced();
    const low = this.age('low');
    const lowLit = low !== null && (still || low % LOW_BLINK < LOW_BLINK / 2);
    const bar = (kind: 'hull' | 'sail' | 'crew', label: string, fill: string): Node => {
      const sized = SHIP_BARS[kind];
      const share = Math.round(Math.max(0, Math.min(1, ship[kind])) * 100);
      return thinBarNode({
        name: `ship ${kind}`,
        label: `${label}: ${share}%`,
        length: length > 0 ? length : 160,
        height: wide ? sized.wide : sized.base,
        zoom,
        fill: (pen) => drawMeter(pen, this.bars[kind], fill, 'faint'),
        alert: kind === 'hull' && lowLit ? BAR_TONES.blood : null,
      });
    };
    const chip = (text: string, colour: string): Node => ({
      role: 'chip',
      bevel: zoom,
      padding: [zoom, 6 * zoom, zoom, 6 * zoom],
      children: [{ text: { ...words(text, colour), size: zoom } }],
    });
    const chips = [
      boostNode(ship.boost, said.boost, zoom),
      ship.fire && chip('On fire', INKS.fire),
      ship.braced && chip('Braced', TONES.word),
    ];
    return {
      label: 'Your ship',
      direction: 'column',
      gap: sizes.gap * zoom,
      float: { to: 'screen', x: CORNER.side * zoom, y: CORNER.top * zoom, z: 1 },
      children: [
        bar('hull', 'Hull', FILLS.health),
        bar('sail', 'Sails', FILLS.sails),
        bar('crew', 'Crew', FILLS.stamina),
        { direction: 'row', alignY: 'center', gap: 6 * zoom, padding: [4 * zoom, 0, 0, 0], children: chips },
        this.roseNode(ship, said, zoom),
      ],
    };
  }

  /** The battery rose: Bow over the two sides' chips over Stern, each side filling from its foot as it loads, gold
   *  round where the look lays it, flashing as it comes ready, edged in blood where a blow lands. */
  private roseNode(
    ship: NonNullable<SeaFightModel['ship']>,
    said: ReturnType<typeof seaFightWords>,
    zoom: number,
  ): Node {
    const still = motionReduced();
    const end = (name: 'bow' | 'stern', text: string): Node => ({
      width: 'grow',
      alignX: 'center',
      ...(ship.blow === name ? { draw: blowEdge(zoom) } : {}),
      children: [{ text: { ...words(text, ship.blow === name ? INKS.blowWords : TONES.stoneLit), size: zoom } }],
    });
    const side = (name: 'port' | 'starboard'): Node => {
      const rose: RoseSide = ship[name];
      const age = this.age(name);
      // A side come ready flashes brass twice, lit for the second half of each; held lit with reduced motion.
      const flashed = age !== null && (still || age % FRESH_FLASH >= FRESH_FLASH / 2);
      const lit = flashed && !still;
      const colour = ship.blow === name ? INKS.blowWords : lit ? TONES.outline : rose.laid ? TONES.brassHi : TONES.word;
      const border = rose.laid ? TONES.brassHi : rose.ready ? TONES.brass : TONES.stoneDim;
      return {
        width: 'grow',
        alignX: 'center',
        padding: [3 * zoom, 5 * zoom, 3 * zoom, 5 * zoom],
        draw: (ui, box, scale, clip, fade) => {
          const pen = { ui, box, scale: scale * zoom, clip, fade };
          const step = pen.scale;
          if (rose.laid) {
            ring(pen, box, TONES.outline);
            for (let glow = 1; glow <= 3; glow++)
              ring(pen, grownBy(box, glow * step), faded('rgba(243,207,134,0.45)', (4 - glow) / 4));
          } else {
            ring(pen, box, TONES.outline);
            paintBox(pen, { ...box, x: box.x + 2 * step, y: box.y + 2 * step }, 'rgba(0,0,0,0.35)');
          }
          const inner = grownBy(box, -step);
          paintBox(pen, inner, flashed ? TONES.brassHi : TONES.groundChip);
          if (!flashed) {
            const filled = Math.round(Math.max(0, Math.min(1, rose.fill)) * inner.height);
            paintBox(pen, { ...inner, y: inner.y + inner.height - filled, height: filled }, faded(TONES.brassLo, 0.8));
          }
          edges(pen, box, [border]);
          if (ship.blow === name) blowEdge(zoom)(ui, box, scale, clip, fade);
        },
        children: [{ text: { ...words(said[name], colour), size: zoom } }],
      };
    };
    return {
      width: ROSE_WIDE * zoom,
      direction: 'column',
      gap: 3 * zoom,
      padding: [4 * zoom, 0, 0, 0],
      children: [
        end('bow', 'Bow'),
        { direction: 'row', gap: 3 * zoom, width: 'grow', children: [side('port'), side('starboard')] },
        end('stern', 'Stern'),
      ],
    };
  }

  /** The card: the target plate's build, the faction's emblem framed at its left; to its right the name, class and
   *  distance and state as small words over one bar of the hull in the rank's colour (an ally's blue, its emblem
   *  hidden). */
  private cardNode(card: NonNullable<SeaFightModel['card']>, state: string): Node {
    const ally = card.band === 'ally';
    const emblem = ally ? null : emblemSvg(card.faction);
    const side = EMBLEM_PIXELS * 3;
    const fill = FILLS[card.band as keyof typeof FILLS] ?? FILLS.red;
    const stateColour =
      card.state === 'sinking'
        ? INKS.sinking
        : card.state === 'struck' || card.boardKey
          ? TONES.brassHi
          : TONES.wordDim;
    return {
      direction: 'row',
      gap: 5,
      width: '76%',
      maxWidth: 340,
      label: `${card.name}, ${card.sub}${state ? `, ${state}` : ''}: hull ${Math.round(card.hull * 100)}%`,
      children: [
        !ally && {
          role: 'chip',
          width: EMBLEM_SQUARE,
          height: EMBLEM_SQUARE,
          alignX: 'center',
          alignY: 'center',
          children: [
            !!emblem && {
              width: side,
              height: side,
              picture: {
                key: `emblem ${card.faction}`,
                source: { svg: emblem },
                pixel: { width: EMBLEM_PIXELS, height: EMBLEM_PIXELS },
              },
            },
          ],
        },
        {
          direction: 'column',
          width: 'grow',
          ...(ally ? {} : { height: EMBLEM_SQUARE }),
          gap: 3,
          // The words at the top and the bar at the foot, the room between them.
          children: [
            {
              direction: 'row',
              gap: 5,
              width: 'grow',
              alignY: 'center',
              clip: true,
              children: [
                {
                  children: [
                    { text: words(card.name.slice(0, NAME_KEPT), ally ? TONES.ally : TONES.word) },
                    card.name.length > NAME_KEPT && {
                      text: { ...words(card.name.slice(NAME_KEPT), ally ? TONES.ally : TONES.word), ellipsis: true },
                    },
                  ],
                },
                { text: words(card.sub, TONES.wordDim, 3) },
                state !== '' && { text: words(state, stateColour, 3) },
              ],
            },
            !ally && { height: 'grow' },
            {
              role: 'track',
              bevel: 1,
              width: 'grow',
              height: 12,
              draw: (ui, box, scale, clip, fade) => {
                const pen = { ui, box: grownBy(box, -scale), scale, clip, fade };
                drawMeter(pen, this.cardHull, fill, 'pale');
              },
            },
          ],
        },
      ],
    };
  }

  /** DFO's warning under the card, blood-edged and pulsing in steps, never over the sight. */
  private warnNode(warn: string, top: number): Node {
    const age = this.age('warn') ?? 0;
    const lit = !motionReduced() && age % WARN_PULSE >= WARN_PULSE / 2;
    return {
      padding: [5, 14, 6, 14],
      float: { to: 'screen', at: [0.5, 0], anchor: [0.5, 0], y: top, z: 1 },
      label: warn,
      draw: (ui, box, scale, clip, fade) => {
        const pen = { ui, box, scale, clip, fade };
        ring(pen, box, TONES.outline);
        paintBox(pen, box, 'rgba(60, 12, 8, 0.72)');
        edges(pen, box, lit ? WARN_EDGES.lit : WARN_EDGES.rest, 2);
      },
      children: [{ text: words(warn, lit ? INKS.warnLit : INKS.warn, 3) }],
    };
  }
}

/** A blow's 2 px blood edge, round the outside of what it lands on. */
const blowEdge =
  (zoom: number): Drawing =>
  (ui, box, scale, clip, fade) =>
    ring({ ui, box, scale: scale * zoom, clip, fade }, box, INKS.sinking, 2);
