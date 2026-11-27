// The sea room as the ship sails in it, a server's or, playing alone, one in the rooms' worker: its course sent when
// set, its orders in a fight, and off the helm each step of the walk on deck; and every ship, hostile and fight the
// room last showed, with its word on the player's body on deck.
import {
  askBytes,
  chaseBytes,
  courseBytes,
  faceBytes,
  helmBytes,
  ordersBytes,
  walkBytes,
} from '../network/courseMessages.ts';
import { readFromRoom, type SeenHostile, type SeenShip } from '../network/messages.ts';
import type { GearState } from '../network/gearMessages.ts';
import type { PlayerPlate } from '../network/plateMessages.ts';
import type { RoomLink, Snapshot } from '../network/roomConnection.ts';
import { type NavalEvent, fightViewOf, ordersNumbers } from '../network/seaFight.ts';
import { RoomThread } from '../network/roomThread.ts';
import {
  type SeenDeck,
  type SeenFlotsam,
  type SeenCharted,
  type SeenMark,
  type SeenFriendly,
  type SeenIsle,
  type SeenKept,
  TOLD,
} from '../network/seaHarbour.ts';
import type { Point2 } from '../overworld/ground.ts';
import type { Pace } from '../overworld/voyage.ts';
import type { FightEvent, FightOrders, FightView } from '../rules/fightRules.ts';
import type { Body } from '../rules/movementRules.ts';
import { shipName } from '../ships/shipBars.ts';
import type { SailedPace } from './seaLaw.ts';

/** A room link that may be closed: a server's socket, or a room let go in the rooms' worker (`RoomThread`). */
type Closable = RoomLink & { close?(): void };

/** The ticks the page leaves between the courses it sends: the sea takes one each half second (crates/room/src/sea.rs,
 *  `COURSE_EVERY_TICKS`), and a quarter second more keeps the network's jitter from bringing two closer than that. */
const COURSE_SENT_APART_TICKS = 45;
/** The ticks after a course is sent before the room's word is taken as having taken it: a round trip's allowance, so a
 *  snapshot already on its way with the course before is never read as the room's answer.
 *  shortcut: a round trip over 1 s still reads the old word; the room naming the course it took would end the guess. */
const SETTLE_TICKS = 60;

export class SeaRoom {
  own: number;
  private readonly link: Closable;
  /** The link's welcomes followed, and whether one more came since the sea last asked: the player joined it again. */
  private joined: number;
  private fresh = false;
  private ships: readonly SeenShip[] = [];
  /** The plate over each other player's ship in sight, by their number, as the room's last snapshot sent them. */
  plates: ReadonlyMap<number, PlayerPlate> = new Map();
  /** The hostile ships at sea: each sailing, and each in a fight among captains alone where the room has it. */
  hostiles: readonly SeenHostile[] = [];
  /** The friendly ships the room keeps at sea, and each traffic id it has taken off its route. */
  friendlies: readonly SeenFriendly[] = [];
  taken: ReadonlySet<number> = new Set();
  /** Every ship in the sea, the player's own among them, with its captain's name, as the room last charted them (about
   *  once a second). */
  charted: readonly SeenCharted[] = [];
  /** Every hostile ship and standing island in the water the player's ship lies in, as the room last charted them. */
  chartMarks: readonly SeenMark[] = [];
  /** The room's last word on the player's body on deck, off the helm (the number of their last step it took), or
   *  null while they hold it; and how many words it has sent, so each is taken once. */
  onDeck: { readonly acknowledged: number; readonly body: Body } | null = null;
  words = 0;
  /** The player's gear as the sea last sent it: the character it keeps for them, or their deck room's while they
   *  fight aboard another ship. */
  gearSent: GearState | null = null;
  /** The player's own fight as the room last showed it, and its events since they were last taken. */
  private fight: FightView | null = null;
  private events: FightEvent[] = [];
  /** The sea's events of the player's fight since they were last taken, and what the sea told them beside it. */
  private naval: NavalEvent[] = [];
  private told: number[][] = [];
  /** Whether the sea would take a boarding the player asked now, as its last word said. */
  mayBoard = false;
  /** Whether the player's fight is the Harbourmaster's hulk's, as the sea's last word said. */
  hulk = false;
  /** Their ship's kept hurts and repair, what floats for them, and the deck they stand on, as the room last said. */
  kept: SeenKept | null = null;
  flotsam: readonly SeenFlotsam[] = [];
  deck: SeenDeck | null = null;
  /** The islands the room tells the player of: those in sight of their ship, and those they have found. */
  islands: readonly SeenIsle[] = [];
  /** What each snapshot of the deck the player stands on goes to: the page's fight on its deck, once it stands. */
  hearDeck: ((snapshot: Snapshot) => void) | null = null;
  /** Where the room moored the player's ship once they washed up (crates/room/src/harbour.rs), until it is taken. */
  private washedAt: { readonly x: number; readonly y: number; readonly heading: number } | null = null;
  /** The room's tick by its last snapshot (none before the first), the tick the last course was sent at, and a course
   *  waiting to be sent. */
  private tick: number | null = null;
  private courseSentAt: number | null = null;
  private waitingCourse: ReturnType<typeof courseBytes> | null = null;
  private waitingFacing = false;
  /** The helm left while a course waited: sent just after it, so the room takes the course from the helm. */
  private leaveWaiting = false;
  /** A travel asked and not yet answered, which no course takes the place of; and the room's answer, until taken
   *  (crates/room/src/sea_travel.rs: 0 taken, else why it was refused). */
  private travelAsked = false;
  private travelled: number | null = null;

