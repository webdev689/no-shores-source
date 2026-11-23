// A zone's public event as the banner under the compass shows it, after Destiny's: what it is over its name, the name
// and the place, the countdown at the right, the objective with its bar, the heroic task with its window's countdown,
// the bonus and whether it holds; the result for its time once it is over; and the next event's line between them.
// It slides in afresh at each beat (begun, a stage, heroic met or missed, won, failed). Drawn as nodes of the
// interface the game draws (`ui/`), laid afresh each frame from what the banner keeps.
import type { PlaceMark } from '../plus/compass.ts';
import { motionReduced } from '../plus/kit.ts';
import { Meter } from '../plus/meter.ts';
import { TONES } from '../plus/tones.ts';
import { announce } from '../ui/announce.ts';
import { cubicBezier } from '../ui/ease.ts';
import type { Child, Node, Text } from '../ui/node.ts';
import { drawMeter, thinBarNode } from './barDraw.ts';

/** The banner's tone: an event running, one turned heroic, its result, or the next event's line between them. */
export type BannerTone = 'running' | 'heroic' | 'won' | 'failed' | 'next';

/** What the banner shows: a line over the name (what it is), the name, the place, a clock (the countdown, or how long
 *  until the next), the objective, the bar under it, the heroic task with its window's clock, and the bonus. */
export interface Banner {
  readonly tone: BannerTone;
  readonly kicker: string;
  readonly title: string;
  readonly place: string;
  readonly clock: string;
  /** The event's last minute: its clock red and pulsing. */
  readonly urgent?: boolean;
  /** What runs or comes next elsewhere on the island, between events. */
  readonly elsewhere?: string;
  readonly objective: string;
  readonly bar: { readonly share: number; readonly label: string } | null;
  readonly heroic: { readonly text: string; readonly clock: string; readonly met: boolean } | null;
  readonly bonus: { readonly text: string; readonly state: 'holds' | 'met' | 'lost' | 'warns' } | null;
}

/** A beat of the event the banner slides in afresh for. */
export type BannerBeat = 'begun' | 'stage' | 'heroic' | 'missed' | 'won' | 'failed' | 'chance' | 'soon';

/** What the display shows of the zone's public event this frame: its banner and the beat it slides in for, the
 *  places the compass marks, each store's health over it while a raid runs (struck: under attack), the least mood it
 *  holds the music to, and an Elite Dungeon's Court the part its Boss's score plays (by its wards broken). */
export interface PublicShown {
  readonly banner: Banner | null;
  readonly beat: BannerBeat | null;
  readonly places: readonly PlaceMark[];
  readonly stores: readonly {
    readonly at: readonly [number, number, number];
    readonly share: number;
    readonly struck?: boolean;
  }[];
  readonly mood?: 'tension' | 'peak' | null;
  readonly part?: number;
}

/** How high over a store's foot its bar stands, metres: over its stack and tarp (1.6 m), as a plate over a head. */
export const STORE_BAR_OVER_M = 2.3;

/** Each tone's colour: the accent down its edge, its kicker's words and its bar's fill. */
export const TONE_COLOURS = {
  running: '#e9b44c',
  heroic: '#ff7a3d',
  won: '#9fd86a',
  failed: '#e0483c',
  next: TONES.stoneHi,
} as const;
const HEROIC = '#ff7a3d';
const HEROIC_WORDS = '#ffb27a';
const URGENT = '#e0483c';

/** The banner's width at most, CSS pixels, or this share of a narrower view; the slide's and the flares' seconds. */
const WIDTH = { most: 440, share: 0.75 } as const;
const SLIDE_S = 0.45;
const FLARE_S = 1.2;
const CHANCE_S = 1.6;

/** Whether a blink `period` seconds long stands in its dark half at `time`, as CSS's `steps(2, end)` blinks. */
export const blinkDark = (time: number, period: number): boolean => time % period >= period / 2;

/** A diamond `size` CSS pixels a side, filled and edged as said, with a glow of `glow` round it where one is given. */
export function diamondNode(size: number, fill: string, edge: string, glow: string | null = null): Node {
  const halo = glow ? `<path d="M10 0 20 10 10 20 0 10Z" fill="${glow}" opacity="0.45"/>` : '';
  return {
    width: size,
    height: size,
    picture: {
      key: `diamond ${fill} ${edge} ${glow ?? ''}`,
      source: {
        svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">${halo}<path d="M10 3 17 10 10 17 3 10Z" fill="${fill}" stroke="${edge}" stroke-width="1.5"/></svg>`,
      },
    },
  };
}

