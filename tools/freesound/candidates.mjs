// Finds candidates on Freesound for each cue in content/audio/freesound.json: sounds of the cue's length under CC0 or
// Attribution (the licences the owner allows; never a non-commercial one), the first few by Freesound's relevance. Each
// candidate's high-quality preview is saved with a report of who made it and under which licence, for the test sheet.
// Freesound refuses Claude's cloud machines, so this runs on GitHub's (.github/workflows/freesound.yml).
//
//     FREESOUND_TOKEN=... node tools/freesound/candidates.mjs [out-folder]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const API = 'https://freesound.org/apiv2';
/** How many candidates each cue offers, from how many results looked at. */
const OFFERED = 4;
const LOOKED_AT = 30;
/** The licences allowed, as Freesound names them in a sound's licence address. */
const ALLOWED = [/creativecommons\.org\/publicdomain\/zero\//, /creativecommons\.org\/licenses\/by\/[\d.]+\/?$/];

const token = process.env.FREESOUND_TOKEN;
if (!token) {
  console.error('FREESOUND_TOKEN is not set');
  process.exit(2);
}
const out = process.argv[2] ?? 'freesound-candidates';
const wanted = JSON.parse(readFileSync(new URL('../../content/audio/freesound.json', import.meta.url), 'utf8'));
const headers = { authorization: `Token ${token}`, 'user-agent': 'overlook-tools' };

/** A licence's short name for the sheet, or null for one not allowed. */
const licenceOf = (address) =>
  !ALLOWED.some((pattern) => pattern.test(address)) ? null : address.includes('/zero/') ? 'CC0' : 'CC-BY';

async function search(cue) {
  const [least, most] = cue.seconds;
  const params = new URLSearchParams({
    query: cue.query,
    filter: `duration:[${least} TO ${most}]`,
    fields: 'id,name,username,license,duration,previews,url,avg_rating,num_downloads',
    page_size: String(LOOKED_AT),
  });
  const answer = await fetch(`${API}/search/text/?${params}`, { headers });
  if (!answer.ok) throw new Error(`${cue.id}: Freesound answered ${answer.status} ${await answer.text()}`);
  const { results } = await answer.json();
  return results.flatMap((sound) => {
    const licence = licenceOf(sound.license);
    return licence ? [{ ...sound, licence }] : [];
  });
}

const report = [];
for (const cue of wanted.cues) {
  const found = (await search(cue)).slice(0, OFFERED);
  mkdirSync(join(out, cue.id), { recursive: true });
  const candidates = [];
  for (const sound of found) {
    const file = `${sound.id}.mp3`;
    const answer = await fetch(sound.previews['preview-hq-mp3'], { headers: { 'user-agent': 'overlook-tools' } });
    if (!answer.ok) continue;
    writeFileSync(join(out, cue.id, file), Buffer.from(await answer.arrayBuffer()));
    candidates.push({
      freesound: sound.id,
      name: sound.name,
      author: sound.username,
      licence: sound.licence,
      licenceUrl: sound.license,
      page: sound.url,
      seconds: Math.round(sound.duration * 100) / 100,
      rating: sound.avg_rating,
      downloads: sound.num_downloads,
      file: `${cue.id}/${file}`,
    });
  }
  console.log(`${cue.id}: ${candidates.length} candidates`);
  report.push({ id: cue.id, use: cue.use, query: cue.query, candidates });
}
writeFileSync(join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
