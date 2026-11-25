// What a release publishes, from the folder its builds left: the installers of every platform, each one's block map
// and the update feeds, checked whole, with `latest.json` naming the newest installer for each name that never moves.
// The upload order puts every installer before the feeds, so no installed copy reads a feed that names a file not yet
// there; a release missing any file publishes nothing.
//
//     node desktop/release/publish.ts <folder> <version>
//
// writes `latest.json` into the folder and prints each file to upload, in order; `merge <feed> <feed>` prints Linux's
// two feeds as one.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Each name that never moves, and the installer it names. */
export const LATEST_FILES = {
  'windows': (version: string) => `No-Shores-${version}-windows-x64-setup.exe`,
  'mac-arm64': (version: string) => `No-Shores-${version}-mac-arm64.dmg`,
  'mac-x64': (version: string) => `No-Shores-${version}-mac-x64.dmg`,
  'linux-appimage': (version: string) => `No-Shores-${version}-linux-x86_64.AppImage`,
  'linux-deb': (version: string) => `No-Shores-${version}-linux-amd64.deb`,
} as const;

/** Every file a whole release holds, the feeds last. */
export function releaseFiles(version: string): readonly string[] {
  const installers = Object.values(LATEST_FILES).map((name) => name(version));
  const updates = [
    `No-Shores-${version}-windows-x64-setup.exe.blockmap`,
    `No-Shores-${version}-mac-arm64.zip`,
    `No-Shores-${version}-mac-x64.zip`,
    `No-Shores-${version}-mac-arm64.zip.blockmap`,
    `No-Shores-${version}-mac-x64.zip.blockmap`,
  ];
  return [...installers, ...updates, 'latest.json', 'latest.yml', 'latest-mac.yml', 'latest-linux.yml'];
}

/** The release in `found`, the folder's files: its upload order, or the files it lacks. */
export function releasePlan(
  found: readonly string[],
  version: string,
): { order: readonly string[]; missing: readonly string[] } {
  const order = releaseFiles(version);
  const missing = order.filter((name) => name !== 'latest.json' && !found.includes(name));
  return { order, missing };
}

/** `latest.json`: the version, and each name that never moves with its installer. */
export function latestOf(version: string): string {
  const files = Object.fromEntries(Object.entries(LATEST_FILES).map(([name, file]) => [name, file(version)]));
  return `${JSON.stringify({ version, files }, null, 2)}\n`;
}

/** A feed's lines: its `files:` list's entries, and the rest. */
function feedParts(feed: string): { readonly version: string; readonly files: string[]; readonly rest: string[] } {
  const lines = feed.trimEnd().split('\n');
  const start = lines.indexOf('files:');
  if (start < 0) throw new Error('a feed without its files');
  let end = start + 1;
  while (end < lines.length && (lines[end] ?? '').startsWith('  ')) end++;
  const version = lines.find((line) => line.startsWith('version: ')) ?? '';
  return { version, files: lines.slice(start + 1, end), rest: [...lines.slice(0, start + 1), ...lines.slice(end)] };
}

/** Linux's two feeds as one: the AppImage's, with the Debian package's files after its own, so the AppImage's updater
 *  and the Debian package's each find their own file. The two are packed apart, as a Debian package marks the folder
 *  it is packed from as its own, which an AppImage packed beside it would carry. */
export function mergeFeeds(base: string, extra: string): string {
  const [first, second] = [feedParts(base), feedParts(extra)];
  if (first.version !== second.version) throw new Error(`feeds of two versions: ${first.version}, ${second.version}`);
  const after = first.rest.indexOf('files:') + 1;
  return `${[...first.rest.slice(0, after), ...first.files, ...second.files, ...first.rest.slice(after)].join('\n')}\n`;
}

if (import.meta.main && process.argv[2] === 'merge') {
  const [base = '', extra = ''] = process.argv.slice(3);
  process.stdout.write(mergeFeeds(readFileSync(base, 'utf8'), readFileSync(extra, 'utf8')));
} else if (import.meta.main) {
  const [folder = '', version = ''] = process.argv.slice(2);
  const { order, missing } = releasePlan(readdirSync(folder), version);
  if (missing.length > 0) {
    console.error(`the release lacks ${missing.join(', ')}: nothing is published`);
    process.exit(1);
  }
  writeFileSync(path.join(folder, 'latest.json'), latestOf(version));
  for (const name of order) console.log(name);
}
