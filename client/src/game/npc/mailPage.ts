// The Postmaster's letters, where a keeper's wares stand (npcScreen.ts), drawn by the game: their count of the most
// kept at the heading's right, Take all under it, then every letter the game wrote, oldest first, each in a well: the
// tile of what it holds (an item's picture, a module's or a Vestige's glyph, framed in its rarity, its card under the
// pointer or the focus), its name and words (`letterWords`), and its Take press. A click or E on a letter's tile or
// press takes it. Where the column is narrow, as on a phone, a letter stands in one column. Nothing here judges a
// rule: the room refuses what there is no room for, and the menu's footer says why.
import { ASKS, type GearAsk, type GearState } from '../../network/gearMessages.ts';
import type { GearLetter } from '../../network/mailMessages.ts';
import { RARITIES, SLOTS } from '../../player/gear.ts';
import type { Child, Node } from '../../ui/node.ts';
import { cardFrame, cardName, cardNode, rarityTone } from '../gearCard.ts';
import { cardOf, wornFor } from '../gearCards.ts';
import {
  type Hint,
  INK,
  focusRing,
  glyphNode,
  itemIconNode,
  itemMarks,
  label,
  pressNode,
  tileLabel,
  tileNode,
  words,
} from '../gearNodes.ts';
import type { MenuContext } from '../menuPage.ts';
import { gearName, moduleGlyph } from '../shipGear.ts';
import type { KeeperLook } from './npcTiles.ts';

/** How many letters a mailbox keeps (the gear crate's `MAIL_MOST`). */
export const MAIL_MOST = 50;
/** A tile and its picture box, in pixels, as the inventory's cells are. */
const TILE = 64;
const TILE_PX = 48;
/** Narrower than this, in pixels, a letter stands in one column. */
const NARROW = 420;
const TAKE_HINTS: readonly Hint[] = [['Click / E', 'Take']];
/** Each source's words, by its name in the gear crate's `mail::Source` and in its numbers' order: where what a letter
 *  holds came from. */
export const FROM_WORDS = {
  LeftLying: 'You left this lying where it fell. It was picked up before it was lost.',
  LeftBehind: 'You left before you picked this up, so it was sent on.',
  Clear: 'Your reward for a first clear. Your ten Vestiges and the vault were full, so it came here.',
  Flotsam: 'Found in flotsam you gathered. You carried ten Vestiges, so it came here.',
  Salvage: 'Salvage you took. Its slot carried nine, so it came here.',
  Found: 'Something you found. Its slot carried nine and the vault was full, so it came here.',
  Gift: "A welcome gift from Overlook's keepers. Take it, and the Mage will open it for you.",
} as const;
const WORDS_BY_SOURCE: readonly string[] = Object.values(FROM_WORDS);
/** What a letter that tells of a letter a full mailbox let go adds. */
const CROWDED = 'Your mailbox was full, so the oldest letter holding the least was let go.';

/** A letter's words: where what it holds came from (a source a later room adds, in general words), and whether a
 *  full mailbox let a letter go as it came or after it. */
export function letterWords(letter: GearLetter): string {
  const words = WORDS_BY_SOURCE[letter.from] ?? 'This was sent on to you.';
  return letter.crowded ? `${words} ${CROWDED}` : words;
}

/** A letter as its row shows it: what it holds, named ("Rare Vestige", an item's own name, empty for nothing), its
 *  rarity, its words, and what taking it asks. */
export interface LetterRow {
  readonly letter: GearLetter;
  readonly holds: string;
  readonly words: string;
  readonly rarity: number | null;
  readonly take: GearAsk;
}

/** The letters waiting, oldest first, and what Take all asks while any waits. */
export function letterRows(gear: GearState): { readonly rows: readonly LetterRow[]; readonly takeAll: GearAsk | null } {
  const rows = (gear.mail ?? []).map((letter) => {
    const { item, vestige } = letter;
    const holds = item ? gearName(item) : vestige ? `${RARITIES[vestige.rarity]?.name ?? ''} Vestige` : '';
    return {
      letter,
      holds,
      words: letterWords(letter),
      rarity: item?.rarity ?? vestige?.rarity ?? null,
      take: { kind: ASKS.takeLetter, item: letter.id },
    };
  });
  return { rows, takeAll: rows.length > 0 ? { kind: ASKS.takeAllLetters } : null };
}

/** A letter's tile's id, and its Take press's. */
const tileId = (letter: GearLetter) => `letter-${letter.id}`;
const takeId = (letter: GearLetter) => `npc-take-${letter.id}`;
const holdsAny = (letter: GearLetter) => letter.item !== null || letter.vestige !== null;

/** The letters' presses as the keeper's screen moves the focus among them: their Take presses in one row, their tiles
 *  in another, so the focus on a letter taken goes to the same press of the letter after it, else the one before. */
export const letterPresses = (gear: GearState): string[][] => {
  const letters = gear.mail ?? [];
  return [letters.map(takeId), letters.filter(holdsAny).map(tileId)];
};

/** The letters asked for since the room last answered: the page is drawn each frame from the gear the room last sent,
 *  so a second press before its answer would ask for a letter already taken, and be refused. */
let asked = { answered: -1, letters: new Set<number>() };

/** Forgets the letters asked for as a screen opens: a room joined since counts its answers afresh, so an ask it never
 *  answered must not hold that letter back. */
export const mailOpened = (): void => void (asked = { answered: -1, letters: new Set() });

/** `ask` for `letters`, unless every one of them was asked for since the room last answered. */
function askOnce(context: MenuContext, letters: readonly number[], ask: GearAsk): void {
  const { answered } = context.gear;
  if (asked.answered !== answered) asked = { answered, letters: new Set() };
  if (letters.every((letter) => asked.letters.has(letter))) return;
  for (const letter of letters) asked.letters.add(letter);
  context.ask(ask);
}

