// The one screen every keeper of a social space opens, after Destiny 1's vendors: the keeper large at the left over a
// ground lit in their colour, their mark and title above them; at the right their words, the currencies they deal in
// (and a faction's rank and its meter), the band they speak in, their wares in rows under engraved headings (the
// vault keeper's two sides of the vault in their place, the Postmaster's letters in theirs), and at the foot the time
// to the next stock, or to Shape's leaving. The menu (gearWindow.ts) frames it with its header and footer.
import type { GearAsk, GearState } from '../../network/gearMessages.ts';
import { ELEMENTS } from '../../player/gear.ts';
import { motionReduced } from '../../plus/kit.ts';
import type { Child, Node } from '../../ui/node.ts';
import { emblemOf, emblemPixels } from '../emblemArt.ts';
import { cardFrame, nameCard } from '../gearCard.ts';
import { type Hint, INK, glyphNode, rgba, svgNode, words } from '../gearNodes.ts';
import type { View } from '../gearScreen.ts';
import { KEEPERS, KEEPER_KINDS, type KeeperKind } from '../keepers.ts';
import type { MenuContext } from '../menuPage.ts';
import { vaultPage } from '../stationPages.ts';
import { clockWords, countdownsAt } from './npcClock.ts';
import { factionOf, rankRewards, reputationOf } from './factionRows.ts';
import { keeperFigure } from './npcFigure.ts';
import { letterPresses, mailOpened, mailPage } from './mailPage.ts';
import { keeperMarkSvg } from './npcMarks.ts';
import { type Asked, answeredWith } from './npcLines.ts';
import { hush, keeperSays, speechBand } from './npcSpeech.ts';
import { type KeeperLook, coinGlyph, meter, rowsNode } from './npcTiles.ts';
import { type Ware, purseOf, rowsOf } from './npcWares.ts';

/** The keepers whose wares change at each daily reset. */
const DAILY: readonly KeeperKind[] = ['armorsmith', 'weaponsmith', 'tailor', 'tack'];
/** The menu's brass, the ground of a keeper who serves no Art. */
const BRASS = '#c08a3e';
/** What the footer says the screen's keys do, as the references' footer does: the Mage's holds open a Vestige, and
 *  Escape steps back out of the Art's choice of fragments before it dismisses the screen. */
export const npcHints = (view: View): readonly Hint[] => [
  ['Hold', view === 'mage' ? 'Open' : 'Buy'],
  ['character', 'Open Character'],
  ['Esc', choosing ? 'Back' : 'Dismiss'],
];
/** Whether the screen shows the Art's choice of fragments, a step the footer steps back out of. */
export const npcChoosing = (): boolean => choosing;
/** The figure's height beside what the screen's body leaves it, and the least it is drawn at. */
const FIGURE_AROUND = 120;
const FIGURE_LEAST = 200;
/** A room narrower than this, in pixels, stands the keeper over the rest. */
const NARROW = 600;
/** The rows' own id, which scrolls where a screen is too short for them all. */
const ROWS = 'npc-rows';

/** Whether a view of the menu is a keeper's screen: every counter's, the vault's among them. */
export const isKeeperView = (view: View): view is KeeperKind => (KEEPER_KINDS as readonly string[]).includes(view);

/** Whether the Art's rise waits on its fragment. */
let choosing = false;
/** The press to focus on the next frame: the first fragment as the choice opens, the Rise as it closes, the Art once
 *  its rise is bought. */
let focusNext: 'first-rise' | string | null = null;
/** How many frames the focus has waited for its press. */
let focusWaited = 0;
/** The asks that wait on the room's answers: how many it had answered at the first, and how many were made. */
let pending: Asked | null = null;
/** The wares' presses, row by row, as last drawn, so the focus on one gone goes to the one beside it. */
let pressesShown: readonly (readonly string[])[] = [];

/** The screen opens at `view`: a keeper's greets the player; any other view hushes the last. */
export function npcOpened(view: View): void {
  [choosing, pending, focusNext, pressesShown] = [false, null, null, []];
  mailOpened();
  if (isKeeperView(view)) keeperSays(view, 'Hello');
  else hush();
}