/** The banner as it stands: what it shows, how long since its last beat, and its bar, kept across frames so its
 *  slide plays once a beat and its bar eases as a vital's does. */
export class PublicBanner {
  private shown: Banner | null = null;
  private beat: BannerBeat | null = null;
  private time = 0;
  private beatAt = Number.NEGATIVE_INFINITY;
  private readonly meter = new Meter({ lossShown: false });

  /** Shows `banner`, or hides it for none, `seconds` after the last frame; a `beat` slides it in afresh and is read
   *  out on its own, never the ticking clocks. */
  update(banner: Banner | null, seconds: number, beat: BannerBeat | null = null): void {
    this.time += seconds;
    this.shown = banner;
    if (!banner) return;
    if (banner.bar) this.meter.set(banner.bar.share, seconds);
    if (!beat) return;
    [this.beat, this.beatAt] = [beat, this.time];
    const objective =
      beat === 'heroic' || beat === 'missed' || beat === 'chance' ? banner.heroic?.text : banner.objective;
    announce(`${banner.kicker}: ${banner.title}${objective ? `. ${objective}` : ''}`);
  }

  /** The tone the banner shows in, none while it is hidden. */
  get tone(): BannerTone | null {
    return this.shown?.tone ?? null;
  }

  /** The banner `room` CSS pixels of view wide at `zoom`: a dark band fading to its right, its tone down its left
   *  edge, words on the face's grid; between events one line. In a `short` view, two lines that stand clear of the
   *  crosshair: the result once over, the name, the heroic task and the clock, then the objective and its count. */
  node(room: number, zoom: number, short = false): Child {
    const banner = this.shown;
    if (!banner) return null;
    const tone = TONE_COLOURS[banner.tone];
    const still = motionReduced();
    const since = this.time - this.beatAt;
    const slid = still ? 1 : cubicBezier(0.2, 0.8, 0.3, 1, Math.min(1, Math.max(0, since / SLIDE_S)));
    const line = (text: Text, more: Partial<Node> = {}): Node => ({
      text: { size: zoom, colour: TONES.word, edge: 'halo', ...text },
      ...more,
    });
    const next = banner.tone === 'next';
    const clockColour = banner.urgent ? URGENT : TONES.word;
    const titleColour = banner.tone === 'won' || banner.tone === 'failed' ? tone : TONES.word;
    const clock = line({
      words: banner.clock,
      size: next ? zoom : 2 * zoom,
      colour: clockColour,
      wrap: false,
    });
    const kicker = line({ words: banner.kicker.toUpperCase(), colour: tone, tracking: 3.5, wrap: false });
    const title = line({
      words: banner.title,
      size: next ? zoom : 2 * zoom,
      colour: titleColour,
    });
    const urgentDark = !still && !!banner.urgent && blinkDark(this.time, 1);
    const heroicWords = (heroic: NonNullable<Banner['heroic']>) =>
      line({
        words: heroic.met ? heroic.text.toUpperCase() : `${heroic.text} ${heroic.clock}`,
        colour: heroic.met ? HEROIC : HEROIC_WORDS,
      });
    const rows: Child[] = next
      ? [
          {
            direction: 'row',
            wrap: true,
            gap: 10 * zoom,
            alignY: 'end',
            children: [kicker, title, { ...clock, opacity: urgentDark ? 0.35 : 1 }],
          },
          !!banner.elsewhere && line({ words: banner.elsewhere, colour: TONES.wordDim }),
        ]
      : short
        ? [
            {
              direction: 'row',
              width: 'grow',
              gap: 10 * zoom,
              alignY: 'end',
              children: [
                (banner.tone === 'won' || banner.tone === 'failed') && kicker,
                line({ words: banner.title, colour: titleColour }),
                banner.heroic && heroicWords(banner.heroic),
                { width: 'grow' },
                line({ words: banner.clock, colour: clockColour, wrap: false }, { opacity: urgentDark ? 0.35 : 1 }),
              ],
            },
            {
              direction: 'row',
              width: 'grow',
              gap: 10 * zoom,
              children: [
                line({ words: banner.objective }),
                { width: 'grow' },
                banner.bar && line({ words: banner.bar.label, colour: tone }),
              ],
            },
          ]
        : [
            {
              direction: 'row',
              width: 'grow',
              gap: 12 * zoom,
              alignY: 'end',
              children: [kicker, { width: 'grow' }, { ...clock, opacity: urgentDark ? 0.35 : 1 }],
            },
            {
              direction: 'row',
              wrap: true,
              gap: 10 * zoom,
              alignY: 'end',
              children: [
                title,
                banner.place !== '' && line({ words: banner.place, colour: TONES.wordDim, tracking: 1.8 }),
              ],
            },
            banner.objective !== '' && line({ words: banner.objective }, { padding: [3 * zoom, 0, 0, 0] }),
            banner.bar && this.barNode(banner.bar.label, tone, zoom),
            banner.heroic && this.heroicNode(banner.heroic, zoom, still),
            banner.bonus && bonusNode(banner.bonus, tone, zoom),
            !!banner.elsewhere && line({ words: banner.elsewhere, colour: TONES.wordDim }),
          ];
    return {
      // Short, its two lines take the whole share of the view, so neither wraps. The line between events (or between
      // an Elite Dungeon's seals) is as wide as its words, no wider than the banner.
      width: next ? 'fit' : Math.round((short ? WIDTH.share * room : Math.min(WIDTH.most, WIDTH.share * room)) * zoom),
      ...(next ? { maxWidth: Math.round(Math.min(WIDTH.most, WIDTH.share * room) * zoom) } : {}),
      direction: 'column',
      padding: next || short ? [4 * zoom, 12 * zoom, 4 * zoom, 10 * zoom] : [6 * zoom, 12 * zoom, 7 * zoom, 14 * zoom],
      outline: { width: zoom, colour: this.flare(tone, since, still) ?? TONES.outline },
      opacity: slid,
      offset: [0, Math.round(-10 * zoom * (1 - slid))],
      picture: {
        key: 'public banner band',
        source: {
          draw: (context, width, height) => {
            const band = context.createLinearGradient(0, 0, width, 0);
            band.addColorStop(0, 'rgba(8,9,12,0.86)');
            band.addColorStop(0.7, 'rgba(8,9,12,0.7)');
            band.addColorStop(1, 'rgba(8,9,12,0.35)');
            context.fillStyle = band;
            context.fillRect(0, 0, width, height);
          },
        },
      },
      children: [
        // The tone down its left edge.
        { width: 3 * zoom, height: 'grow', fill: this.chanceEdge(since, still) ?? tone, float: { at: [0, 0], z: 1 } },
        ...rows,
      ],
    };
  }

