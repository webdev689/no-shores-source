import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { notesOf } from '../client/src/game/launcher/patchNotes.ts';
import { noteOf, patchNotesOf, plainOf } from './patchNotes.ts';

const merged = '2026-11-25T14:00:00Z';
const body = `## What changed

Developers' words.

## Patch notes: The desktop app

- No Shores now installs on **Windows**, macOS and Linux.
- It opens on a [launcher](https://noshores.online/) with \`news\`.
<!-- a note to reviewers -->

## How it was tested

Not for players.`;

test("a pull request's notes are its Patch notes section, in plain words, with the title it gives", () => {
  assert.deepEqual(noteOf({ number: 210, title: 'The desktop app on Electron', body, merged_at: merged }), {
    number: 210,
    title: 'The desktop app',
    merged,
    lines: ['No Shores now installs on Windows, macOS and Linux.', 'It opens on a launcher with news.'],
  });
});

test("with no title of its own, the notes take the pull request's", () => {
  const note = noteOf({
    number: 1,
    title: 'Faster loading',
    body: '## Patch notes\n\n- Areas load sooner.',
    merged_at: merged,
  });
  assert.equal(note?.title, 'Faster loading');
});

test('a pull request not merged, with no section, or an empty one, has no notes', () => {
  assert.equal(noteOf({ number: 1, title: 't', body, merged_at: null }), null);
  assert.equal(noteOf({ number: 1, title: 't', body: '## What changed\n\nWords.', merged_at: merged }), null);
  assert.equal(noteOf({ number: 1, title: 't', body: '## Patch notes\n\n## Next', merged_at: merged }), null);
  assert.equal(noteOf({ number: 1, title: 't', body: null, merged_at: merged }), null);
});

test('the file written is the one the launcher reads, newest first', () => {
  const file = patchNotesOf([
    { number: 1, title: 'Older', body: '## Patch notes\n- One.', merged_at: '2026-11-20T00:00:00Z' },
    { number: 2, title: 'Newer', body: '## Patch notes\n- Two.', merged_at: '2026-11-24T00:00:00Z' },
    { number: 3, title: 'Silent', body: 'Nothing for players.', merged_at: '2026-11-24T00:00:00Z' },
  ]);
  assert.deepEqual(
    notesOf(JSON.parse(file))?.map((note) => note.number),
    [2, 1],
  );
});

test('markdown is taken out of a line, and a list mark off its start', () => {
  assert.equal(plainOf('  * __Bold__ and `code` and ![a picture](x.png)  '), 'Bold and code and a picture');
  assert.equal(plainOf('1. First step'), 'First step');
});

test("the repository's pull request template, left unfilled, puts nothing on the launcher", () => {
  const body = readFileSync(new URL('../.github/pull_request_template.md', import.meta.url), 'utf8');
  assert.match(body, /^## Patch notes$/m);
  assert.equal(noteOf({ number: 1, title: 'A change', body, merged_at: '2026-11-25T00:00:00Z' }), null);
});

test("only a section's list items are notes: a footer after it, or words around them, never reach the launcher", () => {
  const signed = `## Patch notes: The app\n\n- It installs.\n- It updates.\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n\nhttps://claude.ai/code/session_1`;
  assert.deepEqual(noteOf({ number: 1, title: 't', body: signed, merged_at: merged })?.lines, [
    'It installs.',
    'It updates.',
  ]);
});
