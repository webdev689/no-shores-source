// The menu's Compendium, drawn by the game, after Destiny's Collections and lore books: its front a grid of the lore's
// categories, each with its motif, its name and how many of its chapters are found; a category opened shows its books
// at the left, the book chosen in the middle with how much of it is found, the chapter chosen at the right, and the
// book's chapters numbered under them. What is found is the rules' word (the gear's `lore`); what is read is kept in
// this browser (`lore.ts`), and what is found and unread wears Destiny's small diamond, up to its category's tile.
import type { GearState } from '../../network/gearMessages.ts';
import type { Child, Node } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import { FOCUS, INK, type Sizes, words } from '../gearNodes.ts';
import { pixelNode } from '../journalIcons.ts';
import type { PlainContext } from '../menuPage.ts';
import type { Lore } from './lore.ts';
import { COVER, MOTIF_PIXELS, NEW_PIXELS, NEW_SVG, coverSvg, motifSvg } from './loreArt.ts';
import {
  type Block,
  type BookShown,
  type CategoryShown,
  type ChapterShown,
  blocksOf,
  heardOf,
  keyOf,
  spansOf,
} from './loreBook.ts';

/** What the Compendium reads: the last word of the character any room sent, as the Journal does. */
export interface CompendiumSource {
  kept(): GearState | null;
}

/** What the front says with no lore in the game, and a book's chapter not yet found. */
export const NO_LORE =
  'No lore has been found. The lore books you find in the world, on quests and in the story are kept here.';
export const UNFOUND_CHAPTER = 'This chapter has not been found.';
const UNFOUND_BOOK = 'Undiscovered';

/** A category's tile, its motif, and a cover in the list and chosen, CSS pixels, on a narrow menu and a wide one. */
const TILE = { narrow: [176, 168], wide: [224, 208] } as const;
const TILE_MOTIF = { narrow: 64, wide: 80 } as const;
const LIST_COVER = { narrow: 48, wide: 72 } as const;
const BIG_COVER = { narrow: 144, wide: 192 } as const;
/** How much wider than its cover the book chosen stands, CSS pixels. */
const CHOSEN_MARGIN = 48;
/** A chapter's number press, square. */
const NUMBER = 36;

/** The ids of the presses. */
export const categoryId = (id: string): string => `lore-category-${id}`;
export const bookId = (id: string): string => `lore-book-${id}`;
export const chapterId = (place: number): string => `lore-chapter-${place}`;
export const LORE_BACK = 'lore-back';

/** A cover's height for its width, as its pixels stand. */
const coverHeight = (width: number) => Math.round((width * COVER[1]) / COVER[0]);

/** Destiny's new diamond, floated at the top right of what it marks. */
function newMark(size: number): Node {
  return {
    float: { to: 'parent', anchor: [1, 0], at: [1, 0], x: -4, y: 4 },
    children: [pixelNode('lore new', NEW_SVG, NEW_PIXELS, size)],
  };
}

/** A bar of how much is found: its track, and its found share in brass. */
function foundBar(found: number, total: number, width: Node['width'] = 'grow'): Node {
  const share = total > 0 ? found / total : 0;
  return {
    width,
    height: 4,
    fill: 'rgba(6,7,9,0.8)',
    children: [share > 0 && { width: `${Math.round(share * 1000) / 10}%`, height: 4, fill: INK.brass }],
  };
}

/** A press's lit outline: brass while chosen, white while the keys' focus is on it. */
function edge(ui: Interface, id: string, chosen: boolean): Partial<Node> {
  if (ui.focused(id) && ui.keyFocused) return { outline: { width: 2, colour: FOCUS } };
  if (chosen || ui.hovered(id)) return { outline: { width: chosen ? 2 : 1, colour: INK.brass } };
  return {};
}

/** The Compendium: the category open (none on the front), the book and chapter chosen in it, and each frame's
 *  nodes. */
export class Compendium {
  private open: string | null = null;
  private book: string | null = null;
  private chapter: number | null = null;
  /** Where the focus goes once laid: into a category as it opens, back to its tile as it closes. */
  private focusing: string | null = null;
  private readonly source: CompendiumSource | null;
  private readonly lore: Lore | null;

  constructor(source: CompendiumSource | null, lore: Lore | null) {
    [this.source, this.lore] = [source, lore];
  }

  /** Escape's step back: from a category to the front. Answers whether it stepped. */
  back(): boolean {
    if (this.open === null) return false;
    this.focusing = categoryId(this.open);
    [this.open, this.book, this.chapter] = [null, null, null];
    return true;
  }

