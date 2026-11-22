// A travel by the held map, as the page sails it: the cinematic (`SailAway`) round the room's answer. The travel is
// asked as the picture fades; taken, the ship is laid where the room put it, short of the course's end, and sails on
// to it; refused, it heaves to, its voyage kept, and its line says why.
import { SailAway } from '../cinema/sailAway.ts';
import type { Point2 } from '../overworld/ground.ts';
import type { Passage } from './passage.ts';
import type { Sea } from './sea.ts';
import type { SeaRoom } from './seaRoom.ts';

/** The room's answers (crates/room/src/sea_travel.rs `TravelRefused::number`): taken, and too soon after a course,
 *  which is asked again. */
const TAKEN = 0;
const TOO_SOON = 6;
/** How long the room may leave a travel unanswered before the page gives it up, seconds. */
const ANSWER_WITHIN_S = 10;

/** Why the room refused a travel, by its number, as the ship's line says it. */
export function travelRefusal(refused: number): string {
  const words: Record<number, string> = {
    1: 'No travel while fighting.',
    2: 'No travel off the helm.',
    3: 'No travel with a hostile ship giving chase.',
    4: 'That lies in these waters.',
    5: 'The way there crosses land.',
  };
  return words[refused] ?? 'The sea would not take that course.';
}

export class SeaTravel {
  readonly away: SailAway;
  private readonly end: Point2;
  private readonly passage: Passage;
  private readonly ready: () => boolean;
  /** Seconds since the travel was asked, and the sea room it was sent to: one joined since is asked again. */
  private asked: number | null = null;
  private sentTo: SeaRoom | null = null;

  /** Travels for `end`, in the water named `water`: `ready` says when the new waters round the ship have loaded. */
  constructor(water: string, end: Point2, passage: Passage, ready: () => boolean) {
    [this.end, this.passage, this.ready] = [end, passage, ready];
    this.away = new SailAway(water, () => this.ask());
  }

  private ask(): void {
    [this.asked, this.sentTo] = [0, this.passage.room];
    this.passage.travel();
  }

  /** `seconds` on in `room`: its answer taken, and the cinematic stepped. */
  step(seconds: number, room: SeaRoom | null): void {
    if (!this.away.answered) this.answer(seconds, room);
    this.away.advance(seconds, this.ready());
  }

  /** The room's answer, while none has come. */
  private answer(seconds: number, room: SeaRoom | null): void {
    if (this.asked !== null) this.asked += seconds;
    const answer = room?.takeTravelled() ?? null;
    const moved = room?.ownShip;
    if (answer === TOO_SOON || (this.asked !== null && room && room !== this.sentTo)) this.ask();
    else if (answer === TAKEN && moved) {
      // Laid where the room has it, with no easing across the way it did not sail.
      this.passage.placeAt({ x: moved.x, y: moved.y, heading: moved.heading });
      this.passage.sailAlong([this.end]);
      this.away.answer(null);
    } else if (answer !== null || (this.asked !== null && this.asked > ANSWER_WITHIN_S)) {
      const why = answer !== null && answer !== TAKEN ? travelRefusal(answer) : 'The sea did not answer.';
      this.passage.stop();
      this.passage.say(why);
      this.away.answer(why);
    }
  }
}

/** Sails `sea` for `to`; with `travel` (the held map's prompt answered yes), travels there when its water is known,
 *  `ready` saying when the waters round the ship have loaded. */
export function sailOrTravel(sea: Sea, to: Point2, travel: boolean, ready: () => boolean): void {
  const water = travel ? sea.waterAt?.(to)?.name : null;
  if (water) sea.travelTo(to, water, ready);
  else sea.sailTo(to);
}
