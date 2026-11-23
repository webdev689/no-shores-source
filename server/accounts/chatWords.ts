/**
 * How the hall judges a chat line's words, by the same blocked words the Names judge keeps. A chat line is free text,
 * where a username is ASCII alone, so letters of other scripts that look like Latin ones are read as those first.
 */

import { blocked } from './names.ts';

/** Cyrillic and Greek letters, and the dotless i, as the Latin letters they look like. */
const LOOKS: Readonly<Record<string, string>> = {
  а: 'a',
  в: 'b',
  с: 'c',
  ԁ: 'd',
  е: 'e',
  ё: 'e',
  һ: 'h',
  н: 'h',
  і: 'i',
  ı: 'i',
  ј: 'j',
  к: 'k',
  м: 'm',
  о: 'o',
  р: 'p',
  ԛ: 'q',
  ѕ: 's',
  т: 't',
  у: 'y',
  х: 'x',
  α: 'a',
  β: 'b',
  ε: 'e',
  η: 'n',
  ι: 'i',
  κ: 'k',
  ν: 'v',
  ο: 'o',
  ρ: 'p',
  τ: 't',
  υ: 'u',
  χ: 'x',
};
const LOOKALIKE = new RegExp(`[${Object.keys(LOOKS).join('')}]`, 'giu');

/** Words read as a reader takes them: each look-alike letter as the Latin one it passes for. */
export function folded(text: string): string {
  return text.replace(LOOKALIKE, (letter) => LOOKS[letter.toLowerCase()] ?? letter);
}

/** Runs of two or more single letters, as a word is spelled out apart: "f u c k". */
const SPELLED_OUT = /(?<!\S)(?:[\p{L}\p{N}] )+[\p{L}\p{N}](?!\S)/gu;

/** A line's words with each word that holds a blocked root starred letter for letter, so it is never longer; null
 *  where single letters spell one out. Only single letters are read together: whole words side by side ("go ok") are
 *  ordinary speech. */
export function starred(text: string): string | null {
  const shown = text
    .split(' ')
    .map((word) => (blocked(folded(word)) ? word.replace(/[\p{L}\p{N}]/gu, '*') : word))
    .join(' ');
  const spelled = [...shown.matchAll(SPELLED_OUT)].some((run) => blocked(folded(run[0].replaceAll(' ', ''))));
  return spelled ? null : shown;
}
