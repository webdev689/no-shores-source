// The forge viewer's game half, with no page in it: what a person can wear and hold, off the game's own tables, the
// equipment a choice makes, and each record's picture composed by the game's own calls in the game's own order. The
// page (viewer.js) only asks, so what it shows is what the game draws. Node runs it too (forgeviewer.test.js).
import LOOKS from '../../src/systems/studioArt/forgeLooks.json' with { type: 'json' };
import TEMPLATES from '../../src/characters/itemTemplates.json' with { type: 'json' };
import { EQUIP_SLOTS } from '../../src/systems/equip.js';
import { SLOT_RULES } from '../../src/characters/equipRules.js';
import { MATERIAL_NAMES } from '../../src/systems/item/itemInfo.js';
import { DYE_COLORS } from '../../src/characters/dyes.js';
import { HORSE_COATS, HORSE_PATTERNS, HORSE_LEGS, HORSE_MOUNTS, HORSE_SEED_MAX, horseLookCode } from '../../src/systems/horse/horseCoats.js';
import { FORGE_RACES } from '../../src/systems/studioArt/forgeRaces.js';
import { FACES } from '../../src/systems/studioArt/forgeHair.js';
import { GARMENTS_OF_TEMPLATE } from '../../src/systems/studioArt/forgeWardrobe.js';
import { GUILD_SETS } from '../../src/systems/guildSets.js';
import { CROSSBOW_TEMPLATE } from '../../src/characters/crossbowIds.js';
import { THUNDERLOCK_TEMPLATE, PISTOLET_TEMPLATE } from '../../src/characters/thunderlockIds.js';
import { personDressLook, pairedBlades } from '../../src/systems/studioArt/forgePersonLook.js';
import { personBase } from '../../src/systems/studioArt/forgePeople.js';
import { dressedWhole } from '../../src/systems/studioArt/forgeDressed.js';
import { FORGE_BOW_LAYERS, forgeBowDye } from '../../src/systems/studioArt/forgeBows.js';
import { FORGE_STAFF_LAYERS, forgeStaffDye } from '../../src/systems/studioArt/forgeStaffs.js';
import { FORGE_CROSSBOW_LAYERS, forgeCrossbowDye } from '../../src/systems/studioArt/forgeCrossbows.js';
import { playingAnim, lookPlays, PLAYING_VIEWS } from '../../src/systems/studioArt/forgePlaying.js';
import { INSTRUMENT_KINDS } from '../../src/systems/instruments/instrumentIds.js';
import { OUTFITS, POSE_FRAMES, POSE_ANIM, standingLook, standingWhole } from '../../src/systems/studioArt/forgeStanding.js';
import { ENEMY_BASICS, ENEMY_NAMES } from '../../src/characters/enemy/enemyBasics.js';
import { designForArchive } from '../../src/characters/villagerDesigns.js';
import {
  lookAs, lookCell, composeFrame, composeRecord, recordCanvas, recordLift, ownOnRecord, laidOnGround, layersOf,
  layerPath, layerCellOf, forgeLayersListed, forgeLayerFile,
} from '../../src/systems/studioArt/forgeLayers.js';

export { LOOKS, EQUIP_SLOTS, layerPath, layerCellOf, forgeLayersListed, forgeLayerFile, HORSE_SEED_MAX };

export const VIEWS = Object.freeze(['Front', 'Front ¾', 'Side', 'Back ¾', 'Back']);
export const BODIES = Object.freeze(Object.keys(LOOKS.bodies));
const OWN_NAMES = { [CROSSBOW_TEMPLATE]: 'Crossbow', [THUNDERLOCK_TEMPLATE]: 'Thunderlock', [PISTOLET_TEMPLATE]: 'Pistolet' };
const nameOf = (t) => TEMPLATES[t]?.name ?? OWN_NAMES[t] ?? `#${t}`;
const metals = (n = MATERIAL_NAMES.length) => MATERIAL_NAMES.slice(0, n).map((name, material) => ({ name, material }));
const isShield = (t) => t >= 109 && t <= 112;

