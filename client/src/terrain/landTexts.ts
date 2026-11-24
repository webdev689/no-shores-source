// What the land's worker settles a landmass with besides its edits, read once from the pages' `world/` folder: the
// RMB index for its city, and every RMB block file, the forged models' tables and the nodes' briefs for its layouts,
// joined as the open request's members so the worker parses them once.

/** The RMB index's text, and the layouts' builders as JSON members (`"rmbBlocks":[...],"forged":{...},"briefs":
 *  {...}`); either null where the pages do not serve it. */
export interface LandTexts {
  readonly rmbText: string | null;
  readonly buildersText: string | null;
}

const texts = new Map<string, Promise<string>>();

/** A file of the pages' `world/` folder, fetched once however many ask: the land's texts and the city's assets read
 *  the same tables and blocks. One that fails is fetched afresh the next time. */
export function worldText(base: string, path: string): Promise<string> {
  const url = `${base}world/${path}`;
  const kept = texts.get(url);
  if (kept) return kept;
  const reading = fetch(url).then((answer) => {
    if (!answer.ok) throw new Error(`world/${path}: ${answer.status}`);
    return answer.text();
  });
  texts.set(url, reading);
  reading.catch(() => texts.get(url) === reading && texts.delete(url));
  return reading;
}

/** Reads the land's texts; a part the pages do not serve is null, and the land is settled without it. */
export async function loadLandTexts(base: string): Promise<LandTexts> {
  const read = (path: string) => worldText(base, path);
  const rmbText = await read('rmb/index.json').catch(() => null);
  if (rmbText === null) return { rmbText, buildersText: null };
  try {
    const index = JSON.parse(rmbText) as { blocks: readonly (readonly [string, string, ...unknown[]])[] };
    const files = [...new Set(index.blocks.map((row) => row[1]))].sort();
    const [blockFiles, buildings, props, parts, briefs] = await Promise.all([
      Promise.all(files.map((file) => read(`rmb/${file}`))),
      read('forged/buildings.json'),
      read('forged/props.json'),
      read('forged/parts.json'),
      read('briefs.json'),
    ]);
    const forged = `{"buildings":${buildings},"props":${props},"parts":${parts}}`;
    const buildersText = `"rmbBlocks":[${blockFiles.join(',')}],"forged":${forged},"briefs":${briefs}`;
    return { rmbText, buildersText };
  } catch (error) {
    console.error('the layouts cannot be built:', error);
    return { rmbText, buildersText: null };
  }
}
