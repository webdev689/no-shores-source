// Destiny's revive on foot as the page shows it; the room judges all of it (crates/room/src/revive.rs). E held over a
// fallen ally beside the player holds a revive, its share the room's word, as a node's gather is shown. The player
// fallen themselves is told how long until they may respawn, who is reviving them, or that the dark lets no one
// respawn there.
import type { Reviving, SeenPlayer } from '../network/messages.ts';
import { type FighterView, fighterView } from '../rules/fighters.ts';
import type { PixelPicture } from '../combat/dropPictures.ts';
import { EVENT } from '../combat/cues.ts';
import { RESPAWN_TICKS } from '../combat/hudPlace.ts';
import type { Marked } from '../combat/marksOver.ts';
import type { Use } from './footGear.ts';

/** How near a fallen ally's body the player stands to revive them, metres across and up or down
 *  (crates/room/src/revive.rs REVIVE_REACH_M, REVIVE_RISE_M). */
export const REVIVE_REACH_M = 2.5;
export const REVIVE_RISE_M = 2;

/** What the room last said of its fallen: whether it is a darkness zone now, who is reviving whom, and an Abyss
 *  run's revives left (-1 in any other room). */
export interface FallenWord {
  darkness: boolean;
  reviving: readonly Reviving[];
  revives: number;
}

type Point = readonly [number, number, number];

/** Whether a fighter lies fallen in the fight, as an ally may revive them: down, and not dead past the section. */
const fallenIn = (seen: SeenPlayer, view: FighterView): boolean =>
  view.action.kind === 'dead' && seen.standing.kind !== 'dead';

/** The fallen ally nearest the player's feet within reach to revive, by their number, but those `taken` (another
 *  ally's to revive); null for none. */
export function fallenNear(
  own: Point,
  others: ReadonlyMap<number, SeenPlayer>,
  taken: (id: number) => boolean = () => false,
): number | null {
  let nearest: { readonly id: number; readonly across: number } | null = null;
  for (const [id, seen] of others) {
    if (!seen.fighter || taken(id)) continue;
    const view = fighterView(seen.fighter);
    const across = Math.hypot(view.x - own[0], view.y - own[1]);
    const reached = across <= REVIVE_REACH_M && Math.abs(view.z - own[2]) <= REVIVE_RISE_M;
    if (fallenIn(seen, view) && reached && (!nearest || across < nearest.across)) nearest = { id, across };
  }
  return nearest?.id ?? null;
}

/** What E does over the fallen ally `fallen` (named `name`, '' for a guest): it holds their revive. */
export function reviveUse(fallen: number, name: string): Use {
  return { words: name ? `Hold to revive ${name}` : 'Hold to revive', run: () => undefined, revive: fallen };
}

/** E on foot over a fallen ally, where the player may use it (`able`): the revive's Use, and held, the fight's hold of
 *  it, sent with each input (`Fighting.reviving`), and how far it has gone as the room says; none, and no hold, where
 *  no fallen ally another does not revive lies within reach of `feet`, or in an Abyss run with no revive left, so E
 *  stays the cache's or the door's there. */
export function reviveHere(
  fight: { readonly others: ReadonlyMap<number, SeenPlayer>; readonly player: number; reviving: boolean },
  word: FallenWord,
  feet: Point,
  able: boolean,
  use: { held(control: 'use'): boolean },
  nameOf: (id: number) => string,
): { readonly use: Use | null; readonly share: number | null } {
  const taken = (id: number) => word.reviving.some((each) => each.fallen === id && each.reviver !== fight.player);
  const fallen = able && word.revives !== 0 ? fallenNear(feet, fight.others, taken) : null;
  const found = fallen === null ? null : reviveUse(fallen, nameOf(fallen));
  fight.reviving = found?.revive !== undefined && use.held('use');
  return { use: found, share: fight.reviving ? heldShare(word, fight.player) : null };
}

/** How far the player's own hold of a revive has gone (0 to 1), as the room last said; null while they hold none. */
export function heldShare(word: FallenWord, player: number): number | null {
  return word.reviving.find((each) => each.reviver === player)?.progress ?? null;
}

/** What the player fallen in the fight is told and may do: whether Respawn is offered at all (never in the dark, nor
 *  while an ally revives them), whether it may be pressed yet, and the line under death's words: who revives them,
 *  the seconds left before Respawn, or why no Respawn comes. */
export interface Fallen {
  readonly offered: boolean;
  readonly canRespawn: boolean;
  readonly line: string;
}

