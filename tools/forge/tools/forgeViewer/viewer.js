// The forge viewer's page (forge-viewer.html, published with the site): every sprite the forge makes, drawn by the
// game's own compositor off the studio the site serves. kit.js asks the game; this file lays out what it answers. The
// palette is the visitor's own Daggerfall's, as the game stored it or as a file they pick: the site holds no game data.
// The choice lives in the address, so a look can be sent.
import { setDfLookPalette } from '../../src/world/dfLook.js';
import { DFPalette } from '../../src/formats/dfPalette.js';
import { decodePng } from '../../src/systems/textureReplacement.js';
import { studioUrl, STUDIO_INDEX } from '../../src/systems/studioArt/studioArt.js';
import { getBytes } from '../../src/scenes/dataSource.js';
import * as K from './kit.js';
import { choiceOfHash, hashOfChoice } from './address.js';

const $ = (id) => document.getElementById(id);
const canvas = /** @type {HTMLCanvasElement} */ ($('stage'));
const ctx = canvas.getContext('2d');

/** An element with its properties, listeners (`on…`) and children. */
function h(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'checked' || key === 'disabled' || key === 'value') node[key] = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) node.append(kid instanceof Node ? kid : String(kid));
  return node;
}

/** A select over `options` ({ value, label, group? }), its value `value`. */
function pick(options, value, change) {
  const node = h('select', { onchange: () => change(node.value) });
  const groups = new Map();
  for (const option of options) {
    const item = h('option', { value: String(option.value) }, option.label);
    if (!option.group) { node.append(item); continue; }
    if (!groups.has(option.group)) { groups.set(option.group, h('optgroup', { label: option.group })); node.append(groups.get(option.group)); }
    groups.get(option.group).append(item);
  }
  node.value = String(value ?? '');
  return node;
}
/** Fill a node with children, leaving out the empty ones. */
const fill = (node, kids) => node.replaceChildren(...kids.flat().filter((kid) => kid != null && kid !== false));
const row = (label, ...fields) => h('label', { class: 'row' }, h('span', {}, label), ...fields);
const check = (label, checked, change, disabled = false) =>
  h('label', { class: 'check' }, h('input', { type: 'checkbox', checked, disabled, onchange: (e) => change(e.target.checked) }), label);
const seg = (options, value, change) => h('span', { class: 'seg' },
  options.map((o) => h('button', { class: String(o.value) === String(value) ? 'on' : '', onclick: () => change(o.value) }, o.label)));
const num = (value, change, min = 0, max = 1e9) => h('input', { type: 'number', value: String(value), min: String(min), max: String(max),
  onchange: (e) => change(Math.max(min, Math.min(max, Math.floor(Number(e.target.value) || 0)))) });

// ---- the choice -------------------------------------------------------------------------------------------------

const TABS = [['person', 'Person'], ['class', 'Class looks'], ['towns', 'Townsfolk'], ['layers', 'Layers'], ['studio', 'Pictures']];
const DEFAULT = {
  tab: 'person',
  person: { gender: 'male', race: '', face: '', right: '120:0', left: '', paired: false, mounted: false,
    horse: { coat: 0, pattern: 0, legs: 0, mount: 0, seed: 1 }, armour: {}, clothes: {} },
  cls: { archive: K.CLASS_LOOKS.find((c) => c.who)?.archive ?? K.CLASS_LOOKS[0].archive, holding: '', race: 'class' },
  towns: { role: 'commoner', female: false, child: false, race: 'breton', seed: 1, pose: 'idle' },
  layers: { body: 'male', layer: 'body', anim: 'walk', filter: '' },
  studio: { folder: '', record: '', make: '', filter: '' },
  move: '', view: 0, frame: 0, fps: 8, zoom: 3, mode: 'colour', bg: 'check', all: false, outline: false, hidden: [],
};
let state = choiceOfHash(location.hash, DEFAULT);
state.playing = false;
let saving = 0;
/** The hash the page wrote last: an address change to any other is a look sent or typed, and is read. */
let written = location.hash;
function save() {
  clearTimeout(saving);
  saving = setTimeout(() => {
    written = hashOfChoice(state);
    try { history.replaceState(null, '', written); } catch { /* a frame that keeps its own address */ }
  }, 200);
}
// a new choice in the address (a link followed, the hash typed) opens in the page already open: the page keeps no
// other copy of the choice, so the pictures drawn are always the address's
window.addEventListener('hashchange', () => {
  if (location.hash === written) return;
  clearTimeout(saving);
  written = location.hash;
  state = choiceOfHash(location.hash, DEFAULT);
  state.playing = false;
  refresh();
});
/** Change the choice and draw it again; `fresh` starts the move over (a new subject). */
function set(change, fresh = false) {
  change(state);
  if (fresh) { state.frame = 0; state.hidden = []; }
  save();
  refresh();
}

// ---- the studio ------------------------------------------------------------------------------------------------

let files = [];
let artFiles = [];
let listed = new Set();
let folders = {};
const keys = {};
let palette = false;
const STRIPS = new Map();
/** A studio picture decoded as the game decodes it, the last few hundred kept. */
/** How a path names one of the site's pictures outside the studio (art/index.json's), apart from the studio's. */
const ART = '@art/';
/** Whether a folder is one of the site's own (the art folder itself among them), and its name as the site serves it. */
const isArt = (folder) => folder === ART.slice(0, -1) || folder.startsWith(ART);
const folderName = (folder) => (isArt(folder) ? `art${folder.slice(ART.length - 1)}` : `art/studio/${folder}`);
/** A WebP or a JPEG of the site's, read as the game reads a PNG (textureReplacement.js decodePng). */
async function decodeOther(bytes, path) {
  const bmp = await createImageBitmap(new Blob([bytes], { type: /\.webp$/i.test(path) ? 'image/webp' : 'image/jpeg' }));
  const ctx = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const img = ctx.getImageData(0, 0, bmp.width, bmp.height);
  bmp.close?.();
  return { width: img.width, height: img.height, data: new Uint8Array(img.data.buffer) };
}

/** Built for a published page (VITE_FORGE_PACK): every picture is read out of the packs beside the page
 *  (tools/forgeViewer/pack.py), its bytes by their range, the studio's and the site's own alike. */