  /** Leaves a category for the front, as the Compendium is left. */
  reset(): void {
    [this.open, this.book, this.chapter, this.focusing] = [null, null, null, null];
  }

  /** The page: the front, or the category open. */
  page(plain: PlainContext): Node {
    const { ui, sizes, room } = plain;
    const found = this.source?.kept()?.lore ?? [];
    const shelf = this.lore?.shelf(found) ?? [];
    for (const category of shelf) if (ui.clicked(categoryId(category.def.id))) this.enter(category);
    if (ui.clicked(LORE_BACK)) this.back();
    const open = shelf.find((category) => category.def.id === this.open) ?? null;
    if (!open) this.open = null;
    const page = open ? this.category(ui, open, sizes, room) : this.front(ui, shelf, sizes);
    if (this.focusing && ui.boxOf(this.focusing)) [this.focusing] = [null, ui.focusOn(this.focusing)];
    return page;
  }

  /** Opens a category at its first book with a chapter unread, else its first found, at its first chapter unread,
   *  else its first found. */
  private enter(category: CategoryShown): void {
    const books = category.books;
    const book = books.find((each) => each.unread) ?? books.find((each) => each.found > 0) ?? books[0];
    this.open = category.def.id;
    this.book = book?.def.id ?? null;
    this.chapter = book ? firstChapter(book) : null;
    // A book found takes the focus; with none found, the way back, as a stone cover takes no press.
    this.focusing = book && book.found > 0 ? bookId(book.def.id) : LORE_BACK;
  }

  /** The front: "LORE" with how much of it is found, and a tile for each category; with no lore, why. */
  private front(ui: Interface, shelf: readonly CategoryShown[], sizes: Sizes): Node {
    const wide = sizes.name > 1;
    const [found, total] = shelf.reduce(([one, two], category) => [one + category.found, two + category.total], [0, 0]);
    const head: Node = {
      width: 'grow',
      gap: 10,
      alignY: 'center',
      padding: [0, 0, 8, 0],
      children: [
        words('LORE', 2, INK.word, { tracking: 3 }),
        total > 0 && {
          role: 'chip',
          padding: [1, 8],
          label: `${found} of ${total} found`,
          children: [words(`${found}/${total}`)],
        },
      ],
    };
    if (shelf.length === 0)
      return {
        id: 'compendium',
        width: 'grow',
        direction: 'column',
        children: [
          head,
          {
            width: 'grow',
            direction: 'column',
            alignX: 'center',
            gap: 18,
            padding: [56, 16, 24, 16],
            children: [
              {
                gap: 14,
                opacity: 0.32,
                children: ['lighthouse', 'bell', 'key'].map((motif) =>
                  pixelNode(`lore cover rest ${motif}`, coverSvg(INK.brass, motif, false), COVER, 64, coverHeight(64)),
                ),
              },
              { maxWidth: 460, text: { words: NO_LORE, colour: INK.faint, align: 'center' } },
            ],
          },
        ],
      };
    const [tileWidth, tileHeight] = wide ? TILE.wide : TILE.narrow;
    const tiles = shelf.map((category): Node => {
      const id = categoryId(category.def.id);
      const motif = motifSvg(category.def.motif, category.found === 0);
      const size = wide ? TILE_MOTIF.wide : TILE_MOTIF.narrow;
      return {
        id,
        press: true,
        role: 'tile',
        label: `${category.def.name}: ${category.found} of ${category.total} found${category.unread ? ', new' : ''}`,
        width: tileWidth,
        height: tileHeight,
        direction: 'column',
        alignX: 'center',
        gap: 8,
        padding: [16, 12, 12, 12],
        ...edge(ui, id, false),
        children: [
          motif !== null &&
            pixelNode(`lore motif ${category.def.motif} ${category.found === 0}`, motif, MOTIF_PIXELS, size),
          { height: 'grow' },
          {
            width: 'grow',
            alignX: 'center',
            children: [words(category.def.name, sizes.name, INK.word, { ellipsis: true })],
          },
          words(
            `${category.found}/${category.total}`,
            1,
            category.total > 0 && category.found === category.total ? INK.brassLit : INK.faint,
          ),
          foundBar(category.found, category.total),
          category.unread && newMark(10),
        ],
      };
    });
    return {
      id: 'compendium',
      width: 'grow',
      direction: 'column',
      gap: 10,
      children: [head, { width: 'grow', gap: 12, wrap: true, children: tiles }],
    };
  }

