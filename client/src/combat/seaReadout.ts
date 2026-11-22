// The sea fight's readout as the interface draws it, built as the on-foot display is (`plus/seaFight.ts` holds what it
// shows and its words): the player's ship's plate at the top left is the vitals' long thin bars (Hull over Sails over
// Crew, the hull's frame flashing low as health's does, a fire chip under them); the ship's abilities stand at the
// bottom left as the Arts' bar does on foot (`shipAbilityBar.ts`); the target card under the compass is the target's
// plate (the faction's emblem, its name, one hull bar in its rank's colour, its class, distance and state as small
// words); the tally of the last volley under the view's middle; and the broadside warning under the card while a
// battery is run out at the player's ship, written over the sea as the game's other warnings are, with no panel.
import { BAR_TONES, CORNER, VITAL_SIZES } from '../plus/barFrame.ts';
import { PIECE_LEAST } from '../plus/barLoss.ts';
import { UNDER_COMPASS } from '../plus/compass.ts';
import { EMBLEM_PIXELS, emblemSvg } from '../plus/emblems.ts';
import { motionReduced } from '../plus/kit.ts';
import { lowShare, Meter } from '../plus/meter.ts';
import {
  CARD_GAP,
  SHIP_BARS,
  type SeaFightModel,
  seaFightWords,
  type SeaWarning,
  seaWarnWords,
} from '../plus/seaFight.ts';
import { FILLS, TONES } from '../plus/tones.ts';
import { announce } from '../ui/announce.ts';
import type { Node, Text } from '../ui/node.ts';
import { lineHeight } from '../ui/text.ts';
import { drawMeter, grownBy, keycapNode, paintBox, thinBarNode } from './barDraw.ts';
import { type CapFace, capWords, ShipAbilityBar, shipBarSize } from './shipAbilityBar.ts';

/** The hull's low blink (on for its first half), and the warning's pulse (its lit look for the second half of each),
 *  in seconds: slower while its battery's tell burns, faster once it may fire. */
const LOW_BLINK = 0.9;
const WARN_PULSE = { burning: 0.5, due: 0.25 } as const;
/** The card's emblem square, the emblem at three screen pixels a pixel inside a 2 px edge, as the target plate's. */
const EMBLEM_SQUARE = EMBLEM_PIXELS * 3 + 4;
/** The card's height: its emblem's square, or with none (an ally's), its words over its 12 px bar. */
const cardTall = (ally: boolean) => (ally ? lineHeight(1) + 3 + 12 : EMBLEM_SQUARE);
/** The warning's lines, 3 px apart: its title at twice the words' size, the fuse, whose battery and where, its shot,
 *  the brace over its keycap, and the other batteries' line while any are run out. */
const WARN_GAP = 3;
const FUSE_TALL = 2;
const KEYCAP_TALL = 15;
const warnTall = (more: boolean) =>
  lineHeight(2) +
  FUSE_TALL +
  lineHeight(1) * 2 +
  Math.max(lineHeight(1), KEYCAP_TALL) +
  WARN_GAP * 4 +
  (more ? lineHeight(1) + WARN_GAP : 0);
/** The letters of the card's name kept however long the words after it, as a browser's row shrinks them all. */
const NAME_KEPT = 3;
/** The colours the palette does not name: the fire's chip, a state going down, the warning's title at rest and lit,
 *  its fuse burning and burnt, and the tally's miss. */
const INKS = {
  fire: '#ffb066',
  sinking: '#ee5745',
  warn: '#ff5a45',
  warnLit: '#ffc2b8',
  fuse: '#ff7a5c',
  burnt: 'rgba(20, 6, 4, 0.55)',
  miss: '#b3a684',
} as const;
/** The warning's sign, a blood triangle round a "!", either side of its title. */
const WARN_SIGN = {
  width: 15,
  height: 13,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 17 15"><path d="M7.5 0 15 13 0 13Z" fill="${INKS.warn}" stroke="rgba(0,0,0,0.9)" stroke-width="1"/><path d="M6.5 4h2v5h-2zM6.5 10h2v2h-2z" fill="#1a0604"/></svg>`,
} as const;

/** How much of a fuse `width` long stands unburnt with `left` of its tell to burn: burnt in from both ends, then whole
 *  on each flash (`lit`) once burnt through, as the battery may fire. */
export const fuseSpan = (width: number, left: number, lit: boolean): number =>
  left > 0 ? width * Math.min(1, left) : lit ? width : 0;

/** Words of the readout: in the face's 11 px, outlined as the display's words are, in capitals spaced `tracking` 22nds
 *  of the size apart where it is given. */
const words = (said: string, colour: string, tracking?: number): Text => ({
  words: tracking ? said.toUpperCase() : said,
  colour,
  edge: 'halo',
  wrap: false,
  ...(tracking ? { tracking } : {}),
});

/** How far the ship's bar reaches from the view's bottom left, in its pixels: across from the left edge, and up from
 *  the foot. */
export interface Reach {
  readonly right: number;
  readonly up: number;
}

