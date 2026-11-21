// What the player gains, shown at the right of the screen as Destiny shows what is picked up: a row for each gain, its
// picture in a well of its rarity, its name and how many, sliding in and fading after a few seconds. A gain of the
// same as a row still shown adds to that row. It shows in play and over the menu alike, so a piece dismantled or a
// Vestige opened shows what it gave as soon as the room answers, and each batch chimes for its rarest gain.

import { edged } from '../combat/barDraw.ts';
import type { GearState } from '../network/gearMessages.ts';
import { RARITIES } from '../player/gear.ts';
import type { ItemPictures } from '../player/itemPictures.ts';
import type { Cards } from '../player/cards.ts';
import { motionReduced } from '../plus/kit.ts';
import { announce } from '../ui/announce.ts';
import type { Child, Node } from '../ui/node.ts';
import { emblemOf } from './emblemArt.ts';
import { type Gain, gainsOf } from './gains.ts';
import { fineGlyph } from './gearGlyphs.ts';
import {
  INK,
  emblemNode,
  glyphNode,
  itemIconNode,
  rarityEdges,
  rarityRgb,
  rgba,
  svgNode,
  words,
  type Sizes,
} from './gearNodes.ts';
import type { GearHere } from './gearScreen.ts';
import { chime } from './uiSounds.ts';

/** How long a row stays, how long it takes to come in and to leave, and how many stand at once, the oldest leaving
 *  first. */
const STAY_MS = 4500;
const ENTER_MS = 220;
const LEAVE_MS = 400;
const ROWS_MOST = 6;
/** How long after a room first gives the player's gear its changes are not gains: a room holds a starting character
 *  until the player's own is claimed, a claim waiting on another room for up to some seconds. */
const SETTLE_MS = 10_000;
/** A row's picture box and its well, in pixels. */
const ICON_PX = 36;
const WELL_PX = 44;

/** A row shown: its gain, its count so far, when it came, when its count last grew, and when it leaves. */
interface Row {
  readonly gain: Gain;
  readonly key: string;
  total: number;
  readonly since: number;
  bumped: number;
  leaves: number;
}

export class AcquiredFeed {
  private rows: Row[] = [];
  private last: GearState | null = null;
  private since = 0;
  private readonly here: () => GearHere | null;
  private readonly picturesOf: (forge: Cards) => ItemPictures;
  private readonly now: () => number;

  constructor(
    here: () => GearHere | null,
    picturesOf: (forge: Cards) => ItemPictures,
    now: () => number = () => performance.now(),
  ) {
    this.here = here;
    this.picturesOf = picturesOf;
    this.now = now;
  }

  /** Looks at the gear for what was gained since it last did. */
  look(): void {
    const gear = this.here()?.gear ?? null;
    // A room left or joined starts afresh: what it first says the player holds is not a gain, nor the character it
    // gives them once theirs is claimed.
    if (!gear || !this.last) {
      this.last = gear;
      this.since = this.now();
      return;
    }
    if (gear === this.last) return;
    const gains = this.now() - this.since < SETTLE_MS ? [] : gainsOf(this.last, gear);
    this.last = gear;
    if (gains.length === 0) return;
    gains.forEach((gain) => this.show(gain));
    chime(Math.max(0, ...gains.map((each) => each.rarity ?? 0)));
  }

  private show(gain: Gain): void {
    const now = this.now();
    const known = this.rows.find((row) => row.key === gain.key && row.leaves > now);
    announce(`${gain.name} +${gain.count.toLocaleString()}`);
    if (known) {
      known.total += gain.count;
      known.bumped = now;
      known.leaves = now + STAY_MS;
      // Brought back to the front, so the latest gain is the one read last, and the last to leave.
      this.rows = [...this.rows.filter((row) => row !== known), known];
      return;
    }
    this.rows.push({ gain, key: gain.key, total: gain.count, since: now, bumped: -Infinity, leaves: now + STAY_MS });
    // The oldest leaves once too many stand.
    const staying = this.rows.filter((row) => row.leaves > now);
    for (const old of staying.slice(0, Math.max(0, staying.length - ROWS_MOST))) old.leaves = Math.min(old.leaves, now);
  }