/** An armour piece's or a shield's sets: leather, chain, each plate metal; armour also in each guild's own. */
export const SHIELD_SETS = Object.freeze([{ name: 'Leather', material: 0x0000 }, { name: 'Chain', material: 0x0100 },
  ...MATERIAL_NAMES.map((name, i) => ({ name, material: 0x0200 | i }))]);
export const ARMOUR_SETS = Object.freeze([...SHIELD_SETS, ...GUILD_SETS.map((set) => ({ name: `${set} (guild)`, material: 0x0200, set }))]);

/** What a right hand can hold: each weapon in each metal it comes in. Guns come in one make. */
export const WEAPONS = Object.freeze([
  ...[113, 114, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 115, 129, 130]
    .map((t) => ({ templateIndex: t, name: nameOf(t), materials: metals() })),
  { templateIndex: CROSSBOW_TEMPLATE, name: nameOf(CROSSBOW_TEMPLATE), materials: metals(6) },
  { templateIndex: THUNDERLOCK_TEMPLATE, name: nameOf(THUNDERLOCK_TEMPLATE), materials: [{ name: 'Dwarven', material: 0 }] },
  { templateIndex: PISTOLET_TEMPLATE, name: nameOf(PISTOLET_TEMPLATE), materials: [{ name: 'Dwarven', material: 0 }] },
]);
export const SHIELDS = Object.freeze([109, 110, 111, 112].map((t) => ({ templateIndex: t, name: nameOf(t), materials: SHIELD_SETS })));
/** What a left hand can hold: a shield, a second blade for a pair, or a Pistolet for a brace. */
export const OFF_HANDS = Object.freeze([...SHIELDS, ...WEAPONS.filter((w) => [113, 114, 116, 117, 118, 119, 120, 121, 124, PISTOLET_TEMPLATE].includes(w.templateIndex))]);

/** The armour's pieces, each its template and the slot it is worn in. */
export const ARMOUR = Object.freeze([['Helm', 107, 'Head'], ['Cuirass', 102, 'ChestArmor'], ['Right pauldron', 106, 'RightArm'],
  ['Left pauldron', 105, 'LeftArm'], ['Gauntlets', 103, 'Gloves'], ['Greaves', 104, 'LegsArmor'], ['Boots', 108, 'Feet']]
  .map(([name, templateIndex, slot]) => ({ name, templateIndex, slot })));

/** The clothing slots a person dresses, in the order the page lists them. */
export const CLOTHING_SLOTS = Object.freeze(['ChestClothes', 'LegsClothes', 'Feet', 'Cloak1']);
/** Each sex's garments by slot: the template, its name and its cuts (the forge's garments for each variant). A cloak
 *  has no slot rule of its own: it is worn in a cloak slot. */
export const CLOTHING = Object.freeze((() => {
  const out = { male: {}, female: {} };
  for (const [t, cuts] of Object.entries(GARMENTS_OF_TEMPLATE)) {
    const female = Number(t) >= 182;
    const slot = SLOT_RULES[female ? 'WomensClothing' : 'MensClothing'][t]?.slot ?? 'Cloak1';
    (out[female ? 'female' : 'male'][slot] ??= []).push({ templateIndex: Number(t), name: nameOf(Number(t)), variants: cuts.map(String) });
  }
  return out;
})());

/** The clothing dyes (Daggerfall's band shifts), each once. */
export const DYES = Object.freeze(Object.entries(DYE_COLORS).filter(([, value]) => value < 15).map(([name, value]) => ({ name, value })));
export const RACES = Object.freeze(Object.values(FORGE_RACES));
export const FACE_COUNT = FACES;
export { HORSE_COATS, HORSE_PATTERNS, HORSE_LEGS, HORSE_MOUNTS };
/** A horse's look as the code a rider's look carries. */
export const horseCode = (look) => horseLookCode(look);

