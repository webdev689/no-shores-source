// The fight on a struck ship's deck, boarded from the sea: the player on foot there exactly as on land (the same
// controls, views, display and fight, `Foot`), its deck room reached through the sea's link, which hands it the land
// inputs and its deck room's snapshots (crates/room/src/sea_decks.rs). Everything on its deck is in its own frame and
// laid into the world as its ship lies on the swell, as walking the player's own deck is (aboard.ts).
import type { RoomLink, Snapshot } from '../network/roomConnection.ts';
import type { SeenDeck, SeenFlotsam } from '../network/seaHarbour.ts';
import type { CardAt } from '../player/cards.ts';
import type { InputFrame } from '../player/input.ts';
import type { FightCaptain, FightView } from '../rules/fightRules.ts';
import { cellHeight, type Deck, deckFloats, deckToWorld, HULL_DECKS, type Lying, railSpot } from '../ships/deck.ts';
import { deckCameraBlocks } from '../ships/spars.ts';
import { shipAxes } from '../ships/shipAxes.ts';
import type { Shot } from './camera.ts';
import type { Foot, FootContext, FootFrame } from './foot.ts';
import type { NodeInfo } from './worldData.ts';

/** How the player is stood on foot on its deck: `Foot.onDeck`, handed in, so tests of the deck run without the land's
 *  scene on foot. */
export type StandOnDeck = (typeof Foot)['onDeck'];

/** What the fight on its deck needs of the sea room: the deck the player stands on, their number at sea, the link's
 *  state and gear, where its deck room's snapshots go, and a way to send it the land's inputs. */
export interface DeckSea {
  readonly deck: SeenDeck | null;
  readonly own: number;
  readonly rejoining: boolean;
  readonly lost: string | null;
  /** Whether the sea has gone unheard so long that what the page sends waits for its word. */
  readonly quiet?: boolean;
  readonly gear: Pick<RoomLink, 'trim' | 'arms' | 'arts'>;
  readonly flotsam: readonly SeenFlotsam[];
  hearDeck: ((snapshot: Snapshot) => void) | null;
  sendDeck(bytes: Uint8Array<ArrayBuffer>): void;
}

/** Its deck room as the boarder's fight reaches it, as `boarder` there: through the sea's link, which the sea pumps,
 *  rejoins and loses; its gear is the sea's link's, which hears the deck room's word on it. */
export function deckLink(sea: DeckSea, boarder: number): RoomLink {
  return {
    player: boarder,
    dressed: [],
    joins: 1,
    get rejoining() {
      return sea.rejoining;
    },
    get lost() {
      return sea.lost;
    },
    get quiet() {
      return sea.quiet === true;
    },
    send: (bytes) => sea.sendDeck(bytes),
    pump: () => undefined,
    get trim() {
      return sea.gear.trim;
    },
    get arms() {
      return sea.gear.arms;
    },
    get arts() {
      return sea.gear.arts;
    },
  };
}

/** Its deck as a place on foot: its ring the deck's bounds and its one spawn where the deck room stands a boarder
 *  come over its rail on `side`. */
export function deckNode(deck: Deck, name: string, side: number): NodeInfo {
  const [west, north] = [deck.west, deck.north];
  const [east, south] = [west + deck.cell * deck.columns, north + deck.cell * deck.rows];
  const spawn = railSpot(deck, side);
  return {
    id: 'deck',
    kind: 'patrol',
    name,
    continent: '',
    ring: [
      [west, north],
      [east, north],
      [east, south],
      [west, south],
    ],
    spawns: [spawn],
    centre: spawn,
  };
}

/** The captain of a fight lying nearest `near`, the boarded one, and where it lies, drawn `scale` times its size: never
 *  a friendly ship (faction 0), which holds no crew for boarders, while any other lies in the fight. */
