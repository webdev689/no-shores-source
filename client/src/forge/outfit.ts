/** The armour pieces, each worn in a set: a metal (`iron`…`daedric`), `leather`, `chain` or a guild's. */
export const ARMOUR_PIECES = ['helm', 'pauldrons', 'cuirass', 'gauntlets', 'greaves', 'boots'] as const;
export type ArmourPiece = (typeof ARMOUR_PIECES)[number];

/** What a figure wears and holds: a set for each armour piece, garments in the order they are put on with the dye of
 *  each, what is in each hand, and whether the weapons are out or put away. Hair is a style and a colour; null is
 *  bald. */
export interface Outfit {
  readonly armour: Readonly<Partial<Record<ArmourPiece, string>>>;
  readonly garments: readonly string[];
  readonly dyes: Readonly<Record<string, string>>;
  readonly right: string | null;
  readonly left: string | null;
  readonly drawn: boolean;
  readonly hair: { readonly style: string; readonly colour: string } | null;
}

/** Garments whose skirt falls to the ankles: a cloak worn with one hangs clear of it, and greaves are hidden. */
const FULL_SKIRT = new Set([
  'evening_gown',
  'day_gown',
  'casual_dress',
  'strapless_dress',
  'long_skirt',
  'long_skirt_slit',
  'formal_eodoric',
  'plain_robes',
  'plain_robes_hooded',
  'priest_robes',
  'priestess_robes',
]);
/** A hooded garment and what it is under a helm: its hood down. */
const HOOD_DOWN: Readonly<Record<string, string>> = {
  casual_cloak_hooded: 'casual_cloak',
  formal_cloak_hooded: 'formal_cloak',
  plain_robes_hooded: 'plain_robes',
};
/** Hair styles that hang, each drawn clear of armour (`_plated`) and over a cloak (`_cloaked`); a crop has none. */
const HANGING = new Set(['braid', 'long', 'short', 'shoulder', 'tails', 'tied']);
/** Garments worn on the chest: with one, armour has no padding drawn under it. */
const CHEST =
  /^(shirt_|straps|armbands|fancy_armbands|sash|kimono|eodoric|formal_eodoric|khajiit_suit|toga|vest|peasant_blouse)|(_surcoat|tunic|robes|_straps|brassiere|_gown|dress)$/;
/** Pieces of armour that hold a drape out from the body. */
const PLATING: readonly ArmourPiece[] = ['cuirass', 'greaves', 'boots'];

/** Where a weapon is worn while it is not in the hand, and while it is (an empty scabbard, a quiver). A mace, a flail
 *  or a hammer has no place on the body. The left hand's blade sits at the right hip (`_l`). */
export function wornWeapon(weapon: string, out: boolean): string[] {
  const left = weapon.endsWith('_l') ? '_l' : '';
  const name = left ? weapon.slice(0, -2) : weapon;
  const [kind = ''] = name.split('_');
  if (kind === 'sword') return [out ? `scabbard_sword${left}` : `sheath_sword${left}`];
  if (kind === 'dagger') return [`${out ? 'scabbard' : 'sheath'}_${name}${left}`];
  if (kind === 'pistolet') return [out ? `scabbard_${name}${left}` : `sheath_${name}${left}`];
  if (kind === 'bow') return out ? ['quiver'] : [`sheath_${name}`, 'quiver'];
  if (kind === 'shield') return out ? [] : [`slung_${name}`];
  if (out) return [];
  if (kind === 'axe') return ['sheath_axe'];
  if (kind === 'staff' || kind === 'crossbow' || kind === 'thunderlock') return [`sheath_${name}`];
  return [];
}

/**
 * The layers an outfit stacks, from the skin out, with its hair; only layers the body draws are kept. As the forge's
 * game dresses a figure: a helm shades the face (`face_<set>`) and lays a hood down; a raised hood shades the face as
 * well (`face_hooded`); armour with nothing over the chest has its set's padding under it; a drape hangs over plate
 * (`_plated`) or over a skirt to the ankles (`_skirted`), which also hides greaves; hair is hung clear of plate and
 * over a cloak, and not drawn under a helm or a hood. Weapons put away are worn on the body.
 */
export function outfitLayers(
  outfit: Outfit,
  drawn: Readonly<Record<string, readonly string[]>>,
): { gear: string[]; hair: { layer: string; colour: string } | null } {
  const gear: string[] = [];
  const add = (layer: string) => {
    if (drawn[layer] && !gear.includes(layer)) gear.push(layer);
  };
  const pieces = ARMOUR_PIECES.filter((piece) => outfit.armour[piece]);
  const helm = outfit.armour.helm;
  const plated = PLATING.some((piece) => outfit.armour[piece]);
  const skirted = outfit.garments.some((garment) => FULL_SKIRT.has(garment));
  const hangs = plated
    ? skirted
      ? ['plated_skirted', 'plated']
      : ['plated']
    : skirted
      ? ['skirted', 'drape']
      : ['drape'];
  if (helm) add(`face_${helm}`);
  const shown = skirted ? pieces.filter((piece) => piece !== 'greaves') : pieces;
  for (const piece of shown) add(`${piece}_${outfit.armour[piece] ?? ''}`);
  const chested = outfit.garments.some((garment) => CHEST.test(garment));
  const bodyArmour = shown.find((piece) => piece === 'cuirass' || piece === 'greaves');
  if (bodyArmour && !chested) add(`under_${outfit.armour[bodyArmour] ?? ''}`);
  for (const garment of outfit.garments) {
    const name = helm ? (HOOD_DOWN[garment] ?? garment) : garment;
    if (name in HOOD_DOWN) add('face_hooded');
    add(name);
    // A skirt to the ankles keeps its own fitted drape over armour.
    const own = FULL_SKIRT.has(garment) ? ['drape'] : hangs;
    const hang = own.map((way) => `${name}_${way}`).find((layer) => drawn[layer]);
    if (hang) add(hang);
  }
  for (const hand of [outfit.right, outfit.left])
    if (hand) for (const layer of wornWeapon(hand, outfit.drawn)) add(layer);
  if (outfit.drawn) for (const hand of [outfit.right, outfit.left]) if (hand) add(hand);
  const covered = gear.some((layer) => /^(face|helm|hood)(_|$)/.test(layer) || /_hooded(_|$)/.test(layer));
  const cloaked = gear.some((layer) => /(^|_)cloak(_|$)/.test(layer));
  const style = outfit.hair?.style ?? '';
  const hung = HANGING.has(style)
    ? `${plated || !!outfit.armour.pauldrons ? '_plated' : ''}${cloaked ? '_cloaked' : ''}`
    : '';
  const layer = `hair_${style}${hung}`;
  const hair = outfit.hair && !covered && drawn[layer] ? { layer, colour: outfit.hair.colour } : null;
  return { gear, hair };
}