  private constructor(link: Closable) {
    this.link = link;
    [this.own, this.joined] = [link.player, link.joins];
  }

  /** Follows the link into the sea it joined again: a new player there, with no ship at sea and no course sent. */
  private follow(): void {
    if (this.link.joins === this.joined) return;
    [this.joined, this.own, this.fresh] = [this.link.joins, this.link.player, true];
    [this.tick, this.courseSentAt, this.waitingCourse] = [null, null, null];
    [this.waitingFacing, this.leaveWaiting, this.travelAsked] = [false, false, false];
  }

  /** How many times the link has joined its sea, as its last word showed: a join since drops what was sent. */
  get joins(): number {
    return this.joined;
  }

  /** Whether the player joined the sea again since this was last asked, after its socket closed: their ship is to be
   *  put to sea again where it lies. */
  rejoined(): boolean {
    this.follow();
    const fresh = this.fresh;
    this.fresh = false;
    return fresh;
  }

  /** Whether the link is joining the sea again after its socket closed. */
  get rejoining(): boolean {
    return this.link.rejoining;
  }

  /** Joins the sea through `open`, which hands on each snapshot, the ship put to sea at `start`, at rest. */
  static async join(
    open: (snapshot: (snapshot: Snapshot) => void, gear: (gear: GearState) => void) => Promise<Closable> | Closable,
    start: Point2,
    pace: Pace,
  ): Promise<SeaRoom> {
    let room: SeaRoom | null = null;
    const link = await open(
      (snapshot) => room?.take(snapshot),
      (gear) => room && (room.gearSent = gear),
    );
    room = new SeaRoom(link);
    room.course([start], pace);
    return room;
  }

  private take(snapshot: Snapshot): void {
    this.follow();
    // A course sent before the room's first word is reckoned from it: the room took it no later.
    if (this.tick === null && this.courseSentAt !== null) this.courseSentAt = Number(snapshot.tick);
    this.tick = Number(snapshot.tick);
    this.sendCourse();
    this.ships = snapshot.ships;
    this.plates = new Map(snapshot.plates.map((plate) => [plate.player, plate]));
    this.hostiles = snapshot.hostiles;
    [this.friendlies, this.taken] = [snapshot.friendlies, new Set(snapshot.taken)];
    // The chart always holds the player's own ship; its marks, sent with it, may be none.
    if (snapshot.charted.length > 0) [this.charted, this.chartMarks] = [snapshot.charted, snapshot.chartMarks];
    const walking = snapshot.players.find((seen) => seen.player === this.own);
    this.onDeck = walking ? { acknowledged: walking.acknowledged, body: walking.body } : null;
    this.words += 1;
    this.kept = snapshot.kept.find((kept) => kept.player === this.own) ?? null;
    this.flotsam = snapshot.flotsam.filter((piece) => piece.player === this.own);
    this.islands = snapshot.islands;
    this.deck = snapshot.decks.find((deck) => deck.aboard.some(([player]) => player === this.own)) ?? null;
    const onDeck = this.deck && this.hearDeck ? readFromRoom(this.deck.snapshot) : null;
    if (onDeck?.kind === 'snapshot') this.hearDeck?.(onDeck);
    this.told.push(...snapshot.told.filter((told) => told.player === this.own).map((told) => [...told.numbers]));
    const own = snapshot.fights.find((fight) => fight.player === this.own);
    this.mayBoard = own?.mayBoard ?? false;
    this.hulk = own?.lesson ?? false;
    if (own) {
      const who = { name: shipName(own.faction, own.hull), faction: own.faction, rank: own.rank };
      const view = fightViewOf(own.view, who, shipName);
      this.fight = view;
      this.events.push(...view.events);
      this.naval.push(...view.naval);
    }
    // An ended fight's last view, shown in one snapshot, is kept until it is taken.
    const told = snapshot.told.filter((each) => each.player === this.own).map((each) => each.numbers[0]);
    const travelled = snapshot.told.find((each) => each.player === this.own && each.numbers[0] === TOLD.TRAVELLED);
    if (travelled) [this.travelled, this.travelAsked] = [travelled.numbers[2] ?? null, false];
    if (told.includes(TOLD.WASHED_UP)) this.washUp(snapshot);
    else if (told.includes(TOLD.MOORED)) this.moor(snapshot);
    // Washed up, the fight was sunk first; otherwise one the room no longer lists is gone.
    if (!own) this.leaveFight();
  }

