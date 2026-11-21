// What the story's beats share: the stage they draw on, the ships they sail, the Brig and its crew, the storm's
// lightning, where it all happens, the player as they have made themselves, and the game's own parts the playable
// beats run on.
import type { Lightning } from '../../cinema/lightning.ts';
import type { FirstPerson } from '../../firstperson/firstPerson.ts';
import type { Dress } from '../../player/dressing.ts';
import type { Input } from '../../player/input.ts';
import type { Walker } from '../../player/walker.ts';
import type { AccountLink } from '../../network/accounts.ts';
import type { MovementRules } from '../../rules/movementRules.ts';
import type { MarkView } from '../../ships/markView.ts';
import type { LandWorker } from '../../terrain/landClient.ts';
import type { Brig } from './brig.ts';
import type { Look } from './look.ts';
import type { Sailing } from './sailing.ts';
import type { Stage } from './stage.ts';

/** Where the story happens: the storm at sea, out past Saltmere's harbour, and the Brig's heading through it. */
export interface Places {
  readonly storm: readonly [number, number];
  readonly heading: number;
  /** The bearing from the storm back toward Saltmere's town. */
  readonly home: number;
}

export interface Story {
  readonly stage: Stage;
  readonly sailing: Sailing;
  readonly brig: Brig;
  readonly lightning: Lightning;
  readonly places: Places;
  readonly land: LandWorker;
  readonly movement: MovementRules;
  readonly walker: Walker;
  readonly firstPerson: FirstPerson;
  readonly input: Input;
  readonly roomModule: Promise<WebAssembly.Module>;
  readonly marks: MarkView;
  readonly link: AccountLink | null;
  /** The player as they made themselves: their look, and the dress they wear in the story. */
  look: Look;
  dress: Dress;
}
