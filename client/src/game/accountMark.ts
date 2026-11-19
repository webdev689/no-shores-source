import { make } from '../editor/dom.ts';
import type { Account } from '../network/accounts.ts';
import type { Picture } from '../player/picture.ts';
import { pictureCanvas } from './gearDom.ts';
import { drawnBounds } from './iconFit.ts';

/** The portrait's size, its face drawn at whole pixels of the figure inside it. */
const PORTRAIT_PX = 42;
/** The share of a figure's height its head takes, from the top of what is drawn. */
const HEAD_SHARE = 0.2;

/** The head of a figure's picture: a square from the top of what is drawn, centred on its topmost rows; null for a
 *  picture with nothing drawn. */
export function headOf(picture: Picture): Picture | null {
  const bounds = drawnBounds(picture.width, picture.height, picture.pixels);
  if (!bounds) return null;
  const [, north, , height] = bounds;
  const side = Math.max(8, Math.round(height * HEAD_SHARE));
  // The head's middle is the middle of what is drawn in its own rows, clear of the arms and anything held.
  let [west, east] = [picture.width, -1];
  for (let row = north; row < Math.min(picture.height, north + Math.ceil(side / 2)); row++)
    for (let column = 0; column < picture.width; column++)
      if ((picture.pixels[(row * picture.width + column) * 4 + 3] ?? 0) > 0) {
        west = Math.min(west, column);
        east = Math.max(east, column);
      }
  const middle = east < 0 ? picture.width / 2 : (west + east + 1) / 2;
  const [left, top] = [Math.round(middle - side / 2), Math.max(0, north - 1)];
  const pixels = new Uint8ClampedArray(side * side * 4);
  for (let row = 0; row < side; row++)
    for (let column = 0; column < side; column++) {
      const [fromX, fromY] = [left + column, top + row];
      if (fromX < 0 || fromY < 0 || fromX >= picture.width || fromY >= picture.height) continue;
      const from = (fromY * picture.width + fromX) * 4;
      pixels.set(picture.pixels.subarray(from, from + 4), (row * side + column) * 4);
    }
  return { width: side, height: side, pixels };
}

/** Whether an account is kept anywhere (a username or Discord), rather than in this browser alone, as a guest's is. */
const keptAnywhere = (account: Account | null): boolean => !!account && (!!account.username || !!account.discord);

/**
 * The account's mark at the top right of the menu, after DFO's profile mark: a round well rimmed in brass with the
 * player's face in it (a hooded head and shoulders until their figure is drawn), and a gem on its rim, filled for an
 * account kept anywhere and hollow for a guest's. Pressed, it opens the account in Settings.
 */
export function accountMark(open: () => void): {
  readonly node: HTMLButtonElement;
  show(account: Account | null, figure: Picture | null): void;
} {
  const node = make('button', '', 'gear-profile');
  node.type = 'button';
  node.dataset['key'] = 'account-mark';
  const portrait = make('span', '', 'gear-portrait');
  portrait.setAttribute('aria-hidden', 'true');
  const gem = make('span', '', 'gear-profile-gem');
  gem.setAttribute('aria-hidden', 'true');
  node.append(portrait, gem);
  node.addEventListener('click', open);
  let drawnFrom: Picture | null | undefined;
  const show = (account: Account | null, figure: Picture | null) => {
    const kept = keptAnywhere(account);
    const name = account?.username ?? (account ? 'Guest' : 'Offline');
    const words = account ? (kept ? 'kept with this account' : 'kept in this browser') : 'not kept';
    node.setAttribute('aria-label', `Account: ${name}, your character ${words}. Open it in Settings.`);
    node.title = name;
    gem.textContent = kept ? '◆' : '◇';
    gem.classList.toggle('gear-on', kept);
    if (figure === drawnFrom) return;
    drawnFrom = figure;
    const head = figure ? headOf(figure) : null;
    portrait.replaceChildren(head ? pictureCanvas(head, PORTRAIT_PX) : make('span', '', 'gear-silhouette'));
  };
  show(null, null);
  return { node, show };
}