  /** A gain's picture: the item's own once drawn, an emblem's sign, a mark of its own, or its glyph. */
  private iconOf(gain: Gain, sizes: Sizes): Node {
    const now = this.here();
    if (gain.item) {
      const pictures = now?.forge ? this.picturesOf(now.forge) : null;
      const picture = pictures && now?.dress ? pictures.pictureOf(gain.item, now.dress, () => undefined) : null;
      return itemIconNode(picture, gain.name, ICON_PX, sizes, gain.rarity ?? 0);
    }
    if (gain.icon !== null) return svgNode(`gain ${gain.key}`, gain.icon, 24);
    if (gain.emblem !== null) return emblemNode(emblemOf(gain.emblem), 'sign', 24, 24, 24);
    const glyph = gain.glyph === 'item' ? 'empty' : gain.glyph;
    // A ship glyph's 24 cells stand at their own size, where the gear's 12 stand at three times.
    return glyphNode(glyph, fineGlyph(glyph) ? 24 : ICON_PX, gain.rarity ?? 0, gain.tint);
  }

  /** The feed this frame at the right of `view`: low over the menu's footer while it is open (`low`). */
  node(sizes: Sizes, view: { readonly width: number; readonly height: number }, low: boolean): Child {
    this.look();
    const now = this.now();
    this.rows = this.rows.filter((row) => now - row.leaves < LEAVE_MS);
    if (this.rows.length === 0) return null;
    const still = motionReduced();
    return {
      direction: 'column',
      alignX: 'end',
      gap: 6,
      float: {
        to: 'screen',
        anchor: [1, 1],
        at: [1, 1],
        x: -40,
        y: low ? -96 : -Math.round(view.height * 0.3),
        z: 30,
      },
      children: this.rows.map((row): Node => {
        const coming = Math.min(1, (now - row.since) / ENTER_MS);
        const going = Math.max(0, (now - row.leaves) / LEAVE_MS);
        const slide = still ? 0 : Math.round(32 * (1 - (1 - (1 - coming) ** 2)) + 16 * going);
        const fade = Math.min(coming, 1 - going);
        const rarity = row.gain.rarity;
        const pips = row.gain.pips ?? 0;
        const count = pips > 0 ? '' : row.total > 1 || !row.gain.item ? `+${row.total.toLocaleString()}` : '';
        return {
          minWidth: 240,
          gap: 12,
          alignY: 'center',
          padding: [4, 14, 4, 4],
          opacity: fade,
          offset: [slide, 0],
          picture: {
            key: 'acquired band',
            source: {
              draw: (context, width, height) => {
                const band = context.createLinearGradient(width, 0, 0, 0);
                band.addColorStop(0.6, 'rgba(14,11,8,0.82)');
                band.addColorStop(1, 'rgba(14,11,8,0)');
                context.fillStyle = band;
                context.fillRect(0, 0, width, height);
              },
            },
          },
          children: [
            { width: 'grow' },
            {
              maxWidth: 260,
              text: {
                words: row.gain.name,
                size: sizes.name,
                colour: rarity !== null ? (RARITIES[rarity]?.colour ?? INK.word) : INK.word,
                ellipsis: true,
                wrap: false,
                edge: 'shadow',
              },
            },
            count !== '' && {
              minWidth: 24,
              alignX: 'end',
              // A row's count grows a moment as more of it comes.
              offset: !still && now - row.bumped < ENTER_MS ? [0, -1] : undefined,
              children: [words(count, sizes.name, INK.brassLit, { edge: 'shadow' })],
            },
            pips > 0 && pipsNode(pips),
            {
              width: WELL_PX,
              height: WELL_PX,
              alignX: 'center',
              alignY: 'center',
              fill: INK.well,
              draw: edged(rarityEdges(rarity), 2),
              picture: {
                key: `acquired glow ${rarityRgb(rarity)}`,
                source: {
                  draw: (context, width, height) => {
                    const light = context.createRadialGradient(
                      width / 2,
                      height * 1.15,
                      0,
                      width / 2,
                      height * 1.15,
                      height * 0.9,
                    );
                    light.addColorStop(0, rgba(rarityRgb(rarity), 0.35));
                    light.addColorStop(1, rgba(rarityRgb(rarity), 0));
                    context.fillStyle = light;
                    context.fillRect(0, 0, width, height);
                  },
                },
              },
              children: [this.iconOf(row.gain, sizes)],
            },
          ],
        };
      }),
    };
  }
}

/** A chest's tier as four diamonds, so many filled in brass. */
function pipsNode(lit: number): Node {
  return {
    direction: 'row',
    gap: 3,
    alignY: 'center',
    children: [0, 1, 2, 3].map((place) => {
      const fill = place < lit ? INK.brassLit : 'none';
      return svgNode(
        `chest pip ${fill}`,
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M5 1 9 5 5 9 1 5Z" fill="${fill}" stroke="${INK.brassLit}" stroke-width="1.2"/></svg>`,
        10,
      );
    }),
  };
}