/** Escape's step on the screen: out of the Art's choice of fragments, the focus back on its Rise; false with none. */
export function npcStepBack(): boolean {
  if (!choosing) return false;
  [choosing, focusNext, focusWaited] = [false, 'npc-rise', 0];
  return true;
}

/** The press to take the focus once `gone` is no longer drawn, nearest first: the one after it in its row, the one
 *  before, the next row's first, the row before's last. */
export function keyBeside(rows: readonly (readonly string[])[], gone: string): string | null {
  const found = rows.findIndex((row) => row.includes(gone));
  const row = rows[found];
  if (!row) return null;
  const place = row.indexOf(gone);
  const near = [row[place + 1], row[place - 1], rows[found + 1]?.[0], rows[found - 1]?.at(-1)];
  return near.find((key): key is string => key !== undefined) ?? null;
}

/** The keeper's colour: a faction's in its Art's element, else the menu's brass. */
function glowOf(kind: KeeperKind): string {
  const faction = KEEPERS[kind].faction;
  const element = faction === undefined ? 0 : (factionOf(faction)?.art.element ?? 0);
  return ELEMENTS[element]?.colour ?? BRASS;
}

/** `css` ("#rrggbb") as channels "r,g,b". */
const channels = (css: string) => [1, 3, 5].map((start) => parseInt(css.slice(start, start + 2), 16)).join(',');

/** The diamond by the keeper's title: a faction's emblem cut to the diamond its keepers' marks are drawn in and edged
 *  in their colour, else the keeper's own mark. */
function markOf(kind: KeeperKind, size: number, glow: string): Node {
  const faction = KEEPERS[kind].faction;
  const emblem = faction === undefined ? null : factionOf(faction)?.faction.emblem;
  if (!emblem) return svgNode(`keeper mark ${kind}`, keeperMarkSvg(kind), size);
  const shown = emblemOf(emblem);
  return {
    width: size,
    height: size,
    picture: {
      key: `keeper emblem ${shown.id} ${glow}`,
      source: {
        draw: (drawing, width, height) => {
          const pixels = emblemPixels(shown, 'sign');
          const own = new OffscreenCanvas(24, 24);
          own.getContext('2d')?.putImageData(new ImageData(pixels, 24), 0, 0);
          const diamond = () => {
            drawing.beginPath();
            drawing.moveTo(width / 2, 0);
            drawing.lineTo(width, height / 2);
            drawing.lineTo(width / 2, height);
            drawing.lineTo(0, height / 2);
            drawing.closePath();
          };
          drawing.save();
          diamond();
          drawing.clip();
          drawing.imageSmoothingEnabled = false;
          drawing.drawImage(own, 0, 0, width, height);
          drawing.restore();
          diamond();
          drawing.strokeStyle = glow;
          drawing.lineWidth = (2 * width) / size;
          drawing.stroke();
        },
      },
    },
  };
}

/** The currencies at the top right, and for a faction the rank, its meter and the reputation's details. */
function purseNode(context: MenuContext, kind: KeeperKind, look: KeeperLook): Node {
  const { sizes } = context;
  const purse: Node = {
    gap: 22,
    wrap: true,
    children: purseOf(kind, context.gear).map((coin, place): Node => {
      const id = `npc-coin-${place}`;
      // Its glyph alone does not name the currency: a card does on hover or focus.
      context.card(id, () => nameCard(sizes, coin.name));
      return {
        id,
        focusable: true,
        gap: 6,
        alignY: 'center',
        // The glyph says nothing to a screen reader, so the currency's name is read with its number.
        label: `${coin.amount.toLocaleString('en')} ${coin.name}`,
        children: [
          coin.glyph === 'shapes' ? coinGlyph('shapes') : glyphNode(coin.glyph, 22),
          words(coin.amount.toLocaleString('en'), 2, INK.word),
        ],
      };
    }),
  };
  const faction = KEEPERS[kind].faction;
  if (faction === undefined) return purse;
  const standing = reputationOf(faction, context.gear.standing);
  const id = 'npc-details';
  context.card(id, () =>
    cardFrame(
      sizes,
      { lit: INK.stoneHi, shade: INK.stoneLo, rgb: '154,144,121' },
      [{ width: 'grow', text: { words: 'Reputation', size: 2, colour: INK.word } }],
      ['Earned in the world while pledged to them and wearing their cape.', rankRewards(faction)].map((said): Node => ({
        width: 'grow',
        text: { words: said, size: sizes.label, colour: INK.faint },
      })),
    ),
  );
  return {
    direction: 'column',
    gap: 11,
    children: [
      purse,
      {
        width: 'grow',
        maxWidth: look.wide ? 880 : 572,
        gap: 11,
        alignY: 'center',
        children: [
          words(`Rank ${standing.rank}`, look.text, INK.word),
          { width: 'grow', children: [meter(standing.toNext, standing.words, look.glow, look)] },
          {
            id,
            press: true,
            role: 'button',
            label: 'Reputation details',
            padding: [4, 13],
            children: [words('Reputation details', look.text)],
          },
        ],
      },
    ],
  };
}

