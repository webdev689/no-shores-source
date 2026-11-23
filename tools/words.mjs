// The game's words out to a writing tool and back: every spoken line (content/story), every quest's name, task and
// goal (content/quests/quests.json) and the lore (content/lore/lore.json) written to one plain text, each under a tag
// naming where it lives; and that text, edited elsewhere, read back by its tags into the files it came from, only the
// words that changed, each file formatted as the repository formats it.
//
//   node tools/words.mjs export [words.md]   writes the words (to stdout without a file)
//   node tools/words.mjs import words.md     writes back what changed; --dry says what would, writing nothing
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const STORY = ['welcome', 'prologue', 'houses', 'keepers'];
/** A tag at a line's start: its name, and after `|` what the line is about (a speaker, a field), read and ignored. */
const TAG = /^\[([a-z0-9][\w.-]*)(?:\s*\|[^\]]*)?\]\s?(.*)$/i;

/** Every word the export carries, in the order it writes them: its tag, its file, where in the file it lives (keys
 *  from the file's root), what it is about, its words, and a heading over the first of a group. */
export function entriesOf(root) {
  const read = (file) => JSON.parse(readFileSync(join(root, file), 'utf8'));
  const entries = [];
  const cast = read('content/story/cast.json').speakers ?? {};
  for (const name of STORY) {
    const file = `content/story/${name}.json`;
    for (const [scene, lines] of Object.entries(read(file).scenes)) {
      lines.forEach((line, index) => {
        if (typeof line.say !== 'string') return;
        const heading = index === 0 ? `## ${name}: ${scene}` : null;
        const about = cast[line.who]?.name ?? line.who ?? '';
        entries.push({
          tag: `story.${name}.${scene}.${index}`,
          file,
          path: ['scenes', scene, index, 'say'],
          about,
          words: line.say,
          heading,
        });
      });
    }
  }
  const quests = 'content/quests/quests.json';
  read(quests).quests.forEach((quest, place) => {
    const base = ['quests', place];
    entries.push({
      tag: `quest.${quest.id}.name`,
      file: quests,
      path: [...base, 'name'],
      about: 'quest',
      words: quest.name,
      heading: `## Quest: ${quest.id}`,
    });
    quest.tasks.forEach((task, step) => {
      const where = [...base, 'tasks', step];
      if (typeof task.task === 'string')
        entries.push({
          tag: `quest.${quest.id}.${task.id}.task`,
          file: quests,
          path: [...where, 'task'],
          about: 'task',
          words: task.task,
        });
      (task.goals ?? []).forEach((goal, index) => {
        if (typeof goal.text === 'string')
          entries.push({
            tag: `quest.${quest.id}.${task.id}.goal${index}`,
            file: quests,
            path: [...where, 'goals', index, 'text'],
            about: 'goal',
            words: goal.text,
          });
      });
    });
  });
  const lore = 'content/lore/lore.json';
  if (existsSync(join(root, lore))) {
    const file = read(lore);
    file.categories.forEach((category, place) =>
      entries.push({
        tag: `lore.${category.id}`,
        file: lore,
        path: ['categories', place, 'name'],
        about: 'category',
        words: category.name,
        heading: place === 0 ? '## Lore' : null,
      }),
    );
    file.books.forEach((book, place) => {
      entries.push({
        tag: `lore.${book.id}.name`,
        file: lore,
        path: ['books', place, 'name'],
        about: 'book',
        words: book.name,
        heading: `## Lore: ${book.id}`,
      });
      book.chapters.forEach((chapter, step) => {
        const base = ['books', place, 'chapters', step];
        entries.push({
          tag: `lore.${book.id}.${chapter.id}.title`,
          file: lore,
          path: [...base, 'title'],
          about: 'chapter title',
          words: chapter.title,
        });
        entries.push({
          tag: `lore.${book.id}.${chapter.id}.text`,
          file: lore,
          path: [...base, 'text'],
          about: 'chapter',
          words: chapter.text,
        });
      });
    });
  }
  return entries;
}

const HEAD = `# The game's words

Edit the words after each tag. Keep every tag, the part in square brackets, exactly as it is, at the start of its
line: it says where the words go back to. What follows "|" inside a tag (a speaker, a field) is only there to read.
A line or a chapter may run over several lines; the next tag or heading ends it. Lines added without a tag are kept
with the words above them; a tag removed leaves those words as they were.

The rules the words keep (the bible's Dialogue and Plain Text rules):
- A spoken line holds at most 14 words; a shout at most 4. A speaker says at most two lines at a time.
- No em dash, en dash, double hyphen or ellipsis: a pause is a full stop.
- No line explains the game ("XP", "quest", key names), and none names a place, a people or a past not yet named.
- British spelling.
- In the lore: **bold** and *italic*; a block whose every line starts with > is a document; ~ alone is a break.
`;

