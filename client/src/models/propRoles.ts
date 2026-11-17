// Each prop's family, by its classic model id: what the piece is for. A family builds from the piece's box, its
// pictures and its doors alone.
import type { Picture } from './model.ts';
import type { Relief } from './tables.ts';
import type { DoorCorners, Frame } from './frame.ts';
import type { PartBuilder } from './parts.ts';

export type FamilyName =
  | 'ankh'
  | 'arcade'
  | 'archway'
  | 'armchair'
  | 'beam'
  | 'bed'
  | 'bench'
  | 'board'
  | 'boat'
  | 'cabinet'
  | 'canopy'
  | 'cart'
  | 'caveMouth'
  | 'chair'
  | 'column'
  | 'counter'
  | 'crate'
  | 'cupboard'
  | 'dresser'
  | 'fountain'
  | 'gateArch'
  | 'gateFrame'
  | 'gazebo'
  | 'grave'
  | 'graveSlab'
  | 'greatTree'
  | 'hanging'
  | 'headstone'
  | 'hearth'
  | 'hut'
  | 'ladder'
  | 'lectern'
  | 'log'
  | 'mausoleum'
  | 'mound'
  | 'obelisk'
  | 'panel'
  | 'parkBench'
  | 'pedestal'
  | 'post'
  | 'rack'
  | 'railFence'
  | 'ramp'
  | 'rock'
  | 'ruin'
  | 'ruinArch'
  | 'sarcophagus'
  | 'shelf'
  | 'shrineFront'
  | 'siege'
  | 'signboard'
  | 'signFrame'
  | 'signPole'
  | 'signpost'
  | 'statue'
  | 'stepShelf'
  | 'table'
  | 'temple'
  | 'tent'
  | 'throne'
  | 'tomb'
  | 'trough'
  | 'wallPanel'
  | 'wardrobe'
  | 'wellHouse';

const each = (ids: readonly number[], family: FamilyName): [number, FamilyName][] => ids.map((id) => [id, family]);

