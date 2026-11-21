// A bounty as a tile and as a card, after Destiny's Bounty Tracker; the board's screen and the Journal's column both
// show them. A tile has no words: its mark says where the bounty counts and its look its state. The card says the
// rest: its name and kind, its words, its count, what it pays, and at the board its press.
import './bountyTiles.css';
import { make } from '../editor/dom.ts';
import { ROLES } from '../plus/kit.ts';
import type { BountyRow, Pay } from './bountyBoard.ts';
import { glyphImage } from './gearDom.ts';
import { type IconName, POOL_GROUNDS, iconImage, poolMarkUrl } from './journalIcons.ts';

/** Each pool's kind, as a card names it under the bounty's name, with its mark. */
export const BOUNTY_KINDS: readonly string[] = ['Land bounty', 'Sea bounty', 'Dungeon bounty'];
const KIND_MARKS: readonly IconName[] = ['land', 'sea', 'dungeon'];

/** A gauge of a count toward its target. */
function gauge(count: number, target: number): HTMLElement {
  const track = make('div', '', `bounty-gauge ${ROLES.track}`);
  const fill = make('div', '', ROLES.meter);
  fill.style.width = `${Math.round((100 * Math.min(count, target)) / Math.max(1, target))}%`;
  track.append(fill);
  return track;
}

/** A bounty's tile, sized by where it stands: its mark, and its state: open plain, taken with a gauge of its count,
 *  done with a gold edge, turned in dimmed with a tick. */
export function bountyTile(row: BountyRow): HTMLButtonElement {
  const tile = make('button', '', `bounty-tile bounty-tile-${row.state} bounty-pool-${row.pool} ${ROLES.tile}`);
  tile.type = 'button';
  tile.dataset['key'] = `bounty-${row.place}`;
  tile.style.backgroundColor = POOL_GROUNDS[row.pool] ?? '';
  const said = { open: 'Not taken', held: row.progress, done: 'Done', paid: 'Turned in' }[row.state];
  tile.setAttribute('aria-label', `${row.name}: ${row.words} ${said}`);
  const mark = make('img', '', 'bounty-tile-mark');
  [mark.src, mark.alt] = [poolMarkUrl(row.pool) ?? '', ''];
  tile.append(mark);
  if (row.state === 'held' || row.state === 'done') tile.append(gauge(row.count, row.target));
  if (row.state === 'paid') {
    const check = iconImage('taken', '', 24);
    check.classList.add('bounty-tile-check');
    tile.append(check);
  }
  return tile;
}

/** A bounty's card: its name, its kind under it by its mark, its words, a gauge with its count, what it pays (its XP,
 *  and its Aurem by the Aurem glyph), and `foot` (the board's press, or a word on its state). */
export function bountyCard(row: BountyRow, pay: Pay, foot: HTMLElement | null): HTMLElement {
  const card = make('div', '', `bounty-card ${ROLES.panel}`);
  card.dataset['key'] = 'bounty-card';
  card.classList.add(`bounty-card-${row.state}`);
  const kind = make('span', '', 'bounty-card-kind');
  kind.append(iconImage(KIND_MARKS[row.pool] ?? 'land', '', 24), make('span', BOUNTY_KINDS[row.pool] ?? ''));
  card.append(make('b', row.name, 'bounty-card-name'), kind, make('p', row.words, 'bounty-card-words'));
  const counted = make('div', '', 'bounty-card-count');
  counted.append(gauge(row.state === 'paid' ? row.target : row.count, row.target));
  counted.append(make('span', `${row.state === 'paid' ? row.target : row.count} / ${row.target}`));
  // What it pays, each by its glyph: XP by its letters, Aurem by its coin.
  const paid = make('p', '', 'bounty-card-pay');
  const aurem = glyphImage('aurem');
  [aurem.width, aurem.height, aurem.alt] = [24, 24, 'Aurem'];
  aurem.classList.add('journal-icon');
  for (const [image, amount] of [
    [iconImage('xp', 'XP', 24), pay.xp],
    [aurem, pay.aurem],
  ] as const) {
    const part = make('span', '', 'bounty-card-earn');
    part.append(image, make('span', `+${amount.toLocaleString()}`));
    paid.append(part);
  }
  card.append(counted, paid);
  if (foot) card.append(foot);
  return card;
}

/** Marks the tile of `place` as the one chosen, and no other. */
export function chooseTile(tiles: readonly HTMLElement[], place: number): void {
  for (const tile of tiles) tile.classList.toggle('bounty-tile-chosen', tile.dataset['key'] === `bounty-${place}`);
}

/** The arrows move the focus among tiles laid `perRow` a row; E presses the one focused. */
export function moveAmongTiles(tiles: readonly HTMLElement[], event: KeyboardEvent, perRow = 2): void {
  const focused = tiles.findIndex((tile) => tile === document.activeElement);
  if (focused < 0) return;
  const step = { arrowleft: -1, arrowright: 1, arrowup: -perRow, arrowdown: perRow }[event.key.toLowerCase()];
  if (event.key.toLowerCase() === 'e' && !event.repeat) tiles[focused]?.click();
  else if (step !== undefined) tiles[Math.min(tiles.length - 1, Math.max(0, focused + step))]?.focus();
  else return;
  event.preventDefault();
}
