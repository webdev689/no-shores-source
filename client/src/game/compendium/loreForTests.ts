// Lore for the Compendium's tests, as a file might hold it: two categories, the first of two books, the second of one.
import type { LoreFile } from './loreBook.ts';

const chapter = (id: string, title: string, text: string) => ({ id, title, text, found: { kind: 'story' } as const });

export const SAMPLE_LORE: LoreFile = {
  categories: [
    { id: 'drowned', name: 'The Drowned Coast', motif: 'bell' },
    { id: 'lamps', name: 'The Lamps', motif: 'lighthouse' },
  ],
  books: [
    {
      id: 'bell',
      category: 'drowned',
      name: 'The Drowned Bell',
      cover: { colour: '#35572e', motif: 'bell' },
      chapters: [
        chapter('first', 'It Rang Once', 'The bell rang once.\n\nThen the sea came in,\nslow and grey.'),
        chapter('second', 'Under the Water', 'It rings still, under the water.'),
        chapter('third', 'The Diver', 'No one dives for it.'),
      ],
    },
    {
      id: 'keeper',
      category: 'drowned',
      name: 'The Keeper of Keys',
      cover: { colour: '#75201c', motif: 'key' },
      chapters: [chapter('door', 'The Door', 'A door with no key.')],
    },
    {
      id: 'lamp',
      category: 'lamps',
      name: 'The First Lamp',
      cover: { colour: '#ac6e2f', motif: 'lighthouse' },
      chapters: [chapter('lit', 'Lit', 'It was lit at dusk.'), chapter('out', 'Out', 'It went out at dawn.')],
    },
  ],
};

/** A browser's storage, in memory. */
export function storage(): Pick<Storage, 'getItem' | 'setItem'> & { readonly kept: Map<string, string> } {
  const kept = new Map<string, string>();
  return { kept, getItem: (key) => kept.get(key) ?? null, setItem: (key, value) => void kept.set(key, value) };
}
