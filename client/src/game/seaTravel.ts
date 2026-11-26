// A travel by the held map, as the page sails it: the cinematic (`SailAway`) round the room's answer. The travel is
// asked as the picture fades; taken, the ship is laid where the room put it, short of the course's end, and sails on
// to it; refused, it heaves to, its voyage kept, and its line says why.
import { SailAway } from '../cinema/sailAway.ts';
import type { MapWater } from '../heldmap/watersWash.ts';
import type { Point2 } from '../overworld/ground.ts';
import type { Passage } from './passage.ts';
import type { Sea } from './sea.ts';
import type { SeaRoom } from './seaRoom.ts';
import { drawnWhole, WHOLE_FRAMES } from '../standIns.ts';

/** The room's answers (crates/room/src/sea_travel.rs `TravelRefused::number`): taken, and too soon after a course or
 *  a travel, which is asked again. */
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
  private readonly passage: Passage;
  private readonly ready: () => boolean;
  /** Seconds since the travel was asked, and the sea room it was sent to and its joins then: a room joined since, or
   *  the same joined again (which drops what was sent), is asked again. */
  private asked: number | null = null;
  private sentTo: SeaRoom | null = null;
  private sentJoins: number | undefined;
  /** The end of the course sent, which the room sails the ship on to once it has taken the travel. */
  private sentEnd: Point2;
  /** Steps since the room answered: `ready` is asked before a frame is drawn, so the waters it laid the ship in count
   *  as ready only once frames enough have drawn them. */
  private sinceAnswer = 0;

  /** Travels for `end` (until a course is sent, whose own end it then is), in the water named `water`: `ready` says
   *  when the land of the new waters round the ship has loaded; the black waits too for frames drawn whole since the
   *  room's answer (`standIns.ts`). */
  constructor(water: string, end: Point2, passage: Passage, ready: () => boolean) {
    [this.sentEnd, this.passage, this.ready] = [end, passage, ready];
    this.away = new SailAway(water, () => this.ask());
  }

  /** Asks the room for the travel; a voyage stopped meanwhile (a fight met, the ship hove to) has none to ask. The
   *  wait for its answer runs from the first ask. */
  private ask(): void {
    if (!this.passage.sailing) {
      this.passage.say('The voyage was stopped.');
      this.away.answer('The voyage was stopped.');
      return;
    }
    this.asked ??= 0;
    // A room that has no ship of the player's yet (a tier's, just joined, before its keeper put it to sea) would take
    // it for a course with nowhere to start: it is asked once the room has it.
    const room = this.passage.room;
    [this.sentTo, this.sentJoins] = [room?.ownShip ? room : null, room?.joins];
    if (this.sentTo) this.sentEnd = this.passage.travel().at(-1) ?? this.sentEnd;
  }

  /** Ends the travel at once, `room` told to forget it: the player has the ship again. */
  cut(room: SeaRoom | null): void {
    room?.forgetTravel();
    this.away.cut();
  }

  /** `seconds` on in `room`: its answer taken, and the cinematic stepped. */
  step(seconds: number, room: SeaRoom | null): void {
    if (!this.away.answered) this.answer(seconds, room);
    else this.sinceAnswer += 1;
    this.away.advance(seconds, this.sinceAnswer > WHOLE_FRAMES && drawnWhole() && this.ready());
  }

  /** The room's answer, while none has come. */
  private answer(seconds: number, room: SeaRoom | null): void {
    if (this.asked === null) return;
    this.asked += seconds;
    const answer = room?.takeTravelled() ?? null;
    const moved = room?.ownShip;
    const joined = room && (room !== this.sentTo || room.joins !== this.sentJoins);
    // The wait runs over every asking again: a room that never shows the ship is given up, never left black.
    const waiting = this.asked <= ANSWER_WITHIN_S;
    if (waiting && (answer === TOO_SOON || joined)) this.ask();
    else if (answer === TAKEN && moved) {
      // Laid where the room has it, with no easing across the way it did not sail.
      this.passage.placeAt({ x: moved.x, y: moved.y, heading: moved.heading });
      this.passage.sailAlong([this.sentEnd]);
      this.away.answer(null);
    } else if (answer !== null || !waiting) {
      const why = answer !== null && answer !== TAKEN ? travelRefusal(answer) : 'The sea did not answer.';
      room?.forgetTravel();
      this.passage.stop();
      this.passage.say(why);
      this.away.answer(why);
    }
  }
}

/** Sails `sea` for `to`; with `travel`, the water the held map's prompt asked of and was answered yes, travels there
 *  (named as the prompt named it, never judged again at `to`), `ready` saying when the waters round the ship have
 *  loaded. */
export function sailOrTravel(sea: Sea, to: Point2, travel: MapWater | null, ready: () => boolean): void {
  if (!travel || !sea.travelTo(to, travel.name ?? travel.id, ready)) sea.sailTo(to);
}
