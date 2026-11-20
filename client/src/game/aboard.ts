// The view brought down aboard the player's Sloop at its true size: Manage, a view over its deck where the player
// stands at its wheel and its stand-in crew go about; and the walk, the player off the helm roaming its deck while its
// helmsman keeps its course. Each pans down from the sea's view and back up to it. Everything aboard is in its own
// frame, laid into the world as it lies.
import { FIELD_OF_VIEW } from '../editor/orbit.ts';
import type { CardAt, Cards } from '../player/cards.ts';
import { type Dress, plainDress } from '../player/dressing.ts';
import { cardStand, frameAt, viewOf } from '../player/figures.ts';
import { IDLE, type InputFrame } from '../player/input.ts';
import { playerCamera } from '../player/player.ts';
import type { Walker } from '../player/walker.ts';
import type { MovementRules } from '../rules/movementRules.ts';
import { cellHeight, type Deck, deckToWorld, type Lying, worldToDeck } from '../ships/deck.ts';
import { smooth01 } from '../overworld/overworldCamera.ts';
import { type Shot, shotOfOrbit } from './camera.ts';
import { Crew } from './crew.ts';
import { type DeckRoom, DeckWalk } from './deckWalk.ts';

/** Seconds the view takes to come down aboard, or go back up. */
const PAN_S = 1.4;
/** Manage's view over its deck: how far from its middle, metres, how far down it looks, and where from, radians off
 *  its heading (its starboard quarter, looking forward); and how near and far the wheel takes it. */
const MANAGE = { distanceM: 39, pitch: 0.5, turn: -0.6, nearestM: 18, farthestM: 78 } as const;
/** Its middle, which Manage looks at: on its centre line a little aft, a metre over its deck. */
const MIDDLE = [0, 1.2, 3] as const;
/** How near the spot behind its wheel the player stands to take the helm, metres: the sea room's own reach
 *  (crates/room/src/deck.rs `WHEEL_REACH_M`), which judges it. */
export const WHEEL_REACH_M = 0.8;
/** How long the room has to say the player is off the helm before the leave is taken back, seconds. */
const LEAVING_S = 2;
/** The walk's lens and how far the third-person camera keeps over its deck, as on foot. */
const LENS = { fov: FIELD_OF_VIEW, near: 0.1, far: 60_000 } as const;
const CAMERA_CLEARANCE_M = 0.3;
/** A stand-in's moves loop at this many frames a second. */
const LOOP_FPS = 6;
/** The forge keeps a figure's last card by its number: the helmsman's and the hands' are their own. */
const HELMSMAN_ID = 950;
const HAND_IDS = 960;

/** What the view aboard needs of the game: the movement rules, the player, and the forge's cards. */
export interface AboardContext {
  readonly movement: MovementRules;
  readonly walker: Walker;
  readonly forge: Cards;
}

/** What it needs of the sea room: the walk's, and to leave or take the helm, and its word that the player is off it. */
export interface HelmRoom extends DeckRoom {
  leaveHelm(): void;
  takeHelm(): void;
}

/** Manage or the walk, `at` how far down (0 the sea's view, 1 aboard), coming down or going back up. */
interface View {
  readonly kind: 'manage' | 'deck';
  readonly at: number;
  readonly going: 'down' | 'up';
}

/** The view aboard the player's Sloop, and its stand-in crew. */
export class Aboard {
  private readonly context: AboardContext;
  private readonly deck: Deck;
  private readonly crew: Crew;
  private readonly handDresses: Dress[] = [];
  private readonly helmsman = plainDress('human', 0.55);
  private view: View | null = null;
  private walk: DeckWalk | null = null;
  /** Whether the room has said the player is off the helm since they left it, and how long since they did. */
  private heardOff = false;
  private sinceLeft = 0;
  private turn: number = MANAGE.turn;
  private distance: number = MANAGE.distanceM;

  constructor(context: AboardContext, deck: Deck) {
    this.context = context;
    this.deck = deck;
    this.crew = new Crew(deck, 7);
  }

  /** Whether the view is aboard, or on its way down or up. */
  get active(): boolean {
    return this.view !== null;
  }

  /** How far down the view has come, eased: 0 the sea's view, 1 aboard. */
  get share(): number {
    return this.view ? smooth01(this.view.at) : 0;
  }

