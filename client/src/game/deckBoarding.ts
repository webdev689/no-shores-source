// The player's boarding as the sea shows it: once the sea room says they stand on a struck ship's deck, the fight on
// its deck stands up (deckFight.ts) and each frame is played there and laid on the ship as the sea's fight shows it;
// once the room says they have left it (its hold taken, its minute up, or washed up beaten), it is let go and the view
// is the sea's fight's again, at the player's own ship.
import type { CardAt } from '../player/cards.ts';
import type { InputFrame } from '../player/input.ts';
import type { FightCaptain, FightView } from '../rules/fightRules.ts';
import { cellHeight, type Lying } from '../ships/deck.ts';
import type { Shot } from './camera.ts';
import {
  boardingSide,
  DeckFight,
  type DeckSea,
  deckTurn,
  holdWords,
  laidOnDeck,
  type StandOnDeck,
} from './deckFight.ts';
import type { FootContext, FootFrame } from './foot.ts';
import type { FootView } from './footView.ts';
import type { Drawer } from './scene.ts';

/** What one frame on its deck gives the sea's frame: the shot and every figure aboard it, in the world. */
export interface BoardedFrame {
  readonly shot: Shot;
  readonly figures: readonly CardAt[];
  readonly firstPerson: boolean;
}

/** What the frame on its deck needs of the sea's: its controls, time and view, and whether a menu holds the world. */
export interface BoardingInput {
  readonly controls: InputFrame;
  readonly seconds: number;
  readonly time: number;
  readonly paused: boolean;
  readonly viewport: { readonly width: number; readonly height: number };
}

/** The last frame on its deck: the fight there, its frame in its own frame, its captain and how it lies, and the
 *  world's shot it is drawn through. */
interface Shown {
  readonly fight: DeckFight;
  readonly frame: FootFrame;
  readonly captain: FightCaptain;
  readonly lying: Lying;
  readonly shot: Shot;
}

/** The player's boarding of the struck ships of their fight, one deck at a time. */
export class Boarding {
  private readonly context: FootContext;
  private readonly stand: StandOnDeck;
  private fight: DeckFight | null = null;
  /** The boarder's number a fight on its deck is standing up for, and one that would not stand (tried no more). */
  private starting: number | null = null;
  private refused: number | null = null;
  private shown: Shown | null = null;

  /** Boards with the game's `context` on foot, stood on each deck by `stand` (`Foot.onDeck`). */
  constructor(context: FootContext, stand: StandOnDeck) {
    [this.context, this.stand] = [context, stand];
  }

  /** Whether the player plays on its deck this frame. */
  get onDeck(): boolean {
    return this.shown !== null;
  }

  /** Whether its crew has fallen: the player may go back aboard their own ship (E). */
  get won(): boolean {
    return this.shown !== null && this.shown.fight.holdLeft !== null;
  }

  /** One frame of the sea's fight `view`, as the sea room `sea` last said: on its deck, the player plays there and it
   *  answers the shot and the figures laid on its ship; off it, null. */
  frame(sea: DeckSea | null, view: FightView | null, input: BoardingInput): BoardedFrame | null {
    this.follow(sea, view);
    const fight = this.fight;
    if (!fight || !view) {
      this.shown = null;
      return null;
    }
    const { width, height } = input.viewport;
    const how = { paused: input.paused, hands: input.controls.locked, aspect: width / Math.max(1, height) };
    const frame = fight.frame(input.controls, input.seconds, input.time, how);
    // Its deck is laid on it at its true size, as the sea's fight draws it once its view is down.
    const { captain, lying } = fight.boarded(view, 1);
    const laid = laidOnDeck(frame, lying);
    this.shown = { fight, frame, captain, lying, shot: laid.shot };
    return { shot: laid.shot, figures: laid.figures, firstPerson: this.context.walker.inFirstPerson };
  }

  /** Stands up the fight on the deck the sea says the player boarded, and lets it go once they have left it. */
  private follow(sea: DeckSea | null, view: FightView | null): void {
    const boarder = (view && sea?.deck?.aboard.find(([player]) => player === sea.own)?.[1]) ?? null;
    if (this.fight && this.fight.boarder !== boarder) {
      this.fight.leave();
      this.fight = null;
    }
    if (this.fight || this.starting !== null || boarder === null || boarder === this.refused) return;
    if (!sea?.deck || !view) return;
    this.starting = boarder;
    const [x = 0, y = 0] = view.player.ship;
    DeckFight.board(this.context, this.stand, sea, sea.deck, [x, y], boardingSide(view)).then(
      (fight) => {
        // One deck stands up at a time: a deck left meanwhile is let go at the next frame's look at the sea's word.
        [this.starting, this.fight] = [null, fight];
      },
      (error: unknown) => {
        [this.starting, this.refused] = [null, boarder];
        console.error('the fight on its deck did not stand', error);
      },
    );
  }

  /** The fight's display on its deck over the view drawn `size` device pixels on a `viewport` CSS pixels big, and
   *  its drawers under and over the figures; off its deck the display is hidden and there are none. */
  drawn(
    view: FootView,
    seconds: number,
    drawnOn: { size: { width: number; height: number }; viewport: { width: number; height: number } },
  ): { under: Drawer; over: Drawer } | undefined {
    const shown = this.shown;
    if (!shown) {
      view.hide();
      return undefined;
    }
    const deck = shown.fight.deck;
    const onBoarded = { shot: shown.shot, turn: deckTurn(shown.lying) };
    const groundAt = (x: number, y: number) => cellHeight(deck, x, y);
    return view.frame(shown.fight.foot, shown.frame, seconds, { ...drawnOn, groundAt, onBoarded });
  }

  /** What the display says on its deck: where the player is, the line under it, and the keys listed. */
  get words(): { readonly place: string; readonly line: string; readonly hints: readonly string[] } | null {
    const shown = this.shown;
    if (!shown) return null;
    const { fight, captain, frame } = shown;
    const left = fight.holdLeft;
    const take = fight.take;
    if (left === null) return { place: captain.name, line: 'Aboard: its crew stands to meet you', hints: frame.hints };
    // The take on one line under its name, as the place's line holds it; the minute left with the key that ends it.
    const line = take ? `Its hold: ${holdWords(take)}` : 'Its hold is open';
    return { place: 'Its deck is yours', line, hints: [`E back aboard your ship · ${left} s left`, ...frame.hints] };
  }

  /** The fight on foot on its deck while the player plays there, for the display's respawn. */
  get foot(): DeckFight['foot'] | null {
    return this.shown?.fight.foot ?? null;
  }

  /** Where the player stands on its deck as its deck room said, for the display's word on a fall. */
  get standing(): FootFrame['standing'] | null {
    return this.shown?.frame.standing ?? null;
  }
}
