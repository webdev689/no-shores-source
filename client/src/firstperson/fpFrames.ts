import { type GlowElement, recolourToGlow } from '../elementGlow.ts';
import type { Strip } from '../forge/compose.ts';
import { type CoverSteps, TRIM_ALPHA, coverSteps, coversOf, lightOf } from '../forge/coverLight.ts';
import type { DyeTable, PaletteSnap, Rgb } from '../forge/dyes.ts';
import type { ForgeLooks } from '../forge/looks.ts';
import type { WeaponKind } from './weaponMachine.ts';

/** The forge's first-person file each kind is drawn from. */
export const ARCHIVE_OF: Readonly<Record<WeaponKind, string>> = {
  staff: 'WEAPON01',
  dagger: 'WEAPON02',
  sword: 'WEAPON04',
  mace: 'WEAPON05',
  flail: 'WEAPON06',
  warhammer: 'WEAPON07',
  axe: 'WEAPON08',
  bow: 'WEAPON09',
  fists: 'WEAPON10',
};

/** A weapon in the hand as the first person draws it: its kind, its metal (`Iron`; null for a plain one), the make
 *  of its blade (`OrcishShort` for a short sword), and a bow's type. */
export interface Wielded {
  readonly kind: WeaponKind;
  readonly metal: string | null;
  readonly make: string | null;
  readonly bow: 'Long' | 'Short' | null;
}

const KIND_OF_LAYER: Readonly<Record<string, WeaponKind>> = {
  staff: 'staff',
  dagger: 'dagger',
  sword: 'sword',
  mace: 'mace',
  flail: 'flail',
  warhammer: 'warhammer',
  axe: 'axe',
  bow: 'bow',
};
const METALS = new Set([
  'iron',
  'steel',
  'silver',
  'elven',
  'dwarven',
  'mithril',
  'adamantium',
  'ebony',
  'orcish',
  'daedric',
]);

