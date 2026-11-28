/** One animation's cell in a layer's strip: its size in pixels, its frames and the root (the feet) on it. */
export interface AnimCell {
  readonly cell: readonly [number, number];
  readonly frames: number;
  readonly root: readonly [number, number];
}

/** A body the forge renders: its animations, the layers drawn past an animation's cell, and each layer's animations. */
export interface ForgeBody {
  readonly anims: Readonly<Record<string, AnimCell>>;
  readonly cells?: Readonly<Record<string, Readonly<Record<string, AnimCell>>>>;
  readonly layers: Readonly<Record<string, readonly string[]>>;
}

/** A dressed look the forge index keeps: its body, gear, weapon and race, and the dye each dyeable layer takes. */
export interface IndexLook {
  readonly body: string;
  readonly gear: readonly string[];
  readonly weapon: string | null;
  readonly race?: string;
  readonly dyes?: Readonly<Record<string, number>>;
}

/** The forge's index of what it rendered (the forge's forgeLooks.json). Depths are metres, `depth.scale` units each. */
export interface ForgeLooks {
  readonly bodies: Readonly<Record<string, ForgeBody>>;
  readonly order?: Readonly<Record<string, number>>;
  readonly cover?: Readonly<Record<string, number>>;
  readonly under?: Readonly<Record<string, number>>;
  readonly depth?: { readonly base: number; readonly scale: number };
  readonly dye?: readonly string[];
  readonly metal?: readonly string[];
  readonly looks?: Readonly<Record<string, IndexLook>>;
}

/** A figure as it is dressed: a body; a race whose own body it wears (the forge's `khajiit`, `argonian`), or a skin
 *  tone from 0 (lightest) to 1 (darkest), or neither for the body as rendered; hair; and the layers it wears and holds,
 *  in the order they stack. */
export interface Figure {
  readonly body: string;
  readonly race: string | null;
  readonly tone: number | null;
  readonly hair: { readonly layer: string; readonly colour: string } | null;
  readonly gear: readonly string[];
  /** The barding stacked over a ridden horse (`horse_warhorse`), or none. */
  readonly barding?: string | null;
}

/** The horse a rider sits on, drawn in the mounted animations. */
export const HORSE_LAYER = 'horse';
/** A face in a helm's shade (`face_<set>`) or a raised hood's (`face_hooded`): the head is covered. */
const SHADED_FACE = /^face_/;

/** The bare body a figure stacks in `anim`: a beast race's own where the body draws it, helmed under a shaded face. */
function bodyLayer(figure: Figure, anim: string, drawn: ForgeBody['layers']): { layer: string; beast: string | null } {
  const race = figure.race && drawn[`body_${figure.race}`]?.includes(anim) ? figure.race : null;
  if (!race) return { layer: 'body', beast: null };
  const covered = figure.gear.some((layer) => SHADED_FACE.test(layer)) && drawn[`body_${race}_helmed`]?.includes(anim);
  return { layer: covered ? `body_${race}_helmed` : `body_${race}`, beast: race };
}

/** A worn piece hung at one hip, which a mirror moves to the other: its twin (`<layer>_l`) hangs at the other hip. */
const HIP = /^(sheath|scabbard)_(sword|dagger|pistolet)(_|$)/;
/** A piece off the body's middle with no twin at the other hip: the quiver, a weapon slung across the back. */
const ONE_SIDE = /^(quiver$|sheath_(greatsword|axe|staff|bow|thunderlock)|scabbard_greatsword)/;

/** A piece's twin on the other side (`<layer>_l` and back). */
const otherSide = (layer: string): string => (layer.endsWith('_l') ? layer.slice(0, -2) : `${layer}_l`);

/** A hip piece's twin at the other hip, or null for a layer that has none. */
export const hipTwin = (layer: string): string | null => (HIP.test(layer) ? otherSide(layer) : null);

/**
 * A figure's gear as a mirrored view of `anim` composes it. The forge draws a right-handed body, so a mirror hangs each
 * hip piece at the other hip and puts what each fist holds (`held`) in the other. Each is swapped for its twin first,
 * so the mirror lays it back where it was: the hips' pieces together, and the fists' together, so none ends beside
 * another. Where a twin is not drawn in `anim` (a sword in the left fist through the walk), or a piece with none hangs
 * at a hip (the quiver), that side's pieces are left to the mirror.
 */
export function mirroredGear(
  gear: readonly string[],
  anim: string,
  drawn: ForgeBody['layers'],
  held: readonly (string | null)[],
): string[] {
  const stacked = gear.filter((layer) => drawn[layer]?.includes(anim));
  const lopsided = stacked.some((layer) => ONE_SIDE.test(layer));
  const sides = [
    lopsided ? [] : stacked.filter((layer) => hipTwin(layer) !== null),
    stacked.filter((layer) => held.includes(layer)),
  ];
  const swapped = new Map<string, string>();
  for (const pieces of sides)
    if (pieces.every((layer) => drawn[otherSide(layer)]?.includes(anim)))
      for (const layer of pieces) swapped.set(layer, otherSide(layer));
  return gear.map((layer) => swapped.get(layer) ?? layer);
}

/** The layers a figure stacks in `anim`, bottom first: bare body, hair, gear, a ridden horse and its barding.
 *  A beast race's face under a helm or a hood is its own. Only layers the body draws in `anim` are kept. */
export function layersOf(figure: Figure, anim: string, looks: ForgeLooks): string[] {
  const drawn = looks.bodies[figure.body]?.layers ?? {};
  const { layer: body, beast } = bodyLayer(figure, anim, drawn);
  const faceOf = (layer: string) =>
    !beast
      ? layer
      : layer === 'face_hooded'
        ? `face_hooded_${beast}`
        : SHADED_FACE.test(layer)
          ? `face_${beast}`
          : layer;
  const stacked = [body, figure.hair?.layer, ...figure.gear.map(faceOf), HORSE_LAYER, figure.barding];
  return stacked.filter((layer): layer is string => !!layer && !!drawn[layer]?.includes(anim));
}

/** A layer's cell and root in `anim`: its own where the index gives one, else the animation's. */
export function layerCellOf(looks: ForgeLooks, body: string, layer: string, anim: string): AnimCell | null {
  const own = looks.bodies[body];
  return own?.cells?.[layer]?.[anim] ?? own?.anims[anim] ?? null;
}

/** The box every stacked layer fills about the body's root, and the root's place on it. */
export function lookCell(figure: Figure, anim: string, looks: ForgeLooks): AnimCell | null {
  const base = looks.bodies[figure.body]?.anims[anim];
  if (!base) return null;
  let [left, top, right, low] = [0, 0, 0, 0];
  const stacked = layersOf(figure, anim, looks);
  for (const layer of stacked.length > 0 ? stacked : ['body']) {
    const own = layerCellOf(looks, figure.body, layer, anim);
    if (!own) continue;
    left = Math.max(left, own.root[0]);
    top = Math.max(top, own.root[1]);
    right = Math.max(right, own.cell[0] - own.root[0]);
    low = Math.max(low, own.cell[1] - own.root[1]);
  }
  return { cell: [left + right, top + low], frames: base.frames, root: [left, top] };
}

/** The strip file of a layer in an animation, colour or depth, as the forge names it. */
export const layerPath = (body: string, layer: string, anim: string, depth = false): string =>
  `forge/layers/${body}/${layer}_${anim}${depth ? '_z' : ''}.png`;