const PACKED = import.meta.env?.VITE_FORGE_PACK === '1';
let pack = null;
/** Each pack's way of answering: by range, or whole (then kept, the last few). */
const PACK_MODE = new Map();
const PACK_WHOLE = new Map();
async function packedBytes(path) {
  const at = pack?.pictures?.[path];
  if (!at) return null;
  const [n, offset, length] = at;
  const url = new URL(pack.packs[n], document.baseURI);
  const whole = () => {
    if (!PACK_WHOLE.has(n)) {
      if (PACK_WHOLE.size >= 4) PACK_WHOLE.delete(PACK_WHOLE.keys().next().value);
      PACK_WHOLE.set(n, fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)));
    }
    return PACK_WHOLE.get(n).then((buf) => (buf ? new Uint8Array(buf, offset, length) : null));
  };
  if (PACK_MODE.has(n)) {
    if (await PACK_MODE.get(n) === 'whole') return whole();
    const r = await fetch(url, { headers: { Range: `bytes=${offset}-${offset + length - 1}` } });
    return r.status === 206 ? new Uint8Array(await r.arrayBuffer()) : null;
  }
  let answer;
  PACK_MODE.set(n, new Promise((done) => { answer = done; }));
  const r = await fetch(url, { headers: { Range: `bytes=${offset}-${offset + length - 1}` } }).catch(() => null);
  if (r?.status === 206) {
    answer('range');
    return new Uint8Array(await r.arrayBuffer());
  }
  answer('whole');
  if (r?.ok) PACK_WHOLE.set(n, r.arrayBuffer());
  return whole();
}

/** A packed picture decoded as the game decodes a PNG, whatever its type. */
async function decodePacked(bytes, type) {
  if (type === 'image/png') return decodePng(bytes);
  const bmp = await createImageBitmap(new Blob([bytes], { type }));
  const ctx = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const img = ctx.getImageData(0, 0, bmp.width, bmp.height);
  bmp.close?.();
  return { width: img.width, height: img.height, data: new Uint8Array(img.data.buffer) };
}

function strip(path) {
  if (STRIPS.has(path)) {
    const held = STRIPS.get(path);
    STRIPS.delete(path);
    STRIPS.set(path, held);
    return held;
  }
  if (STRIPS.size >= 600) STRIPS.delete(STRIPS.keys().next().value);
  if (PACKED) {
    const got = packedBytes(path).then((bytes) => (bytes ? decodePacked(bytes, pack.pictures[path][3]) : null)).catch(() => null);
    STRIPS.set(path, got);
    return got;
  }
  const own = path.startsWith(ART);   // one of the site's own pictures, outside the studio
  const got = fetch(own ? new URL(`art/${path.slice(ART.length)}`, document.baseURI) : studioUrl(path)).then((r) => (r.ok ? r.arrayBuffer() : null))
    .then((bytes) => (!bytes ? null : own && !/\.png$/i.test(path) ? decodeOther(bytes, path) : decodePng(new Uint8Array(bytes)))).catch(() => null);
  STRIPS.set(path, got);
  return got;
}

/** Lay Daggerfall's palette on (ART_PAL.COL's bytes), so the dyes and the palette's snap are the game's. */
function usePalette(bytes) {
  const colours = new DFPalette();
  colours.load(bytes, 'ART_PAL.COL');
  setDfLookPalette(colours);
  palette = true;
  PICS.clear();
}

const PALETTE_KEPT = 'forgeViewer.palette';
/** The palette: the game's stored Daggerfall data on this site, else one picked here before, else none yet. */
async function findPalette() {
  try {
    usePalette(await getBytes('ART_PAL.COL'));
    return;
  } catch { /* no Daggerfall data stored on this site */ }
  try {
    const kept = localStorage.getItem(PALETTE_KEPT);
    if (kept) usePalette(Uint8Array.from(atob(kept), (c) => c.charCodeAt(0)));
  } catch { /* storage refused: pick it again */ }
}

/** A palette picked from the visitor's own files, kept for their next visit. */
async function pickPalette(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length !== 768 && bytes.length !== 776) {
    showStatus('That is not ART_PAL.COL. It is in the ARENA2 folder of Daggerfall.');
    return;
  }
  usePalette(bytes);
  try { localStorage.setItem(PALETTE_KEPT, btoa(String.fromCharCode(...bytes))); } catch { /* kept for this visit only */ }
  showStatus();
  refresh();
}

function showStatus(note = '') {
  const words = [files.length || listed.size ? `${listed.size} layer strips, ${files.length + artFiles.length} other pictures` : 'The studio listing did not load.'];
  if (note) words.push(note);
  else if (!palette) words.push('No palette: the dyes show grey.');
  const pickOne = !palette && h('label', { class: 'pick' }, 'Pick ART_PAL.COL',
    h('input', { type: 'file', accept: '.col,.COL', onchange: (e) => e.target.files[0] && pickPalette(e.target.files[0]) }));
  fill($('status'), [words.join(' · '), pickOne]);
  $('status').classList.toggle('bad', !palette || !listed.size);
}