/** The readout: the plate, the ship's bar, the card and the tally, kept from frame to frame and drawn by the
 *  interface. */
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
  /** Since when the hull's warning and the broadside's have run, seconds; null while neither does. */
  private readonly since: Record<'low' | 'warn', number | null> = { low: null, warn: null };
  /** The battery the warning was last on, so another's tell burns afresh and is said again. */
  private warned: string | null = null;
  private readonly face: CapFace | null;
  private layout = { length: 0, wide: false, zoom: 1 };
  /** The ship's abilities at the bottom left. */
  private readonly abilities: ShipAbilityBar;

  /** How far down the ships' plates may stand, CSS pixels: under the card and the warning while they show, else under
   *  the compass. */
  under = UNDER_COMPASS;

  /** With `face`, a key on the ship's bar that is no word (a mouse's button, a pad's) stands drawn on its keycap. */
  constructor(face: CapFace | null = null) {
    this.abilities = new ShipAbilityBar(face);
    this.face = face;
  }

  /** How far the ship's bar reaches from the view's bottom left while it shows, in the view's pixels; none while it
   *  does not. */
  get reach(): Reach | null {
    const { wide, zoom } = this.layout;
    const count = this.model ? this.abilities.count : 0;
    if (count === 0) return null;
    const { width, height } = shipBarSize(count, wide, zoom);
    return { right: CORNER.side * zoom + width, up: CORNER.foot * zoom + height };
  }

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
    }
    this.abilities.update(ship?.abilities ?? null, seconds);
    if (card) {
      if (this.carded !== card.name) this.cardHull.forget();
      this.carded = card.name;
      this.cardHull.set(card.hull, seconds);
    }
    // Each battery's warning is said as it comes, once, as a page's alert is; its tell burns from then.
    const warn = model?.warn ?? null;
    if (warn && warn.id !== this.warned) {
      announce(seaWarnWords(warn).said);
      this.since.warn = null;
    }
    this.warned = warn?.id ?? null;
    this.mark('warn', warn !== null);
    // The warning under the card, or the compass while none shows: clear of the sight and the ship aimed at; the
    // ships' plates under both.
    this.under = UNDER_COMPASS + (model && card ? cardTall(card.band === 'ally') + CARD_GAP : 0);
    if (warn) this.under += warnTall(warn.more > 0) + CARD_GAP;
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
        model.ship && this.plateNode(model.ship),
        this.abilitiesNode(),
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
        model.warn !== null && this.warnNode(model.warn, this.under - warnTall(model.warn.more > 0) - CARD_GAP),
      ],
    };
  }

  /** The ship's abilities at the bottom left, where the Arts' bar stands on foot, at its step and zoom. */
  private abilitiesNode(): Node | null {
    const { wide, zoom } = this.layout;
    const bar = this.abilities.node(wide, zoom);
    return (
      bar && {
        ...bar,
        id: 'fight-ship',
        float: { to: 'screen', at: [0, 1], anchor: [0, 1], x: CORNER.side * zoom, y: -CORNER.foot * zoom, z: 1 },
      }
    );
  }

  /** The ship's plate at the top left: the thin bars, and the fire's chip under them while it burns. */
  private plateNode(ship: NonNullable<SeaFightModel['ship']>): Node {
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
    return {
      label: 'Your ship',
      direction: 'column',
      gap: sizes.gap * zoom,
      float: { to: 'screen', x: CORNER.side * zoom, y: CORNER.top * zoom, z: 1 },
      children: [
        bar('hull', 'Hull', FILLS.health),
        bar('sail', 'Sails', FILLS.sails),
        bar('crew', 'Crew', FILLS.stamina),
        ship.fire && {
          direction: 'row',
          padding: [4 * zoom, 0, 0, 0],
          children: [chip('On fire', INKS.fire)],
        },
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

  /** The broadside warning under the card, never over the sight, as the game's other warnings stand with no panel:
   *  BROADSIDE at twice the words' size between two blood signs, pulsing in steps; under it the battery's tell as a
   *  fuse burning in from both ends; whose battery, how far and where from the bow; its shot and what it does; the
   *  brace over its key, brass once braced; and how many other batteries stand run out. */
  private warnNode(warn: SeaWarning, top: number): Node {
    const said = seaWarnWords(warn);
    const age = this.age('warn') ?? 0;
    const left = warn.tell > 0 ? Math.max(0, 1 - age / warn.tell) : 0;
    const pulse = left > 0 ? WARN_PULSE.burning : WARN_PULSE.due;
    const lit = !motionReduced() && age % pulse >= pulse / 2;
    const sign: Node = {
      width: WARN_SIGN.width,
      height: WARN_SIGN.height,
      picture: { key: 'broadside sign', source: { svg: WARN_SIGN.svg } },
    };
    const line = (text: string, colour: string): Node => ({ text: words(text, colour, 3) });
    return {
      direction: 'column',
      alignX: 'center',
      gap: WARN_GAP,
      through: true,
      float: { to: 'screen', at: [0.5, 0], anchor: [0.5, 0], y: top, z: 1 },
      label: said.said,
      children: [
        {
          direction: 'row',
          gap: 8,
          alignY: 'center',
          height: lineHeight(2),
          children: [sign, { text: { ...words(said.title, lit ? INKS.warnLit : INKS.warn, 5), size: 2 } }, sign],
        },
        {
          width: 'grow',
          height: FUSE_TALL,
          draw: (ui, box, scale, clip, fade) => {
            const pen = { ui, box, scale, clip, fade };
            paintBox(pen, box, INKS.burnt);
            // Burnt in from both ends; once burnt through it flashes with the title, as the battery may fire.
            const width = fuseSpan(box.width, left, lit);
            if (width > 0) paintBox(pen, { ...box, x: box.x + (box.width - width) / 2, width }, INKS.fuse);
          },
        },
        line(said.who, TONES.word),
        line(said.shot, TONES.wordDim),
        {
          direction: 'row',
          gap: 6,
          alignY: 'center',
          height: Math.max(lineHeight(1), KEYCAP_TALL),
          children: [
            !warn.braced &&
              keycapNode(
                capWords(warn.braceKey),
                1,
                KEYCAP_TALL,
                KEYCAP_TALL,
                1,
                this.face?.(warn.braceKey, 1) ?? null,
              ),
            line(said.brace, warn.braced ? TONES.brassHi : TONES.word),
          ],
        },
        said.more !== '' && line(said.more, TONES.wordDim),
      ],
    };
  }
}
