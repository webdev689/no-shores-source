// What the music hears of a Breach: from the room's BreachSeen, the space the player stands over and the frame's
// moments, the song of the encounter under way or of its space, its great foe awake, the Ways' sighting, the calm
// piece the space plays, and which encounter a moment (begun, won, wiped, cleared) is of. Pure, for the director.

import { BREACH_EVENT, type BreachSeen } from '../../../network/breachMessages.ts';
import type { FightEvent } from '../../../network/messages.ts';
import { ENCOUNTER } from '../../breachWords.ts';
import type { BreachSong, Cue, HeardBreach } from './directorLaw.ts';

/** Each encounter's song by its number (`ENCOUNTER`): the Steward's court, before or after the Steward, plays the Two
 *  Shores'. */
const ENCOUNTER_SONGS: readonly BreachSong[] = ['waking', 'mending', 'choir', 'ways', 'shores', 'shores'];
/** The calm piece each quiet space plays: the Descent's there, the Broken Stair's on its slabs, After the Bells in
 *  every space an encounter was fought in. */
const PIECES: Readonly<Record<string, number>> = { descent: 0, stair: 1 };
const AFTER_BELLS = 2;
/** The room's moments that are an encounter's, each carrying its number (0 the Waking, at the gate). */
const OF_ENCOUNTER: ReadonlySet<number> = new Set([BREACH_EVENT.begun, BREACH_EVENT.won, BREACH_EVENT.wiped]);

/** The encounter a frame's moments are of, the last that is one's; 'cleared' for the Breach cleared; none. */
export function momentOf(had: readonly Pick<FightEvent, 'kind' | 'amount'>[]): number | 'cleared' | null {
  if (had.some((event) => event.kind === BREACH_EVENT.cleared)) return 'cleared';
  return had.reduce<number | null>((last, event) => (OF_ENCOUNTER.has(event.kind) ? event.amount : last), null);
}

/** The cue a moment of encounter `number` plays its sting in: its song's, the Steward's own score in its court. */
export const encounterCue = (number: number): Cue =>
  number === ENCOUNTER.steward
    ? { kind: 'boss', boss: 'steward', part: 1 }
    : { kind: 'breach', song: ENCOUNTER_SONGS[number] ?? 'waking' };

/** A Breach as the music hears it: in its run, the encounter under way (else the one fought in `space`, the space
 *  the player stands over), its great foe awake and the Ways' Watchers having seen; at its gate, the Waking while
 *  `holding` (the player's company holds it, in its hollow), else no song; and the encounter of the frame's moments
 *  `had`, which the room tells on the frame the Waking ends too. */
export function hearBreach(
  seen: Pick<BreachSeen, 'gate' | 'encounter' | 'boss' | 'seen' | 'heldBy' | 'woken'>,
  plan: { readonly encounters: readonly { readonly space: string | null }[] },
  space: string | null,
  holding: boolean,
  had: readonly Pick<FightEvent, 'kind' | 'amount'>[] = [],
): HeardBreach {
  const moment = momentOf(had);
  const told = moment === null ? {} : { moment };
  // At the gate the zone hears the Breach (its instruments fetched), but only its holders the Waking's song.
  if (seen.gate)
    return {
      run: false,
      song: holding && seen.heldBy && !seen.woken ? 'waking' : null,
      boss: null,
      piece: AFTER_BELLS,
      ...told,
    };
  const running = seen.encounter;
  const index =
    running > 0 ? running : plan.encounters.findIndex((encounter) => space !== null && encounter.space === space);
  const boss =
    running === ENCOUNTER.choir && seen.boss > 0 ? 'scrivener' : running === ENCOUNTER.steward ? 'steward' : null;
  return {
    run: true,
    song: ENCOUNTER_SONGS[index] ?? 'waking',
    boss,
    piece: PIECES[space ?? ''] ?? AFTER_BELLS,
    ...told,
    ...(running === ENCOUNTER.ways && seen.seen && { least: 'peak' as const }),
  };
}
