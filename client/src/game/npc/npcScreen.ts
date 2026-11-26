// The one screen every keeper of a social space opens, after Destiny 2's vendor screen (keeperFrame.ts): the keeper
// large at the left, cut off below the waist, their role, name and a line about them at its foot; at the top right
// their crest (a faction's emblem and the player's reputation with it, or the keeper's own mark) and the currencies
// they deal in; under it the line they are saying, the quest they offer as an item (quests/questCard.ts) with Acquire,
// their wares in rows under engraved headings (the vault keeper's two sides of the vault in their place, the
// Postmaster's letters in theirs), and at the foot the time to the next stock, or to Shape's leaving. Speaking with
// them happens here: a word a quest asks of them is asked as the screen opens, and its lines said in it. The menu
// (gearWindow.ts) frames it with its header and footer.
import { ASKS, type GearAsk, type GearState } from '../../network/gearMessages.ts';
import { ELEMENTS } from '../../player/gear.ts';
import { motionReduced } from '../../plus/kit.ts';
import type { Child, Node } from '../../ui/node.ts';
import { emblemOf, emblemPixels } from '../../plus/emblemArt.ts';
import { cardFrame, nameCard } from '../gearCard.ts';
import { type Hint, INK, focusRing, glyphNode, svgNode, words } from '../gearNodes.ts';
import type { View } from '../gearScreen.ts';
import { KEEPER_KINDS, type KeeperKind, keeperOf } from '../keepers.ts';
import type { MenuContext } from '../menuPage.ts';
import { COUNTERS, offeredAt, talkAt, trackedOf } from '../quests/questBook.ts';
import { questCardNode, questStoryNode, questTileNode, storyLines } from '../quests/questCard.ts';
import { vaultPage } from '../stationPages.ts';
import { clockWords, countdownsAt } from './npcClock.ts';
import { factionOf, rankRewards, reputationOf } from './factionRows.ts';
import { FIGURE_KEPT, bodyWidth, crestNode, figureHeight, keeperFrame, stageOf } from './keeperFrame.ts';
import { type FigureKind, keeperFigure } from './npcFigure.ts';
import { letterPresses, mailOpened, mailPage } from './mailPage.ts';
import { keeperMarkSvg } from './npcMarks.ts';
import { type Asked, answeredWith, nameOf } from './npcLines.ts';
import { hush, keeperSays, sayInScreen, screenOpened, speechBand } from './npcSpeech.ts';
import { type KeeperLook, coinGlyph, rowsNode } from './npcTiles.ts';
import { type Ware, purseOf, rowsOf } from './npcWares.ts';

/** The keepers whose wares change at each daily reset. */
const DAILY: readonly KeeperKind[] = ['armorsmith', 'weaponsmith', 'tailor', 'tack'];
/** The menu's brass, the ground of a keeper who serves no Art. */
const BRASS = '#c08a3e';
/** Whether the keeper whose screen is open offers a quest waiting to be acquired, so the footer offers Acquire. */
let offerWaiting = false;
/** What the footer says the screen's keys do, as the references' footer does: a quest waiting is acquired by a click,
 *  the Mage's holds open a Vestige, and Escape steps back out of the Art's choice of fragments before it dismisses
 *  the screen. */
export const npcHints = (view: View): readonly Hint[] => [
  ...(offerWaiting ? ([['Click', 'Acquire']] as const) : []),
  ['Hold', view === 'mage' ? 'Open' : 'Buy'],
  ['character', 'Open Character'],
  ['Esc', choosing ? 'Back' : 'Dismiss'],
];
/** Whether the screen shows the Art's choice of fragments, a step the footer steps back out of. */
export const npcChoosing = (): boolean => choosing;
/** The rows' own id, which scrolls where a screen is too short for them all; and Acquire's. */
const ROWS = 'npc-rows';
const ACQUIRE = 'npc-acquire';
/** The acquired quest's tile, and whether a tap or a press has opened its card in the rows. */
const QUEST_TILE = 'npc-quest';
let questOpen = false;

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
/** Whether the screen open has greeted the player, and how many frames a quest waiting to be acquired has shown:
 *  Acquire takes the focus on its second, once it has been laid. */
