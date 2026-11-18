/**
 * The one judge of every name and line a player sets for others to read: usernames, guild names, guild tags and guild
 * mottos. Each kind keeps its own shape; none may hold a blocked word, and no name may claim to speak for the game.
 * Look-alikes need the database, so each caller finds them by a name's `skeleton`.
 */

import { BLOCKED } from './blockedWords.ts';

/** A username: 3 to 20 letters, digits and underscores, starting with a letter. */
export const USERNAME = /^[A-Za-z][A-Za-z0-9_]{2,19}$/;
/** A guild's name, whose spaces, dashes and apostrophes each stand alone between letters or digits. */
const GUILD_NAME = /^(?=.{3,24}$)[A-Za-z][A-Za-z0-9]*(?:[' -][A-Za-z0-9]+)*$/;
const TAG = /^[A-Za-z0-9]{2,4}$/;
const MOTTO_MOST = 80;
/** Control characters and the marks that turn text's direction, which could hide or reorder what others read. */
const HIDDEN = /[\p{Cc}‪-‮⁦-⁩]/u;
const NOT_ALLOWED = 'That name is not allowed. Choose another.';

/** What a kind may be, what its player is told when it is not, and whether it is a name, which may not claim to speak
 *  for the game. */
interface Rules {
  readonly fits: (text: string) => boolean;
  readonly shape: string;
  readonly refused: string;
  readonly named: boolean;
}

const KINDS = {
  username: {
    fits: (text) => USERNAME.test(text),
    shape: 'A username is 3 to 20 letters, digits or underscores, starting with a letter.',
    refused: NOT_ALLOWED,
    named: true,
  },
  guild: {
    fits: (text) => GUILD_NAME.test(text),
    shape:
      'A guild name is 3 to 24 characters: letters and digits, starting with a letter, with single spaces, dashes or apostrophes between them.',
    refused: NOT_ALLOWED,
    named: true,
  },
  tag: {
    fits: (text) => TAG.test(text),
    shape: 'A tag is 2 to 4 letters or digits.',
    refused: 'That tag is not allowed. Choose another.',
    named: true,
  },
  motto: {
    fits: (text) => text.length <= MOTTO_MOST && !HIDDEN.test(text),
    shape: `A motto is one line of ${MOTTO_MOST} characters at most.`,
    refused: 'That motto is not allowed.',
    named: false,
  },
} satisfies Record<string, Rules>;

/** How a name looks, so names told apart only by look-alike letters are one: lower case, 0 as o, 1, l and | as i, 5 as
 *  s, rn as m and vv as w, with no separators. The name-skeletons migration makes the same in SQL; keep them alike. */
export function skeleton(name: string): string {
  const looks: Readonly<Record<string, string>> = { '0': 'o', '1': 'i', 'l': 'i', '|': 'i', '5': 's' };
  return name
    .toLowerCase()
    .replace(/[01l|5]/g, (letter) => looks[letter] ?? letter)
    .replaceAll('rn', 'm')
    .replaceAll('vv', 'w')
    .replace(/[\s_'.-]/g, '');
}

/** Words that would claim to speak for the game, by how they look. */
const RESERVED = new Set(
  [
    'admin',
    'admins',
    'administrator',
    'moderator',
    'mod',
    'mods',
    'staff',
    'owner',
    'overlook',
    'vestige',
    'official',
    'system',
    'sysop',
    'support',
    'gm',
    'gamemaster',
    'dev',
    'devs',
    'developer',
    'server',
    'guest',
    'null',
    'undefined',
  ].map(skeleton),
);

const SWAPS: Readonly<Record<string, string>> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  '$': 's',
  '!': 'i',
};

/** The words of a text as a reader takes them: accents dropped, digits and signs read as the letters they stand for
 *  (a "!" only before a letter, as elsewhere it ends a sentence), split at anything else that is not a letter. */
function wordsOf(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/!(?![a-z])/g, ' ')
    .replace(/[013457@$!]/g, (sign) => SWAPS[sign] ?? sign)
    .split(/[^a-z]+/)
    .filter(Boolean);
}

/** A text split again where a capital follows a small letter, as "BigName" reads as two words. */
const apart = (text: string) => text.replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2');
const once = (word: string) => word.replace(/([a-z])\1+/g, '$1');
const twice = (word: string) => word.replace(/([a-z])\1+/g, '$1$1');
/** The fewest letters a root has to count inside a word; a shorter root is a word of its own. */
const LONG = 4;

/** Whether words hold a root: whole words that spell it together, a long root inside one word, or a long root begun in
 *  pieces of one or two letters. A run of a letter counts once, unless the root spells it twice. */
function holds(words: readonly string[], root: string): boolean {
  const fold = /([a-z])\1/.test(root) ? twice : once;
  const long = root.length >= LONG;
  return words.some((word, start) => {
    if (long && fold(word).includes(root)) return true;
    let [joined, spelled] = ['', true];
    for (const next of words.slice(start)) {
      joined = fold(joined + next);
      if (joined === root || (long && spelled && joined.startsWith(root))) return true;
      if (joined.length >= root.length) return false;
      spelled &&= next.length <= 2;
    }
    return false;
  });
}

/**
 * Whether a text holds a blocked word. A root of four letters or more counts inside a word, or across words that spell
 * it whole ("blow job") or begin it in pieces of a letter or two ("f u c k"); never from inside one word into another
 * ("push it", "bit chasers"). A shorter root counts only as whole words, so ordinary words that hold its letters
 * pass. A double letter in a root is kept, so Niger is not a slur.
 */
export function blocked(text: string): boolean {
  const [whole, split] = [wordsOf(text), wordsOf(apart(text))];
  return BLOCKED.some((root) => holds(whole, root) || holds(split, root));
}

/** Whether a name claims to speak for the game: a reserved word, however its letters are dressed, as the whole name or
 *  its first or last word. */
export function reserved(name: string): boolean {
  const words = wordsOf(apart(name));
  return [words.join(''), words[0] ?? '', words.at(-1) ?? ''].some((word) => RESERVED.has(skeleton(word)));
}

/** Why a player's name or line is refused, in words for them, or null when others may read it. */
export function refusalOf(kind: keyof typeof KINDS, text: unknown): string | null {
  const rules: Rules = KINDS[kind];
  if (typeof text !== 'string' || !rules.fits(text)) return rules.shape;
  return blocked(text) || (rules.named && reserved(text)) ? rules.refused : null;
}