async function boot() {
  if (PACKED) {
    const [, index] = await Promise.all([findPalette(), fetch(new URL('index.json', document.baseURI)).then((r) => (r.ok ? r.json() : null)).catch(() => null)]);
    pack = index;
    const paths = Object.keys(index?.pictures ?? {});
    listed = new Set(paths.filter((path) => K.forgeLayerFile(path)));
    files = paths.filter((path) => !path.startsWith(ART) && !listed.has(path));
    artFiles = paths.filter((path) => path.startsWith(ART));
    folders = K.studioFolders([...files, ...artFiles]);
    showStatus();
    refresh();
    return;
  }
  const [, index, art] = await Promise.all([
    findPalette(),
    fetch(studioUrl(STUDIO_INDEX)).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch(new URL('art/index.json', document.baseURI)).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  if (index) {
    files = index.files ?? [];
    listed = new Set(K.forgeLayersListed(index.layers));
  }
  artFiles = (art?.files ?? []).map((path) => `${ART}${path}`);
  folders = K.studioFolders([...files, ...artFiles]);
  showStatus();
  for (const body of import.meta.env?.DEV ? K.BODIES : []) {   // the render's keys, beside the forge: the dev server's alone
    fetch(new URL(`tools/sprite-forge/keys/keys-${body}.json`, document.baseURI)).then((r) => (r.ok ? r.json() : null)).then((json) => {
      if (!json) return;
      keys[body] = json;
      renderInfo();
    }).catch(() => {});
  }
  refresh();
}

// ---- what is shown ---------------------------------------------------------------------------------------------

/** The person tab's choice as equipment. */
function personKit(p) {
  const item = (code) => {
    if (!code) return null;
    const [templateIndex, material] = code.split(':').map(Number);
    return { templateIndex, material };
  };
  const armour = {};
  for (const [slot, at] of Object.entries(p.armour)) {
    const kit = K.ARMOUR_SETS[Number(at)];
    if (at !== '' && kit) armour[slot] = { material: kit.material, ...(kit.set ? { set: kit.set } : {}) };
  }
  const clothes = {};
  for (const [slot, c] of Object.entries(p.clothes)) if (c?.t) clothes[slot] = { templateIndex: Number(c.t), variant: Number(c.v ?? 0), dye: Number(c.d ?? 0) };
  return { right: item(p.right), left: item(p.left), armour, clothes };
}

let subject = { kind: null, look: null, key: '', plays: [], moves: [] };
function computeSubject() {
  const s = state;
  if (s.tab === 'person') {
    const p = s.person, slots = K.slotsOf(personKit(p));
    const look = K.personLook(p.gender, slots, { race: p.race || null, face: p.face === '' ? null : Number(p.face),
      paired: p.paired && K.canPair(slots), mounted: p.mounted, coat: p.mounted ? K.horseCode(p.horse) : 0, listed });
    return wrap('person', look, JSON.stringify(p));
  }
  if (s.tab === 'class') {
    const holding = K.classHoldings(s.cls.archive).find((x) => x.layer === s.cls.holding) ?? null;
    return wrap('class', K.classLook(s.cls.archive, holding, s.cls.race === 'class' ? undefined : s.cls.race), JSON.stringify(s.cls));
  }
  if (s.tab === 'towns') return wrap('standing', K.townsLook(s.towns), JSON.stringify(s.towns));
  return { kind: null, look: null, key: '', plays: [], moves: [] };
}
/** A subject's plays gathered into moves, each its plays by view. */
function wrap(kind, look, key) {
  if (!look) return { kind, look: null, key, plays: [], moves: [] };
  const plays = K.playsOf(look, kind), moves = [], byKey = new Map();
  plays.forEach((play, i) => {
    const k = `${play.how}|${play.anim}|${play.worn ?? ''}`;
    if (!byKey.has(k)) {
      byKey.set(k, { key: k, how: play.how, anim: play.anim, worn: play.worn, views: [] });
      moves.push(byKey.get(k));
    }
    byKey.get(k).views[play.view] = i;
  });
  return { kind, look, key, plays, moves };
}
function currentMove() {
  const move = subject.moves.find((m) => m.key === state.move) ?? subject.moves[0];
  if (!move) return null;
  const view = move.views[state.view] != null ? state.view : move.views.findIndex((v) => v != null);
  return { move, view, index: move.views[view], play: subject.plays[move.views[view]] };
}

const PICS = new Map();
/** A play's frame composed, kept (the last several hundred). */
function pictureOf(index, frame) {
  const key = `${state.tab}|${subject.key}|${index}|${frame}|${[...state.hidden].sort().join(',')}`;
  if (PICS.has(key)) return PICS.get(key);
  if (PICS.size >= 900) PICS.delete(PICS.keys().next().value);
  const got = K.playPicture(subject.look, subject.plays[index], frame, strip, new Set(state.hidden)).catch((e) => {
    console.error(e);
    return null;
  });
  PICS.set(key, got);
  return got;
}

/** How many frames the current view steps through. */
function frameCount() {
  if (state.tab === 'layers') return K.LOOKS.bodies[state.layers.body]?.anims?.[state.layers.anim]?.frames ?? 1;
  if (state.tab === 'studio') return studioFrames().length || 1;
  return currentMove()?.play?.frames ?? 1;
}

// ---- drawing ---------------------------------------------------------------------------------------------------

/** A picture as an ImageData in a mode: its colours, its depth as grey, the weapon in hand lit. */
function imageOf(pic, mode) {
  const { width, height } = pic, out = new ImageData(width, height), px = out.data;
  if (mode === 'depth' && pic.depth) {
    let lo = 255, hi = 0;
    for (const d of pic.depth) if (d) { lo = Math.min(lo, d); hi = Math.max(hi, d); }
    pic.depth.forEach((d, i) => {
      if (!d) return;
      const v = hi > lo ? Math.round(40 + (215 * (d - lo)) / (hi - lo)) : 200;
      px.set([v, v, v, 255], i * 4);
    });
    return out;
  }
  px.set(pic.data.subarray(0, width * height * 4));
  if (mode === 'held' && pic.held) {
    for (let i = 0; i < width * height; i++) {
      if (!px[i * 4 + 3]) continue;
      if (pic.held[i]) px.set([255, 60, 220, 255], i * 4);
      else for (let c = 0; c < 3; c++) px[i * 4 + c] = px[i * 4 + c] * 0.35;
    }
  }
  return out;
}

const PART_COLOURS = [[0, 0, 0], [200, 120, 80], [80, 160, 220], [220, 200, 80], [150, 110, 200], [110, 200, 140],
  [240, 150, 170], [60, 120, 200], [200, 80, 60], [250, 250, 250], [100, 200, 200], [160, 120, 60], [230, 120, 30],
  [120, 120, 120], [80, 80, 160], [160, 80, 160]];
/** A depth strip read out: how deep each texel lies as grey, or which part of the body it is as a colour. */
function stripDepthImage(depth, mode) {
  const { width, height, data } = depth, out = new ImageData(width, height), px = out.data;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < width * height; i++) if (data[i * 4 + 3]) { const d = data[i * 4] * 256 + data[i * 4 + 1]; lo = Math.min(lo, d); hi = Math.max(hi, d); }
  for (let i = 0; i < width * height; i++) {
    if (!data[i * 4 + 3]) continue;
    if (mode === 'parts') px.set([...PART_COLOURS[data[i * 4 + 2] % 16], 255], i * 4);
    else {
      const v = hi > lo ? Math.round(255 - (215 * (data[i * 4] * 256 + data[i * 4 + 1] - lo)) / (hi - lo)) : 200;
      px.set([v, v, v, 255], i * 4);
    }
  }
  return out;
}

/** The panels the current choice shows: each a picture, its label, and what the pointer may read off it. */
async function panelsNow() {
  if (state.tab === 'layers') return layerPanels();
  if (state.tab === 'studio') return studioPanels();
  const at = currentMove();
  if (!at) return [];
  const views = state.all ? at.move.views.map((index, view) => ({ index, view })).filter((v) => v.index != null) : [{ index: at.index, view: at.view }];
  const out = [];
  for (const { index, view } of views) {
    const play = subject.plays[index];
    const frame = Math.min(state.frame, play.frames - 1);
    const pic = await pictureOf(index, frame);
    if (pic) out.push({ pic, image: imageOf(pic, state.mode), label: `${K.VIEWS[view]} · frame ${frame}`, ground: true });
  }
  if (state.playing) {   // the rest of the move composed ahead of the playhead
    for (const { index } of views) for (let f = 0; f < subject.plays[index].frames; f++) pictureOf(index, f);
  }
  return out;
}

async function layerPanels() {
  const { body, layer, anim } = state.layers;
  const [colour, depth] = await Promise.all([strip(K.layerPath(body, layer, anim)), strip(K.layerPath(body, layer, anim, true))]);
  const out = [];
  const own = K.LOOKS.bodies[body];
  const { cell, root } = own?.anims?.[anim] ? K.layerCellOf(K.LOOKS, body, layer, anim) : { cell: null, root: null };
  const grid = cell ? { cell, root, frames: own.anims[anim].frames, frame: state.frame } : null;
  if (colour && (state.mode === 'colour' || !depth)) out.push({ pic: colour, image: new ImageData(new Uint8ClampedArray(colour.data), colour.width, colour.height), label: 'colour', grid });
  if (depth && state.mode !== 'colour') out.push({ pic: depth, image: stripDepthImage(depth, state.mode), label: state.mode === 'parts' ? 'parts' : 'depth', grid, depth: true });
  return out;
}

/** The current studio record's frames in the current make, in order. */
function studioFrames() {
  const folder = folders[state.studio.folder];
  const rec = folder?.records?.[state.studio.record];
  if (!rec) return [];
  return [...rec.frames.entries()].filter(([k]) => k.split('|')[1] === state.studio.make)
    .map(([k, path]) => ({ frame: Number(k.split('|')[0]), path })).sort((a, b) => a.frame - b.frame);
}

async function studioPanels() {
  const folder = folders[state.studio.folder];
  if (!folder) return [];
  if (state.studio.record === '#pictures') {
    const out = [];
    for (const path of folder.pictures.filter((p) => !state.studio.filter || p.includes(state.studio.filter)).slice(0, 120)) {
      const pic = await strip(path);
      if (pic) out.push({ pic, image: new ImageData(new Uint8ClampedArray(pic.data), pic.width, pic.height), label: path.split('/').pop() });
    }
    return out;
  }
  const list = studioFrames();
  const shown = state.all ? list : list.slice(Math.min(state.frame, list.length - 1), Math.min(state.frame, list.length - 1) + 1);
  const out = [];
  for (const { frame, path } of shown) {
    const pic = await strip(path);
    if (pic) out.push({ pic, image: new ImageData(new Uint8ClampedArray(pic.data), pic.width, pic.height), label: `frame ${frame}`, path });
  }
  return out;
}

const BACKGROUNDS = { check: null, dark: '#101114', light: '#d9dcd2', grass: '#4d6a32', sky: '#87a9c8', magenta: '#ff00ff' };
let placed = [];
let drawing = 0;
async function draw() {
  const token = ++drawing;
  const list = await panelsNow();
  if (token !== drawing) return;
  const gap = 14, labelH = 16, room = Math.max(240, $('stageWrap').clientWidth - 32);
  let x = 0, y = 0, rowH = 0, wide = 1;
  placed = [];
  ctx.font = '11px system-ui, sans-serif';
  for (const item of list) {
    const scale = Math.max(1, Math.min(state.zoom, Math.floor(16000 / Math.max(item.image.width, item.image.height))));
    const w = item.image.width * scale, hgt = item.image.height * scale;
    const room1 = Math.max(w, Math.ceil(ctx.measureText(item.label).width) + 4);   // its label as wide as it needs
    if (x > 0 && x + room1 > room) { x = 0; y += rowH + gap; rowH = 0; }
    placed.push({ ...item, x, y: y + labelH, w, h: hgt, scale });
    x += room1 + gap;
    rowH = Math.max(rowH, hgt + labelH);
    wide = Math.max(wide, x - gap);
  }
  canvas.width = wide;
  canvas.height = Math.max(1, y + rowH);
  ctx.imageSmoothingEnabled = false;
  ctx.font = '11px system-ui, sans-serif';
  for (const p of placed) {
    ctx.fillStyle = getComputedStyle(document.body).color;
    ctx.fillText(p.label, p.x, p.y - 4);
    paintGround(p);
    const tmp = new OffscreenCanvas(p.image.width, p.image.height);
    tmp.getContext('2d').putImageData(p.image, 0, 0);
    ctx.drawImage(tmp, p.x, p.y, p.w, p.h);
    if (state.outline || p.grid) paintOverlay(p);
  }
  renderTransport();
}

function paintGround(p) {
  const fill = BACKGROUNDS[state.bg];
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    return;
  }
  const size = 8;
  for (let yy = 0; yy < p.h; yy += size) {
    for (let xx = 0; xx < p.w; xx += size) {
      ctx.fillStyle = ((xx + yy) / size) % 2 ? '#3a3f48' : '#2b2f37';
      ctx.fillRect(p.x + xx, p.y + yy, Math.min(size, p.w - xx), Math.min(size, p.h - yy));
    }
  }
}

