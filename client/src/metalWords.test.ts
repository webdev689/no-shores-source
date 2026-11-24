import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

/** The forge's metals, which no player reads: gear says its set or its content instead. */
const METAL = /\b(elven|dwarven|orcish|mithril|adamantium|ebony|daedric)\b/i;
const ROOT = new URL('../../', import.meta.url).pathname;

async function filesUnder(folder: string, ending: string): Promise<string[]> {
  const entries = await readdir(join(ROOT, folder), { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(ending))
    .map((entry) => join(entry.parentPath, entry.name));
}

/** Every string a content file holds, but those naming the forge's own looks: a piece's `look` or `metal`, a
 *  content's `armour` and `metals` lists, and the forge's table of drawn layers. */
function playerStrings(value: unknown, key = ''): string[] {
  if (['look', 'metal', 'armour', 'metals'].includes(key)) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((each) => playerStrings(each));
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([field, each]) => playerStrings(each, field));
  return [];
}

test('no metal name is in any content a player reads', async () => {
  const files = (await filesUnder('content', '.json')).filter((file) => !file.endsWith('gear/drawn.json'));
  const found = [];
  for (const file of files) {
    const strings = playerStrings(JSON.parse(await readFile(file, 'utf8')));
    found.push(...strings.filter((each) => METAL.test(each)).map((each) => `${file}: ${each}`));
  }
  assert.deepEqual(found, []);
  assert.ok(files.length > 20, 'the content was read');
});

test("no metal name is in the client's words: only the forge's layer keys hold them", async () => {
  // The forge's own folder names its layers and their colours; those keys stay inside the code.
  const files = (await filesUnder('client/src', '.ts')).filter(
    (file) => !file.endsWith('.test.ts') && !file.includes('/client/src/forge/'),
  );
  const found = [];
  for (const file of files) {
    const code = (await readFile(file, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const literals = code.match(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g) ?? [];
    // A key is lower case and spaceless ('sword_daedric'); words a player reads have a capital or a space.
    const words = literals.filter((each) => METAL.test(each) && (/\s/.test(each) || /[A-Z]/.test(each)));
    found.push(...words.map((each) => `${file}: ${each}`));
  }
  assert.deepEqual(found, []);
  assert.ok(files.length > 100, 'the client was read');
});