/** The foot's countdown, to the second: to the daily reset, or to Shape's leaving, by the rules' clock. */
function footNode(kind: KeeperKind, gear: GearState, look: KeeperLook, width: number): Node | null {
  const shape = kind === 'shape' ? gear.shape : null;
  if (!DAILY.includes(kind) && !shape) return null;
  const left = countdownsAt();
  return {
    role: 'well',
    width,
    padding: [6, 13],
    gap: 11,
    alignY: 'center',
    children: [
      { text: { words: (shape ? 'Leaves in' : 'Stock refresh').toUpperCase(), size: look.text, tracking: 2 } },
      words(left ? clockWords(shape ? left.shape : left.stock) : '', look.text, INK.word, { tracking: 2 }),
    ],
  };
}

/** The keeper `width` by `height`: their mark and title above them, the figure on a floor lit in their colour. */
function stageNode(context: MenuContext, kind: KeeperKind, look: KeeperLook, width: number, height: number): Node {
  const { forge, sizes } = context;
  const rgb = channels(look.glow);
  const figure = keeperFigure(
    kind,
    forge,
    Math.max(Math.min(FIGURE_LEAST, height - 44), height - FIGURE_AROUND),
    sizes.ratio,
    performance.now(),
    motionReduced(),
  );
  const mark = look.wide ? 63 : 42;
  return {
    width,
    height,
    clip: true,
    direction: 'column',
    alignX: 'center',
    alignY: 'end',
    picture: {
      key: `keeper ground ${rgb}`,
      source: {
        draw: (drawing, across, down) => {
          const ground = drawing.createLinearGradient(0, 0, 0, down);
          ground.addColorStop(0, '#08090c');
          ground.addColorStop(0.7, '#0e1013');
          ground.addColorStop(1, '#050608');
          drawing.fillStyle = ground;
          drawing.fillRect(0, 0, across, down);
          const glow = (x: number, y: number, wide: number, tall: number, alpha: number, reach: number) => {
            drawing.save();
            drawing.translate(x, y);
            drawing.scale(1, tall / wide);
            const light = drawing.createRadialGradient(0, 0, 0, 0, 0, wide);
            light.addColorStop(0, rgba(rgb, alpha));
            light.addColorStop(reach, rgba(rgb, 0));
            drawing.fillStyle = light;
            drawing.fillRect(-wide, -wide, 2 * wide, 2 * wide);
            drawing.restore();
          };
          // The keeper's light behind them, and the floor they stand on.
          glow(across / 2, down * 0.58, across * 0.6, down * 0.55, 0.34, 0.72);
          glow(
            across / 2,
            down - 11 * (down / height) - 22 * (down / height),
            across * 0.4,
            22 * (down / height),
            0.45,
            0.7,
          );
        },
      },
    },
    children: [
      {
        gap: 11,
        alignY: 'center',
        float: { to: 'parent', x: 22, y: 22 },
        children: [
          markOf(kind, mark, look.glow),
          words(KEEPERS[kind].title.toUpperCase(), look.wide ? 3 : 2, INK.word, { tracking: 2 }),
        ],
      },
      { padding: [0, 0, 22, 0], children: [figure] },
    ],
  };
}

/** A keeper's screen, drawn each frame from the gear the room last sent; `more` stands under the wares (a faction's
 *  muster of officers, `shipPages.ts`). */
