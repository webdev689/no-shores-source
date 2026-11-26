// The player off the helm, walking their Sloop's deck: their body stepped by the movement crate on its deck's grid of
// heights, in its own frame, each tick's controls sent to the sea room as a numbered step, and the room's word on the
// body correcting the prediction, as a node's room corrects a walker on land. The room keeps its course meanwhile.
import { Prediction } from '../network/prediction.ts';
import { newPlayer } from '../player/player.ts';
import type { Walker } from '../player/walker.ts';
import { type Body, type Controls, type MovementRules, floatsOfControls } from '../rules/movementRules.ts';
import { type Deck, deckFloats } from '../ships/deck.ts';

/** What the walk needs of the sea room: to send a step, and its last word on the player's body on deck (the number
 *  of their last step it took), counted so each word is taken once. */
export interface DeckRoom {
  walk(sequence: number, controls: readonly number[]): void;
  readonly onDeck: { readonly acknowledged: number; readonly body: Body } | null;
  readonly words: number;
  /** Whether the room has gone unheard so long that no step is sent until it speaks (`UNHEARD_MOST`). */
  readonly quiet?: boolean;
}

/** The player's walk on a deck, from the spot behind its wheel, facing its bow. */
export class DeckWalk {
  private readonly prediction = new Prediction<Controls>();
  private readonly movement: MovementRules;
  private readonly walker: Walker;
  private readonly room: DeckRoom;
  private wordTaken: number;

  constructor(movement: MovementRules, walker: Walker, deck: Deck, room: DeckRoom) {
    [this.movement, this.walker, this.room] = [movement, walker, room];
    this.wordTaken = room.words;
    movement.setCourse([]);
    movement.setHeights(deckFloats(deck));
    const [x, y] = deck.helm;
    walker.player = { ...newPlayer(movement, x, y), view: walker.player.view, yaw: 0, facing: 0 };
  }

  /** The rules the player steps by on deck: the movement rules, each tick's controls sent on as a step. */
  rules(): MovementRules {
    const { movement, prediction, room } = this;
    return {
      ...movement,
      step: (body, asked) => {
        // A deck is no saddle: the room walks every body aboard on foot, so the page does too.
        const controls = { ...asked, mounted: false };
        // A room long unheard takes no step until it speaks, and the body stands meanwhile.
        if (room.quiet === true) return body;
        room.walk(prediction.next(controls), floatsOfControls(controls));
        return movement.step(body, controls);
      },
    };
  }

  /** Takes the room's latest word on the body, once: the steps it has not taken yet are stepped again on top. */
  correct(): void {
    const word = this.room.onDeck;
    if (!word || this.room.words === this.wordTaken) return;
    this.wordTaken = this.room.words;
    const { movement } = this;
    const body = this.prediction.corrected(word.body, word.acknowledged, (from, ask) => movement.step(from, ask));
    this.walker.player = { ...this.walker.player, body };
  }
}