  /** A category open: its head with the way back, its books, the book chosen and its chapter, and its chapters'
   *  numbers. */
  private category(
    ui: Interface,
    category: CategoryShown,
    sizes: Sizes,
    room: { readonly width: number; readonly height: number },
  ): Node {
    const wide = sizes.name > 1;
    for (const book of category.books)
      if (book.found > 0 && ui.clicked(bookId(book.def.id)))
        [this.book, this.chapter] = [book.def.id, firstChapter(book)];
    const book = category.books.find((each) => each.def.id === this.book) ?? category.books[0] ?? null;
    for (const chapter of book?.chapters ?? [])
      if (chapter.found && ui.clicked(chapterId(chapter.place))) this.chapter = chapter.place;
    const chapter = book?.chapters[this.chapter ?? -1] ?? null;
    // A chapter is read as it is shown: its diamond goes, and its book's and category's with it.
    if (chapter?.found && !chapter.read) this.lore?.markRead(keyOf(chapter.book, chapter.def));
    const head: Node = {
      width: 'grow',
      gap: 10,
      alignY: 'center',
      padding: [0, 0, 8, 0],
      children: [
        {
          id: LORE_BACK,
          press: true,
          role: 'button',
          label: 'Back to the lore',
          padding: [2, 10],
          ...edge(ui, LORE_BACK, false),
          children: [words('‹ LORE', 1, INK.faint, { tracking: 2 })],
        },
        words(category.def.name.toUpperCase(), 2, INK.word, { tracking: 3 }),
        {
          role: 'chip',
          padding: [1, 8],
          label: `${category.found} of ${category.total} found`,
          children: [words(`${category.found}/${category.total}`)],
        },
      ],
    };
    const narrow = room.width < 900;
    return {
      id: 'compendium',
      width: 'grow',
      direction: 'column',
      gap: 10,
      children: [
        head,
        {
          width: 'grow',
          gap: 20,
          children: [
            this.books(ui, category.books, book, wide),
            // Narrow, the book chosen is named over its chapter rather than drawn large beside it, so all stays in view.
            !narrow && book && this.chosen(book, wide),
            {
              width: 'grow',
              direction: 'column',
              gap: 12,
              children: [
                narrow && book && this.named(book),
                this.reading(book, chapter, sizes, room),
                book && this.numbers(ui, book, chapter),
              ],
            },
          ],
        },
      ],
    };
  }

  /** The category's books, covers in rows of three: each found one a press, its diamond while a chapter of it is
   *  unread; one not found a plain stone cover that does nothing. */
  private books(ui: Interface, books: readonly BookShown[], chosen: BookShown | null, wide: boolean): Node {
    const width = wide ? LIST_COVER.wide : LIST_COVER.narrow;
    const covers = books.map((book): Node => {
      const id = bookId(book.def.id);
      const found = book.found > 0;
      return {
        id,
        press: found,
        disabled: !found,
        label: found
          ? `${book.def.name}: ${book.found} of ${book.def.chapters.length} found${book.unread ? ', new' : ''}`
          : UNFOUND_BOOK,
        width,
        height: coverHeight(width),
        ...(found ? edge(ui, id, book === chosen) : {}),
        children: [
          pixelNode(
            `lore cover ${book.def.id} ${found}`,
            coverSvg(book.def.cover.colour, book.def.cover.motif, found),
            COVER,
            width,
            coverHeight(width),
          ),
          book.unread && newMark(10),
        ],
      };
    });
    const rows: Child[] = [];
    for (let first = 0; first < covers.length; first += 3)
      rows.push({ gap: 8, children: covers.slice(first, first + 3) });
    return { id: 'lore-books', direction: 'column', gap: 8, children: rows };
  }

  /** The book chosen: its cover, its name, and how much of it is found. */
  private chosen(book: BookShown, wide: boolean): Node {
    const width = wide ? BIG_COVER.wide : BIG_COVER.narrow;
    const found = book.found > 0;
    return {
      // Wider than its cover, so a name of a few words takes two lines, not one a word.
      width: width + CHOSEN_MARGIN,
      direction: 'column',
      alignX: 'center',
      gap: 8,
      children: [
        pixelNode(
          `lore cover ${book.def.id} ${found}`,
          coverSvg(book.def.cover.colour, book.def.cover.motif, found),
          COVER,
          width,
          coverHeight(width),
        ),
        // Its name whole, on as many lines as it takes.
        {
          width: 'grow',
          text: { words: found ? book.def.name : UNFOUND_BOOK, size: 2, colour: INK.word, align: 'center' },
        },
        words(
          `${book.found}/${book.def.chapters.length}`,
          1,
          book.found === book.def.chapters.length ? INK.brassLit : INK.faint,
        ),
        foundBar(book.found, book.def.chapters.length, width),
      ],
    };
  }