/** A Vestige's card: its name, and the slot and level of what it holds. */
function vestigeCard(context: MenuContext, row: LetterRow, slot: number, level: number): Node {
  const { sizes } = context;
  const said = `For the ${SLOTS[slot] ?? ''}, level ${level}. Open it at the Mage.`;
  return cardFrame(
    sizes,
    rarityTone(row.rarity),
    [cardName(row.holds, row.rarity)],
    [{ width: 'grow', text: { words: said, size: sizes.label, colour: INK.faint } }],
    TAKE_HINTS,
  );
}

/** The tile of what a letter holds, in its rarity with its pips, its card under the pointer or the focus; none for a
 *  letter holding nothing. */
function heldTile(context: MenuContext, row: LetterRow): Node | null {
  const { ui, sizes } = context;
  const { item, vestige } = row.letter;
  if (!holdsAny(row.letter)) return null;
  const id = tileId(row.letter);
  // A module is no figure's to wear: its glyph stands for it, as on the ship's tab.
  const module = item ? moduleGlyph(item.kind) : null;
  context.card(id, () =>
    item
      ? cardNode(cardOf(item, wornFor(context.gear, item)), module ? null : context.picture(item), TAKE_HINTS, sizes)
      : vestigeCard(context, row, vestige?.slot ?? 0, vestige?.level ?? 0),
  );
  const icon = module
    ? glyphNode(module)
    : item
      ? itemIconNode(context.picture(item), row.holds, TILE_PX, sizes, item.rarity)
      : glyphNode('vestige', 36, row.rarity ?? 0);
  const { marks, gilded } = item ? itemMarks(item) : { marks: [], gilded: false };
  const pips = row.rarity === null ? '' : (RARITIES[row.rarity]?.pips ?? '');
  const lit = ui.hovered(id) || (ui.focused(id) && ui.keyFocused);
  return tileNode(TILE, row.rarity, lit ? 'lit' : 'rest', [icon], {
    id,
    press: true,
    keys: ['e'],
    label: tileLabel(row.holds, row.rarity, 'in the mail'),
    gilded,
    marks: [
      ...marks,
      pips !== '' && {
        text: { words: pips, colour: RARITIES[row.rarity ?? 0]?.colour ?? INK.word, edge: 'shadow' },
        float: { to: 'parent', clipped: true, anchor: [0, 1], at: [0, 1], x: 4, y: -5 },
      },
      ui.focused(id) && ui.keyFocused && focusRing(TILE, TILE),
    ],
  });
}

/** One letter in its well: its tile, its name in its rarity's colour and its words, and its Take press; in one column
 *  where `narrow`, its words the well's whole width and its press at its end. */
function letterNode(context: MenuContext, row: LetterRow, among: string, look: KeeperLook, narrow: boolean): Node {
  const { ui } = context;
  const { letter } = row;
  const [tile, take] = [tileId(letter), takeId(letter)];
  const keyed = [tile, take].some((id) => ui.keysOn(id).includes('e'));
  if (ui.clicked(tile) || ui.clicked(take) || keyed) askOnce(context, [letter.id], row.take);
  const found = row.rarity === null ? undefined : RARITIES[row.rarity];
  const name: Child = row.holds !== '' && {
    width: 'grow',
    text: { words: row.holds, size: look.text, colour: (row.rarity === 0 ? found?.colour : found?.lit) ?? INK.word },
  };
  const said: Node = { width: 'grow', text: { words: row.words, size: look.text, colour: INK.faint } };
  const press = pressNode(take, 'Take', 'button', '', look.text, {
    keys: ['e'],
    label: `Take ${row.holds || 'the letter'}, ${among}`,
  });
  const well = { role: 'well', width: 'grow', padding: [8, 11], gap: 11 } as const;
  return narrow
    ? {
        ...well,
        direction: 'column',
        children: [
          { width: 'grow', gap: 11, alignY: 'center', children: [heldTile(context, row), name] },
          said,
          { width: 'grow', alignX: 'end', children: [press] },
        ],
      }
    : {
        ...well,
        alignY: 'center',
        children: [
          heldTile(context, row),
          { width: 'grow', direction: 'column', gap: 3, children: [name, said] },
          press,
        ],
      };
}

/** The Postmaster's letters, in a column `width` pixels wide: their heading with their count of the most kept at its
 *  right, Take all while any waits, and each letter's well. */
export function mailPage(context: MenuContext, look: KeeperLook, width: number): Node {
  const { rows, takeAll } = letterRows(context.gear);
  const letters = rows.map((row) => row.letter.id);
  if (takeAll && context.ui.clicked('npc-take-all')) askOnce(context, letters, takeAll);
  return {
    width: 'grow',
    direction: 'column',
    gap: 11,
    children: [
      {
        width: 'grow',
        direction: 'column',
        gap: 4,
        label: `Letters, ${rows.length} of ${MAIL_MOST} kept`,
        children: [
          {
            width: 'grow',
            children: [
              { width: 'grow', children: [label('Letters', look.text)] },
              words(`${rows.length}/${MAIL_MOST}`, look.text, INK.faint),
            ],
          },
          { width: 'grow', height: 1, fill: 'rgba(163,152,128,0.26)' },
        ],
      },
      takeAll
        ? pressNode('npc-take-all', 'Take all', 'primary', '', look.text)
        : words('No letters wait for you.', look.text, INK.faint),
      ...rows.map((row, place) => letterNode(context, row, `${place + 1} of ${rows.length}`, look, width < NARROW)),
    ],
  };
}
