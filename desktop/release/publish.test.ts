import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LATEST_NAMES } from '../../site/worker.ts';
import { LATEST_FILES, latestOf, mergeFeeds, releaseFiles, releasePlan } from './publish.ts';

const version = '2026.1125.1230';

test('the names that never move are the ones the site answers', () => {
  assert.deepEqual(Object.keys(LATEST_FILES), [...LATEST_NAMES]);
});

test('every installer goes up before any feed, and the feeds go last', () => {
  const order = releaseFiles(version);
  const firstFeed = order.findIndex((name) => name.endsWith('.yml') || name === 'latest.json');
  assert.ok(firstFeed > 0);
  assert.ok(order.slice(firstFeed).every((name) => name.endsWith('.yml') || name === 'latest.json'));
  assert.equal(order.at(-1)?.endsWith('.yml'), true);
});

test('a release missing any file says which, and is not published', () => {
  const all = releaseFiles(version).filter((name) => name !== 'latest.json');
  assert.deepEqual(releasePlan(all, version).missing, []);
  assert.deepEqual(
    releasePlan(
      all.filter((name) => !name.endsWith('.deb')),
      version,
    ).missing,
    [`No-Shores-${version}-linux-amd64.deb`],
  );
});

test('latest.json names each newest installer, as the builds name them', () => {
  const latest = JSON.parse(latestOf(version)) as { version: string; files: Record<string, string> };
  assert.equal(latest.version, version);
  assert.equal(latest.files['windows'], `No-Shores-${version}-windows-x64-setup.exe`);
  assert.equal(latest.files['linux-appimage'], `No-Shores-${version}-linux-x86_64.AppImage`);
});

const appImageFeed = `version: ${version}
files:
  - url: No-Shores-${version}-linux-x86_64.AppImage
    sha512: oXuIXELIbO0TJNddZCc+Zyd9oes/rGhofA8wORjQhS7XtFsFL1iE5i6SzWEl4Als8HSrPyGCuOwO9R2NxuIcfw==
    size: 126055374
    blockMapSize: 132066
path: No-Shores-${version}-linux-x86_64.AppImage
sha512: oXuIXELIbO0TJNddZCc+Zyd9oes/rGhofA8wORjQhS7XtFsFL1iE5i6SzWEl4Als8HSrPyGCuOwO9R2NxuIcfw==
releaseDate: '2026-11-25T13:25:22.994Z'
`;
const debFeed = `version: ${version}
files:
  - url: No-Shores-${version}-linux-amd64.deb
    sha512: +dMQLr77HqNQ2dAqvBmF6bHE+VFsy5LHprQVcQrA53fdTkXKOkH76k6KxcVx8bmE3j6FP2nfY42vTYcFZL8J/A==
    size: 101303076
path: No-Shores-${version}-linux-amd64.deb
sha512: +dMQLr77HqNQ2dAqvBmF6bHE+VFsy5LHprQVcQrA53fdTkXKOkH76k6KxcVx8bmE3j6FP2nfY42vTYcFZL8J/A==
releaseDate: '2026-11-25T13:26:02.110Z'
`;

test("Linux's two feeds become one, the AppImage's first, so each updater finds its own file there", () => {
  const merged = mergeFeeds(appImageFeed, debFeed);
  assert.equal(
    merged,
    `version: ${version}
files:
  - url: No-Shores-${version}-linux-x86_64.AppImage
    sha512: oXuIXELIbO0TJNddZCc+Zyd9oes/rGhofA8wORjQhS7XtFsFL1iE5i6SzWEl4Als8HSrPyGCuOwO9R2NxuIcfw==
    size: 126055374
    blockMapSize: 132066
  - url: No-Shores-${version}-linux-amd64.deb
    sha512: +dMQLr77HqNQ2dAqvBmF6bHE+VFsy5LHprQVcQrA53fdTkXKOkH76k6KxcVx8bmE3j6FP2nfY42vTYcFZL8J/A==
    size: 101303076
path: No-Shores-${version}-linux-x86_64.AppImage
sha512: oXuIXELIbO0TJNddZCc+Zyd9oes/rGhofA8wORjQhS7XtFsFL1iE5i6SzWEl4Als8HSrPyGCuOwO9R2NxuIcfw==
releaseDate: '2026-11-25T13:25:22.994Z'
`,
  );
});

test('feeds of two versions are never merged', () => {
  assert.throws(() => mergeFeeds(appImageFeed, debFeed.replace(`version: ${version}`, 'version: 2026.1125.1231')));
});
