// Finds candidates on Freesound for each cue in content/audio/freesound.json, with no key: it reads Freesound's
// public search page for the cue's words and length, then each result's own page for its title, author and licence,
// keeping only CC0 and Attribution (the licences the owner allows; never a non-commercial one), and saves the first
// few's public previews with a report of who made them. Freesound refuses Claude's cloud machines, so this runs on
// GitHub's (.github/workflows/freesound.yml). Each cue's first search page is kept beside the report, so a change to
// Freesound's pages can be read and this reader fixed.
//
//     node tools/freesound/candidates.mjs [out-folder]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { licenceOf, previewOf, resultsOf, titleOf } from './pages.mjs';

const SITE = 'https://freesound.org';
/** How many candidates each cue offers, and how many results are looked at to find them. */
const OFFERED = 4;
const LOOKED_AT = 16;
/** A pause between requests, so the search reads as one person browsing. */
const PAUSE_MS = 600;
const headers = { 'user-agent': 'Mozilla/5.0 (compatible; overlook-tools; sound test sheet)' };

const out = process.argv[2] ?? 'freesound-candidates';
const wanted = JSON.parse(readFileSync(new URL('../../content/audio/freesound.json', import.meta.url), 'utf8'));
const pause = () => new Promise((done) => setTimeout(done, PAUSE_MS));

/** An answer that came back well, or null with the reason logged. */
async function fetched(url) {
  await pause();
  try {
    const answer = await fetch(url, { headers });
    if (answer.ok) return answer;
    console.log(`  ${answer.status} for ${url}: ${(await answer.text()).slice(0, 200).replace(/\s+/g, ' ')}`);
  } catch (error) {
    // One request failing is logged and passed over: the rest of the search still runs.
    console.log(`  no answer from ${url}: ${error.cause?.code ?? error.message}`);
  }
  return null;
}

/** A page's text, or null with the reason logged. */
async function page(url) {
  return (await fetched(url))?.text() ?? null;
}

const report = [];
for (const cue of wanted.cues) {
  // A cue the owner settled on the sound sheet is searched no more; what they already heard is passed over.
  if (cue.picked || cue.keep || cue.made) continue;
  const heard = new Set((cue.skip ?? []).map(String));
  const [least, most] = cue.seconds;
  const search = (filter) =>
    `${SITE}/search/?${new URLSearchParams({ q: cue.query, f: filter, s: 'Automatic by relevance' })}`;
  const duration = `duration:[${least} TO ${most}]`;
  console.log(`${cue.id}: "${cue.query}"`);
  // The licences asked for in the search first; Freesound may name them otherwise, so the length alone after.
  let html = await page(search(`${duration} license:("Creative Commons 0" OR "Attribution")`));
  let results = html ? resultsOf(html) : [];
  if (results.length === 0) {
    html = (await page(search(duration))) ?? html;
    results = html ? resultsOf(html) : [];
  }
  mkdirSync(join(out, cue.id), { recursive: true });
  mkdirSync(join(out, 'pages'), { recursive: true });
  if (html) writeFileSync(join(out, 'pages', `${cue.id}.html`), html, { flag: 'w' });
  const candidates = [];
  for (const { author, id } of results.slice(0, LOOKED_AT)) {
    if (candidates.length >= OFFERED) break;
    if (heard.has(id)) continue;
    const address = `${SITE}/people/${author}/sounds/${id}/`;
    const sound = await page(address);
    if (!sound) continue;
    const licence = licenceOf(sound);
    if (!licence) continue;
    const preview = previewOf(sound, id);
    if (!preview) continue;
    const audio = await fetched(preview);
    if (!audio) continue;
    const file = `${id}.mp3`;
    writeFileSync(join(out, cue.id, file), Buffer.from(await audio.arrayBuffer()));
    candidates.push({
      freesound: Number(id),
      name: titleOf(sound, id),
      author,
      licence,
      page: address,
      file: `${cue.id}/${file}`,
    });
  }
  console.log(`  ${results.length} results read, ${candidates.length} kept`);
  report.push({ id: cue.id, use: cue.use, query: cue.query, candidates });
}
writeFileSync(join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
// A search that kept nothing at all fails the run, so a refusal or a changed page shows; its pages are still kept.
if (report.every((cue) => cue.candidates.length === 0)) {
  console.log('No candidates for any cue: read pages/ in the download to see why.');
  process.exitCode = 1;
}