/**
 * The equipment a choice makes, as the game's slots hold it.
 * @param {{ right?: any, left?: any, armour?: Record<string, any>, clothes?: Record<string, any> }} kit
 */
export function slotsOf({ right = null, left = null, armour = {}, clothes = {} } = {}) {
  const slots = [];
  if (right) slots[EQUIP_SLOTS.RightHand] = { group: 'Weapons', ...right };
  if (left) slots[EQUIP_SLOTS.LeftHand] = { group: isShield(left.templateIndex) ? 'Armor' : 'Weapons', ...left };
  for (const piece of ARMOUR) if (armour[piece.slot]) slots[EQUIP_SLOTS[piece.slot]] = { group: 'Armor', templateIndex: piece.templateIndex, ...armour[piece.slot] };
  for (const [slot, item] of Object.entries(clothes)) if (item) slots[EQUIP_SLOTS[slot]] = item;
  return slots;
}

/** Whether the game would hold a kit's two hands as a pair. */
export const canPair = (slots) => !!pairedBlades(slots);

/**
 * A person's look as the game dresses a player or another player: the class look their right hand picks, the kit over
 * it, and the race, face, pair and saddle; with the studio's listing (`listed`), the body's own moves it plays.
 * @param {'male'|'female'} gender @param {any[]} slots
 * @param {{ race?: string|null, face?: number|null, paired?: boolean, mounted?: boolean, coat?: number,
 *   listed?: Set<string> | null }} [how]
 */
export function personLook(gender, slots, how = {}) {
  const base = personBase(gender, slots[EQUIP_SLOTS.RightHand] ?? null);
  return base == null ? null : personDressLook(base, slots, { ...how, looks: LOOKS });
}

/** Who wears a class archive: the classes whose rows draw it, or the townsperson Daggerfall draws in it. */
function wearersOf(archive) {
  const classes = Object.entries(ENEMY_BASICS).filter(([id, row]) => Number(id) >= 128 && (row.maleTexture === archive || row.femaleTexture === archive))
    .map(([id]) => ENEMY_NAMES[43 + Number(id) - 128]).filter(Boolean);
  return classes.length ? classes.join(', ') : (designForArchive(archive)?.name ?? '');
}

/** The class looks the forge draws, each its archive, body, weapon and who wears it. */
export const CLASS_LOOKS = Object.freeze(Object.entries(LOOKS.looks).map(([archive, look]) =>
  ({ archive: Number(archive), body: look.body, weapon: look.weapon, who: wearersOf(Number(archive)) })));

/** What a class look may be drawn holding in place of its class's own, as the game composes it: each bow and crossbow
 *  where it draws the bow, each staff where it carries one. */
export function classHoldings(archive) {
  const look = LOOKS.looks[archive];
  if (!look) return [];
  const drawn = LOOKS.bodies[look.body].layers;
  const bows = look.records.some((rec) => rec.anim === 'bow');
  const out = [];
  if (bows) for (const layer of FORGE_BOW_LAYERS) if (drawn[layer]?.includes('bow')) out.push({ layer, key: 'bow', dye: forgeBowDye(layer) });
  if (bows) for (const layer of FORGE_CROSSBOW_LAYERS) if (drawn[layer]?.includes('bow')) out.push({ layer, key: 'bow', dye: forgeCrossbowDye() });
  const first = look.records[0]?.anim;
  if (look.weapon === 'staff') for (const layer of FORGE_STAFF_LAYERS) if (drawn[layer]?.includes(first)) out.push({ layer, key: 'staff', dye: forgeStaffDye(layer) });
  return out;
}

/** A class look, its archive as its base, optionally drawn holding one of classHoldings and in a race of its body. */
export function classLook(archive, holding = null, race = undefined) {
  const look = LOOKS.looks[archive];
  if (!look) return null;
  const out = { ...look, base: Number(archive), own: look.own ?? [] };
  if (holding) Object.assign(out, { [holding.key]: holding.layer, dyes: { ...(look.dyes ?? {}), ...(holding.dye != null ? { [holding.layer]: holding.dye } : {}) } });
  if (race !== undefined) { if (race) out.race = race; else delete out.race; }
  return out;
}

