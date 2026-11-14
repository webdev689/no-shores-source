// The placed people's pictures and what the forge must draw for them. A person is dressed by rule at run time
// (src/systems/studioArt/forgeStanding.js); what a picture fixes is read here once: each record's frame count and its
// pose, from Daggerfall's own words for it (FLATS.CFG: a smith at the anvil, a beggar with a bowl) or its instrument.
// Only those numbers and pose names are kept (specs/people/npc-records.json), never Daggerfall's words. From them:
// forgeLooks.json `people` (each record's [frames, pose], read at run time) and, by body, each layer's animations
// that some rule can ask for (specs/people-worn.json, read by layers.py `PEOPLE_WORN`).
//   ARENA2_PATH=... node tools/sprite-forge/peopleLooks.mjs --read   each record's frames and pose, read once
//   node tools/sprite-forge/peopleLooks.mjs                           the records' table and the worn list
//   node tools/sprite-forge/peopleLooks.mjs --check                   fails where either is not what the rules make
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NPC_FLAT_ARCHIVES } from '../../src/world/npcFlatArchives.js';
import { DAEDRA_PRINCES_ARCHIVE } from '../../src/characters/peopleBodies.js';
import { musicianKindOf } from '../../src/systems/instruments/musicianIds.js';
import { wornLook } from '../../src/systems/studioArt/forgeWardrobe.js';
import { OUTFITS, POSE_ANIM, POSE_PLAYS, POSE_PROPS, outfitSlots } from '../../src/systems/studioArt/forgeStanding.js';
import { FACE_HAIR, FACES, forgeHairOf, hairCloaked, hairCovered, hairHung } from '../../src/systems/studioArt/forgeHair.js';
import { isMain } from '../lib/isMain.mjs';

const ROOT = new URL('../../', import.meta.url);
const LOOKS_PATH = new URL('src/systems/studioArt/forgeLooks.json', ROOT);
const RECORDS_PATH = new URL('tools/sprite-forge/specs/people/npc-records.json', ROOT);
const WORN_PATH = new URL('tools/sprite-forge/specs/people-worn.json', ROOT);
/** The grown body a child's garments are the forge's own of (layers.py BODIES `base`). */
const BASE = { male: 'male', female: 'female', boy: 'male', girl: 'female' };
/** The roles a child is drawn in: the street's, a merchant's and a noble's household. */
const CHILD_ROLES = ['commoner', 'merchant', 'noble'];
/** The roles in armour or with a weapon: standing only, whatever their picture. */
const ARMED = ['knight', 'fighter'];

/** A picture's pose from Daggerfall's words for it, the first that matches; none, standing. */
export const CAPTION_POSES = Object.freeze(/** @type {[string, RegExp][]} */ ([
  ['charm', /snake charmer/i], ['play_lute', /\blutist/i], ['play_flute', /\bflut(?:ist|e player)/i],
  ['play_tambourine', /\bdrummer/i], ['smith', /smith\b/i], ['beg', /\b(?:beggar|cripple|pitiful)/i],
  ['dance', /\bdancer/i], ['juggle', /\bjuggler/i], ['sweep', /\bsweeper/i], ['carry', /\bmilk ?maid/i],
  ['hold', /\bchef/i], ['pray', /\bmonk/i], ['gesture', /\bjester/i], ['kneel', /\bslave/i], ['drink', /\bsailor/i],
  ['lean_cane', /\b(?:crone|old man|wizened)/i], ['ride', /horseback/i],
]));
/** A record's pose: its instrument's playing, else its words'. @param {number} archive @param {number} record @param {string} caption */
export function recordPose(archive, record, caption) {
  const kind = musicianKindOf(archive, record);
  if (kind) return `play_${kind}`;
  return CAPTION_POSES.find(([, re]) => re.test(caption ?? ''))?.[0] ?? null;
}

