// The people a cutscene places by hand: crew at work, foes at each other's throats, a stranger on the shore. Each is a
// forge figure in a dress and a move, standing where the story puts it and facing where it says, drawn as the
// figures on a deck are drawn: in the view the eye sees it from, at the move's own pace.
import type { CardAt, Cards } from '../../player/cards.ts';
import type { Dress } from '../../player/dressing.ts';
import { cardStand, frameAt, viewOf } from '../../player/figures.ts';

/** How many frames a second a placed figure's move plays at, as the deck's hands play theirs. */
const LOOP_FPS = 6;
/** Ids for placed figures start here, clear of the player's and the rooms' own. */
export const ACTOR_IDS = 900_000;

/** One figure as a cutscene places it: world metres, the bearing it faces, its move, and how many times life size
 *  (a figure aboard a ship drawn larger is drawn as large as it is). `since` is when its move began (seconds of the
 *  story's clock), so a move that plays once starts at its first frame; `hold` keeps a move on its last frame. */
export interface Actor {
  readonly id: number;
  readonly dress: Dress;
  readonly anim: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly facing: number;
  readonly scale?: number;
  readonly since?: number;
  readonly hold?: boolean;
  /** Its move's frames a second, where its pace is not the deck's: a walker's, so its feet keep to the ground. */
  readonly fps?: number;
}

/** The frame a placed figure's move shows at `clock`: looping, or held on its last once played through. */
export function actorFrame(actor: Pick<Actor, 'since' | 'hold' | 'fps'>, clock: number, frames: number): number {
  const into = clock - (actor.since ?? 0);
  const fps = actor.fps ?? LOOP_FPS;
  if (actor.hold && frames > 0) return Math.min(frames - 1, Math.floor(Math.max(0, into) * fps));
  return frameAt(into, frames, fps);
}

/** Each actor's card for an eye at `eye`, those whose frame is not composed yet showing their last. */
export function actorCards(
  actors: readonly Actor[],
  forge: Cards,
  eye: readonly [number, number, number],
  clock: number,
): CardAt[] {
  const shown: CardAt[] = [];
  for (const actor of actors) {
    const { view, flip } = viewOf(actor.facing, actor.x, actor.y, eye[0], eye[1]);
    const frame = actorFrame(actor, clock, forge.frames(actor.dress.body, actor.anim));
    const card = forge.card(actor.id, actor.dress, actor.anim, view, frame, flip);
    if (!card) continue;
    shown.push({ card, ...cardStand(actor.x, actor.y, eye[0], eye[1]), z: actor.z, flip, scale: actor.scale });
  }
  return shown;
}