/** The export: the head, then each entry under its tag, a heading over each group. */
export function exportOf(entries) {
  const parts = [HEAD];
  for (const entry of entries) {
    if (entry.heading) parts.push(`\n${entry.heading}\n`);
    const multi = entry.words.includes('\n');
    parts.push(`[${entry.tag} | ${entry.about}]${multi ? '\n' : ' '}${entry.words}${multi ? '\n' : ''}`);
  }
  return `${parts.join('\n')}\n`;
}

/** The words an edited export holds, by tag: each tag's words run to the next tag or heading, trimmed. Tags found
 *  twice are named, as are lines before the first tag that are not the head's. */
export function readExport(text) {
  const found = new Map();
  const twice = [];
  let tag = null;
  let lines = [];
  const close = () => {
    if (tag === null) return;
    if (found.has(tag)) twice.push(tag);
    found.set(tag, lines.join('\n').replace(/^\n+|\s+$/g, ''));
  };
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const tagged = TAG.exec(line.trim());
    if (tagged) {
      close();
      [tag, lines] = [tagged[1], tagged[2] ? [tagged[2]] : []];
    } else if (/^#{1,6}\s/.test(line.trim())) {
      close();
      tag = null;
    } else if (tag !== null) lines.push(line.replace(/\s+$/, ''));
  }
  close();
  return { found, twice };
}

/** What an edited export changes: each entry whose words differ, the tags it holds that the game does not, the tags
 *  the game holds that it does not, and each tag left empty. */
export function changesOf(entries, text) {
  const { found, twice } = readExport(text);
  const known = new Map(entries.map((entry) => [entry.tag, entry]));
  const changed = [];
  const emptied = [];
  for (const [tag, words] of found) {
    const entry = known.get(tag);
    if (!entry) continue;
    // A one-line entry's words stay on one line, however the tool wrapped them.
    const kept = entry.words.includes('\n') ? words : words.replace(/\s*\n\s*/g, ' ');
    if (kept === '') emptied.push(tag);
    else if (kept !== entry.words) changed.push({ ...entry, was: entry.words, words: kept });
  }
  return {
    changed,
    emptied,
    twice,
    unknown: [...found.keys()].filter((tag) => !known.has(tag)),
    missing: entries.filter((entry) => !found.has(entry.tag)).map((entry) => entry.tag),
  };
}

/** What a line breaks of the rules a check would fail it for, said plainly; none for a line that keeps them. */
export function brokenRules(entry) {
  const broken = [];
  if (/[–—]|--|…|\.\.\./.test(entry.words)) broken.push('a dash or an ellipsis');
  if (entry.tag.startsWith('story.') && entry.words.split(/\s+/).filter(Boolean).length > 14)
    broken.push('over 14 words');
  if (entry.tag.startsWith('lore.') && (entry.words.match(/\*/g) ?? []).length % 2 === 1)
    broken.push('a bold or italic not closed');
  return broken;
}

async function main([how, path, ...flags]) {
  const root = process.cwd();
  const entries = entriesOf(root);
  if (how === 'export') {
    const text = exportOf(entries);
    if (path) writeFileSync(path, text);
    else process.stdout.write(text);
    if (path) console.log(`wrote ${entries.length} entries, ${text.split(/\s+/).length} words, to ${path}`);
    return;
  }
  if (how !== 'import' || !path) {
    console.error('node tools/words.mjs export [words.md] | import words.md [--dry]');
    process.exit(2);
  }
  const { changed, emptied, twice, unknown, missing } = changesOf(entries, readFileSync(path, 'utf8'));
  const say = (label, tags) => tags.length > 0 && console.log(`${label} (${tags.length}): ${tags.join(', ')}`);
  say('tags the game does not hold, left out', unknown);
  say('tags not in the text, left as they were', missing);
  say('tags found twice, the last kept', twice);
  say('tags left empty, left as they were', emptied);
  const breaking = changed.filter((entry) => brokenRules(entry).length > 0);
  for (const entry of breaking)
    console.log(`breaks the rules, ${brokenRules(entry).join(' and ')}: [${entry.tag}] ${entry.words}`);
  console.log(`${changed.length} changed${breaking.length ? `, ${breaking.length} of them breaking the rules` : ''}`);
  if (flags.includes('--dry') || changed.length === 0) return;
  const prettier = await import('prettier');
  for (const file of new Set(changed.map((entry) => entry.file))) {
    const full = join(root, file);
    const data = JSON.parse(readFileSync(full, 'utf8'));
    for (const entry of changed.filter((each) => each.file === file)) {
      const parent = entry.path.slice(0, -1).reduce((node, key) => node[key], data);
      parent[entry.path.at(-1)] = entry.words;
    }
    const options = (await prettier.resolveConfig(full)) ?? {};
    writeFileSync(full, await prettier.format(JSON.stringify(data, null, 2), { ...options, filepath: full }));
    console.log(`wrote ${file}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main(process.argv.slice(2));