/** Every outfit a role makes for a sex, as equip slots: each set of clothes, in each metal it may take. */
function outfitsOf(role, female) {
  const o = OUTFITS[role];
  const clothes = female ? o.female : o.male;
  const metals = o.metals?.length ?? 1;
  // a seed walks the clothes and the metal apart: one seed per clothes, its metal stepped by outfitSlots's own mix
  const out = [];
  for (let seed = 0; out.length < clothes.length * metals && seed < 4096; seed++) {
    const slots = outfitSlots(role, female, seed);
    const key = JSON.stringify(slots.map((s) => s && [s.templateIndex, s.variant ?? null, s.material ?? s.set ?? null]));
    if (!out.some((o2) => o2.key === key)) out.push({ key, slots });
  }
  return out.map((o2) => o2.slots);
}

/** Every hair a body's people can wear over `worn`: each race's, each face's, hung as forgeStanding.js standingHairOf
 *  hangs it. @param {string} body @param {{ gear: string[], plated?: boolean, pauldrons?: boolean }} worn */
function hairsOf(body, worn) {
  if (hairCovered(worn.gear)) return [];
  const out = new Set();
  for (const race of Object.keys(FACE_HAIR[body] ?? {})) {
    for (let face = 0; face < FACES; face++) {
      const own = forgeHairOf(body, race, face);
      if (own) out.add(hairHung(own.layer, { plated: !!(worn.plated || worn.pauldrons), cloaked: hairCloaked(worn.gear) }));
    }
  }
  return [...out];
}

/** The records' table (forgeLooks.json `people`) and, by body, each layer's animations the rules can ask for. */
export function peopleLooks(looks = JSON.parse(readFileSync(LOOKS_PATH, 'utf8')),
  records = JSON.parse(readFileSync(RECORDS_PATH, 'utf8'))) {
  const poses = new Set(['idle', 'idle_staff']);
  for (const recs of Object.values(records)) for (const [, pose] of Object.values(recs)) if (pose) poses.add(pose);
  /** @type {Record<string, { layers: Record<string, Set<string>>, anims: Set<string> }>} */
  const worn = {};
  for (const body of ['male', 'female', 'boy', 'girl']) {
    const female = body === 'female' || body === 'girl';
    const drawn = looks.bodies[BASE[body]].layers;
    const w = (worn[body] = { layers: {}, anims: new Set() });
    const add = (/** @type {string} */ layer, /** @type {string} */ anim) => {
      (w.layers[layer] ??= new Set()).add(anim);
      w.anims.add(anim);
    };
    const roles = body === 'boy' || body === 'girl' ? CHILD_ROLES : Object.keys(OUTFITS);
    for (const role of roles) {
      const o = OUTFITS[role];
      const stand = o.held?.[0]?.startsWith('staff_') ? 'idle_staff' : 'idle';
      const rolePoses = ARMED.includes(role) ? [stand] : [...poses].filter((p) => p !== 'idle_staff' || stand === 'idle_staff');
      for (const pose of rolePoses) {
        const anim = POSE_ANIM[pose] ?? pose;
        for (const layer of ['body', 'body_khajiit', 'body_argonian']) add(layer, anim);
        for (const slots of outfitsOf(role, female)) {
          const worn = wornLook(slots, drawn);
          const { gear } = worn;
          for (const g of gear) add(g, anim);
          for (const h of hairsOf(body, worn)) add(h, anim);
          // a beast race's body under a helm (forgeLayers.js beastBodyOf)
          if (gear.some((g) => g.startsWith('helm_'))) for (const b of ['body_khajiit_helmed', 'body_argonian_helmed']) add(b, anim);
        }
        for (const p of POSE_PROPS[pose] ?? []) add(`prop_${p}`, anim);
        if (POSE_PLAYS[pose]) add(POSE_PLAYS[pose], anim);
        if (pose === stand) for (const h of o.held ?? []) add(h, anim);
      }
    }
  }
  const list = Object.fromEntries(Object.entries(worn).map(([b, w]) => [b, { anims: [...w.anims].sort(),
    layers: Object.fromEntries(Object.keys(w.layers).sort().map((l) => [l, [...w.layers[l]].sort()])) }]));
  return { people: records, worn: list };
}