/** The player's own fall, from the ticks they have lain and the room's word, with a reviver's name (`nameOf`, '' for a
 *  guest); null while they stand. */
export function fallenOf(
  own: FighterView | null,
  player: number,
  word: FallenWord,
  nameOf: (id: number) => string,
): Fallen | null {
  if (own?.action.kind !== 'dead') return null;
  const reviving = word.reviving.find((each) => each.fallen === player);
  const waits = { offered: false, canRespawn: false };
  if (reviving) {
    const name = nameOf(reviving.reviver) || 'An ally';
    return { ...waits, line: `${name} is reviving you  ${Math.round(reviving.progress * 100)}%` };
  }
  if (word.revives === 0) return { ...waits, line: 'No revives left. You stay down for the rest of the run.' };
  if (word.darkness) return { ...waits, line: 'Darkness zone. Only an ally can raise you.' };
  const left = Math.ceil(Math.max(0, RESPAWN_TICKS - own.action.elapsed) / 60);
  return { offered: true, canRespawn: left === 0, line: left > 0 ? `Respawn in ${left} s` : 'You fell.' };
}

/** The mark over a fallen ally, after Destiny's Ghost and drawn new: a faceted shell of light round a glowing eye.
 *  Lit, it beats and is seen from everywhere, through what stands before it. */
export const FALLEN_PICTURE: PixelPicture = {
  rows: [
    '......a......',
    '.....aba.....',
    '....abcba....',
    'aaaabcccbaaaa',
    '.abbcccccbba.',
    '..abcdddcba..',
    '...acdedca...',
    '..abcdddcba..',
    '.abbcccccbba.',
    'aaaabcccbaaaa',
    '....abcba....',
    '.....aba.....',
    '......a......',
  ],
  colours: ['#0d1a24', '#cfe8f2', '#8fb7c9', '#2a4a5a', '#7ff0ff'],
};
/** How high over a fallen body's feet its mark stands, metres: over the body lying there. */
const FALLEN_OVER_M = 1.1;

/** A mark over each fallen ally, where an ally may revive them. */
export function fallenMarks(others: ReadonlyMap<number, SeenPlayer>): Marked[] {
  const marks: Marked[] = [];
  for (const seen of others.values()) {
    const view = seen.fighter ? fighterView(seen.fighter) : null;
    if (view && fallenIn(seen, view))
      marks.push({ picture: FALLEN_PICTURE, at: [view.x, view.y, view.z + FALLEN_OVER_M], lit: true });
  }
  return marks;
}

/** How long a revive's notice stands over the middle of the view, milliseconds. */
const TOLD_MS = 3000;

/** What the revive tells the player over the middle of the view, each for TOLD_MS: an ally down, a revive given or
 *  taken, a checkpoint reached, and the company fallen back to it. */
export class ReviveNotices {
  private told: { readonly words: string; readonly until: number }[] = [];

  /** Takes a frame's events for `player`, another player named by `nameOf` ('' for a guest; null for no player). */
  hear(
    events: readonly { readonly kind: number; readonly striker: number; readonly defender: number }[],
    player: number,
    nameOf: (id: number) => string | null,
    now: number,
  ): void {
    for (const event of events) {
      const words = noticeOf(event, player, nameOf);
      if (words && !this.told.some((told) => told.words === words)) this.told.push({ words, until: now + TOLD_MS });
    }
  }

  /** The notices standing at `now`, oldest first. */
  lines(now: number): string[] {
    this.told = this.told.filter((told) => told.until > now);
    return this.told.map((told) => told.words);
  }
}

function noticeOf(
  event: { readonly kind: number; readonly striker: number; readonly defender: number },
  player: number,
  nameOf: (id: number) => string | null,
): string | null {
  const named = (id: number) => nameOf(id) || 'An ally';
  if (event.kind === EVENT.checkpoint) return event.defender === player ? 'Checkpoint reached' : null;
  if (event.kind === EVENT.fellBack)
    return event.defender === player ? 'Your company fell. Back to the checkpoint' : null;
  if (event.kind === EVENT.revived && event.defender === player) return `${named(event.striker)} revived you`;
  if (event.kind === EVENT.revived && event.striker === player)
    return `You revived ${nameOf(event.defender) || 'an ally'}`;
  const ally = event.kind === EVENT.killed && event.defender !== player && nameOf(event.defender) !== null;
  return ally ? `${named(event.defender)} is down` : null;
}