function paintOverlay(p) {
  ctx.save();
  ctx.lineWidth = 1;
  if (state.outline) {
    ctx.strokeStyle = 'rgba(216,162,72,0.9)';
    ctx.strokeRect(p.x - 0.5, p.y - 0.5, p.w + 1, p.h + 1);
    if (p.ground) {   // the canvas's bottom row is where the game stands the feet
      ctx.strokeStyle = 'rgba(111,191,115,0.9)';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + p.h - p.scale / 2);
      ctx.lineTo(p.x + p.w, p.y + p.h - p.scale / 2);
      ctx.stroke();
    }
  }
  if (p.grid) {
    const [cw, ch] = p.grid.cell, s = p.scale;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    for (let col = 0; col <= p.grid.frames; col++) {
      ctx.beginPath();
      ctx.moveTo(p.x + col * cw * s + 0.5, p.y);
      ctx.lineTo(p.x + col * cw * s + 0.5, p.y + 5 * ch * s);
      ctx.stroke();
    }
    for (let r = 0; r <= 5; r++) {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + r * ch * s + 0.5);
      ctx.lineTo(p.x + p.grid.frames * cw * s, p.y + r * ch * s + 0.5);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(216,162,72,0.95)';
    ctx.strokeRect(p.x + p.grid.frame * cw * s + 0.5, p.y + 0.5, cw * s, 5 * ch * s);
    ctx.strokeStyle = 'rgba(224,103,93,0.95)';
    for (let r = 0; r < 5; r++) {
      for (let col = 0; col < p.grid.frames; col++) {
        const rx = p.x + (col * cw + p.grid.root[0]) * s, ry = p.y + (r * ch + p.grid.root[1]) * s;
        ctx.beginPath();
        ctx.moveTo(rx - 4, ry);
        ctx.lineTo(rx + 4, ry);
        ctx.moveTo(rx, ry - 4);
        ctx.lineTo(rx, ry + 4);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

canvas.addEventListener('mousemove', (e) => {
  const box = canvas.getBoundingClientRect();
  const mx = e.clientX - box.left, my = e.clientY - box.top;
  const p = placed.find((q) => mx >= q.x && mx < q.x + q.w && my >= q.y && my < q.y + q.h);
  if (!p) { $('hover').textContent = 'Point at the picture to read a pixel.'; return; }
  const x = Math.floor((mx - p.x) / p.scale), y = Math.floor((my - p.y) / p.scale), i = y * p.pic.width + x;
  const d = p.pic.data, words = [`${p.label}  x ${x}  y ${y}`];
  words.push(`rgba ${d[i * 4]},${d[i * 4 + 1]},${d[i * 4 + 2]},${d[i * 4 + 3]}`);
  if (p.depth) words.push(`depth ${d[i * 4] * 256 + d[i * 4 + 1]}  part ${d[i * 4 + 2]}`);
  if (p.pic.depth) words.push(`depth byte ${p.pic.depth[i]}`);
  if (p.pic.held) words.push(p.pic.held[i] ? 'weapon in hand' : '');
  if (p.grid) words.push(`cell ${Math.floor(x / p.grid.cell[0])}, view ${K.VIEWS[Math.floor(y / p.grid.cell[1])] ?? '-'}`);
  if (p.path) words.push(p.path);
  $('hover').textContent = words.filter(Boolean).join('   ');
});
window.addEventListener('resize', () => draw());

// ---- playing ---------------------------------------------------------------------------------------------------

let timer = 0;
function setPlaying(on) {
  state.playing = on;
  clearInterval(timer);
  if (on) {
    timer = setInterval(() => {
      state.frame = (state.frame + 1) % frameCount();
      draw();
    }, 1000 / Math.max(1, state.fps));
  }
  renderTransport();
}
function step(by) {
  state.frame = (state.frame + by + frameCount()) % frameCount();
  save();
  draw();
}
document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (e.key === 'ArrowRight') step(1);
  else if (e.key === 'ArrowLeft') step(-1);
  else if (e.key === ' ') { e.preventDefault(); setPlaying(!state.playing); }
  else if (/^[1-5]$/.test(e.key)) set((s) => { s.view = Number(e.key) - 1; });
});

// ---- the page's parts ------------------------------------------------------------------------------------------

function renderTabs() {
  $('tabs').replaceChildren(...TABS.map(([id, label]) => h('button', { role: 'tab', 'aria-selected': String(state.tab === id),
    onclick: () => set((s) => { s.tab = id; s.move = ''; s.mode = 'colour'; }, true) }, label)));
}

function renderTransport() {
  const n = frameCount(), frame = Math.min(state.frame, n - 1);
  const at = currentMove();
  const keyed = at && at.play?.rec?.keys ? ` (key ${at.play.rec.keys[frame]})` : '';
  const modes = state.tab === 'layers' ? [['colour', 'Colour'], ['depth', 'Depth'], ['parts', 'Parts']]
    : state.tab === 'studio' ? [['colour', 'Colour']] : [['colour', 'Colour'], ['depth', 'Depth'], ['held', 'Weapon']];
  const all = state.tab === 'studio' ? 'All frames' : state.tab === 'layers' ? null : 'All five views';
  fill($('transport'), [
    h('button', { onclick: () => step(-1), title: 'Left arrow' }, '◀'),
    h('button', { onclick: () => setPlaying(!state.playing), title: 'Space' }, state.playing ? 'Pause' : 'Play'),
    h('button', { onclick: () => step(1), title: 'Right arrow' }, '▶'),
    h('input', { type: 'range', min: '0', max: String(n - 1), value: String(frame), oninput: (e) => { state.frame = Number(e.target.value); save(); draw(); } }),
    h('span', { class: 'mono' }, `${frame + 1}/${n}${keyed}`),
    h('label', { class: 'check' }, 'fps', h('input', { type: 'number', min: '1', max: '30', value: String(state.fps), style: 'width:52px',
      onchange: (e) => { state.fps = Math.max(1, Math.min(30, Number(e.target.value) || 8)); save(); if (state.playing) setPlaying(true); } })),
    h('label', { class: 'check' }, 'zoom', pick([1, 2, 3, 4, 5, 6, 8, 10].map((z) => ({ value: z, label: `${z}×` })), state.zoom, (v) => set((s) => { s.zoom = Number(v); }))),
    seg(modes.map(([value, label]) => ({ value, label })), state.mode, (v) => set((s) => { s.mode = v; })),
    pick(Object.keys(BACKGROUNDS).map((b) => ({ value: b, label: b === 'check' ? 'checker' : b })), state.bg, (v) => set((s) => { s.bg = v; })),
    all ? check(all, state.all, (v) => set((s) => { s.all = v; })) : null,
    state.tab !== 'studio' && state.tab !== 'layers' ? check('Canvas and ground', state.outline, (v) => set((s) => { s.outline = v; })) : null,
  ]);
}

function renderMoves() {
  if (!subject.look) {
    $('moves').replaceChildren(state.tab === 'layers' || state.tab === 'studio' ? '' : h('span', { class: 'no' }, 'No look: the game has no class look for this choice.'));
    $('moves').hidden = state.tab === 'layers' || state.tab === 'studio';
    return;
  }
  $('moves').hidden = false;
  const at = currentMove();
  const label = (m) => `${m.anim}${m.worn ? ' · worn' : ''}${m.how === 'playing' ? ' ♪' : ''}`;
  const groups = [['class', 'Records'], ['own', 'Own moves'], ['playing', 'Playing'], ['standing', 'Pose']];
  const kids = [];
  for (const [how, title] of groups) {
    const list = subject.moves.filter((m) => m.how === how);
    if (!list.length) continue;
    kids.push(h('span', { class: 'dim' }, `${title}:`));
    for (const m of list) kids.push(h('button', { class: at?.move === m ? 'on' : '', onclick: () => set((s) => { s.move = m.key; s.frame = 0; }) }, label(m)));
    kids.push(h('span', { class: 'sep' }));
  }
  kids.push(h('span', { class: 'dim' }, 'View:'), h('span', { class: 'views' }, K.VIEWS.map((name, view) =>
    h('button', { class: at?.view === view ? 'on' : '', disabled: at?.move.views[view] == null, title: `Key ${view + 1}`,
      onclick: () => set((s) => { s.view = view; }) }, name))));
  fill($('moves'), kids);
}

function renderSide() {
  const side = $('side');
  if (state.tab === 'person') fill(side, personSide());
  else if (state.tab === 'class') fill(side, classSide());
  else if (state.tab === 'towns') fill(side, townsSide());
  else if (state.tab === 'layers') fill(side, layersSide());
  else fill(side, studioSide());
  side.querySelector('.list button.on')?.scrollIntoView({ block: 'nearest' });
}

const raceOptions = (first) => [...first, ...K.RACES.map((r) => ({ value: r, label: r }))];
const materialOptions = (entry) => (entry?.materials ?? []).map((m) => ({ value: m.material, label: m.name }));
const itemCode = (t, m) => `${t}:${m}`;
const itemParts = (code) => (code ? code.split(':').map(Number) : [null, null]);

function personSide() {
  const p = state.person;
  const slots = K.slotsOf(personKit(p));
  const [rt, rm] = itemParts(p.right), [lt, lm] = itemParts(p.left);
  const right = K.WEAPONS.find((w) => w.templateIndex === rt), left = K.OFF_HANDS.find((w) => w.templateIndex === lt);
  const hand = (list, entry, t, m, key) => h('div', { class: 'pair' },
    pick([{ value: '', label: '(empty)' }, ...list.map((w) => ({ value: w.templateIndex, label: w.name, group: w.templateIndex <= 112 ? 'Shields' : 'Weapons' }))], t ?? '',
      (v) => set((s) => { const next = list.find((w) => w.templateIndex === Number(v)); s.person[key] = next ? itemCode(next.templateIndex, next.materials.some((x) => x.material === m) ? m : next.materials[0].material) : ''; }, true)),
    pick(materialOptions(entry), m ?? '', (v) => set((s) => { s.person[key] = itemCode(t, Number(v)); })));
  const out = [
    h('h2', {}, 'Body'),
    row('Body', seg([{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }], p.gender, (v) => set((s) => { s.person.gender = v; s.person.clothes = {}; }, true))),
    row('Race', pick(raceOptions([{ value: '', label: '(as drawn)' }]), p.race, (v) => set((s) => { s.person.race = v; }))),
    row('Face', pick([{ value: '', label: '(none)' }, ...Array.from({ length: K.FACE_COUNT }, (_, i) => ({ value: i, label: `Face ${i}` }))], p.face, (v) => set((s) => { s.person.face = v; }))),
    h('h2', {}, 'Hands'),
    row('Right', hand(K.WEAPONS, right, rt, rm, 'right')),
    row('Left', hand(K.OFF_HANDS, left, lt, lm, 'left')),
    check('Held as a pair', p.paired && K.canPair(slots), (v) => set((s) => { s.person.paired = v; }, true), !K.canPair(slots)),
    h('h2', {}, 'Armour'),
    row('Whole set', pick([{ value: '', label: '(choose)' }, { value: 'none', label: '(none)' }, ...K.ARMOUR_SETS.map((a, i) => ({ value: i, label: a.name }))], '',
      (v) => set((s) => { s.person.armour = v === 'none' ? {} : Object.fromEntries(K.ARMOUR.map((a) => [a.slot, v])); }))),
  ];
  for (const piece of K.ARMOUR) {
    out.push(row(piece.name, pick([{ value: '', label: '(none)' }, ...K.ARMOUR_SETS.map((a, i) => ({ value: i, label: a.name }))], p.armour[piece.slot] ?? '',
      (v) => set((s) => { s.person.armour[piece.slot] = v; }))));
  }
  out.push(h('h2', {}, 'Clothing'));
  const NAMES = { ChestClothes: 'Chest', LegsClothes: 'Legs', Feet: 'Feet', Cloak1: 'Cloak' };
  for (const slot of K.CLOTHING_SLOTS) {
    const list = K.CLOTHING[p.gender][slot] ?? [], worn = p.clothes[slot] ?? {};
    const garment = list.find((g) => g.templateIndex === Number(worn.t));
    out.push(row(NAMES[slot], h('div', { class: 'trio' },
      pick([{ value: '', label: '(none)' }, ...list.map((g) => ({ value: g.templateIndex, label: g.name }))], worn.t ?? '',
        (v) => set((s) => { s.person.clothes[slot] = v ? { t: Number(v), v: 0, d: worn.d ?? 0 } : null; })),
      pick((garment?.variants ?? ['']).map((cut, i) => ({ value: i, label: `${i}: ${cut || '-'}` })), worn.v ?? 0,
        (v) => set((s) => { s.person.clothes[slot] = { ...worn, v: Number(v) }; })),
      pick(K.DYES.map((d) => ({ value: d.value, label: d.name })), worn.d ?? 0, (v) => set((s) => { s.person.clothes[slot] = { ...worn, d: Number(v) }; })))));
  }
  const horse = p.horse;
  const horsePick = (label, list, key) => row(label, pick(list.map((name, i) => ({ value: i, label: name })), horse[key], (v) => set((s) => { s.person.horse[key] = Number(v); })));
  out.push(h('h2', {}, 'Saddle'), check('Mounted', p.mounted, (v) => set((s) => { s.person.mounted = v; s.move = ''; }, true)));
  if (p.mounted) {
    out.push(horsePick('Coat', K.HORSE_COATS, 'coat'), horsePick('Pattern', K.HORSE_PATTERNS, 'pattern'), horsePick('Legs', K.HORSE_LEGS, 'legs'),
      horsePick('Mount look', K.HORSE_MOUNTS, 'mount'), row('Seed', num(horse.seed, (v) => set((s) => { s.person.horse.seed = v; }), 0, K.HORSE_SEED_MAX)));
  }
  out.push(h('p', { class: 'note' }, 'Drawn as the game dresses a player: the class body your right hand picks, then every piece over it.'));
  return out;
}

function classSide() {
  const c = state.cls;
  const holdings = K.classHoldings(c.archive);
  return [
    h('h2', {}, 'Class look'),
    h('div', { class: 'list' }, K.CLASS_LOOKS.map((look) => h('button', { class: look.archive === c.archive ? 'on' : '',
      onclick: () => set((s) => { s.cls = { archive: look.archive, holding: '', race: 'class' }; s.move = ''; }, true) },
    `${look.archive} · ${look.body} · ${look.weapon ?? 'unarmed'}${look.who ? ` · ${look.who}` : ''}`))),
    row('Holding', pick([{ value: '', label: '(the class’s own)' }, ...holdings.map((x) => ({ value: x.layer, label: x.layer }))], c.holding,
      (v) => set((s) => { s.cls.holding = v; }))),
    row('Race', pick(raceOptions([{ value: 'class', label: '(the class’s own)' }, { value: '', label: '(none)' }]), c.race, (v) => set((s) => { s.cls.race = v; }))),
    h('p', { class: 'note' }, 'A foe or a townsperson in their class look. Records play on the class archive’s canvas; own moves on their own cell.'),
  ];
}

function townsSide() {
  const t = state.towns;
  return [
    h('h2', {}, 'Townsperson'),
    row('Role', pick(K.ROLES.map((r) => ({ value: r, label: r })), t.role, (v) => set((s) => { s.towns.role = v; }))),
    row('Sex', seg([{ value: 'false', label: 'Male' }, { value: 'true', label: 'Female' }], String(t.female), (v) => set((s) => { s.towns.female = v === 'true'; }))),
    check('Child', t.child, (v) => set((s) => { s.towns.child = v; })),
    row('Race', pick(K.RACES.map((r) => ({ value: r, label: r })), t.race, (v) => set((s) => { s.towns.race = v; }))),
    row('Seed', h('div', { class: 'pair' }, num(t.seed, (v) => set((s) => { s.towns.seed = v; }), 0, 0xffffffff),
      h('button', { onclick: () => set((s) => { s.towns.seed = Math.floor(Math.random() * 0xffffffff); }) }, 'Roll'))),
    row('Pose', pick(K.POSES.map((pose) => ({ value: pose, label: pose })), t.pose, (v) => set((s) => { s.towns.pose = v; s.frame = 0; }))),
    h('p', { class: 'note' }, 'The game draws a placed person facing ahead (Front) only; the other views are here to check.'),
  ];
}

function layersSide() {
  const L = state.layers, own = K.LOOKS.bodies[L.body];
  const names = Object.keys(own?.layers ?? {}).sort().filter((n) => !L.filter || n.includes(L.filter));
  const anims = own?.layers?.[L.layer] ?? [];
  return [
    h('h2', {}, 'Layer strip'),
    row('Body', pick(K.BODIES.map((b) => ({ value: b, label: b })), L.body, (v) => set((s) => { s.layers.body = v; }, true))),
    row('Find', h('input', { type: 'text', value: L.filter, placeholder: 'sword, cloak, helm…',
      onchange: (e) => set((s) => { s.layers.filter = e.target.value.trim(); }) })),
    h('div', { class: 'list' }, names.map((n) => h('button', { class: n === L.layer ? 'on' : '',
      onclick: () => set((s) => { s.layers.layer = n; if (!own.layers[n].includes(s.layers.anim)) s.layers.anim = own.layers[n][0]; }, true) },
    `${n} (${own.layers[n].length})`))),
    row('Move', pick(anims.map((a) => ({ value: a, label: `${a} · ${own.anims[a]?.frames ?? '?'} frames` })), L.anim, (v) => set((s) => { s.layers.anim = v; }, true))),
    h('p', { class: 'note' }, `${names.length} layers. A strip is five rows (the views) by its frames; the cross is each cell’s root.`),
  ];
}

/** A folder's first record and its first make, or its pictures where it has no records. */
function firstRecord(name) {
  const folder = folders[name];
  const first = folder && Object.keys(folder.records).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))[0];
  if (!first) return { record: folder?.pictures.length ? '#pictures' : '', make: '' };
  return { record: first, make: [...folder.records[first].makes].sort()[0] };
}