  /** Whether Manage is open, or coming down. */
  get managing(): boolean {
    return this.view?.kind === 'manage' && this.view.going === 'down';
  }

  /** Whether the player is walking its deck, or coming down to it. */
  get walking(): boolean {
    return this.view?.kind === 'deck' && this.view.going === 'down';
  }

  /** Walking its deck and managing it, as the keys listed ask. */
  get where(): { readonly walking: boolean; readonly managing: boolean } {
    return { walking: this.walking, managing: this.managing };
  }

  /** Whether the player stands at its wheel, near enough to take the helm. */
  get atWheel(): boolean {
    if (!this.walking || !this.view || this.view.at < 1) return false;
    const { body } = this.context.walker.player;
    const [helmX, helmY] = this.deck.helm;
    return body.mode === 'ground' && Math.hypot(body.x - helmX, body.y - helmY) <= WHEEL_REACH_M;
  }

  /** Whether the walk is seen through the player's own eyes, the hands drawn and the figure not. */
  get firstPerson(): boolean {
    return this.walking && (this.view?.at ?? 0) >= 1 && this.context.walker.inFirstPerson;
  }

  /** Where the player's feet are on its deck as it `lying` lies, world metres, while they walk it; else none. */
  feetOn(lying: Lying): readonly [number, number, number] | null {
    if (this.view?.kind !== 'deck') return null;
    const { body } = this.context.walker.player;
    return deckToWorld(lying, body.x, body.y, body.z);
  }

  /** Opens Manage from the sea's view, or closes it. */
  manage(): void {
    if (!this.view) this.view = { kind: 'manage', at: 0, going: 'down' };
    else if (this.view.kind === 'manage')
      this.view = { ...this.view, going: this.view.going === 'down' ? 'up' : 'down' };
  }

  /** The player leaves the helm and stands behind its wheel; answers whether they did. */
  leaveHelm(room: HelmRoom): boolean {
    if (this.view) return false;
    room.leaveHelm();
    this.walk = new DeckWalk(this.context.movement, this.context.walker, this.deck, room);
    [this.heardOff, this.sinceLeft] = [false, 0];
    this.view = { kind: 'deck', at: 0, going: 'down' };
    return true;
  }

  /** Asks the room for the helm again, at its wheel: once it says the player holds it, the view goes back up. */
  takeHelm(room: HelmRoom): void {
    if (this.atWheel) room.takeHelm();
  }

  /** Lets go of everything aboard at once, as a fight calls the player to the helm. */
  drop(): void {
    [this.view, this.walk] = [null, null];
  }

  /** A drag across Manage's view turns it round the ship. */
  drag(movedX: number): void {
    if (this.managing) this.turn -= movedX * 0.006;
  }

  /** The wheel's notches, positive in, bring Manage's view nearer it. */
  zoom(notches: number): void {
    if (!this.managing) return;
    this.distance = Math.min(MANAGE.farthestM, Math.max(MANAGE.nearestM, this.distance * 0.9 ** notches));
  }

  /** One frame aboard, `seconds` on: the crew go about, seen or not; the view comes down or goes up; on the walk the
   *  player steps by `controls` (by nothing while `paused`), and the room's word on their body and on the helm is
   *  taken. */
  step(seconds: number, clock: number, controls: InputFrame, paused: boolean, room: HelmRoom | null): void {
    this.crew.step(seconds);
    if (!this.view) return;
    const down = Math.min(1, Math.max(0, this.view.at + (this.view.going === 'down' ? seconds : -seconds) / PAN_S));
    this.view = { ...this.view, at: down };
    if (this.view.going === 'up' && down <= 0) {
      this.drop();
      return;
    }
    const { walk } = this;
    if (this.view.kind !== 'deck' || !walk || !room) return;
    this.sinceLeft += seconds;
    if (room.onDeck) this.heardOff = true;
    if (!this.heardOff) {
      // No word yet that the player is off the helm: they stand, sending no step. Past LEAVING_S the leave is taken
      // back, should the room have taken it late, and the view goes back up.
      if (this.sinceLeft > LEAVING_S && this.view.going === 'down') {
        room.takeHelm();
        this.view = { ...this.view, going: 'up' };
      }
      return;
    }
    // The room's word that the player holds the helm again: the view goes back up.
    if (!room.onDeck && this.view.going === 'down') this.view = { ...this.view, going: 'up' };
    if (this.view.going === 'up') return;
    walk.correct();
    const { walker } = this.context;
    walker.frame(paused ? IDLE : controls, walk.rules(), seconds, clock);
    // A deck is no saddle: the walk is on foot, as the room steps it.
    if (walker.player.mounted) walker.player = { ...walker.player, mounted: false };
  }

