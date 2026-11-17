// Each exterior set's family, written as a few words: its face, the frame it stands in, the stones at its corner,
// its bands, its window. The wall recipe paints them.
import { materials, type Materials } from '../materials.ts';

export type Face =
  | 'bricks'
  | 'blocks'
  | 'plaster'
  | 'stucco'
  | 'adobe'
  | 'rubble'
  | 'cobbles'
  | 'herringbone'
  | 'planks'
  | 'vplanks'
  | 'marble';
export type WindowKind = 'shutters' | 'lattice' | 'grid' | 'arch' | 'gothic' | 'hole' | 'slit' | 'tall';

/** A wall's window: its kind and the materials of its frame, leading, shutters and sill. */
export interface WallWindow {
  readonly kind: WindowKind;
  readonly frame: string;
  readonly lead?: string;
  readonly shutters?: string;
  readonly sill?: string;
}

/**
 * A set's family: `face` the wall's surface in `material`; `frame` a timber frame's material (braced on the edge
 * record with `brace`); `quoin` the corner stones on the edge record; `strip` a run of bricks up its left; `ivy` a
 * vine up the edge record or the third; `vines` leaves over every wall; `moss` mossy joints; `top` and `foot`
 * bands; `pillars`, `posts`, `panels`, `pegs` (beam ends), `relief` a carved face; `extra` the material of a castle
 * set's plain fifth record, `fence` a fence set's boards; `small` smaller stones, `dark` darker rubble, `patchy`
 * patches of render over brick, `patches` fewer trowel smears, `cracked` cracks.
 */
export interface WallFamily {
  readonly face: Face;
  readonly material: string;
  readonly window?: WallWindow;
  readonly small?: boolean;
  readonly patchy?: boolean;
  readonly patches?: boolean;
  readonly dark?: boolean;
  readonly cracked?: boolean;
  readonly brace?: boolean;
  readonly quoin?: string;
  readonly strip?: string;
  readonly top?: string;
  readonly foot?: string;
  readonly pillars?: string;
  readonly posts?: string;
  readonly panels?: string;
  readonly frame?: string;
  readonly fence?: string;
  readonly extra?: string;
  readonly pegs?: string;
  readonly relief?: 'demon';
  readonly ivy?: 'edge' | 'third';
  readonly moss?: number;
  readonly vines?: number;
}