function studioSide() {
  const st = state.studio;
  const names = Object.keys(folders).sort();
  const folder = folders[st.folder];
  const recs = folder ? Object.keys(folder.records).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).filter((r) => !st.filter || r.includes(st.filter)) : [];
  const rec = folder?.records?.[st.record];
  return [
    h('h2', {}, 'Pictures'),
    row('Folder', pick([{ value: '', label: '(choose)' }, ...names.map((n) => ({ value: n, group: isArt(n) ? 'The site\u2019s pictures' : 'The studio',
      label: `${folderName(n)} (${Object.keys(folders[n].records).length + folders[n].pictures.length})` }))], st.folder,
      (v) => set((s) => { s.studio = { folder: v, ...firstRecord(v), filter: '' }; }, true))),
    folder ? row('Find', h('input', { type: 'text', value: st.filter, onchange: (e) => set((s) => { s.studio.filter = e.target.value.trim(); }) })) : null,
    folder ? h('div', { class: 'list' },
      folder.pictures.length ? h('button', { class: st.record === '#pictures' ? 'on' : '', onclick: () => set((s) => { s.studio.record = '#pictures'; }, true) }, `Pictures (${folder.pictures.length})`) : null,
      recs.map((r) => h('button', { class: r === st.record ? 'on' : '',
        onclick: () => set((s) => { s.studio.record = r; s.studio.make = [...folder.records[r].makes].sort()[0]; }, true) }, `${r} (${folder.records[r].frames.size})`))) : null,
    rec ? row('Make', pick([...rec.makes].sort().map((m) => ({ value: m, label: m || '(plain)' })), st.make, (v) => set((s) => { s.studio.make = v; }, true))) : null,
    h('p', { class: 'note' }, 'Every picture that is not a layer strip. The studio holds the first-person frames, held weapons, the doll, bows and the lantern. The site holds the crossbow, the guns, the hands that cast, climb, ride and run, and the rest.'),
  ];
}