/** `raw` (forgeLooks.json's text) with its `people` key set to `people`, the rest of the text as it was. */
export function withPeople(raw, people) {
  const block = ` "people": ${JSON.stringify(people, null, 1).replace(/\n/g, '\n ')}`;
  const at = raw.indexOf('\n "people": {');
  if (at >= 0) {
    const end = raw.indexOf('\n }', at + 1);
    return `${raw.slice(0, at + 1)}${block}${raw.slice(end + 3)}`;
  }
  const keys = [...raw.matchAll(/\n "([^"]+)": /g)];
  const next = keys.find((m) => m[1] > 'people');
  if (!next) throw new Error('forgeLooks.json: no key after "people" to set it before');
  return `${raw.slice(0, next.index + 1)}${block},\n${raw.slice(next.index + 1)}`;
}

/** The worn list as text: a line a layer, its animations on it. @param {Record<string, any>} worn */
export function wornJson(worn) {
  const one = (/** @type {any} */ w) => `{\n  "anims": ${JSON.stringify(w.anims)},\n  "layers": {\n${Object.entries(w.layers)
    .map(([l, a]) => `   ${JSON.stringify(l)}: ${JSON.stringify(a)}`).join(',\n')}\n  }\n }`;
  return `{\n${Object.entries(worn).map(([b, w]) => ` ${JSON.stringify(b)}: ${one(w)}`).join(',\n')}\n}\n`;
}

/** Each record's [frames, pose] off ARENA2: its TEXTURE file's frames and FLATS.CFG's words, the Princes' left out. */
async function readRecords() {
  const { TextureFile, texName } = await import('../../src/formats/textureFile.js');
  const { FlatsFile } = await import('../../src/formats/flatsFile.js');
  const arena2 = process.env.ARENA2_PATH;
  if (!arena2) throw new Error('set ARENA2_PATH');
  const flats = new FlatsFile();
  flats.load(new Uint8Array(readFileSync(join(arena2, 'FLATS.CFG'))), 'FLATS.CFG');
  /** @type {Record<number, Record<number, [number, string | null]>>} */
  const out = {};
  for (const a of NPC_FLAT_ARCHIVES) {
    if (a === DAEDRA_PRINCES_ARCHIVE) continue;
    const t = new TextureFile();
    t.load(new Uint8Array(readFileSync(join(arena2, texName(a)))), texName(a));
    out[a] = Object.fromEntries(Array.from({ length: t.recordCount }, (_, r) =>
      [r, [t.getFrameCount(r), recordPose(a, r, flats.getFlatData(a, r)?.caption ?? '')]]));
  }
  return out;
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--read')) {
    const recs = await readRecords();
    writeFileSync(RECORDS_PATH, `{\n${Object.entries(recs).map(([a, r]) => ` ${JSON.stringify(a)}: ${JSON.stringify(r)}`).join(',\n')}\n}\n`);
    console.log('the records\' frames and poses written');
  } else {
    const raw = readFileSync(LOOKS_PATH, 'utf8');
    const { people, worn } = peopleLooks(JSON.parse(raw));
    const text = withPeople(raw, people);
    const wornText = wornJson(worn);
    if (process.argv.includes('--check')) {
      const stale = [text !== raw && 'forgeLooks.json people', wornText !== readFileSync(WORN_PATH, 'utf8') && 'people-worn.json']
        .filter(Boolean);
      if (stale.length) {
        console.error(`${stale.join(', ')} not what the rules make: node tools/sprite-forge/peopleLooks.mjs`);
        process.exit(1);
      }
    } else {
      writeFileSync(LOOKS_PATH, text);
      writeFileSync(WORN_PATH, wornText);
      const n = Object.values(worn).reduce((k, w) => k + Object.values(w.layers).reduce((m, a) => m + a.length, 0), 0);
      console.log(`${Object.values(people).reduce((k, r) => k + Object.keys(r).length, 0)} records, ${n} strips to draw -> forgeLooks.json people, specs/people-worn.json`);
    }
  }
}
