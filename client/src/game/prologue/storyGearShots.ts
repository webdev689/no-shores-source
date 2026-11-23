// The Character page over the gear the story's own room sends once the player has woken on the wreck, in its steel,
// and taken up its sword and shield and its bow: the room's word itself, not a sample, pictured headless
// (`tools/uiShot.mjs`). The game never imports it.
import type { GearState } from '../../network/gearMessages.ts';
import { LocalRoom } from '../../network/localRoom.ts';
import { fetchRoomWasm } from '../../rules/combatRules.ts';
import { menuShot } from '../mountShots.ts';
import { courseOf, readWreck } from './wreckLayout.ts';
import { BOW, SWORD_AND_SHIELD } from './wreckTeaching.ts';

const layout = readWreck();
const [x, y] = layout.wake.at;
let sent: GearState | null = null;
const room = LocalRoom.openOverSea(
  await WebAssembly.compileStreaming(fetchRoomWasm(import.meta.env.BASE_URL)),
  { x, y },
  courseOf(layout),
  () => undefined,
  (gear) => (sent = gear),
);
room.storyWreck();
room.pump(0.1);
room.storyTake(SWORD_AND_SHIELD);
room.storyTake(BOW);
room.pump(1);
if (!sent) throw new Error('the story’s room sent no gear');

export const storyCharacter = menuShot('character', sent);
