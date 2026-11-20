// What the player gains, shown at the right of the screen as Destiny shows what is picked up: a row for each gain, its
// picture in a well of its rarity, its name and how many, sliding in and fading after a few seconds. A gain of the
// same as a row still shown adds to that row. It shows in play and over the menu alike, so a piece dismantled or a
// Vestige opened shows what it gave as soon as the room answers, and each batch chimes for its rarest gain.

import './acquired.css';
import { make } from '../editor/dom.ts';
import { RARITIES } from '../player/gear.ts';
import type { GearState } from '../network/gearMessages.ts';
import { ROLES } from '../plus/kit.ts';
import { emblemImage, emblemOf } from './emblemArt.ts';
import { type Gain, gainsOf } from './gains.ts';
import { glyphImage, itemIcon, rarityOf } from './gearDom.ts';
import type { GearHere } from './gearScreen.ts';
import type { ItemPictures } from '../player/itemPictures.ts';
import type { Cards } from '../player/cards.ts';
import { chime } from './uiSounds.ts';

/** How long a row stays, how long it takes to leave, and how many stand at once, the oldest leaving first. */
const STAY_MS = 4500;
const LEAVE_MS = 400;
const ROWS_MOST = 6;
/** How often the gear is looked at, in milliseconds. */
const LOOK_MS = 100;
/** How long after a room first gives the player's gear its changes are not gains: a room holds a starting character
 *  until the player's own is claimed, a claim waiting on another room for up to some seconds. */
const SETTLE_MS = 10_000;
/** A row's picture box, in pixels. */
const ICON_PX = 36;

/** A row shown: its gain so far, its count's words, and when it leaves. */
interface Row {
  readonly node: HTMLElement;
  readonly count: HTMLElement;
  total: number;
  timer: number;
}

/** Starts the feed in `root`, watching the gear `here` gives, its pieces drawn by `picturesOf`'s; the feed itself,
 *  which the menu leaves readable. */
export function startAcquiredFeed(
  root: HTMLElement,
  here: () => GearHere | null,
  picturesOf: (forge: Cards) => ItemPictures,
): HTMLElement {
  const feed = make('div', '', 'acquired');
  feed.setAttribute('role', 'log');
  feed.setAttribute('aria-label', 'Acquired');
  root.append(feed);
  const rows = new Map<string, Row>();
  let last: GearState | null = null;
  let since = 0;

  const leave = (key: string, row: Row) => {
    rows.delete(key);
    row.node.classList.add('acquired-leaving');
    window.setTimeout(() => row.node.remove(), LEAVE_MS);
  };
  const stay = (key: string, row: Row) => {
    window.clearTimeout(row.timer);
    row.timer = window.setTimeout(() => leave(key, row), STAY_MS);
  };
  /** A gain's picture: the item's own once drawn, its own picture, an emblem's icon, or its glyph. */
  const iconOf = (gain: Gain, row: () => HTMLElement | undefined): HTMLElement => {
    const now = here();
    if (gain.item) {
      const pictures = now?.forge ? picturesOf(now.forge) : null;
      const item = gain.item;
      const drawn = () => {
        const picture = pictures && now?.dress ? pictures.pictureOf(item, now.dress, () => swap()) : null;
        return itemIcon(picture, gain.name, ICON_PX);
      };
      // Drawn later, the picture takes its place in the row if the row is still there.
      const swap = () => row()?.querySelector('.acquired-icon')?.replaceChildren(drawn());
      return drawn();
    }
    if (gain.icon !== null) {
      const image = make('img', '', 'acquired-emblem');
      [image.src, image.alt] = [gain.icon, ''];
      return image;
    }
    if (gain.emblem !== null) {
      const image = make('img', '', 'acquired-emblem');
      image.src = emblemImage(emblemOf(gain.emblem), 'sign');
      image.alt = '';
      return image;
    }
    return glyphImage(gain.glyph === 'item' ? 'empty' : gain.glyph, gain.rarity ?? 0, gain.tint);
  };
  const show = (gain: Gain) => {
    const known = rows.get(gain.key);
    if (known) {
      known.total += gain.count;
      known.count.textContent = `+${known.total.toLocaleString()}`;
      // Brought back to the front, so the latest gain is the one read last, and the last to leave.
      feed.append(known.node);
      rows.delete(gain.key);
      rows.set(gain.key, known);
      known.node.classList.remove('acquired-bump');
      void known.node.offsetWidth;
      known.node.classList.add('acquired-bump');
      return stay(gain.key, known);
    }
    const node = make('div', '', 'acquired-row');
    const well = make('span', '', `acquired-icon ${ROLES.tile}`);
    rarityOf(well, gain.rarity);
    well.append(iconOf(gain, () => (node.isConnected ? node : undefined)));
    const name = make('span', gain.name, 'acquired-name');
    if (gain.rarity !== null) name.style.color = RARITIES[gain.rarity]?.colour ?? '';
    const count = make('b', gain.count > 1 || !gain.item ? `+${gain.count.toLocaleString()}` : '', 'acquired-count');
    node.append(well, name, count);
    feed.append(node);
    const row: Row = { node, count, total: gain.count, timer: 0 };
    rows.set(gain.key, row);
    stay(gain.key, row);
    // The oldest leaves once too many stand.
    const extra = [...rows].slice(0, Math.max(0, rows.size - ROWS_MOST));
    for (const [key, old] of extra) {
      window.clearTimeout(old.timer);
      leave(key, old);
    }
  };

  window.setInterval(() => {
    const gear = here()?.gear ?? null;
    // A room left or joined starts afresh: what it first says the player holds is not a gain, nor the character it
    // gives them once theirs is claimed.
    if (!gear || !last) {
      last = gear;
      since = performance.now();
      return;
    }
    if (gear === last) return;
    const gains = performance.now() - since < SETTLE_MS ? [] : gainsOf(last, gear);
    last = gear;
    if (gains.length === 0) return;
    gains.forEach(show);
    chime(Math.max(0, ...gains.map((each) => each.rarity ?? 0)));
  }, LOOK_MS);
  return feed;
}