function renderInfo() {
  const info = $('info');
  if (state.tab === 'layers') { fill(info, layerInfo()); return; }
  if (state.tab === 'studio') { fill(info, studioInfo()); return; }
  const look = subject.look;
  if (!look) { info.replaceChildren(h('p', { class: 'no' }, 'Nothing to show for this choice.')); return; }
  const at = currentMove();
  const facts = [['Body', look.body], ['Archive', look.base ?? '-'], ['Race', look.race ?? '-'], ['Hair', look.hair ? `${look.hair.layer} (${look.hair.colour})` : '-'],
    ['Weapon', look.weapon ?? '-'], ['Left fist', look.off ?? '-'], ['Bow', look.bow ?? '-'], ['Staff', look.staff ?? '-'], ['Gun', look.gun ?? '-'],
    ['Shield', look.shield ?? '-'], ['Saddle', look.mounted ? `horse code ${look.coat ?? 0}` : '-'],
    ['Gear', (look.gear ?? []).map((g) => (look.dyes?.[g] != null ? `${g} (dye ${look.dyes[g]})` : g)).join(', ') || '-']];
  if (look.sheath) facts.push(['Worn away', look.sheath.gear.join(', ') || '-']);
  const out = [h('h2', {}, 'Look'), h('dl', {}, facts.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, String(v))]))];
  if (at) {
    const play = at.play, rec = play.rec;
    out.push(h('h2', {}, 'Move'), h('dl', {}, [['Move', play.anim], ['View', K.VIEWS[play.view]], ['Frames', play.frames], ['Drawn', play.how],
      ['Worn', play.worn ?? '-'], ['Record', play.how === 'class' ? play.index : rec.record ?? '-'], ['Keys', rec.keys ? rec.keys.join(' ') : '-'],
      ['Canvas', rec.canvas ? `${rec.canvas.join('×')} place ${rec.place.join(',')}${rec.grow ? ` grow ${rec.grow.join(',')}` : ''}` : 'its own cell']]
      .flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, String(v))])));
    const layers = K.layersInPlay(look, play), hidden = new Set(state.hidden);
    const keyOf = (layer) => keys[look.body]?.[`${layer}_${play.anim}`]?.key ?? '';
    const openStrip = (layer) => set((s) => { s.tab = 'layers'; s.layers = { ...s.layers, body: look.body, layer, anim: play.anim }; s.mode = 'colour'; }, true);
    out.push(h('h2', {}, 'Layers in the stack'), h('table', {},
      h('tr', {}, h('th', {}, ''), h('th', {}, 'layer'), h('th', {}, 'listed'), h('th', {}, 'cell · root'), h('th', {}, 'key'), h('th', {}, '')),
      layers.map((layer) => {
        const { cell, root } = K.layerCellOf(K.LOOKS, look.body, layer, play.anim);
        const ok = listed.has(K.layerPath(look.body, layer, play.anim)) && listed.has(K.layerPath(look.body, layer, play.anim, true));
        return h('tr', {},
          h('td', {}, h('input', { type: 'checkbox', checked: !hidden.has(layer), onchange: (e) => set((s) => {
            s.hidden = e.target.checked ? s.hidden.filter((x) => x !== layer) : [...s.hidden, layer];
          }) })),
          h('td', { class: 'mono' }, h('a', { href: '#', title: 'Show this layer alone', onclick: (e) => {
            e.preventDefault();
            set((s) => { s.hidden = layers.filter((x) => x !== layer); });
          } }, layer)),
          h('td', { class: ok ? 'ok' : 'no' }, ok ? 'yes' : 'no'),
          h('td', { class: 'mono' }, `${cell.join('×')} · ${root.join(',')}`),
          h('td', { class: 'mono dim' }, keyOf(layer).slice(0, 10)),
          h('td', {}, h('a', { href: '#', title: 'Open this strip in Layers', onclick: (e) => { e.preventDefault(); openStrip(layer); } }, 'strip')));
      })),
    h('p', { class: 'note' }, 'Untick a layer to leave it out; click a name to show it alone. Depth, not this order, decides what is in front.'),
    h('p', {}, h('button', { onclick: () => set((s) => { s.hidden = []; }) }, 'Show every layer')));
  }
  const { missing, whole } = K.missingOf(look, subject.kind, listed);
  out.push(h('h2', {}, 'Whole?'), h('p', { class: whole ? 'ok' : 'no' }, whole ? 'The game draws this look whole.' : 'The game would not draw this look: something it needs is missing.'));
  if (missing.length) out.push(h('ul', { class: 'plain mono' }, missing.slice(0, 200).map((m) => h('li', {}, m))));
  fill(info, out);
}