  /** The player washed up: their fight is over for them, and their ship lies where the room moored it. */
  private washUp(snapshot: Snapshot): void {
    this.moor(snapshot);
    if (this.fight?.over === null) this.fight = { ...this.fight, over: 'sunk', events: [] };
  }

  /** Their ship lies where the room has it now. */
  private moor(snapshot: Snapshot): void {
    const moored = snapshot.ships.find((ship) => ship.player === this.own);
    if (moored) this.washedAt = { x: moored.x, y: moored.y, heading: moored.heading };
  }

  /** The sea's word on its island `id`, as an island's room opens on it: a sea in the rooms' worker tells it; a
   *  server's sea tells the island's own room, so the page is told nothing. */
  async isleWord(id: number): Promise<string | null> {
    return this.link instanceof RoomThread ? (await this.link.isleWord(id)) || null : null;
  }

  /** Where the room moored the player's ship once they washed up, taken once. */
  takeWashed(): { readonly x: number; readonly y: number; readonly heading: number } | null {
    const washed = this.washedAt;
    this.washedAt = null;
    return washed;
  }

  /** The name of a ship of the player's fight, by the number its events give it; null for one not in it. */
  shipNamed(ship: number): string | null {
    const view = this.fight;
    if (!view) return null;
    return [view.captain, ...(view.others ?? [])].find((captain) => captain.id === ship)?.name ?? null;
  }

  /** Every other player's ship. */
  get others(): readonly SeenShip[] {
    return this.ships.filter((ship) => ship.player !== this.own);
  }

  /** The player's own ship as the room last moved it, if at sea. */
  get ownShip(): SeenShip | null {
    return this.ships.find((ship) => ship.player === this.own) ?? null;
  }

  /** The room's word on the player's ship once it has taken the last course sent (none waits, and a snapshot came
   *  since); null before. */
  get settledShip(): SeenShip | null {
    const sent = this.courseSentAt;
    if (this.waitingCourse || sent === null || this.tick === null || this.tick <= sent + SETTLE_TICKS) return null;
    return this.ownShip;
  }

  /** Why the link to the room was lost, or null while it holds. */
  get lost(): string | null {
    return this.link.lost;
  }

  /** The player's fight as the room last showed it, its events those since they were last taken; null out of one. */
  takeFight(): FightView | null {
    if (!this.fight) return null;
    const shown = { ...this.fight, events: this.events };
    this.events = [];
    if (shown.over) this.fight = null;
    return shown;
  }

  /** The sea's events of the player's fight and what the sea told them beside it, each since last taken. */
  takeTold(): { naval: NavalEvent[]; told: number[][] } {
    const taken = { naval: this.naval, told: this.told };
    [this.naval, this.told] = [[], []];
    return taken;
  }

  /** Asks the sea for its repair, to board a captain who struck, or to leave its deck. */
  ask(ask: Parameters<typeof askBytes>[0]): void {
    this.link.send(askBytes(ask));
  }

  /** Sends a land room's input on to the deck the player stands on: the sea room hands it to its deck room. */
  sendDeck(bytes: Uint8Array<ArrayBuffer>): void {
    this.link.send(bytes);
  }

