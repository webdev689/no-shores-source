import type { Account } from '../network/accounts.ts';
import { drawnBounds } from '../player/iconFit.ts';
import type { Picture } from '../player/picture.ts';
import type { Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { pictureNode } from './gearNodes.ts';

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

/** Each figure's head, cut once. */
const heads = new WeakMap<Picture, Picture | null>();
const headFor = (figure: Picture): Picture | null => {
  if (!heads.has(figure)) heads.set(figure, headOf(figure));
  return heads.get(figure) ?? null;
};

/** The name the mark stands for: the player's, a guest's, or none while offline. */
export const markName = (account: Account | null): string => account?.username ?? (account ? 'Guest' : 'Offline');

/** Whether an account is kept anywhere (a username or Discord), rather than in this browser alone, as a guest's is. */
const keptAnywhere = (account: Account | null): boolean => !!account && (!!account.username || !!account.discord);

/**
 * The account's mark at the top right of the menu, after DFO's profile mark: a round well rimmed in brass with the
 * player's face in it (a hooded head and shoulders until their figure is drawn), and a gem on its rim, filled for an
 * account kept anywhere and hollow for a guest's. Pressed, it opens the account in Settings.
 */
export function accountMark(
  ui: Interface,
  account: Account | null,
  figure: Picture | null,
  open: () => void,
  ratio: number,
): Node {
  const kept = keptAnywhere(account);
  const name = markName(account);
  const words = account ? (kept ? 'kept with this account' : 'kept in this browser') : 'not kept';
  if (ui.clicked(MARK)) open();
  const lit = ui.hovered(MARK) || (ui.focused(MARK) && ui.keyFocused);
  const head = figure ? headFor(figure) : null;
  return {
    id: MARK,
    press: true,
    label: `Account: ${name}, your character ${words}. Open it in Settings.`,
    width: PORTRAIT_PX + 6,
    height: PORTRAIT_PX + 6,
    alignX: 'center',
    alignY: 'center',
    picture: {
      key: `account well ${lit}`,
      source: { draw: (context, width, height) => well(context, width, height, lit) },
    },
    children: [
      head ? { ...pictureNode(head, PORTRAIT_PX - 6, ratio), clip: true } : SILHOUETTE,
      {
        text: { words: kept ? '◆' : '◇', colour: kept ? '#f3cf86' : '#3a3f47', edge: 'shadow' },
        float: { to: 'parent', anchor: [1, 1], at: [1, 1], x: 4, y: 3 },
      },
    ],
  };
}

/** The mark's id, for its press and the focus given back to it. */
export const MARK = 'account-mark';

/** The round well rimmed in brass over an iron ring, darkening from its middle, as DFO's mark is drawn. */
function well(context: OffscreenCanvasRenderingContext2D, width: number, height: number, lit: boolean): void {
  const [middle, radius, unit] = [width / 2, width / 2, width / 48];
  context.fillStyle = '#3a3f47';
  context.beginPath();
  context.arc(middle, height / 2, radius, 0, Math.PI * 2);
  context.fill();
  const ground = context.createRadialGradient(middle, height * 0.38, 0, middle, height * 0.38, radius * 1.1);
  ground.addColorStop(0, '#1b2029');
  ground.addColorStop(0.72, '#0a0c11');
  context.fillStyle = lit ? '#f3cf86' : '#c08a3e';
  context.beginPath();
  context.arc(middle, height / 2, radius - 2 * unit, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = ground;
  context.beginPath();
  context.arc(middle, height / 2, radius - 5 * unit, 0, Math.PI * 2);
  context.fill();
}

/** A hooded head and shoulders, standing in for the player's face until their figure is drawn. */
const SILHOUETTE: Node = {
  width: PORTRAIT_PX - 6,
  height: PORTRAIT_PX - 6,
  picture: {
    key: 'account silhouette',
    source: {
      draw: (context, width, height) => {
        context.fillStyle = '#3a424d';
        context.beginPath();
        context.ellipse(width / 2, height * 0.36, width * 0.19, height * 0.2, 0, 0, Math.PI * 2);
        context.fill();
        context.beginPath();
        context.ellipse(width / 2, height * 0.88, width * 0.38, height * 0.3, 0, Math.PI, 0);
        context.fill();
      },
    },
  },
};