  /** The shot aboard all the way down as it `lying` lies, which the view eases down to by `share`; none while the
   *  view is not aboard. */
  target(lying: Lying): Shot | null {
    if (!this.view) return null;
    return this.view.kind === 'manage' ? this.manageShot(lying) : this.walkShot(lying);
  }

  private manageShot(lying: Lying): Shot {
    const [middleX, middleY, middleZ] = deckToWorld(lying, ...MIDDLE);
    const yaw = lying.heading + this.turn;
    const away = this.distance * lying.scale;
    const across = away * Math.cos(MANAGE.pitch);
    return {
      eye: [
        middleX - Math.sin(yaw) * across,
        middleY + Math.cos(yaw) * across,
        middleZ + away * Math.sin(MANAGE.pitch),
      ],
      yaw,
      pitch: MANAGE.pitch,
      fov: FIELD_OF_VIEW,
      near: 0.3,
      far: LENS.far,
    };
  }

  private walkShot(lying: Lying): Shot {
    const { walker, movement } = this.context;
    const groundAt = (x: number, y: number) => cellHeight(this.deck, x, y);
    // The deck has no blocks to ease the boom off, so a boom pulled in on foot is let go, not kept in.
    const free = { ...walker.player, view: { ...walker.player.view, boom: undefined } };
    const local = shotOfOrbit(playerCamera(free, movement, []), LENS, groundAt, CAMERA_CLEARANCE_M);
    return { ...local, eye: deckToWorld(lying, ...local.eye), yaw: local.yaw + lying.heading };
  }

  /** Every figure aboard for an eye at `eye` (world metres), as it `lying` lies, at its size as drawn, from any view:
   *  the player walking its deck, with its helmsman at the wheel while it sails on under him; else the player at its
   *  wheel unless the eye is theirs there (`eyeAtHelm`); and its hands. */
  figures(
    lying: Lying,
    eye: readonly [number, number, number],
    clock: number,
    underWay: boolean,
    eyeAtHelm: boolean,
  ): CardAt[] {
    const { walker, forge } = this.context;
    const [eyeX, eyeY] = worldToDeck(lying, ...eye);
    const shown: CardAt[] = [];
    const lay = (aboard: CardAt | null) => {
      if (!aboard) return;
      const [x, y, z] = deckToWorld(lying, aboard.x, aboard.y, aboard.z);
      shown.push({ ...aboard, x, y, z, scale: lying.scale });
    };
    const place = (id: number, dress: Dress, anim: string, x: number, y: number, z: number, facing: number) => {
      const { view: side, flip } = viewOf(facing, x, y, eyeX, eyeY);
      const frame = frameAt(clock, forge.frames(dress.body, anim), LOOP_FPS);
      const card = forge.card(id, dress, anim, side, frame, flip);
      lay(card && { card, ...cardStand(x, y, eyeX, eyeY), z, flip });
    };
    const [helmX, helmY] = this.deck.helm;
    const helmZ = cellHeight(this.deck, helmX, helmY) ?? 0;
    if (this.view?.kind === 'deck') {
      lay(walker.figure(eyeX, eyeY));
      if (underWay && this.walking) place(HELMSMAN_ID, this.helmsman, 'idle', helmX, helmY, helmZ, 0);
    } else if (!eyeAtHelm) place(walker.you.id, walker.you.dress, 'idle', helmX, helmY, helmZ, 0);
    this.crew.hands.forEach((hand, index) => {
      this.handDresses[index] ??= plainDress(hand.race, hand.tone);
      const dress = this.handDresses[index];
      if (dress) place(HAND_IDS + index, dress, hand.walking ? 'walk' : 'idle', hand.x, hand.y, hand.z, hand.facing);
    });
    return shown;
  }
}
