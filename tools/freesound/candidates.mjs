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
import { licenceLinkOf, licenceOf, previewOf, resultsOf, titleOf } from './pages.mjs';

const SITE = 'https://freesound.org';
/** How many candidates each cue offers, and how many results are looked at to find them. */
const OFFERED = 4;
const LOOKED_AT = 16;
/** A pause between requests, so the search reads as one person browsing. */
const PAUSE_MS = 600;
const headers = { 'user-agent': 'Mozilla/5.0 (compatible; overlook-tools; sound test sheet)' };

const out = process.argv[2] ?? 'freesound-candidates';
/** Only the cues whose names begin with one of these (comma-separated, as the workflow is asked by hand), to search
 *  a few again without the whole list; every cue where it is empty. The picks are read whole either way. */
const only = (process.env.ONLY ?? '')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);
const wanted = JSON.parse(readFileSync(new URL('../../content/audio/freesound.json', import.meta.url), 'utf8'));
const pause = () => new Promise((done) => setTimeout(done, PAUSE_MS));

/** An answer's text, or its bytes, read whole; or null with the reason logged. */
async function fetched(url, bytes = false) {
  await pause();
  try {
    const answer = await fetch(url, { headers });
    if (answer.ok) return bytes ? Buffer.from(await answer.arrayBuffer()) : await answer.text();
    console.log(`  ${answer.status} for ${url}: ${(await answer.text()).slice(0, 200).replace(/\s+/g, ' ')}`);
  } catch (error) {
    // One request failing, even partway through its answer, is logged and passed over: the rest still runs.
    console.log(`  no answer from ${url}: ${error.cause?.code ?? error.message}`);
  }
  return null;
}

/** A page's text, or null with the reason logged. */
const page = (url) => fetched(url);
/** A preview's bytes, or null with the reason logged. */
const audioOf = (url) => fetched(url, true);

/** A picked sound, read from its own page for its credit, its preview kept as `picks/<cue>.mp3`. */
async function pickOf(cue) {
  const id = String(cue.picked);
  const sound = await page(`${SITE}/s/${id}/`);
  // Kept beside the picks, so how the credit was read can be checked later without Freesound.
  mkdirSync(join(out, 'pages'), { recursive: true });
  if (sound) writeFileSync(join(out, 'pages', `pick-${cue.id}.html`), sound);
  const licence = sound && licenceLinkOf(sound);
  const preview = sound && previewOf(sound, id);
  const author = sound?.match(new RegExp(`/people/([A-Za-z0-9_.@+-]{1,80})/sounds/${id}/`))?.[1] ?? null;
  const name = sound ? titleOf(sound, id, author ?? '') : null;
  const pick = { id: cue.id, freesound: Number(id), name, author, licence, preview };
  const audio = preview ? await audioOf(preview) : null;
  if (audio) {
    mkdirSync(join(out, 'picks'), { recursive: true });
    writeFileSync(join(out, 'picks', `${cue.id}.mp3`), audio);
  }
  console.log(`${cue.id}: picked ${id}, ${pick.name} by ${author}, ${licence?.url ?? 'no allowed licence found'}`);
  return {
    ...pick,
    page: author ? `${SITE}/people/${author}/sounds/${id}/` : null,
    file: audio ? `picks/${cue.id}.mp3` : null,
  };
}

/** A sound offered by its number, such as one DFO plays, read from its own page as a candidate; null if it is not
 *  under an allowed licence or cannot be read. */
async function offered(cue, id) {
  const sound = await page(`${SITE}/s/${id}/`);
  const author = sound?.match(new RegExp(`/people/([A-Za-z0-9_.@+-]{1,80})/sounds/${id}/`))?.[1];
  const licence = author && licenceOf(sound);
  const preview = licence && previewOf(sound, id);
  const audio = preview && (await audioOf(preview));
  if (!audio) return null;
  writeFileSync(join(out, cue.id, `${id}.mp3`), audio);
  const address = `${SITE}/people/${author}/sounds/${id}/`;
  return {
    freesound: Number(id),
    name: titleOf(sound, id, author),
    author,
    licence,
    page: address,
    file: `${cue.id}/${id}.mp3`,
  };
}

const picks = [];
const report = [];
/** The report and the picks as far as they go: written after each cue, so a run stopped by its time limit keeps every
 *  candidate it found with its credit. */
const save = () => {
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(out, 'picks.json'), `${JSON.stringify(picks, null, 2)}\n`);
};
for (const cue of wanted.cues) {
  // A cue the owner picked a sound for is searched no more: its pick is read for its credit and its preview kept.
  if (cue.picked) {
    picks.push(await pickOf(cue));
    save();
    continue;
  }
  // One kept or made by the game, or whose sound comes from DFO's own, is searched no more; what the owner already
  // heard is passed over.
  if (cue.keep || cue.made || cue.dfo) continue;
  if (only.length > 0 && !only.some((name) => cue.id.startsWith(name))) continue;
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
  // The sounds the list offers by number come first, then the search's own.
  const named = (cue.offer ?? []).map(String).filter((id) => !heard.has(id));
  for (const id of named) {
    const each = await offered(cue, id);
    if (each) candidates.push(each);
  }
  const offers = candidates.length;
  for (const { author, id } of results.slice(0, LOOKED_AT)) {
    if (candidates.length - offers >= OFFERED) break;
    if (heard.has(id) || named.includes(id)) continue;
    const address = `${SITE}/people/${author}/sounds/${id}/`;
    const sound = await page(address);
    if (!sound) continue;
    const licence = licenceOf(sound);
    if (!licence) continue;
    const preview = previewOf(sound, id);
    if (!preview) continue;
    const audio = await audioOf(preview);
    if (!audio) continue;
    const file = `${id}.mp3`;
    writeFileSync(join(out, cue.id, file), audio);
    candidates.push({
      freesound: Number(id),
      name: titleOf(sound, id, author),
      author,
      licence,
      page: address,
      file: `${cue.id}/${file}`,
    });
  }
  console.log(`  ${results.length} results read, ${candidates.length} kept`);
  report.push({ id: cue.id, use: cue.use, query: cue.query, candidates });
  save();
}
save();
// A search that kept nothing at all, or a pick not read whole, fails the run, so a refusal or a changed page shows.
const unread = picks.filter((pick) => !pick.licence || !pick.file).map((pick) => pick.id);
if (unread.length > 0) console.log(`Picks not read whole: ${unread.join(', ')}. Read pages/ in the download.`);
const empty = report.length > 0 && report.every((cue) => cue.candidates.length === 0);
if (empty) console.log('No candidates for any cue: read pages/ in the download to see why.');
if (unread.length > 0 || empty) process.exitCode = 1;
