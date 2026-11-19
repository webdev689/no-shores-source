// The sea room as the ship sails in it, a server's or the one in the page when playing alone: its course sent when
// set, its orders in a fight, and off the helm each step of the walk on deck; and every ship, pirate and fight the room
// last showed, with its word on the player's body on deck.
import {
  courseBytes,
  faceBytes,
  helmBytes,
  ordersBytes,
  type SeenPirate,
  type SeenShip,
  walkBytes,
} from '../network/messages.ts';
import type { RoomLink, Snapshot } from '../network/roomConnection.ts';
import { fightViewOf, ordersNumbers } from '../network/seaFight.ts';
import type { Point2 } from '../overworld/ground.ts';
import type { Pace } from '../overworld/voyage.ts';
import type { FightEvent, FightOrders, FightView } from '../rules/fightRules.ts';
import type { Body } from '../rules/movementRules.ts';
import { shipName } from '../ships/shipBars.ts';

/** A room link that may be closed: a server's socket is; the room in the page has nothing to close. */
type Closable = RoomLink & { close?(): void };

/** The ticks between the courses the page sends: the sea takes one each half second (crates/room/src/sea.rs,
 *  `COURSE_EVERY_TICKS`), and a quarter second more keeps the network's jitter from bringing two closer than that. */
const COURSE_EVERY_TICKS = 45;
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
  /** The hostile ships at sea: each sailing, and each in a fight among captains alone where the room has her. */
  pirates: readonly SeenPirate[] = [];
  /** The room's last word on the player's body on deck, off the helm (the number of their last step it took), or
   *  null while they hold it; and how many words it has sent, so each is taken once. */
  onDeck: { readonly acknowledged: number; readonly body: Body } | null = null;
  words = 0;
  /** The player's own fight as the room last showed it, and its events since they were last taken. */
  private fight: FightView | null = null;
  private events: FightEvent[] = [];
  /** The room's tick by its last snapshot (none before the first), the tick the last course was sent at, and a course
   *  waiting to be sent. */
  private tick: number | null = null;
  private courseSentAt: number | null = null;
  private waitingCourse: ReturnType<typeof courseBytes> | null = null;
  private waitingFacing = false;
  /** The helm left while a course waited: sent just after it, so the room takes the course from the helm. */
  private leaveWaiting = false;

  private constructor(link: Closable) {
    this.link = link;
    [this.own, this.joined] = [link.player, link.joins];
  }

  /** Follows the link into the sea it joined again: a new player there, with no ship at sea and no course sent. */
  private follow(): void {
    if (this.link.joins === this.joined) return;
    [this.joined, this.own, this.fresh] = [this.link.joins, this.link.player, true];
    [this.tick, this.courseSentAt, this.waitingCourse] = [null, null, null];
    [this.waitingFacing, this.leaveWaiting] = [false, false];
  }

  /** Whether the player joined the sea again since this was last asked, after its socket closed: their ship is to be
   *  put to sea again where she lies. */
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
    open: (snapshot: (snapshot: Snapshot) => void) => Promise<Closable> | Closable,
    start: Point2,
    pace: Pace,
  ): Promise<SeaRoom> {
    let room: SeaRoom | null = null;
    const link = await open((snapshot) => room?.take(snapshot));
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
    this.pirates = snapshot.pirates;
    const walking = snapshot.players.find((seen) => seen.player === this.own);
    this.onDeck = walking ? { acknowledged: walking.acknowledged, body: walking.body } : null;
    this.words += 1;
    const own = snapshot.fights.find((fight) => fight.player === this.own);
    if (own) {
      const who = { name: shipName(own.faction, own.hull), faction: own.faction, rank: own.rank };
      this.fight = fightViewOf(own.view, who, shipName);
      this.events.push(...this.fight.events);
    } else if (this.fight?.over === null) this.fight = null;
    // An ended fight's last view, shown in one snapshot, is kept until it is taken.
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

  /** Whether the player is in a fight, as the room last said. */
  get fighting(): boolean {
    return this.fight !== null && this.fight.over === null;
  }

  /** Sets the ship's course: the points ahead, at a pace; none brings it to rest. One set sooner after the last than
   *  the sea takes waits for a later snapshot, and a newer course takes its place. */
  course(points: readonly Point2[], pace: Pace): void {
    [this.waitingCourse, this.waitingFacing] = [courseBytes(points, pace), false];
    this.sendCourse();
  }

  /** Brings the ship to rest turned to `heading`, radians clockwise from north: sent as a course is, in its turn. */
  face(heading: number): void {
    [this.waitingCourse, this.waitingFacing] = [faceBytes(heading), true];
    this.sendCourse();
  }

  private sendCourse(): void {
    const waiting = this.waitingCourse;
    if (!waiting) return;
    const sent = this.courseSentAt;
    if (sent !== null && (this.tick === null || this.tick < sent + COURSE_EVERY_TICKS)) return;
    this.link.send(waiting);
    [this.waitingCourse, this.waitingFacing, this.courseSentAt] = [null, false, this.tick ?? 0];
    if (this.leaveWaiting) this.leaveHelm();
  }

  /** The player leaves the helm, to walk her deck while her helmsman keeps her course: a facing still waiting to be
   *  sent is let go, since the room turns no ship off the helm, and a course still waiting is sent first, since the
   *  helmsman takes none that turns her. */
  leaveHelm(): void {
    if (this.waitingFacing) [this.waitingCourse, this.waitingFacing] = [null, false];
    this.leaveWaiting = this.waitingCourse !== null;
    if (!this.leaveWaiting) this.link.send(helmBytes(true));
  }

  /** The player takes the helm again, at her wheel. */
  takeHelm(): void {
    this.leaveWaiting = false;
    this.link.send(helmBytes(false));
  }

  /** A step of the player's walk on deck: its number and its controls in the movement crate's order. */
  walk(sequence: number, controls: readonly number[]): void {
    this.link.send(walkBytes(sequence, controls));
  }

  /** The player's orders in their fight. */
  orders(orders: FightOrders): void {
    this.link.send(ordersBytes(ordersNumbers(orders)));
  }

  /** Lets the room's clock run `seconds`, where the room runs in the page. While the link rejoins, the room's word is
   *  gone with it: no ship of its is shown, and a fight in it is over, she having left it. */
  pump(seconds: number): void {
    if (this.link.rejoining) {
      [this.ships, this.pirates, this.onDeck] = [[], [], null];
      if (this.fight?.over === null) this.fight = { ...this.fight, over: 'gone', events: [] };
    }
    this.link.pump(seconds);
  }

  close(): void {
    this.link.close?.();
  }
}