let greeted = false;
let offerShown = 0;

/** The screen opens at `view`: a keeper's (the Harbourmaster's among them) is spoken in, and greets the player on its
 *  first frame (`greet`); any other view hushes the last. */
export function npcOpened(view: View): void {
  [choosing, pending, focusNext, pressesShown, greeted, offerWaiting, offerShown, questOpen] = [
    false,
    null,
    null,
    [],
    false,
    false,
    0,
    false,
  ];
  mailOpened();
  hush();
  if (keeperOf(view)) screenOpened(view);
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
function glowOf(kind: FigureKind): string {
  const faction = keeperOf(kind)?.faction;
  const element = faction === undefined ? 0 : (factionOf(faction)?.art.element ?? 0);
  return ELEMENTS[element]?.colour ?? BRASS;
}

/** The diamond of the keeper's crest: a faction's emblem cut to the diamond its keepers' marks are drawn in and edged
 *  in their colour, else the keeper's own mark. */
function markOf(kind: FigureKind, size: number, glow: string): Node {
  const faction = keeperOf(kind)?.faction;
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

/** The currencies the keeper deals in, each its glyph and the player's count, named by a card on hover or focus. */
function coinsNode(context: MenuContext, kind: FigureKind, text: number): Node {
  const { sizes, gear } = context;
  const coins =
    kind === 'harbourmaster' ? [{ glyph: 'aurem', amount: gear.aurem, name: 'Aurem' } as const] : purseOf(kind, gear);
  return {
    gap: text > 1 ? 28 : 18,
    wrap: true,
    alignX: 'end',
    children: coins.map((coin, place): Node => {
      const id = `npc-coin-${place}`;
      // Its glyph alone does not name the currency: a card does on hover or focus.
      context.card(id, () => nameCard(sizes, coin.name));
      return {
        id,
        focusable: true,
        gap: 8,
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
}

/** The crest at the top right: a faction's emblem in its diamond, the player's rank and reputation with it as the bar
 *  running from it (its details in a card on the emblem's hover or focus); a keeper of no faction their own mark and a
 *  plain rule, as the room keeps no standing with them; the currencies under it. */
function crestOf(context: MenuContext, kind: FigureKind, glow: string, width: number): Node {
  const { sizes, gear } = context;
  const text = sizes.label;
  const size = text > 1 ? 76 : 56;
  const coins = coinsNode(context, kind, text);
  const faction = keeperOf(kind)?.faction;
  if (faction === undefined)
    return crestNode(markOf(kind, size, glow), { share: null, named: '' }, coins, glow, width, text);
  const standing = reputationOf(faction, gear.standing);
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
  const emblem: Node = {
    id,
    focusable: true,
    label: `Rank ${standing.rank}, ${standing.words}. Reputation details`,
    children: [markOf(kind, size, glow)],
  };
  const bar = { share: standing.toNext, named: `Reputation  Rank ${standing.rank}`, said: standing.words };
  return crestNode(emblem, bar, coins, glow, width, text);
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

/** What the keeper says as their screen first shows the player's gear: for a quest they offer waiting to be acquired,
 *  its story (but a quest's begin, which the roads say as it begins); for a word a quest asks of them, the ask, its
 *  lines said here as the room meets it; else their greeting. */
function greet(context: MenuContext, kind: FigureKind): void {
  greeted = true;
  const state = context.gear.quest;
  const offered = offeredAt(state, kind);
  const speaker = keeperOf(kind)?.speaker ?? '';
  if (offered && !offered.acquired) {
    const story = offered.offer.story;
    if (story !== offered.quest.begin) sayInScreen(storyLines(offered.offer).map((say) => ({ who: speaker, say })));
    return;
  }
  const column = COUNTERS[kind];
  if (column !== undefined && talkAt(state, kind)) return context.ask({ kind: ASKS.speakWith, column });
  keeperSays(kind, 'Hello');
}

/** The quest the keeper offers, `width` wide: its card with its objectives (Acquire at its foot while it waits), its
 *  tile framed in gold, and its story; none while they offer none now. Acquire asks the room (ask 85). */
function offerNode(
  context: MenuContext,
  kind: FigureKind,
  width: number,
  narrow: boolean,
  ask: MenuContext['ask'],
  body: readonly Child[],
): { readonly rows: readonly Child[]; readonly tile: Node | null } {
  const { ui, gear, sizes } = context;
  const text = sizes.label;
  const offered = offeredAt(gear.quest, kind);
  offerWaiting = offered !== null && !offered.acquired;
  // A card opened by the tile shuts with its quest, so the next one acquired here shows as a tile.
  if (!offered?.acquired) questOpen = false;
  if (!offered || !gear.quest) return { rows: body, tile: null };
  const column = COUNTERS[kind];
  // Asked once until the room answers, as a ware is bought once.
  if (offerWaiting && column !== undefined && ui.clicked(ACQUIRE) && !pending) ask({ kind: ASKS.acquire, column });
  // Acquire takes the focus once it has been laid, so the keys and the pad reach it first.
  if (offerWaiting && ++offerShown === 2) ui.focusOn(ACQUIRE);
  const steps = trackedOf({ ...gear.quest, offered: 0 })?.steps ?? [];
  const keeper = nameOf(keeperOf(kind)?.speaker ?? '');
  const cardWidth = narrow ? width : Math.min(text > 1 ? 600 : 440, Math.floor(width * 0.55));
  const card = questCardNode({ ...offered, steps, keeper }, cardWidth, text, ACQUIRE, ui);
  if (offered.acquired) {
    // The tile's press turns its card first, so the card follows on the frame it was pressed.
    const tile = acquiredTile(context, offered, card);
    return { rows: [questOpen && { id: `${QUEST_TILE}-card`, width: 'grow', children: [card] }, ...body], tile };
  }
  const tile = questTileNode(offered.quest, offered.offer, text > 1 ? 104 : 76);
  const gap = text > 1 ? 28 : 18;
  // Pages laid for the column's whole width (the vault's, the mail's, the Harbourmaster's) stand under the card.
  if (narrow || kind === 'vault' || kind === 'mail' || kind === 'harbourmaster')
    return {
      tile: null,
      rows: [
        {
          width: 'grow',
          direction: 'column',
          gap,
          children: [
            card,
            { gap, children: [tile, questStoryNode(offered.quest, offered.offer, width - 76 - gap, 1)] },
          ],
        },
        ...body,
      ],
    };
  // The card leads; the story, its tile and then the wares stand beside it, so the wares show while it is offered.
  return {
    tile: null,
    rows: [
      {
        width: 'grow',
        gap,
        children: [
          card,
          {
            width: 'grow',
            direction: 'column',
            gap,
            children: [questStoryNode(offered.quest, offered.offer, width - cardWidth - gap, text), tile, ...body],
          },
        ],
      },
    ],
  };
}

/** The quest acquired, stepped aside so the wares lead: its small tile framed in gold with its name and "Acquired",
 *  as Destiny's vendor keeps a quest it gave. Its card floats beside it where the pointer or the keys rest on it; a
 *  tap or a press opens it in the rows instead, as a phone has no pointer, and a second closes it. */
function acquiredTile(context: MenuContext, offered: NonNullable<ReturnType<typeof offeredAt>>, card: Node): Node {
  const { ui, sizes } = context;
  const text = sizes.label;
  const size = text > 1 ? 64 : 48;
  if (ui.clicked(QUEST_TILE)) questOpen = !questOpen;
  if (!questOpen) context.card(QUEST_TILE, () => card);
  const lit = ui.hovered(QUEST_TILE) || (ui.focused(QUEST_TILE) && ui.keyFocused);
  return {
    id: QUEST_TILE,
    press: true,
    label: `${offered.quest.name}, acquired. ${questOpen ? 'Close' : 'Open'} its card`,
    gap: text > 1 ? 14 : 10,
    alignY: 'center',
    children: [
      {
        children: [
          questTileNode(offered.quest, offered.offer, size),
          ui.focused(QUEST_TILE) && ui.keyFocused && focusRing(size, size),
        ],
      },
      {
        direction: 'column',
        gap: 4,
        children: [
          words(offered.quest.name.toUpperCase(), text, lit ? INK.word : 'rgba(239,232,214,0.86)', { tracking: 2 }),
          words('Acquired', text, INK.faint),
        ],
      },
    ],
  };
}

/** A keeper's screen in the frame (keeperFrame.ts): their figure, name and crest, then the line they say, the quest
 *  they offer, and `body` in a scroll of its own, `foot` under it. The Harbourmaster's counter stands in it too.
 *  Acquire asks through `ask`, so a page that waits on the room's answer hears it as it does a ware's. */
export function keeperScreen(
  context: MenuContext,
  kind: FigureKind,
  body: readonly Child[],
  foot: Child = null,
  ask: MenuContext['ask'] = context.ask,
): Node {
  const { room, sizes, forge } = context;
  if (!greeted) greet(context, kind);
  const keeper = keeperOf(kind);
  const text = sizes.label;
  const glow = glowOf(kind);
  const stage = stageOf(room);
  const width = bodyWidth(room, text);
  const figure = keeperFigure(
    kind,
    forge,
    figureHeight(room),
    sizes.ratio,
    performance.now(),
    motionReduced(),
    FIGURE_KEPT,
  );
  const offer = offerNode(context, kind, width, stage.narrow, ask, body);
  // An acquired quest's tile shares the top row only while the crest beside it keeps its least width (its emblem, a
  // bar and the purse); else it stands under the crest, as on a phone.
  const [crestMost, crestLeast, tileRoom] = text > 1 ? [760, 280, 420] : [520, 200, 300];
  const beside = offer.tile !== null && !stage.narrow && width - tileRoom >= crestLeast;
  return keeperFrame(room, text, {
    glow,
    figure,
    role: keeper?.role ?? '',
    name: nameOf(keeper?.speaker ?? ''),
    about: keeper?.words ?? '',
    speech: speechBand(kind, glow, stage.narrow ? 1 : text, stage.width - (stage.narrow ? 32 : text > 1 ? 96 : 64)),
    // Narrower beside an acquired quest's tile, so the two share the row.
    crest: crestOf(context, kind, glow, Math.min(width - (beside ? tileRoom : 0), crestMost)),
    quest: offer.tile,
    questUnder: !beside,
    body: [
      {
        id: ROWS,
        width: 'grow',
        height: 'grow',
        scroll: true,
        direction: 'column',
        gap: text > 1 ? 22 : 14,
        children: offer.rows,
      },
      foot,
    ],
  });
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
  const width = bodyWidth(room, sizes.label);
  // The vault keeper thanks the player for each thing put in or taken out, and the Postmaster for each letter taken,
  // as a keeper does for a ware.
  const thanked = { ...context, ask: (asked: GearAsk) => (waitFor(), context.ask(asked)) };
  const rows = kind === 'vault' || kind === 'mail' ? [] : rowsOf(kind, gear, choosing);
  const wares: Child[] =
    kind === 'vault'
      ? [vaultPage(thanked, look.text)]
      : kind === 'mail'
        ? [mailPage(thanked, look, width)]
        : rowsNode(context, rows, look, act, open);
  // The focus on a ware or a letter gone (bought, taken, or its row closed) goes to the one beside it; on Acquire,
  // a row of its own over them while a quest waits, to the first under it once acquired.
  const offered = offeredAt(gear.quest, kind);
  const presses = [
    // Acquire over the wares while a quest waits; once acquired its tile, so a focus on it is not lost when it is done.
    ...(offered ? [[offered.acquired ? QUEST_TILE : ACQUIRE]] : []),
    ...(kind === 'mail' ? letterPresses(gear) : rows.map((row) => row.wares.map((ware) => `npc-${ware.key}`))),
  ];
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
  return keeperScreen(context, kind, [...wares, ...more], footNode(kind, gear, look, width), thanked.ask);
}