  /** The player's gear as the sea's link last heard it: while they board, their deck room's word. */
  get gear(): Pick<RoomLink, 'trim' | 'arms' | 'arts'> {
    return this.link;
  }

  /** Whether the player is in a fight, as the room last said. */
  get fighting(): boolean {
    return this.fight !== null && this.fight.over === null;
  }

  /** Sets the ship's course: the points ahead, at a pace; none brings it to rest. One set sooner after the last than
   *  the sea takes waits for a later snapshot, and a newer course takes its place. */
  course(points: readonly Point2[], pace: SailedPace): void {
    if (this.travelAsked) return;
    [this.waitingCourse, this.waitingFacing] = [courseBytes(points, pace), false];
    this.sendCourse();
  }

  /** Asks to travel a course to where it ends: sent as a course is, in its turn, and no course sent
   *  in its place until the room answers. */
  travel(points: readonly Point2[], pace: SailedPace): void {
    [this.waitingCourse, this.waitingFacing, this.travelAsked] = [courseBytes(points, pace, true), false, true];
    this.travelled = null;
    this.sendCourse();
  }

  /** A travel given up: courses are sent again, and an answer that comes late is no answer. */
  forgetTravel(): void {
    [this.travelAsked, this.travelled] = [false, null];
  }

  /** The room's answer to the travel asked, taken once: 0 taken, else why it was refused; null before. */
  takeTravelled(): number | null {
    const travelled = this.travelled;
    this.travelled = null;
    return travelled;
  }

  /** Brings the ship to rest turned to `heading`, radians clockwise from north: sent as a course is, in its turn. */
  face(heading: number): void {
    if (this.travelAsked) return;
    [this.waitingCourse, this.waitingFacing] = [faceBytes(heading), true];
    this.sendCourse();
  }

  private sendCourse(): void {
    const waiting = this.waitingCourse;
    if (!waiting) return;
    const sent = this.courseSentAt;
    if (sent !== null && (this.tick === null || this.tick < sent + COURSE_SENT_APART_TICKS)) return;
    this.link.send(waiting);
    [this.waitingCourse, this.waitingFacing, this.courseSentAt] = [null, false, this.tick ?? 0];
    if (this.leaveWaiting) this.leaveHelm();
  }

  /** The player leaves the helm, to walk its deck while its helmsman keeps its course: a facing still waiting to be
   *  sent is let go, since the room turns no ship off the helm, and a course still waiting is sent first, since the
   *  helmsman takes none that turns it. */
  leaveHelm(): void {
    if (this.waitingFacing) [this.waitingCourse, this.waitingFacing] = [null, false];
    this.leaveWaiting = this.waitingCourse !== null;
    if (!this.leaveWaiting) this.link.send(helmBytes(true));
  }

  /** Tells the room the hostile ship the player chases, by its number, or none. */
  chase(ship: number | null): void {
    this.link.send(chaseBytes(ship));
  }

  /** The player takes the helm again, at its wheel. */
  takeHelm(): void {
    this.leaveWaiting = false;
    this.link.send(helmBytes(false));
  }

  /** Whether the room has gone unheard so long that what the page sends waits for its word (`UNHEARD_MOST`). */
  get quiet(): boolean {
    return this.link.quiet === true;
  }

  /** A step of the player's walk on deck: its number and its controls in the movement crate's order. */
  walk(sequence: number, controls: readonly number[]): void {
    this.link.send(walkBytes(sequence, controls));
  }

  /** The player's orders in their fight. */
  orders(orders: FightOrders): void {
    this.link.send(ordersBytes(ordersNumbers(orders)));
  }

  /** Lets the room's clock run `seconds`, where the room runs alone, in the rooms' worker. While the link rejoins,
   *  the room's word is gone with it: no ship of its is shown, and a fight in it is over, the ship having left it. */
  pump(seconds: number): void {
    if (this.link.rejoining) {
      [this.ships, this.hostiles, this.friendlies, this.charted, this.chartMarks, this.onDeck] = [
        [],
        [],
        [],
        [],
        [],
        null,
      ];
      this.leaveFight();
    }
    this.link.pump(seconds);
  }

  /** A fight still on that the room no longer holds for the player is over for them: their ship has left it. */
  private leaveFight(): void {
    if (this.fight?.over === null) this.fight = { ...this.fight, over: 'gone', events: [] };
  }

  /** Lets the room go: a fight in it is over for the player, the ship having left it. */
  close(): void {
    this.leaveFight();
    this.link.close?.();
  }
}