function layerInfo() {
  const { body, layer, anim } = state.layers, own = K.LOOKS.bodies[body];
  if (!own?.anims?.[anim]) return [h('p', { class: 'dim' }, 'Choose a layer.')];
  const { cell, root } = K.layerCellOf(K.LOOKS, body, layer, anim);
  const colourPath = K.layerPath(body, layer, anim), depthPath = K.layerPath(body, layer, anim, true);
  const kept = keys[body]?.[`${layer}_${anim}`];
  return [h('h2', {}, 'Strip'), h('dl', {}, [['Colour', colourPath], ['Listed', listed.has(colourPath) ? 'yes' : 'no'], ['Depth', depthPath],
    ['Listed', listed.has(depthPath) ? 'yes' : 'no'], ['Cell', `${cell.join('×')}${own.cells?.[layer]?.[anim] ? ' (its own)' : ''}`], ['Root', root.join(',')],
    ['Frames', own.anims[anim].frames], ['Key', kept?.key ?? '(no key read)'], ['Order', K.LOOKS.order?.[layer] ?? 0], ['Dyed', (K.LOOKS.dye ?? []).includes(layer) ? 'yes' : 'no'],
    ['Metal', (K.LOOKS.metal ?? []).includes(layer) ? 'yes' : 'no'], ['Drawn in', own.layers[layer].join(', ')]]
    .flatMap(([k, v]) => [h('dt', {}, k), h('dd', { class: 'mono' }, String(v))]))];
}