  /** The edge's colour while a beat's flare lasts: the tone at a heroic beat, a win or a coming event, orange as a
   *  heroic chance opens; none once it has faded, or with motion reduced. */
  private flare(tone: string, since: number, still: boolean): string | null {
    if (still || !this.beat) return null;
    const chance = this.beat === 'chance';
    const lasts = chance ? CHANCE_S : FLARE_S;
    if (!chance && !['heroic', 'won', 'soon'].includes(this.beat)) return null;
    return since < lasts ? (chance ? HEROIC : tone) : null;
  }

  /** The left edge turns orange for the first of a heroic chance's flare. */
  private chanceEdge(since: number, still: boolean): string | null {
    return !still && this.beat === 'chance' && since < CHANCE_S / 2 ? HEROIC : null;
  }

  private barNode(label: string, tone: string, zoom: number): Node {
    return {
      direction: 'row',
      width: 'grow',
      gap: 8 * zoom,
      alignY: 'center',
      padding: [4 * zoom, 0, 0, 0],
      children: [
        {
          ...thinBarNode({
            name: 'public',
            label,
            length: 0,
            height: 8,
            zoom,
            fill: (pen) => drawMeter(pen, this.meter, tone, 'faint'),
          }),
          width: 'grow',
        },
        { text: { words: label, size: zoom, colour: TONES.wordDim, edge: 'halo', wrap: false } },
      ],
    };
  }