/** Each set's family by archive. */
// prettier-ignore
export const WALL_FAMILIES: Readonly<Record<number, WallFamily>> = {
  // ---- desert -------------------------------------------------------------------------------------------------
  7: { face: 'bricks', material: 'sandstone', small: true, patchy: true },
  9: { face: 'blocks', material: 'sandstone', quoin: 'sandstone', window: { kind: 'slit', frame: 'sandstone' }, extra: 'brick' },
  12: { face: 'plaster', material: 'sandstone', strip: 'brickTan', window: { kind: 'arch', frame: 'sandstone', lead: 'iron' } },
  14: { face: 'plaster', material: 'sandstone', foot: 'brickTan', window: { kind: 'arch', frame: 'sandstone', lead: 'iron' } },
  17: { face: 'rubble', material: 'sandstone', window: { kind: 'slit', frame: 'sandstone' } },
  26: { face: 'adobe', material: 'adobe', pegs: 'woodDark', window: { kind: 'hole', frame: 'adobe' } },
  29: { face: 'rubble', material: 'sandstone', fence: 'wood' },
  35: { face: 'blocks', material: 'stoneGreen', quoin: 'stone', moss: 0.08, window: { kind: 'lattice', frame: 'iron', lead: 'iron' } },
  38: { face: 'plaster', material: 'plasterWhite', quoin: 'sandstone', window: { kind: 'arch', frame: 'sandstone', lead: 'iron' } },
  42: { face: 'bricks', material: 'sandstone', small: true, top: 'stoneGreen', strip: 'stoneGreen', window: { kind: 'arch', frame: 'stoneGreen', lead: 'iron' } },
  58: { face: 'plaster', material: 'adobe', posts: 'wood', window: { kind: 'tall', frame: 'wood', lead: 'iron' } },
  61: { face: 'bricks', material: 'brickTan', pillars: 'stone', window: { kind: 'gothic', frame: 'gold', lead: 'iron' } },
  64: { face: 'adobe', material: 'adobe', window: { kind: 'hole', frame: 'stone' } },
  // ---- mountain -----------------------------------------------------------------------------------------------
  107: { face: 'blocks', material: 'stoneDark', moss: 0.2, vines: 0.25 },
  109: { face: 'blocks', material: 'stone', quoin: 'stone', window: { kind: 'slit', frame: 'woodDark' }, extra: 'stoneDark' },
  112: { face: 'rubble', material: 'cobbleBrown', dark: true, quoin: 'stone', window: { kind: 'shutters', frame: 'stone', lead: 'woodDark', shutters: 'clothGreen' } },
  114: { face: 'blocks', material: 'stone', small: true, quoin: 'stone', window: { kind: 'lattice', frame: 'iron', lead: 'iron' } },
  117: { face: 'blocks', material: 'stoneDark', window: { kind: 'slit', frame: 'stoneDark' } },
  126: { face: 'plaster', material: 'sandstone', quoin: 'stone', patches: true, window: { kind: 'grid', frame: 'stone', lead: 'iron' } },
  129: { face: 'rubble', material: 'stone', fence: 'woodDark' },
  135: { face: 'cobbles', material: 'marblePink', quoin: 'stoneDark', moss: 0.1, vines: 0.15, window: { kind: 'lattice', frame: 'iron', lead: 'iron' } },
  138: { face: 'rubble', material: 'stoneDark', window: { kind: 'lattice', frame: 'iron', lead: 'iron' } },
  142: { face: 'blocks', material: 'stone', small: true, window: { kind: 'lattice', frame: 'iron', lead: 'iron' } },
  158: { face: 'blocks', material: 'stoneDark', panels: 'wood', window: { kind: 'grid', frame: 'woodDark', lead: 'woodDark' } },
  161: { face: 'blocks', material: 'stoneBlue', pillars: 'stoneBlue', relief: 'demon', window: { kind: 'tall', frame: 'stone', lead: 'iron' } },
  164: { face: 'cobbles', material: 'stone', frame: 'timber', brace: true, window: { kind: 'lattice', frame: 'iron', lead: 'iron' } },
  // ---- temperate ----------------------------------------------------------------------------------------------
  307: { face: 'blocks', material: 'stoneDark', moss: 0.25, vines: 0.2 },
  309: { face: 'blocks', material: 'stone', quoin: 'stone', window: { kind: 'slit', frame: 'woodDark' }, extra: 'brickDark' },
  312: { face: 'plaster', material: 'sandstone', top: 'brickTan', quoin: 'brickTan', cracked: true, window: { kind: 'shutters', frame: 'woodPale', lead: 'woodPale', shutters: 'woodOlive', sill: 'brickTan' } },
  314: { face: 'stucco', material: 'plaster', frame: 'timber', brace: true, cracked: true, window: { kind: 'lattice', frame: 'iron', lead: 'iron' } },
  317: { face: 'blocks', material: 'stone', window: { kind: 'slit', frame: 'stoneDark' } },
  326: { face: 'bricks', material: 'brickDark', frame: 'timber', brace: true, window: { kind: 'grid', frame: 'iron', lead: 'iron' } },
  329: { face: 'rubble', material: 'cobbleBrown', fence: 'wood' },
  335: { face: 'rubble', material: 'cobbleBrown', quoin: 'stone', moss: 0.06, vines: 0.12, foot: 'stone', window: { kind: 'lattice', frame: 'iron', lead: 'iron' } },
  338: { face: 'bricks', material: 'brick', frame: 'timber', brace: true, window: { kind: 'lattice', frame: 'iron', lead: 'iron' } },
  342: { face: 'herringbone', material: 'brickDark', frame: 'timber', brace: true, window: { kind: 'lattice', frame: 'iron', lead: 'iron' } },
  358: { face: 'cobbles', material: 'stone', frame: 'timber', brace: true, posts: 'timber', ivy: 'third', window: { kind: 'tall', frame: 'iron', lead: 'iron' } },
  361: { face: 'marble', material: 'marbleTeal', pillars: 'bronze', quoin: 'stone', window: { kind: 'gothic', frame: 'stone', lead: 'iron' } },
  364: { face: 'planks', material: 'wood', ivy: 'edge', window: { kind: 'lattice', frame: 'woodGap', lead: 'iron' } },
  // ---- swamp --------------------------------------------------------------------------------------------------
  407: { face: 'bricks', material: 'sandstone', small: true, vines: 0.3 },
  409: { face: 'rubble', material: 'cobbleBrown', moss: 0.12, vines: 0.5, ivy: 'edge', window: { kind: 'lattice', frame: 'iron', lead: 'iron' }, extra: 'sandstone' },
  412: { face: 'cobbles', material: 'stone', frame: 'timber', brace: true, moss: 0.1, vines: 0.15, window: { kind: 'lattice', frame: 'iron', lead: 'iron' } },
  414: { face: 'bricks', material: 'brickDark', frame: 'timber', brace: true, vines: 0.25, window: { kind: 'lattice', frame: 'iron', lead: 'iron' } },
  417: { face: 'rubble', material: 'sandstone', window: { kind: 'slit', frame: 'sandstone' } },
  426: { face: 'vplanks', material: 'woodDark', vines: 0.5, window: { kind: 'lattice', frame: 'woodDark', lead: 'iron' } },
  429: { face: 'rubble', material: 'sandstone', fence: 'woodDark' },
  435: { face: 'rubble', material: 'cobbleBrown', quoin: 'stone', moss: 0.1, vines: 0.12, window: { kind: 'lattice', frame: 'iron', lead: 'iron' } },
  438: { face: 'plaster', material: 'sandstone', frame: 'timber', brace: true, vines: 0.3, window: { kind: 'lattice', frame: 'iron', lead: 'iron' } },
  442: { face: 'plaster', material: 'sandstone', vines: 0.5, window: { kind: 'lattice', frame: 'iron', lead: 'iron' } },
  458: { face: 'blocks', material: 'stone', moss: 0.08, vines: 0.1, window: { kind: 'lattice', frame: 'woodRed', lead: 'woodRed' } },
  461: { face: 'blocks', material: 'stone', posts: 'wood', vines: 0.08, window: { kind: 'gothic', frame: 'wood', lead: 'iron' } },
  464: { face: 'blocks', material: 'stoneDark', vines: 0.7, window: { kind: 'lattice', frame: 'iron', lead: 'iron' } },
};

