// The lore as the page reads it (content/lore/lore.json): its categories, its books and their chapters, numbered as the
// wire numbers them, book by book in the file's order; and what a player has found of it, by the numbers their gear
// gives. The rules (crates/gear/src/lore.rs) judge where each chapter is found; the page only shows it.
import file from '../../../../content/lore/lore.json' with { type: 'json' };
import type { Span } from '../../ui/node.ts';

/** Where a chapter is found, as the file says: in a Breach, at the find its rules name (crates/gear/src/lore.rs). */
export type Found =
  | { readonly kind: 'story' }
  | { readonly kind: 'quest'; readonly quest: string; readonly task: string }
  | { readonly kind: 'breach'; readonly breach: string; readonly find: string }
  | {
      readonly kind: 'place';
      readonly node: string;
      readonly place: string;
      readonly bearing?: number;
      readonly at?: number;
    };

export interface ChapterDef {
  readonly id: string;
  readonly title: string;
  readonly text: string;
  readonly found: Found;
}

export interface BookDef {
  readonly id: string;
  readonly category: string;
  readonly name: string;
  /** Its cover: the cloth's colour (`#rrggbb`) and the motif on it (emblemMotifs.ts). */
  readonly cover: { readonly colour: string; readonly motif: string };
  readonly chapters: readonly ChapterDef[];
}

export interface CategoryDef {
  readonly id: string;
  readonly name: string;
  /** The motif on its tile (emblemMotifs.ts). */
  readonly motif: string;
}

export interface LoreFile {
  readonly categories: readonly CategoryDef[];
  readonly books: readonly BookDef[];
}

/** The lore in the repository. */
export const LORE: LoreFile = file as unknown as LoreFile;

/** A chapter as shown: its book, its place in it (from 0), its number on the wire, and whether the player has found
 *  and read it. */
export interface ChapterShown {
  readonly def: ChapterDef;
  readonly book: BookDef;
  readonly place: number;
  readonly number: number;
  readonly found: boolean;
  readonly read: boolean;
}

/** A book as shown: its chapters, how many are found, and whether one found is unread. */
export interface BookShown {
  readonly def: BookDef;
  readonly chapters: readonly ChapterShown[];
  readonly found: number;
  readonly unread: boolean;
}

/** A category as shown: its books, how many of their chapters are found of how many, and whether one is unread. */
export interface CategoryShown {
  readonly def: CategoryDef;
  readonly books: readonly BookShown[];
  readonly found: number;
  readonly total: number;
  readonly unread: boolean;
}

/** Every chapter of `lore`, book by book in the file's order, which the wire numbers them by: its book and itself. */
const flat = new WeakMap<LoreFile, readonly { readonly book: BookDef; readonly chapter: ChapterDef }[]>();
export function chaptersOf(lore: LoreFile = LORE): readonly { readonly book: BookDef; readonly chapter: ChapterDef }[] {
  // Laid out once a file: the menu's tab asks it for each chapter found, every frame.
  const kept = flat.get(lore) ?? lore.books.flatMap((book) => book.chapters.map((chapter) => ({ book, chapter })));
  flat.set(lore, kept);
  return kept;
}

/** A chapter's key, as characters keep it and the browser keeps it read: its book's id and its own. */
export const keyOf = (book: BookDef, chapter: ChapterDef): string => `${book.id}/${chapter.id}`;

/** The lore as a player has found it: each category with its books and chapters, `found` the chapters' numbers their
 *  gear gives, `read` whether the browser keeps a chapter read, by its key. */
export function shelfOf(
  found: readonly number[],
  read: (key: string) => boolean,
  lore: LoreFile = LORE,
): CategoryShown[] {
  const had = new Set(found);
  let number = 0;
  const books = lore.books.map((def): BookShown => {
    const chapters = def.chapters.map((chapter, place): ChapterShown => {
      const shown = had.has(number);
      number += 1;
      return {
        def: chapter,
        book: def,
        place,
        number: number - 1,
        found: shown,
        read: shown && read(keyOf(def, chapter)),
      };
    });
    const kept = chapters.filter((chapter) => chapter.found);
    return { def, chapters, found: kept.length, unread: kept.some((chapter) => !chapter.read) };
  });
  return lore.categories.map((def): CategoryShown => {
    const held = books.filter((book) => book.def.category === def.id);
    return {
      def,
      books: held,
      found: held.reduce((sum, book) => sum + book.found, 0),
      total: held.reduce((sum, book) => sum + book.def.chapters.length, 0),
      unread: held.some((book) => book.unread),
    };
  });
}

/** The chapter of a number on the wire, with its book; none for a number the file does not hold. */
export function chapterAt(
  number: number,
  lore: LoreFile = LORE,
): { readonly book: BookDef; readonly chapter: ChapterDef } | null {
  return chaptersOf(lore)[number] ?? null;
}

/** A part of a chapter as the page sets it: words, a document set in from the left (a letter, a roll's entry, the
 *  Tithe's own words), or a break between the chapter's parts. */
export type Block = { readonly kind: 'words' | 'document'; readonly words: string } | { readonly kind: 'break' };

/** A chapter's text as blocks, apart at each blank line, each block's lines kept as they stand: `~` alone is a break,
 *  and a block whose every line starts `>` a document. */
export function blocksOf(text: string): Block[] {
  return text
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .trim()
        .split('\n')
        .map((line) => line.trim()),
    )
    .filter((lines) => lines.join('') !== '')
    .map((lines): Block => {
      if (lines.length === 1 && lines[0] === '~') return { kind: 'break' };
      const kept = lines.every((line) => line.startsWith('>'));
      return {
        kind: kept ? 'document' : 'words',
        words: (kept ? lines.map((line) => line.slice(1).trim()) : lines).join('\n'),
      };
    });
}

/** A block's words as spans: `**bold**` and `*italic*` in their style, the rest plain. */
export function spansOf(words: string): Span[] {
  const spans: Span[] = [];
  let from = 0;
  for (const mark of words.matchAll(/\*\*([^*]+)\*\*|\*([^*]+)\*/g)) {
    if (mark.index > from) spans.push({ words: words.slice(from, mark.index) });
    spans.push(mark[1] === undefined ? { words: mark[2] ?? '', style: 'italic' } : { words: mark[1], style: 'bold' });
    from = mark.index + mark[0].length;
  }
  if (from < words.length) spans.push({ words: words.slice(from) });
  return spans;
}

/** A chapter as a screen reader hears it: its blocks' words in a run, none of their marks. */
export const heardOf = (text: string): string =>
  blocksOf(text)
    .flatMap((block) => (block.kind === 'break' ? [] : [block.words.replace(/\*/g, '').replace(/\n/g, ' ')]))
    .join(' ');