export const ROLES = Object.freeze(Object.keys(OUTFITS));
/** The poses the placed people take (forgeLooks.json `people`), standing first. */
export const POSES = Object.freeze([...new Set(['idle', ...Object.values(LOOKS.people ?? {})
  .flatMap((recs) => Object.values(recs).map(([, pose]) => pose ?? 'idle'))])]);

/** A placed person's look in a pose, as the game builds it for a townsperson. */
export function townsLook({ role, female, child, race, seed, pose }) {
  const anim = POSE_ANIM[pose] ?? pose;
  return standingLook({ role, female, child, race, seed: seed >>> 0 }, [POSE_FRAMES[anim] ?? 1, pose], LOOKS);
}

/**
 * Every record a subject plays, each with how the game composes it: `class` a class archive's record on its canvas,
 * `own` a move on its own cell (or on a class record's canvas, as a person's weapon worn), `playing` an instrument,
 * `standing` a placed person's pose.
 * @param {any} look @param {'person'|'class'|'standing'} kind
 */
export function playsOf(look, kind) {
  if (kind === 'standing') {
    return VIEWS.map((_, view) => ({ how: 'standing', anim: look.anim, view, frames: look.frames, rec: { anim: look.anim, view, keys: look.keys } }));
  }
  const out = look.records.map((rec, index) => ({ how: 'class', anim: rec.anim, view: rec.view, frames: rec.frames, rec, index }));
  (look.own ?? []).forEach((rec, index) => out.push({ how: 'own', anim: rec.anim, view: rec.view, frames: rec.frames, rec, index, worn: rec.worn ?? null }));
  if (kind === 'class') {
    for (const instrument of INSTRUMENT_KINDS) {
      const anim = playingAnim(instrument), frames = LOOKS.bodies[look.body].anims[anim]?.frames ?? 0;
      if (!frames || !lookPlays(look, anim, LOOKS)) continue;
      for (let view = 0; view < PLAYING_VIEWS; view++) out.push({ how: 'playing', anim, view, frames, rec: { anim, view } });
    }
  }
  return out;
}

/** The look a play stacks: a record of the weapon worn wears everything put away. */
export const stackedOf = (look, play) => (play.how === 'own' ? lookAs(look, play.rec) : look);

/** The layers a play stacks, in the compositor's own order, the body first. */
export function layersInPlay(look, play) {
  return layersOf(stackedOf(look, play), play.anim, LOOKS);
}

/**
 * A play's frame composed as the game composes it (forgeDressed.js and forgeLayers.js forgeLookEntries): a class record
 * on its class canvas, a person's worn move on its class record's, any other move on the cell of every layer it stacks,
 * laid on the ground in a fall. `hidden` names layers left out; the canvas and the ground line stay the whole look's.
 * @param {any} look @param {any} play @param {number} frame @param {(path: string) => Promise<any>} strip
 * @param {Set<string>} [hidden]
 */
export async function playPicture(look, play, frame, strip, hidden = new Set()) {
  const stacked = stackedOf(look, play), rec = play.rec;
  const veil = hidden.size ? veiled(stacked.body, play.anim, hidden, strip) : strip;
  if (play.how === 'class' || (play.how === 'own' && ownOnRecord(look, rec, LOOKS))) {
    const record = play.how === 'class' ? play.index : rec.record;
    const onRec = play.how === 'class' ? rec : ownOnRecord(look, rec, LOOKS);
    const key = rec.keys?.[frame] ?? frame;
    if (!hidden.size) return composeRecord(stacked, look.base, record, onRec, key, strip, LOOKS);
    const { canvas, place, quad } = recordCanvas(LOOKS, look.base, record, onRec);
    let lift = recordLift(stacked, onRec, key, LOOKS);
    if (lift == null) { await composeRecord(stacked, look.base, record, onRec, key, strip, LOOKS); lift = recordLift(stacked, onRec, key, LOOKS) ?? 0; }
    const pic = await composeFrame(stacked, onRec.anim, onRec.view, key, canvas, [place[0], place[1] + lift], veil, LOOKS);
    if (pic && quad) pic.quad = quad;
    return pic;
  }
  const { cell, root } = lookCell(stacked, play.anim, LOOKS);
  const key = play.how === 'standing' ? (rec.keys?.[frame] ?? frame) : frame;
  const pic = await composeFrame(stacked, play.anim, play.view, key, cell, root, veil, LOOKS);
  return play.how === 'own' ? laidOnGround(play.anim, pic) : pic;
}

