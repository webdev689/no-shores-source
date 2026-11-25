// The version a release is cut at: its commit's UTC time as `year.monthday.hourminute` (2026.1125.1230), so it is
// worked out from what it describes and never bumped by hand, as migrations are named by their time. It is semver,
// which the updater compares, and each part stays under 65536, as Windows keeps a version's parts in 16 bits.
//
//     node desktop/release/version.ts <commit time, ISO 8601> [published version]
//
// prints the version, and fails when the published one is not older, so a release never goes back or repeats.

/** The version of a commit made at `time`. */
export function versionOf(time: Date): string {
  if (Number.isNaN(time.getTime())) throw new Error('the commit time does not read');
  const monthDay = (time.getUTCMonth() + 1) * 100 + time.getUTCDate();
  const hourMinute = time.getUTCHours() * 100 + time.getUTCMinutes();
  return `${time.getUTCFullYear()}.${monthDay}.${hourMinute}`;
}

/** A version's three parts, or null where it is not one. */
export function partsOf(version: string): readonly [number, number, number] | null {
  const parts = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  return parts ? [Number(parts[1]), Number(parts[2]), Number(parts[3])] : null;
}

/** Whether `version` comes after `published`, part by part; anything after nothing published. */
export function isAfter(version: string, published: string | null): boolean {
  const mine = partsOf(version);
  const theirs = published === null ? null : partsOf(published);
  if (!mine) return false;
  if (!theirs) return true;
  for (let index = 0; index < 3; index++) {
    if (mine[index] !== theirs[index]) return (mine[index] ?? 0) > (theirs[index] ?? 0);
  }
  return false;
}

if (import.meta.main) {
  const [time = '', published = ''] = process.argv.slice(2);
  const version = versionOf(new Date(time));
  if (!isAfter(version, published === '' ? null : published)) {
    console.error(`${version} is not after the published ${published}`);
    process.exit(1);
  }
  console.log(version);
}
