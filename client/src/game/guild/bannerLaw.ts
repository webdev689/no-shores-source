import catalogue from '../../../../content/guilds/banners.json' with { type: 'json' };

/**
 * A guild's banner as its founder and admins make it, after Destiny 2's clan banners: a cloth of one cut and colour, a
 * device over it in a second colour, a sign in its own colour on a ground of its own, and the staff it hangs from. Every
 * choice is from the lists in `content/guilds/banners.json`. The accounts judge a banner by this law before keeping it,
 * and the page's editor offers only what it allows, so the two never disagree.
 */

/** A banner, each part by its id in the catalogue. */
export interface Banner {
  readonly cut: string;
  readonly cloth: string;
  readonly device: string;
  readonly deviceColour: string;
  readonly sign: string;
  readonly signColour: string;
  readonly ground: string;
  readonly groundColour: string;
  readonly staff: string;
}

/** A named choice in one of the catalogue's lists. */
export interface Named {
  readonly id: string;
  readonly name: string;
}

export const COLOURS: readonly (Named & { readonly hex: string })[] = catalogue.colours;
export const CUTS: readonly Named[] = catalogue.cuts;
export const DEVICES: readonly Named[] = catalogue.devices;
export const SIGNS: readonly string[] = catalogue.signs;
export const GROUNDS: readonly Named[] = catalogue.grounds;
export const STAFFS: readonly (Named & { readonly level: number })[] = catalogue.staffs;

/** The banner's parts, in the order the editor lists them. */
export const PARTS = [
  'cut',
  'cloth',
  'device',
  'deviceColour',
  'sign',
  'signColour',
  'ground',
  'groundColour',
  'staff',
] as const satisfies readonly (keyof Banner)[];
export type Part = (typeof PARTS)[number];

/** The ids a part may take. */
export function choicesOf(part: Part): readonly string[] {
  switch (part) {
    case 'cut':
      return CUTS.map((cut) => cut.id);
    case 'device':
      return DEVICES.map((device) => device.id);
    case 'sign':
      return SIGNS;
    case 'ground':
      return GROUNDS.map((ground) => ground.id);
    case 'staff':
      return STAFFS.map((staff) => staff.id);
    default:
      return COLOURS.map((colour) => colour.id);
  }
}

/** A colour's hex by its id; pitch for one not in the list. */
export function hexOf(colour: string): string {
  return COLOURS.find((each) => each.id === colour)?.hex ?? '#17171b';
}

/** The words a player reads for a part's choice: its name in the catalogue, or a sign's id in plain words. */
export function nameOf(part: Part, id: string): string {
  const named = [...CUTS, ...DEVICES, ...GROUNDS, ...STAFFS, ...COLOURS].find((each) => each.id === id);
  if (part !== 'sign' && named) return named.name;
  const plain = id.replaceAll('_', ' ');
  return plain.charAt(0).toUpperCase() + plain.slice(1);
}

/** Whether a guild of this level may hang its banner from a staff. */
export function staffOpen(staff: string, level: number): boolean {
  return (STAFFS.find((each) => each.id === staff)?.level ?? Number.POSITIVE_INFINITY) <= level;
}

/** Why a banner may not be kept, in the words the player reads, or null when it may: every part from its list, the
 *  device unlike the cloth, the sign unlike what it sits on, and a staff the guild's level has opened. */
export function bannerRefusal(banner: Banner, level: number): string | null {
  if (!PARTS.every((part) => choicesOf(part).includes(banner[part]))) return 'That banner has a part we do not know.';
  if (banner.device !== 'plain' && banner.deviceColour === banner.cloth)
    return 'Give the device a colour unlike the cloth.';
  const under = banner.ground === 'none' ? [banner.cloth, banner.device === 'plain' ? null : banner.deviceColour] : [];
  if (banner.ground !== 'none' && banner.signColour === banner.groundColour)
    return 'Give the sign a colour unlike its ground.';
  if (under.includes(banner.signColour)) return 'Give the sign a colour unlike the cloth behind it.';
  if (!staffOpen(banner.staff, level)) return 'Your guild has not yet earned that staff.';
  return null;
}

/** A banner read from what was sent or kept, or null when it is not a banner's shape. */
export function bannerFrom(value: unknown): Banner | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (!PARTS.every((part) => typeof record[part] === 'string')) return null;
  return Object.fromEntries(PARTS.map((part) => [part, record[part]])) as unknown as Banner;
}

/** A number from a name's letters, the same on every machine. */
function seedOf(text: string): number {
  let seed = 2166136261;
  for (const char of text.toLowerCase()) seed = Math.imul(seed ^ (char.codePointAt(0) ?? 0), 16777619) >>> 0;
  return seed;
}

/** The banner a new guild hangs until someone changes it, drawn from its name, so each guild's differs and every
 *  machine draws the same one. It keeps the law, on the first staff. */
export function bannerOfName(name: string): Banner {
  let seed = seedOf(name);
  const pick = <Kind>(list: readonly Kind[]): Kind => {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822507) >>> 0;
    return list[seed % list.length] as Kind;
  };
  const colours = COLOURS.map((colour) => colour.id);
  const cloth = pick(colours);
  const deviceColour = pick(colours.filter((colour) => colour !== cloth));
  const device = pick(DEVICES.slice(1).map((each) => each.id));
  const ground = pick(GROUNDS.slice(1).map((each) => each.id));
  const groundColour = pick(colours);
  const signColour = pick(colours.filter((colour) => colour !== groundColour));
  return {
    cut: pick(CUTS.map((cut) => cut.id)),
    cloth,
    device,
    deviceColour,
    sign: pick(SIGNS),
    signColour,
    ground,
    groundColour,
    staff: STAFFS[0]?.id ?? 'driftwood',
  };
}