/** A metal's or an armour set's name as the forge spells it in a picture's name: `iron` is `Iron`. */
export function forgeName(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

/** What a forge weapon layer (`sword_iron`, `sword_orcish_short_l`, `bow_long_elven`) is in first person; empty
 *  hands are fists, and a layer the first person does not draw (a crossbow) is null. */
export function wieldedOf(layer: string | null): Wielded | null {
  if (layer === null) return { kind: 'fists', metal: null, make: null, bow: null };
  const [head = '', ...rest] = layer.replace(/_l$/, '').split('_');
  const kind = KIND_OF_LAYER[head];
  if (!kind) return null;
  const word = rest.find((part) => METALS.has(part));
  const metal = word ? forgeName(word) : null;
  const short = kind === 'sword' && rest.includes('short');
  const bow = kind !== 'bow' ? null : rest[0] === 'short' ? 'Short' : 'Long';
  return { kind, metal, make: metal && short ? `${metal}Short` : metal, bow };
}

/** A first-person picture by its record and frame, a set's or metal's own (`look`) or the one they share. */
export function wholePath(archive: string, record: number, frame: number, look: string | null): string {
  return `forge/${archive}/${archive}.CIF_${record}-${frame}${look ? `_${look}` : ''}.png`;
}

/** One layer of a first-person picture, the hand or the weapon alone, or its depth. */
export function layerPath(
  archive: string,
  record: number,
  frame: number,
  layer: 'hand' | 'weapon',
  look: string | null,
  depth = false,
): string {
  return `forge/${archive}/layers/${archive}.CIF_${record}-${frame}_${layer}${look ? `_${look}` : ''}${depth ? '_z' : ''}.png`;
}

/** The running arm's frame `frame`, in an armour set's gauntlets or the leather glove. */
export const runPath = (frame: number, set: string | null) => `@art/run/RUN_0-${frame}${set ? `_${set}` : ''}.png`;
/** A casting record's layer: a garment, or an element's light. */
export const castPath = (layer: string, record: number) => `@art/cast/${layer}/cast-${record}.png`;

/**
 * The looks a picture is asked for in turn: its set's or metal's own, then the one every set shares. For a hand on
 * the left, first the twins the forge lit for that side (`IronLeft`, `Left`), then the right hand's, drawn mirrored.
 */
export function looksAsked(own: string | null, left: boolean): (string | null)[] {
  const right = own ? [own, null] : [null];
  if (!left) return right;
  return [...(own ? [`${own}Left`] : []), 'Left', ...right];
}

/** Where a picture lies on the 320 by 200 design screen, by its path: its corner, and the box within it Daggerfall
 *  aligned. */
export type FramesTable = Readonly<Record<string, { readonly at: readonly [number, number]; readonly box?: unknown }>>;

/** A composed first-person picture: RGBA top row first, all or nothing in alpha, and its corner on the design screen.
 *  A blade laid over its hand says which pixels are the blade's (a byte a pixel, 1 for the blade's). */
export interface Picture {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly at: readonly [number, number];
  readonly weapon?: Uint8Array;
}

/** The sets drawn in their own colours: leather and chain have no metal to dye, steel is the forge's grey already,
 *  and a guild's set is its own. */
const UNDYED = new Set(['Leather', 'Chain', 'Steel', 'Brotherhood', 'Fighters', 'Knights', 'Mages', 'Thieves']);

/** The ramp a metal's grey is laid on; a plain weapon is steel, the forge's own grey. */
export function metalRamp(dyes: DyeTable, metal: string | null): readonly Rgb[] | null {
  return dyes.armour[metal ?? 'Steel'] ?? dyes.armour.Steel ?? null;
}

/** The steps a ramp covering the forge layer `layer` (its marked trim alone, with `trim`) takes by light, read from
 *  its set on the player's body, as the figure's are; each light at its own share of the ramp where the forge's looks
 *  or the body are not known. */
export function pieceCover(source: FrameSource, layer: string, trim = false): Promise<CoverSteps> {
  const { looks, body } = source;
  if (!looks || !body) return Promise.resolve(coverSteps([]));
  return coversOf(body, [layer], looks, (path) => source.strip(path), trim).then(
    (covers) => covers.get(layer) ?? coverSteps([]),
  );
}

/** A faction's colour on the hilt, guard and trim the forge marks (coverLight.ts `TRIM_ALPHA`), and the step each
 *  light takes on it. */
export interface Trim {
  readonly ramp: readonly Rgb[];
  readonly steps: CoverSteps;
}

/** A faction's blade's colour on its marked trim, in the hand that holds it; none for any other blade. It is laid
 *  across the trim's span of light in `standing`, the blade's own first frame in hand: the first person is lit
 *  brighter than the figure, whose span would leave its brightest trim one flat step. With no such frame, it is laid
 *  by the trim's light on the player's body, as the figure's is. */
async function trimOf(
  source: FrameSource,
  wielded: Wielded,
  left: boolean,
  standing: string | null = null,
): Promise<Trim | null> {
  const ramp = (left ? source.own?.left : source.own?.right) ?? null;
  if (!ramp) return null;
  const first = standing ? await source.strip(standing) : null;
  if (first) return { ramp, steps: coverSteps([first], true) };
  const layer = `${wielded.kind}_${(wielded.metal ?? 'Steel').toLowerCase()}`;
  return { ramp, steps: await pieceCover(source, layer, true) };
}

/** A picture of the hands or feet in `set` painted: a dye worn or a faction's colour covering the whole piece, laid
 *  by the light of the set's gauntlets or boots as the figure's are; else a set's own ramp on its greys. */
export async function paintSet(
  source: FrameSource,
  strip: Strip,
  set: string | null,
  bare: string,
  part: 'hands' | 'feet' = 'hands',
): Promise<Uint8Array> {
  const ramp = setRamp(source, set, bare, part);
  const covers = set !== null && ramp !== null && (ramp === source.own?.[part] || ramp === source.dye);
  const piece = `${part === 'hands' ? 'gauntlets' : 'boots'}_${set?.toLowerCase()}`;
  return source.painter.paint(strip, ramp, covers ? await pieceCover(source, piece) : null);
}

/** The ramp an armour set's grey is laid on, worn on the `part`: a faction's own colour, else the dye worn's, else the
 *  set's own; `bare`'s with no set worn. */
export function setRamp(
  source: FrameSource,
  set: string | null,
  bare: string,
  part: 'hands' | 'feet' = 'hands',
): readonly Rgb[] | null {
  const own = source.own?.[part];
  if (set !== null && own) return own;
  if (set !== null && source.dye) return source.dye;
  return metalRamp(source.dyes, set === null ? bare : UNDYED.has(set) ? 'Steel' : set);
}

/**
 * Lays a forged picture on Daggerfall's colours: each grey texel goes to the nearest step of the metal band, which
 * the forge renders every metal in, and takes that step of the metal's ramp; every other colour goes to its nearest
 * palette colour. The band is steel's ramp, so steel and a ramp of null leave it as the band draws it.
 */
export class FramePainter {
  private readonly steps = new Uint8Array(256);
  private readonly snap: PaletteSnap;

  constructor(dyes: DyeTable, snap: PaletteSnap) {
    this.snap = snap;
    const band = dyes.armour.Steel ?? [];
    for (let grey = 0; grey < 256; grey++) {
      let best = (grey * 16) >> 8;
      let bestDistance = Infinity;
      band.forEach(([red], step) => {
        const distance = Math.abs(red - grey);
        if (distance < bestDistance) [best, bestDistance] = [step, distance];
      });
      this.steps[grey] = best;
    }
  }

  /** The strip's texels painted, clear below half alpha; `ramp` the metal's, or null to snap the greys as any colour.
   *  A ramp that covers the strip (a dye worn or a faction's colour) lies on every texel by its light, where
   *  `covers` lays it: its set's, as the figure's piece takes it. A faction's blade's `trim` lies on its marked
   *  texels alone; a strip with none draws as it did. */
  paint(
    strip: Strip,
    ramp: readonly Rgb[] | null,
    covers: CoverSteps | null = null,
    trim: Trim | null = null,
  ): Uint8Array {
    const pixels = Uint8Array.from(strip.data);
    const dyed: [number, Rgb | undefined][] = [];
    for (let texel = 0; texel < pixels.length; texel += 4) {
      const marked = !!trim && pixels[texel + 3] === TRIM_ALPHA;
      const drawn = (pixels[texel + 3] ?? 0) >= 128;
      pixels[texel + 3] = drawn ? 255 : 0;
      const grey = pixels[texel] === pixels[texel + 1] && pixels[texel + 1] === pixels[texel + 2];
      const light = () => lightOf(pixels.subarray(texel, texel + 3));
      if (marked) {
        dyed.push([texel, trim.ramp[trim.steps[light()] ?? 0]]);
        pixels[texel + 3] = 0;
      } else if (drawn && ramp && (grey || covers)) {
        const colour = covers ? ramp[covers[light()] ?? 0] : ramp[this.steps[pixels[texel] ?? 0] ?? 0];
        dyed.push([texel, colour]);
        pixels[texel + 3] = 0;
      }
    }
    this.snap.snap(pixels);
    for (const [texel, colour] of dyed) {
      pixels.set([...(colour ?? [0, 0, 0]), 255], texel);
    }
    return pixels;
  }
}

/** Lays `top` over `base` where `top` is drawn. */
export function layOver(base: Uint8Array, top: Uint8Array): void {
  for (let texel = 0; texel < base.length && texel < top.length; texel += 4) {
    if (top[texel + 3]) base.set(top.subarray(texel, texel + 4), texel);
  }
}

/** The hand and the weapon laid together by depth (red the high byte, green the low; nearer is smaller): at each
 *  texel the one drawn, and where both are, the nearer. `mask`, a byte a texel, is set to 1 where the weapon's is. */
export function layByDepth(
  hand: Uint8Array,
  handDepth: Strip,
  weapon: Uint8Array,
  weaponDepth: Strip,
  mask?: Uint8Array,
): Uint8Array {
  const pixels = new Uint8Array(hand.length);
  const depthAt = (strip: Strip, texel: number) => (strip.data[texel] ?? 0) * 256 + (strip.data[texel + 1] ?? 0);
  for (let texel = 0; texel < pixels.length; texel += 4) {
    const handDrawn = !!hand[texel + 3];
    const weaponDrawn = !!weapon[texel + 3];
    const weaponNearer = depthAt(weaponDepth, texel) < depthAt(handDepth, texel);
    const from = weaponDrawn && (!handDrawn || weaponNearer) ? weapon : handDrawn ? hand : null;
    if (from) pixels.set(from.subarray(texel, texel + 4), texel);
    if (mask && from === weapon) mask[texel / 4] = 1;
  }
  return pixels;
}

/** Where a first-person picture's strips come from, where they lie, and the colours they are laid on. */
export interface FrameSource {
  strip(path: string): Promise<Strip | null>;
  readonly frames: FramesTable;
  readonly dyes: DyeTable;
  readonly painter: FramePainter;
  /** The cosmetic dye worn, whose ramp every armour set's grey takes in place of its own, as the figure's do. */
  readonly dye?: readonly Rgb[] | null;
  /** A faction's own colour on what is its: the gauntlets, the boots, the bow or staff in the right hand and the
   *  shield in the left, each over the dye worn, as the figure's are. */
  readonly own?: Own;
  /** The forge's looks and the player's body, whose sets' light a covering ramp is laid by (`pieceCover`). */
  readonly looks?: ForgeLooks;
  readonly body?: string;
}

/** A faction's own colour, by the part of the first person that wears it; none where it is no faction's. */
export interface Own {
  readonly hands?: readonly Rgb[] | null;
  readonly feet?: readonly Rgb[] | null;
  readonly right?: readonly Rgb[] | null;
  readonly left?: readonly Rgb[] | null;
}

/** What the hands and feet wear, by the forge's set names (`Iron`, `Leather`, `Fighters`), or null for none. */
export interface Worn {
  readonly hands: string | null;
  readonly feet: string | null;
}

/** The fists' records that are kicks, which wear the boots; every other is a punch, in the gauntlets. */
const KICKS = new Set([1, 3, 6]);

/** The first of `paths` the forge drew, and its strip. */
export async function firstOf(
  source: FrameSource,
  paths: readonly string[],
): Promise<{ path: string; strip: Strip } | null> {
  for (const path of paths) {
    const strip = await source.strip(path);
    if (strip) return { path, strip };
  }
  return null;
}

function placed(
  source: FrameSource,
  path: string,
  strip: Strip,
  pixels: Uint8Array,
  weapon?: Uint8Array,
): Picture | null {
  const corner = source.frames[path]?.at;
  return corner
    ? { width: strip.width, height: strip.height, pixels, at: corner, ...(weapon ? { weapon } : {}) }
    : null;
}

async function whole(
  source: FrameSource,
  archive: string,
  [record, frame]: readonly [number, number],
  own: string | null,
  paint: (strip: Strip) => Uint8Array | Promise<Uint8Array>,
  left: boolean,
): Promise<Picture | null> {
  const paths = looksAsked(own, left).map((look) => wholePath(archive, record, frame, look));
  const found = await firstOf(source, paths);
  return found && placed(source, found.path, found.strip, await paint(found.strip));
}

/** A dagger or a sword drawn from its two layers: the hand in the gauntlets worn, the blade in its own make. */
async function layered(
  source: FrameSource,
  archive: string,
  [record, frame]: readonly [number, number],
  wielded: Wielded,
  hands: string | null,
  left: boolean,
  leftHand = left,
): Promise<Picture | null> {
  const asks = (own: string | null) => (left ? [...(own ? [`${own}Left`] : []), 'Left'] : looksAsked(own, false));
  const pair = async (layer: 'hand' | 'weapon', own: string | null) => {
    for (const look of asks(own)) {
      const path = layerPath(archive, record, frame, layer, look);
      const [colour, depth] = await Promise.all([
        source.strip(path),
        source.strip(layerPath(archive, record, frame, layer, look, true)),
      ]);
      if (colour && depth && depth.width === colour.width && depth.height === colour.height)
        return { path, look, colour, depth };
    }
    return null;
  };
  const [hand, weapon] = await Promise.all([pair('hand', hands), pair('weapon', wielded.make)]);
  const cornerOf = (path: string) => source.frames[path]?.at.join();
  const oneCanvas =
    hand &&
    weapon &&
    hand.colour.width === weapon.colour.width &&
    hand.colour.height === weapon.colour.height &&
    cornerOf(hand.path) === cornerOf(weapon.path);
  // The left hand's blade drawn as the right's twin, mirrored by the caller, is still the left hand's.
  if (!oneCanvas) return left ? layered(source, archive, [record, frame], wielded, hands, false, true) : null;
  const standing = layerPath(archive, 0, 0, 'weapon', weapon.look);
  const blade = new Uint8Array(hand.colour.width * hand.colour.height);
  const pixels = layByDepth(
    await paintSet(source, hand.colour, hands, 'Iron'),
    hand.depth,
    source.painter.paint(
      weapon.colour,
      metalRamp(source.dyes, wielded.metal),
      null,
      await trimOf(source, wielded, leftHand, standing),
    ),
    weapon.depth,
    blade,
  );
  return placed(source, hand.path, hand.colour, pixels, blade);
}

/** A bow in its type and metal, with the hands that hold it laid over it in the gauntlets worn. */
async function bowPicture(
  source: FrameSource,
  wielded: Wielded,
  hands: string | null,
  frame: number,
): Promise<Picture | null> {
  const archive = ARCHIVE_OF.bow;
  const metal = wielded.metal ?? 'Steel';
  const paths = looksAsked(`${wielded.bow ?? 'Long'}${metal}`, false).map((look) => wholePath(archive, 0, frame, look));
  const base = await firstOf(source, paths);
  if (!base) return null;
  // A faction's bow is covered whole by its colour, laid by its own light as the figure's is.
  const own = source.own?.right;
  const layer = `bow_${(wielded.bow ?? 'Long').toLowerCase()}_${metal.toLowerCase()}`;
  const pixels = source.painter.paint(
    base.strip,
    own ?? metalRamp(source.dyes, metal),
    own ? await pieceCover(source, layer) : null,
  );
  const handsPath = wholePath(archive, 0, frame, `Hands${hands ?? ''}`);
  const over = await source.strip(handsPath);
  const fits =
    over?.width === base.strip.width &&
    over.height === base.strip.height &&
    source.frames[handsPath]?.at.join() === source.frames[base.path]?.at.join();
  if (over && fits) layOver(pixels, await paintSet(source, over, hands, 'Steel'));
  return placed(source, base.path, base.strip, pixels);
}

/**
 * The picture `wielded` shows at `record` and `frame`, dyed and placed, or null where the forge drew none. `left`
 * asks for the left hand's twin where the forge lit one; the caller draws it mirrored either way. `leftHand` says
 * the left hand holds it, whose faction's colour a blade's trim takes, mirrored or not. A flail's sway is its record 7.
 */
export async function weaponPicture(
  source: FrameSource,
  wielded: Wielded,
  worn: Worn,
  record: number,
  frame: number,
  left: boolean,
  leftHand = left,
): Promise<Picture | null> {
  const archive = ARCHIVE_OF[wielded.kind];
  const shown = [record, frame] as const;
  if (wielded.kind === 'fists') {
    const kick = KICKS.has(record);
    const set = kick ? worn.feet : worn.hands;
    const paint = (strip: Strip) => paintSet(source, strip, set, 'Iron', kick ? 'feet' : 'hands');
    return whole(source, archive, shown, set, paint, left);
  }
  if (wielded.kind === 'bow') return bowPicture(source, wielded, worn.hands, frame);
  // A faction's staff is covered whole by its colour, as the figure's is; a blade, a head or a haft keeps its metal.
  const own = wielded.kind === 'staff' ? source.own?.right : null;
  const ramp = own ?? metalRamp(source.dyes, wielded.metal);
  const blade = wielded.kind === 'dagger' || wielded.kind === 'sword';
  if (blade) {
    const laid = await layered(source, archive, shown, wielded, worn.hands, left, leftHand);
    if (laid) return laid;
  }
  const staff = wielded.metal ? `staff_${wielded.metal.toLowerCase()}` : 'staff';
  const covers = own ? await pieceCover(source, staff) : null;
  // A faction's blade keeps its metal, its faction's colour on its marked hilt, guard and trim: the forge marks the
  // first person's sword and dagger alone.
  const trim = blade ? await trimOf(source, wielded, leftHand) : null;
  const paint = (strip: Strip) => source.painter.paint(strip, ramp, covers, trim);
  return whole(source, archive, shown, wielded.metal, paint, left);
}

/** Where the running arm's frames lie on the design screen: the right arm's corner, its foot on the bottom edge. */
export const RUN_AT = [177, 100] as const;

/** The running arm's frame `frame` in the gauntlets worn, the leather glove's with none. */
export async function runPicture(source: FrameSource, hands: string | null, frame: number): Promise<Picture | null> {
  const found = await firstOf(
    source,
    looksAsked(hands, false).map((look) => runPath(frame, look)),
  );
  if (!found) return null;
  const pixels = await paintSet(source, found.strip, hands, 'Iron');
  return { width: found.strip.width, height: found.strip.height, pixels, at: RUN_AT };
}

/** Each element's light, as the casting hands draw it. */
export const CAST_LIGHTS = ['fire', 'frost', 'poison', 'shock', 'magic'] as const;
/** The casting arm's garments under the light, in order. */
const CAST_GARMENTS = ['linen', 'gauntlet'] as const;

/** The light each Art casts with, by its element (the gear crate's numbers): Divine's fire, Storm's shock and
 *  Shadow's magic, each recoloured to its element's glow. */
export const ART_LIGHTS: Readonly<Record<GlowElement, (typeof CAST_LIGHTS)[number]>> = {
  1: 'fire',
  2: 'shock',
  3: 'magic',
};

/** The casting hand's record `record` lit by `element` (its light recoloured to `glow`'s, if given): its sleeve, its
 *  glove and the light, laid in order; in a set's
 *  gauntlets (`hands`) the set's whole arm under the light, else the sleeve and glove. Placed by the caller, as a
 *  casting hand is placed by its record. */
export async function castPicture(
  source: FrameSource,
  element: string,
  record: number,
  hands: string | null = null,
  glow: GlowElement | null = null,
): Promise<Picture | null> {
  const layers = hands ? [hands, element] : [...CAST_GARMENTS, element];
  const strips = await Promise.all(layers.map((layer) => source.strip(castPath(layer, record))));
  const [base, ...over] = strips;
  if (!base || over.some((strip) => strip?.width !== base.width || strip.height !== base.height))
    return hands ? castPicture(source, element, record, null, glow) : null;
  // A set's arm is dyed as its fists are.
  const pixels = hands ? await paintSet(source, base, hands, 'Iron') : source.painter.paint(base, null);
  over.forEach((strip, index) => {
    if (!strip) return;
    const painted = source.painter.paint(strip, null);
    if (glow && index === over.length - 1) recolourToGlow(painted, glow);
    layOver(pixels, painted);
  });
  return { width: base.width, height: base.height, pixels, at: [0, 0] };
}