/** The city specials: a painted timber frame round plaster panels, its colour the record's own. */
export const SPECIAL_FRAMES = ['woodRed', 'woodPainted', 'clothBlue'];
/** The city specials' sets, and those of them a winter set snows over (80 is 79's winter, 83 is 82's). */
export const SPECIAL_SETS = [79, 80, 82, 83];
const SPECIAL_SUMMER = [79, 82];

/** Whether an archive is a wall set whose winter turn is it snowed. */
export const snowsOver = (archive: number): boolean =>
  WALL_FAMILIES[archive] !== undefined || SPECIAL_SUMMER.includes(archive);

/** A family's materials, with the glass and its leading. */
export function familyMats(family: WallFamily): Materials {
  const names = new Set([
    family.material,
    'mortar',
    'black',
    'glassDark',
    'iron',
    'moss',
    'leafDark',
    'bark',
    'snow',
    'ice',
  ]);
  const parts = [
    family.frame,
    family.quoin,
    family.strip,
    family.top,
    family.foot,
    family.pillars,
    family.posts,
    family.panels,
    family.fence,
    family.extra,
    family.pegs,
  ];
  for (const part of parts) if (part !== undefined) names.add(part);
  const window = family.window;
  for (const part of [window?.frame, window?.lead, window?.shutters, window?.sill]) if (part) names.add(part);
  return materials([...names, `${family.material}:dim`, ...SPECIAL_FRAMES, 'plaster', 'woodPale']);
}
