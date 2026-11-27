// The keeper's room (`KeptRoom`) on a room's WebAssembly door, as the rooms' host (`worker.ts`) hands it to its keeper.

import type { KeptRoom } from './keeping.ts';
import type { RoomDoor } from './roomDoor.ts';

/** What of a room's door the keeper reads and writes through. */
type KeptDoor = Pick<
  RoomDoor,
  'keptApart' | 'judgedMoved' | 'restoreJoined' | 'parting' | 'mailLying' | 'shut' | 'name' | 'tag' | 'guild'
>;

/** Every keeper's call into the room but `own`, which the host adds: each through `guarded`, which catches a fault in
 *  the room and answers its fallback. A player whose socket another takes over leaves as at a close (`partFrom`): their
 *  chests are opened, then what lies for them is posted to their mail, before their character is read. */
export function keptRoomOn(door: KeptDoor, guarded: <T>(call: () => T, fallback: T) => T): Omit<KeptRoom, 'own'> {
  return {
    keptApart: (player) => guarded(() => door.keptApart(player), null),
    judgedMoved: (player) => guarded(() => door.judgedMoved(player), false),
    restoreJoined: (player, body, vault, from) => guarded(() => door.restoreJoined(player, body, vault, from), false),
    mailLying: (player) => {
      guarded(() => door.parting(player), undefined);
      guarded(() => door.mailLying(player), undefined);
    },
    shut: (player, kept) => guarded(() => door.shut(player, kept), ''),
    name: (player, name) => guarded(() => door.name(player, name), false),
    tag: (player, tag) => guarded(() => door.tag(player, tag), false),
    guild: (player, told) => guarded(() => door.guild(player, told), false),
  };
}
