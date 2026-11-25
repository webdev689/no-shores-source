// The patch notes the desktop app's launcher shows, written at each deploy from the pull requests merged into `main`.
// A pull request's notes are its "## Patch notes" section, in plain words for players: an optional title after a
// colon (else the pull request's own), then a line each. Markdown is taken out, as the game draws words alone.
//
//     gh api 'repos/<owner>/<repo>/pulls?state=closed&base=main&sort=updated&direction=desc&per_page=100' |
//       node site/patchNotes.ts > <served>/play/patch-notes.json
import { readFileSync } from 'node:fs';
import {
  LINES_MOST,
  LINE_MOST,
  NOTES_MOST,
  type PatchNote,
  TITLE_MOST,
} from '../client/src/game/launcher/patchNotes.ts';

/** A pull request as GitHub lists it, the parts read. */
export interface Pull {
  readonly number: number;
  readonly title: string;
  readonly body: string | null;
  readonly merged_at: string | null;
}

const HEADING = /^##[ \t]+Patch notes(?:[ \t]*:[ \t]*(.*?))?[ \t]*$/im;

/** `text` as plain words: links their words, emphasis and code marks gone, a list's mark taken off. */
export function plainOf(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|\*|_|`)(\S(?:.*?\S)?)\1/g, '$2')
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A pull request's notes, or null where it has none or was never merged. */
export function noteOf(pull: Pull): PatchNote | null {
  if (!pull.merged_at || !pull.body) return null;
  const body = pull.body.replace(/\r\n/g, '\n');
  const found = HEADING.exec(body);
  if (!found) return null;
  const after = body.slice(found.index + found[0].length);
  const end = after.search(/^#{1,6}[ \t]/m);
  const lines = (end < 0 ? after : after.slice(0, end))
    .split('\n')
    .map(plainOf)
    .filter((line) => line !== '')
    .map((line) => line.slice(0, LINE_MOST))
    .slice(0, LINES_MOST);
  if (lines.length === 0) return null;
  const title = (plainOf(found[1] ?? '') || plainOf(pull.title)).slice(0, TITLE_MOST);
  return { number: pull.number, title, merged: pull.merged_at, lines };
}

/** The file the launcher reads: the latest merged pull requests' notes, newest first. */
export function patchNotesOf(pulls: readonly Pull[]): string {
  const notes = pulls
    .map(noteOf)
    .filter((note): note is PatchNote => note !== null)
    .sort((first, second) => Date.parse(second.merged) - Date.parse(first.merged))
    .slice(0, NOTES_MOST);
  return `${JSON.stringify({ notes }, null, 2)}\n`;
}

if (import.meta.main) process.stdout.write(patchNotesOf(JSON.parse(readFileSync(0, 'utf8')) as Pull[]));