/** Each piece's family, by its model id, the families in name order. */
export const PROP_ROLES: ReadonlyMap<number, FamilyName> = new Map([
  ...each([43083, 43084, 43085, 43086, 43121, 43122, 43123, 43124], 'ankh'),
  ...each([43007, 43008, 43010], 'arcade'),
  ...each([62310, 62311], 'archway'),
  ...each([41009, 41104], 'armchair'),
  ...each([6308, 6310, 62319], 'beam'),
  ...each([41000, 41001], 'bed'),
  ...each([41105, 41106, 51109], 'bench'),
  ...each([41127, 41128, 41240, 43000, 43002, 51128], 'board'),
  ...each([41508, 41513], 'boat'),
  ...each([41007, 41008, 41022, 41023, 41050, 41309, 41802, 41803, 41805, 41806, 41810], 'cabinet'),
  ...each([41002], 'canopy'),
  ...each([41214, 41239, 41241], 'cart'),
  ...each([42000, 43603, 43604], 'caveMouth'),
  ...each([41100, 41101, 41102, 41103, 41119], 'chair'),
  ...each([41723, 41731, 41732, 41733], 'column'),
  ...each([41126], 'counter'),
  ...each(
    [
      41816, 41817, 41818, 41819, 41821, 41822, 41823, 41824, 41825, 41826, 41827, 41828, 41829, 41830, 41831, 41832,
      41833, 41834,
    ],
    'crate',
  ),
  ...each([41032, 41037, 41051, 41804], 'cupboard'),
  ...each([41033, 41034], 'dresser'),
  ...each([41220, 41221, 41222], 'fountain'),
  ...each([43003, 43004, 43005, 43006], 'gateArch'),
  ...each([41702, 62312, 62317], 'gateFrame'),
  ...each([43109, 43110, 43111, 43112], 'gazebo'),
  ...each([43200, 43201, 43203, 43206], 'grave'),
  ...each(
    [43027, 43028, 43029, 43030, 43031, 43032, 43033, 43034, 43035, 43036, 43037, 43038, 43129, 43130, 43131, 43132],
    'graveSlab',
  ),
  ...each([42001], 'greatTree'),
  ...each([51115, 51116, 51117, 51118, 51119, 51122], 'hanging'),
  ...each(
    [
      43011, 43012, 43013, 43014, 43015, 43016, 43017, 43018, 43019, 43020, 43021, 43022, 43023, 43024, 43025, 43026,
      43039, 43040, 43041, 43042, 43043, 43044, 43045, 43046, 43047, 43048, 43049, 43050, 43051, 43052, 43053, 43054,
      43063, 43064, 43065, 43066, 43067, 43068, 43069, 43070, 43101, 43102, 43103, 43104, 43117, 43118, 43119, 43120,
      43142, 43143, 43144, 43145, 43300, 43301,
    ],
    'headstone',
  ),
  ...each([41116, 41117, 41124], 'hearth'),
  ...each([40012, 41619], 'hut'),
  ...each([41409], 'ladder'),
  ...each([41021, 41118], 'lectern'),
  ...each([41722], 'log'),
  ...each([43079, 43080, 43081, 43082], 'mausoleum'),
  ...each([41216, 41217, 41218, 41219], 'mound'),
  ...each([43071, 43072, 43073, 43074, 43105, 43106, 43107, 43108, 43125, 43126, 43127, 43128, 43303], 'obelisk'),
  ...each([6101], 'panel'),
  ...each([43307], 'parkBench'),
  ...each([41020, 41224, 41230], 'pedestal'),
  ...each([41901, 41902], 'post'),
  ...each([41115, 41125, 41300, 41302], 'rack'),
  ...each([41206, 41207, 41208], 'railFence'),
  ...each([43600], 'ramp'),
  ...each(
    [
      41704, 41705, 41706, 41707, 41708, 41709, 41710, 41711, 41712, 41713, 41714, 41715, 41716, 41717, 41719, 60511,
      60512, 60513, 60514, 60515, 60516, 60517, 60518, 60519, 60520,
    ],
    'rock',
  ),
  ...each(
    [
      41720, 41721, 41724, 41725, 41727, 41728, 41729, 43400, 43401, 43402, 43403, 43404, 43405, 43406, 43407, 43408,
      43409, 43410, 43411, 43412, 43413, 43414, 43415, 43416, 43417, 43500, 43501, 43502, 43503, 43504, 43505, 43506,
      43507, 43508, 43509, 43510, 43511, 43513, 43515, 43516, 43517,
    ],
    'ruin',
  ),
  ...each([41726, 43512, 43514], 'ruinArch'),
  ...each([43075, 43076, 43077, 43078, 43304, 43306], 'sarcophagus'),
  ...each(
    [
      41005, 41006, 41010, 41011, 41012, 41013, 41014, 41015, 41016, 41017, 41018, 41019, 41025, 41026, 41027, 41028,
      41029, 41030, 41031, 41039, 41040, 41041, 41042, 41044, 41045, 41046, 41047, 41048, 41049,
    ],
    'shelf',
  ),
  ...each([43113, 43114, 43115, 43116], 'shrineFront'),
  ...each([41402, 41407], 'siege'),
  ...each([41700], 'signboard'),
  ...each([43702, 43703, 43704, 43705, 43707, 43708, 43710, 43711, 43712, 43713, 43716, 43717], 'signFrame'),
  ...each([43737, 43738, 43739, 43740, 43741, 43744, 43745, 43746, 43749, 43750, 43751, 43754, 43755], 'signPole'),
  ...each(
    [
      41739, 43720, 43721, 43722, 43723, 43724, 43725, 43726, 43727, 43728, 43730, 43731, 43732, 43733, 43734, 43735,
      43736,
    ],
    'signpost',
  ),
  ...each([62324, 62327, 62329], 'statue'),
  ...each([41035, 41036, 41807, 41808, 41814], 'stepShelf'),
  ...each([41108, 41109, 41110, 41111, 41112, 41113, 41114, 41121], 'table'),
  ...each([43137, 43138, 43139, 43140, 43141, 43800, 43801, 43802, 43803, 43804], 'temple'),
  ...each([5103, 43601, 43602], 'tent'),
  ...each([41120, 41122, 41123], 'throne'),
  ...each([43055, 43056, 43057, 43058, 43059, 43060, 43061, 43062, 43133, 43134, 43135, 43136, 43302], 'tomb'),
  ...each([41209, 41210], 'trough'),
  ...each([41200, 41201, 41202, 41203, 41205], 'wallPanel'),
  ...each([41003, 41004, 41800, 41801], 'wardrobe'),
  ...each([43202, 43204], 'wellHouse'),
]);

/** The pieces that stand against a wall by their +z side, the side the classic leaves unmodelled (shelves open to
 *  the room on -z, the ladder): their family is built mirrored, so its front faces the room. */
export const AGAINST_PLUS_Z: ReadonlySet<number> = new Set([41005, 41006, 41012, 41013, 41044, 41409]);

/** What a family reads of its piece's measure: its doors (turned as its builder is), a board's top cover, a canopy
 *  bed's bedding and a tall rock's relief. */
export type FamilyMeasure = {
  readonly doors: readonly DoorCorners[];
  readonly cover?: number;
  readonly bedding?: Picture;
  readonly relief?: Relief;
};

/** A family: from its piece's builder, box, pictures, measure and id, its parts added to the builder. */
export type Family = (
  add: PartBuilder,
  fit: Frame,
  looks: readonly Picture[],
  measure: FamilyMeasure,
  id: number,
) => void;
