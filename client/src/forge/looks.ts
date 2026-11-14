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
  readonly looks?: Readonly<Record<string, IndexLook>>;
}

/** A figure as it is dressed: a body, a race, hair, and the layers it wears and holds, in the order they stack. */
export interface Figure {
  readonly body: string;
  readonly race: string | null;
  readonly hair: { readonly layer: string; readonly colour: string } | null;
  readonly gear: readonly string[];
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

/** The layers a figure stacks in `anim`, bottom first: bare body, hair, gear and a ridden horse.
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
  const stacked = [body, figure.hair?.layer, ...figure.gear.map(faceOf), HORSE_LAYER];
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