export function boardedLying(
  view: FightView,
  near: readonly [number, number],
  scale: number,
): { readonly captain: FightCaptain; readonly lying: Lying } {
  const all = [view.captain, ...(view.others ?? [])];
  const hostile = all.filter((captain) => captain.faction !== 0);
  const captains = hostile.length > 0 ? hostile : all;
  const away = (captain: FightCaptain) =>
    Math.hypot((captain.ship[0] ?? 0) - near[0], (captain.ship[1] ?? 0) - near[1]);
  const captain = captains.reduce((nearest, each) => (away(each) < away(nearest) ? each : nearest));
  const [x = 0, y = 0, heading = 0] = captain.ship;
  const [heave = 0, pitch = 0, roll = 0] = captain.pose;
  return { captain, lying: { x, y, heading, scale, heave, pitch, roll } };
}

/** The side of the struck captain nearest the player's ship in the fight `view` (the one the room boards, as
 *  `Fights::board` chooses it) that their ship lies on, as its deck room reckons it (crates/room/src/sea_decks.rs
 *  `side_of`): 1 its starboard, -1 its port. */
export function boardingSide(view: FightView): number {
  const [x = 0, y = 0] = view.player.ship;
  const all = [view.captain, ...(view.others ?? [])];
  const struck = all.filter((captain) => captain.state === 'struck' && captain.faction !== 0);
  const [first, ...others] = struck.length > 0 ? struck : [view.captain];
  const { lying } = boardedLying({ ...view, captain: first ?? view.captain, others }, [x, y], 1);
  const across = (x - lying.x) * Math.cos(lying.heading) + (y - lying.y) * Math.sin(lying.heading);
  return across < 0 ? -1 : 1;
}

/** The map from its deck's frame to the world's as it lies, column-major: a step along its deck (x to starboard, y
 *  to its stern, z up) to the world's step, at the size it is drawn. */
export function deckTurn(lying: Lying): Float32Array {
  const [bow, starboard, up] = shipAxes(lying.heading, lying.pitch, lying.roll);
  const axis = (along: readonly number[], sign: number) =>
    [0, 1, 2].map((index) => (along[index] ?? 0) * sign * lying.scale);
  return Float32Array.from([...axis(starboard, 1), 0, ...axis(bow, -1), 0, ...axis(up, 1), 0, 0, 0, 0, 1]);
}

/** Two column-major matrices, `first` after `then`: a point mapped by `then`, then by `first`. */
export function times(first: Float32Array, then: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column += 1)
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let step = 0; step < 4; step += 1) sum += (first[step * 4 + row] ?? 0) * (then[column * 4 + step] ?? 0);
      out[column * 4 + row] = sum;
    }
  return out;
}

/** A frame on its deck laid into the world as it lies: the shot from the eye there, level as the walk's on the
 *  player's own deck is, and every figure on its deck where it carries it. */
export function laidOnDeck(shown: FootFrame, lying: Lying): { readonly shot: Shot; readonly figures: CardAt[] } {
  const shot = { ...shown.shot, eye: deckToWorld(lying, ...shown.shot.eye), yaw: shown.shot.yaw + lying.heading };
  const figures = shown.figures.map((figure) => {
    const [x, y, z] = deckToWorld(lying, figure.x, figure.y, figure.z);
    return { ...figure, x, y, z, scale: (figure.scale ?? 1) * lying.scale };
  });
  return { shot, figures };
}

/** What floats from its hold for the player, in words: the pieces' kinds counted. */
export function holdWords(pieces: readonly SeenFlotsam[]): string {
  const counted = (['crate', 'barrel', 'chest'] as const).flatMap((kind) => {
    const count = pieces.filter((piece) => piece.kind === kind).length;
    if (count === 0) return [];
    return [count === 1 ? `a ${kind}` : `${count} ${kind === 'chest' ? 'chests' : `${kind}s`}`];
  });
  return counted.length > 0 ? counted.join(', ') : 'nothing';
}