  private heroicNode(heroic: NonNullable<Banner['heroic']>, zoom: number, still: boolean): Node {
    const dark = !still && !heroic.met && blinkDark(this.time, 0.8);
    return {
      direction: 'row',
      width: 'grow',
      gap: 8 * zoom,
      alignY: 'center',
      padding: [5 * zoom, 0, 0, 0],
      children: [
        { ...diamondNode(12 * zoom, HEROIC, TONES.outline, HEROIC), opacity: dark ? 0.35 : 1 },
        {
          text: {
            words: heroic.met ? heroic.text.toUpperCase() : heroic.text,
            size: zoom,
            colour: heroic.met ? HEROIC : HEROIC_WORDS,
            edge: 'halo',
            ...(heroic.met ? { tracking: 3.5 } : {}),
          },
        },
        { width: 'grow' },
        { text: { words: heroic.clock, size: zoom, colour: HEROIC_WORDS, edge: 'halo', wrap: false } },
      ],
    };
  }
}

/** The bonus: a diamond in the tone, filled once met; struck through and faded once lost; a warning of harm in red
 *  under a red diamond. */
function bonusNode(bonus: NonNullable<Banner['bonus']>, tone: string, zoom: number): Node {
  const lost = bonus.state === 'lost';
  const warns = bonus.state === 'warns';
  return {
    direction: 'row',
    gap: 8 * zoom,
    alignY: 'center',
    padding: [3 * zoom, 0, 0, zoom],
    ...(lost ? { opacity: 0.6 } : {}),
    children: [
      diamondNode(9 * zoom, warns ? URGENT : bonus.state === 'met' ? tone : 'none', warns ? URGENT : tone),
      {
        children: [
          { text: { words: bonus.text, size: zoom, colour: warns ? URGENT : TONES.wordDim, edge: 'halo' } },
          lost && {
            width: 'grow',
            height: zoom,
            fill: TONES.wordDim,
            float: { at: [0, 0.5], anchor: [0, 0.5], z: 1 },
          },
        ],
      },
    ],
  };
}

/** How wide a store's bar is and how tall, CSS pixels. */
const STORE_BAR = { width: 72, height: 7 } as const;
const STORE_FILL = '#e9b44c';
const STORE_STRUCK = '#e0483c';

/** A small bar over each store while a raid runs, its health, as a plate over a foe: gold, red and blinking while the
 *  store is under attack, faded once it is plundered. */
export class StoreBars {
  private readonly meters: Meter[] = [];
  private spots: readonly {
    readonly x: number;
    readonly y: number;
    readonly share: number;
    readonly struck: boolean;
    readonly meter: Meter;
  }[] = [];
  private time = 0;

  /** Lays a bar over each of `stores` where `project` puts the point over it (null off the screen). */
  update(
    stores: PublicShown['stores'],
    project: (point: readonly [number, number, number]) => { readonly x: number; readonly y: number } | null,
    seconds: number,
  ): void {
    this.time += seconds;
    while (this.meters.length < stores.length) this.meters.push(new Meter({ lossShown: true }));
    this.spots = stores.flatMap((store, index) => {
      const meter = this.meters[index];
      if (!meter) return [];
      meter.set(store.share, seconds);
      const spot = project([store.at[0], store.at[1], store.at[2] + STORE_BAR_OVER_M]);
      return spot ? [{ ...spot, share: store.share, struck: !!store.struck, meter }] : [];
    });
  }

  /** The bars this frame, each with its foot over its store, at `zoom`. */
  nodes(zoom: number): Node[] {
    const still = motionReduced();
    return this.spots.map(({ x, y, share, struck, meter }): Node => {
      const dark = struck && !still && blinkDark(this.time, 0.4);
      return {
        ...thinBarNode({
          name: 'store',
          label: `Store: ${Math.round(share * 100)}%`,
          length: STORE_BAR.width,
          height: STORE_BAR.height,
          zoom,
          fill: (pen) => drawMeter(pen, meter, struck ? STORE_STRUCK : STORE_FILL, 'pale'),
        }),
        ...(share <= 0 ? { opacity: 0.45 } : dark ? { opacity: 0.6 } : {}),
        float: { to: 'screen', anchor: [0.5, 1], x, y, z: 1 },
      };
    });
  }
}