  /** The book chosen, named on a line over its chapter: its name, how much of it is found, and a bar of it. */
  private named(book: BookShown): Node {
    const [found, total] = [book.found, book.def.chapters.length];
    return {
      width: 'grow',
      gap: 10,
      alignY: 'center',
      children: [
        { width: 'grow', ...words(found > 0 ? book.def.name : UNFOUND_BOOK, 2, INK.word, { ellipsis: true }) },
        words(`${found}/${total}`, 1, found === total ? INK.brassLit : INK.faint),
        foundBar(found, total, 96),
      ],
    };
  }

  /** The chapter chosen: its title and its words, scrolled within the room the page gives; one not found says so. */
  private reading(
    book: BookShown | null,
    chapter: ChapterShown | null,
    sizes: Sizes,
    room: { readonly height: number },
  ): Node {
    const said = chapter?.found ? blocksOf(chapter.def.text) : [];
    const height = Math.max(160, room.height - 160);
    // As tall as the book chosen beside it, so the page stands still from chapter to chapter.
    const tall = coverHeight(sizes.name > 1 ? BIG_COVER.wide : BIG_COVER.narrow) + 72;
    return {
      id: 'lore-reading',
      role: 'panel',
      // The keys' focus takes it, so a screen reader reads the chapter whole.
      focusable: chapter?.found === true,
      label: chapter?.found ? `${chapter.def.title}. ${heardOf(chapter.def.text)}` : undefined,
      width: 'grow',
      minHeight: Math.min(tall, height),
      direction: 'column',
      gap: 10,
      padding: 16,
      children: [
        chapter?.found
          ? { width: 'grow', text: { words: chapter.def.title, size: 2, colour: INK.brassLit } }
          : words(book && book.found > 0 ? UNFOUND_CHAPTER : UNFOUND_BOOK, 1, INK.faint, { wrap: true }),
        said.length > 0 && {
          id: 'lore-text',
          width: 'grow',
          maxHeight: height,
          scroll: true,
          direction: 'column',
          gap: 10,
          // At the names' size, larger on a large screen, as a page is read and not glanced at.
          children: said.map((block) => blockNode(block, sizes.name)),
        },
      ],
    };
  }

  /** The book's chapters by number: each found one a press, lit while it is shown, its diamond while unread; one not
   *  found dim, and does nothing. */
  private numbers(ui: Interface, book: BookShown, shown: ChapterShown | null): Node {
    return {
      id: 'lore-chapters',
      width: 'grow',
      gap: 6,
      wrap: true,
      children: book.chapters.map((chapter): Node => {
        const id = chapterId(chapter.place);
        const chosen = chapter === shown;
        const number = String(chapter.place + 1);
        return {
          id,
          press: chapter.found,
          disabled: !chapter.found,
          role: chosen ? 'primary' : 'button',
          label: chapter.found
            ? `Chapter ${number}: ${chapter.def.title}${chapter.read ? '' : ', new'}`
            : `Chapter ${number}, not found`,
          width: NUMBER,
          height: NUMBER,
          alignX: 'center',
          alignY: 'center',
          opacity: chapter.found ? 1 : 0.4,
          ...(chapter.found ? edge(ui, id, false) : {}),
          children: [words(number, 1, chosen ? INK.brassLit : INK.word), chapter.found && !chapter.read && newMark(8)],
        };
      }),
    };
  }
}

/** The chapter a book opens at: its first found and unread, else its first found, else its first. */
function firstChapter(book: BookShown): number {
  const chapter = book.chapters.find((each) => each.found && !each.read) ?? book.chapters.find((each) => each.found);
  return chapter?.place ?? 0;
}

/** A block of a chapter at `size`: its words; a document set in on a darker ground, as a page laid in the book; a
 *  break a short brass rule. */
function blockNode(block: Block, size: number): Node {
  if (block.kind === 'break')
    return { width: 'grow', alignX: 'center', padding: [6, 0], children: [{ width: 48, height: 2, fill: INK.brass }] };
  const text = { words: spansOf(block.words), size, colour: INK.word };
  if (block.kind === 'words') return { width: 'grow', text };
  return { width: 'grow', padding: [10, 14], fill: INK.well, outline: { width: 1, colour: INK.stoneLo }, text };
}