/** The fight on one deck the player boarded, as `boarder` in its deck room. */
export class DeckFight {
  readonly foot: Foot;
  readonly boarder: number;
  /** Its deck, as its hull's manifest holds it. */
  readonly deck: Deck;
  private readonly sea: DeckSea;
  /** Where its ship lay last, to know it again among the fight's captains. */
  private near: readonly [number, number];
  /** The pieces of what floats the player had before its hold opened, and what it laid for them once it did. */
  private before = new Set<number>();
  /** Where this fight hears its deck room's snapshots, let go of only while it is the sea's. */
  private heard: DeckSea['hearDeck'] = null;
  private taken: readonly SeenFlotsam[] | null = null;
  /** A tick of the sea's, seconds, as the rules' door gives it. */
  private tickSeconds = 0;

  private constructor(foot: Foot, boarder: number, deck: Deck, sea: DeckSea, near: readonly [number, number]) {
    [this.foot, this.boarder, this.deck, this.sea, this.near] = [foot, boarder, deck, sea, near];
  }

  /** Stands the player on the deck the sea says they boarded, the ship nearest `near`, its deck room's
   *  snapshots heard from the sea's link from now on. */
  static async board(
    context: FootContext,
    stand: StandOnDeck,
    sea: DeckSea,
    deck: SeenDeck,
    near: readonly [number, number],
    side: number,
  ): Promise<DeckFight> {
    const boarder = deck.aboard.find(([player]) => player === sea.own)?.[1] ?? 0;
    const hullDeck = HULL_DECKS[deck.hull] ?? HULL_DECKS[0];
    if (!hullDeck) throw new Error('no hull has a deck');
    const groundAt = (x: number, y: number) => cellHeight(hullDeck, x, y);
    const onBoarded = { ...context, groundAt, cameraBlocks: deckCameraBlocks(deck.hull) };
    // What floats for the player as they board, so a hold won while the fight stands up is told apart from it.
    const before = new Set(sea.flotsam.map((piece) => piece.id));
    let heard: DeckSea['hearDeck'] = null;
    const foot = await stand(onBoarded, deckNode(hullDeck, 'The deck', side), deckFloats(hullDeck), (received) => {
      [sea.hearDeck, heard] = [received, received];
      return deckLink(sea, boarder);
    });
    const fight = new DeckFight(foot, boarder, hullDeck, sea, near);
    [fight.before, fight.heard, fight.tickSeconds] = [before, heard, context.movement.tickSeconds];
    return fight;
  }

  /** Its ship in the fight `view`, the one boarded, and where it lies drawn `scale` times its size. */
  boarded(view: FightView, scale: number): { readonly captain: FightCaptain; readonly lying: Lying } {
    const found = boardedLying(view, this.near, scale);
    this.near = [found.lying.x, found.lying.y];
    return found;
  }

  /** The seconds its won deck holds the player yet, whole; null while its crew still fights. */
  get holdLeft(): number | null {
    const ticks = this.sea.deck?.holdLeft;
    return ticks === null || ticks === undefined ? null : Math.ceil(ticks * this.tickSeconds);
  }

  /** What its hold laid for the player once its crew fell, as the room gave it; null before. */
  get take(): readonly SeenFlotsam[] | null {
    return this.taken;
  }

  /** One frame on its deck, as one on foot is. */
  frame(
    controls: InputFrame,
    seconds: number,
    clock: number,
    how: { paused: boolean; hands: boolean; aspect: number },
  ): FootFrame {
    // Its hold lays its pieces the tick its crew falls: those new since then are its take.
    if (this.holdLeft === null) this.before = new Set(this.sea.flotsam.map((piece) => piece.id));
    else this.taken ??= this.sea.flotsam.filter((piece) => !this.before.has(piece.id));
    return this.foot.frame(controls, seconds, clock, how);
  }

  /** Leaves its deck: its deck room's snapshots are heard no more. */
  leave(): void {
    this.foot.leave();
    if (this.sea.hearDeck === this.heard) this.sea.hearDeck = null;
  }
}