function studioInfo() {
  const st = state.studio, folder = folders[st.folder];
  if (!folder) return [h('p', { class: 'dim' }, `${Object.keys(folders).length} folders. Choose one.`)];
  const rec = folder.records[st.record];
  const out = [h('h2', {}, 'Folder'), h('dl', {}, [['Folder', folderName(st.folder)], ['Records', Object.keys(folder.records).length], ['Pictures', folder.pictures.length],
    ['Makes', [...folder.makes].map((m) => m || '(plain)').join(', ')]].flatMap(([k, v]) => [h('dt', {}, k), h('dd', { class: 'mono' }, String(v))]))];
  if (rec) {
    out.push(h('h2', {}, 'Record'), h('dl', {}, [['Name', rec.name], ['Record', rec.record], ['Makes', [...rec.makes].map((m) => m || '(plain)').join(', ')],
      ['Frames', studioFrames().length]].flatMap(([k, v]) => [h('dt', {}, k), h('dd', { class: 'mono' }, String(v))])));
    out.push(h('ul', { class: 'plain mono' }, studioFrames().map((f) => h('li', {}, f.path))));
  }
  return out;
}

function refresh() {
  if (state.tab === 'studio' && state.studio.folder && !state.studio.record) Object.assign(state.studio, firstRecord(state.studio.folder));
  subject = computeSubject();
  const at = currentMove();
  if (at) { state.move = at.move.key; state.view = at.view; }
  state.frame = Math.min(state.frame, frameCount() - 1);
  renderTabs();
  renderSide();
  renderMoves();
  renderInfo();
  draw();
}

boot();
