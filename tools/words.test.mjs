import assert from 'node:assert/strict';
import { test } from 'node:test';
import { brokenRules, changesOf, entriesOf, exportOf, readExport } from './words.mjs';

const entries = entriesOf(process.cwd());

test('every spoken line, quest and chapter goes out under its own tag and comes back as it was', () => {
  assert.ok(entries.some((entry) => entry.tag.startsWith('story.welcome.')));
  assert.ok(entries.some((entry) => entry.tag.startsWith('quest.')));
  assert.equal(new Set(entries.map((entry) => entry.tag)).size, entries.length, 'no tag twice');
  const { found } = readExport(exportOf(entries));
  for (const entry of entries) assert.equal(found.get(entry.tag), entry.words, entry.tag);
  assert.deepEqual(changesOf(entries, exportOf(entries)).changed, []);
});

test('an edit comes back to its place alone; a tag broken, dropped or emptied is named and changes nothing', () => {
  const [first, second, third] = entries;
  const text = exportOf(entries)
    .replace(`[${first.tag} | ${first.about}] ${first.words}`, `[${first.tag}|x]\n${first.words} Again,\nslowly.`)
    .replace(`[${second.tag} |`, `[${second.tag}x |`)
    .replace(`[${third.tag} | ${third.about}] ${third.words}`, `[${third.tag} | ${third.about}]`);
  const { changed, unknown, missing, emptied } = changesOf(entries, text);
  assert.deepEqual(
    changed.map((entry) => [entry.tag, entry.words]),
    [[first.tag, `${first.words} Again, slowly.`]],
    "a spoken line's wrap runs together",
  );
  assert.deepEqual([unknown, missing, emptied], [[`${second.tag}x`], [second.tag], [third.tag]]);
});

test('a line that breaks the rules a check holds is named before it is written', () => {
  assert.deepEqual(brokenRules({ tag: 'story.a.b.0', words: 'Wait... no' }), ['a dash or an ellipsis']);
  assert.deepEqual(brokenRules({ tag: 'story.a.b.0', words: Array(15).fill('word').join(' ') }), ['over 14 words']);
  assert.deepEqual(brokenRules({ tag: 'lore.a.b.text', words: 'An *open mark.' }), ['a bold or italic not closed']);
  assert.deepEqual(brokenRules({ tag: 'quest.a.name', words: 'A House of Your Own' }), []);
});
