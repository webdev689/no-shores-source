// The launcher's news: the patch notes of the latest pull requests merged, which the site's deploy writes beside the
// game (`site/patchNotes.ts`), newest first. A note merged since the player last pressed Play is new; a player who has
// never pressed it sees none marked. The last list read is kept in this browser, so the launcher still has its notes
// when the site does not answer.

/** One pull request's notes for players: its number, the title they read, when it was merged, and its lines. */
export interface PatchNote {
  readonly number: number;
  readonly title: string;
  readonly merged: string;
  readonly lines: readonly string[];
}

/** The file beside the game's page, and the most notes, lines and characters a note or line holds. */
export const PATCH_NOTES_FILE = 'patch-notes.json';
export const NOTES_MOST = 12;
export const LINES_MOST = 12;
export const TITLE_MOST = 80;
export const LINE_MOST = 300;

/** The browser's keys: the list last read, and when the player last pressed Play. */
export const KEPT_NOTES = 'noshores.patchNotes';
export const LAST_PLAYED = 'noshores.launcherPlayed';

const isText = (value: unknown, most: number): value is string =>
  typeof value === 'string' && value.trim() !== '' && value.length <= most;
const isTime = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value));

/** The notes `json` holds, each checked, newest first; null where it is no list of notes. */
export function notesOf(json: unknown): PatchNote[] | null {
  const listed = (json as { readonly notes?: unknown } | null)?.notes;
  if (!Array.isArray(listed)) return null;
  return listed
    .flatMap((note: Record<string, unknown>) => {
      const lines = Array.isArray(note?.['lines']) ? note['lines'].filter((line) => isText(line, LINE_MOST)) : [];
      const fine =
        Number.isSafeInteger(note?.['number']) && isText(note['title'], TITLE_MOST) && isTime(note['merged']);
      if (!fine || lines.length === 0) return [];
      return [
        {
          number: note['number'] as number,
          title: note['title'] as string,
          merged: note['merged'] as string,
          lines: lines.slice(0, LINES_MOST),
        },
      ];
    })
    .sort((first, second) => Date.parse(second.merged) - Date.parse(first.merged))
    .slice(0, NOTES_MOST);
}

/** Whether `note` was merged since the player last pressed Play. */
export const isNew = (note: PatchNote, lastPlayed: string | null): boolean =>
  lastPlayed !== null && isTime(lastPlayed) && Date.parse(note.merged) > Date.parse(lastPlayed);

/** The notes as the launcher shows them, and where they came from: read now, kept from the last read, or none. */
export interface Notes {
  readonly notes: readonly PatchNote[];
  readonly from: 'read' | 'kept' | 'none';
}

/** Reads the notes beside the game at `base`, keeping what it read in `kept`; falls back to the list kept there. */
export async function readNotes(
  base: string,
  kept: Pick<Storage, 'getItem' | 'setItem'>,
  fetcher: (address: string) => Promise<Response> = (address) => fetch(address, { cache: 'no-cache' }),
): Promise<Notes> {
  try {
    const answer = await fetcher(`${base}${PATCH_NOTES_FILE}`);
    const notes = answer.ok ? notesOf(await answer.json()) : null;
    if (notes) {
      kept.setItem(KEPT_NOTES, JSON.stringify({ notes }));
      return { notes, from: 'read' };
    }
  } catch {
    // Read from what was kept.
  }
  let held: PatchNote[] | null = null;
  try {
    held = notesOf(JSON.parse(kept.getItem(KEPT_NOTES) ?? 'null'));
  } catch {
    held = null;
  }
  return held && held.length > 0 ? { notes: held, from: 'kept' } : { notes: [], from: 'none' };
}