export function npcPage(context: MenuContext, kind: KeeperKind, more: readonly Child[] = []): Node {
  const { ui, gear, room, sizes } = context;
  // The room's answer to the asks made here: thanks for a ware bought, a word for a price not met.
  const answer = pending ? answeredWith(pending, gear.answered, gear.answer) : undefined;
  if (answer !== undefined) {
    pending = null;
    // A rise bought from the choice of fragments takes its whole row away: the focus goes to the Art it raised.
    if (answer === 'Thanks' && choosing) [choosing, focusNext, focusWaited] = [false, 'npc-art', 0];
    if (answer) keeperSays(kind, answer);
  }
  const keeper = KEEPERS[kind];
  const look: KeeperLook = { glow: glowOf(kind), wide: sizes.name > 1 && sizes.label > 1, text: sizes.label };
  const waitFor = () =>
    (pending = pending ? { ...pending, asked: pending.asked + 1 } : { from: gear.answered, asked: 1 });
  const act = (ware: Ware) => {
    if (!ware.ask) return;
    waitFor();
    context.ask(ware.ask);
  };
  const open = () => {
    choosing = !choosing;
    [focusNext, focusWaited] = [choosing ? 'first-rise' : 'npc-rise', 0];
  };
  // In a room as narrow as a phone's the keeper stands over the rest, so neither side is too narrow to read.
  const narrow = room.width < NARROW;
  const stageWidth = narrow ? room.width : Math.floor((room.width * 2) / 5);
  const sideWidth = narrow ? room.width : room.width - stageWidth;
  // The vault keeper thanks the player for each thing put in or taken out, and the Postmaster for each letter taken,
  // as a keeper does for a ware.
  const thanked = { ...context, ask: (asked: GearAsk) => (waitFor(), context.ask(asked)) };
  const rows = kind === 'vault' || kind === 'mail' ? [] : rowsOf(kind, gear, choosing);
  const wares: Child[] =
    kind === 'vault'
      ? [vaultPage(thanked, look.text)]
      : kind === 'mail'
        ? [mailPage(thanked, look, sideWidth - 44)]
        : rowsNode(context, rows, look, act, open);
  // The focus on a ware or a letter gone (bought, taken, or its row closed) goes to the one beside it.
  const presses = kind === 'mail' ? letterPresses(gear) : rows.map((row) => row.wares.map((ware) => `npc-${ware.key}`));
  const focused = ui.focusedId;
  if (focused && !presses.flat().includes(focused) && pressesShown.flat().includes(focused)) {
    const beside = keyBeside(pressesShown, focused);
    if (beside && presses.flat().includes(beside)) ui.focusOn(beside);
  }
  pressesShown = presses;
  if (focusNext) {
    const wanted = focusNext === 'first-rise' ? presses.flat().find((key) => key.startsWith('npc-rise-')) : focusNext;
    // Asked for as a press opens the choice, it is found once the choice is drawn, a frame on; never later.
    if (wanted && presses.flat().includes(wanted)) [focusNext] = [null, ui.focusOn(wanted)];
    else if (++focusWaited > 1) focusNext = null;
  }
  const most = Math.min(look.wide ? 880 : 572, sideWidth - 44);
  const foot = footNode(kind, gear, look, most);
  return {
    width: room.width,
    height: room.height,
    direction: narrow ? 'column' : 'row',
    children: [
      stageNode(context, kind, look, stageWidth, narrow ? Math.floor(room.height / 3) : room.height),
      {
        width: sideWidth,
        height: 'grow',
        direction: 'column',
        gap: 11,
        padding: [11, 22],
        children: [
          // The keeper's words and what the player holds share a line, so the rows of wares have the most room.
          {
            width: 'grow',
            gap: 22,
            alignY: 'center',
            children: [
              { width: 'grow', text: { words: keeper.words, size: look.text, colour: INK.faint, wrap: true } },
              purseNode(context, kind, look),
            ],
          },
          speechBand(kind, look.glow, look.text, most),
          {
            id: ROWS,
            width: 'grow',
            height: 'grow',
            scroll: true,
            direction: 'column',
            gap: 11,
            children: wares,
          },
          ...more,
          foot,
        ],
      },
    ],
  };
}