/** A strip reader that answers nothing for the hidden layers' strips in one animation. */
function veiled(body, anim, hidden, strip) {
  const out = new Set([...hidden].flatMap((layer) => [layerPath(body, layer, anim), layerPath(body, layer, anim, true)]));
  return (path) => (out.has(path) ? Promise.resolve(null) : strip(path));
}

/** A worn weapon, a shield in hand or the staff's spark, drawn by design in a few moves only (forgeDressed.js
 *  wornWeapon, forgePlaying.js). */
const BY_DESIGN = /^(sheath_|scabbard_|slung_shield_|shield_|quiver$|spark$)/;

/**
 * Each (layer, move) a look stacks whose strip the studio does not list, and for a person or a townsperson each piece
 * worn that is not drawn in a move it plays. `listed` holds the studio's listed strips. `whole` is the game's own rule
 * for the kind: a person's (dressedWhole), a townsperson's (standingWhole), a class look's (every strip listed).
 */
export function missingOf(look, kind, listed) {
  const missing = new Set();
  const drawn = LOOKS.bodies[look.body]?.layers ?? {};
  for (const play of playsOf(look, kind)) {
    for (const layer of layersInPlay(look, play)) {
      if (!listed.has(layerPath(look.body, layer, play.anim)) || !listed.has(layerPath(look.body, layer, play.anim, true))) missing.add(`${layer} in ${play.anim} (not listed)`);
    }
    if (kind === 'class') continue;   // a class look draws a piece where it is drawn, and goes without it elsewhere
    for (const layer of stackedOf(look, play).gear ?? []) {
      if (!BY_DESIGN.test(layer) && !drawn[layer]?.includes(play.anim)) missing.add(`${layer} in ${play.anim} (not drawn)`);
    }
  }
  const whole = kind === 'person' ? dressedWhole(look, listed, LOOKS) : kind === 'standing' ? standingWhole(look, listed, LOOKS) : missing.size === 0;
  return { missing: [...missing].sort(), whole };
}

/** A studio picture's name parts (`<name>_<record>-<frame>[_<make>].png`), or null for one that is not a frame. */
export function frameName(file) {
  const m = /^(.+?)_(\d+)-(\d+)(?:_(.+))?\.png$/.exec(file);
  return m ? { name: m[1], record: Number(m[2]), frame: Number(m[3]), make: m[4] ?? '' } : null;
}

/**
 * The studio's pictures that are not layer strips, by folder: each folder's records, each record's frames by make (a
 * metal, a hand, the wear map), and its pictures that are not frames. `files` are studio paths (art/studio/index.json).
 */
export function studioFolders(files) {
  const out = {};
  for (const path of files) {
    if (forgeLayerFile(path)) continue;
    const cut = path.lastIndexOf('/');
    const dir = cut < 0 ? '.' : path.slice(0, cut), file = path.slice(cut + 1);
    const folder = (out[dir] ??= { records: {}, makes: new Set(), pictures: [] });
    const at = frameName(file);
    if (!at) { folder.pictures.push(path); continue; }
    folder.makes.add(at.make);
    const rec = (folder.records[`${at.name} ${at.record}`] ??= { name: at.name, record: at.record, frames: new Map(), makes: new Set() });
    rec.makes.add(at.make);
    rec.frames.set(`${at.frame}|${at.make}`, path);
  }
  return out;
}
