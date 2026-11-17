// The sea room as the ship sails in it, a server's or the one in the page when playing alone: its course sent when
// set and its orders in a fight, and every ship, pirate and fight the room last showed.
import { courseBytes, ordersBytes, type SeenPirate, type SeenShip } from '../network/messages.ts';
import type { RoomLink, Snapshot } from '../network/roomConnection.ts';
import { fightViewOf, ordersNumbers } from '../network/seaFight.ts';
import type { Point2 } from '../overworld/ground.ts';
import type { Pace } from '../overworld/voyage.ts';
import type { FightEvent, FightOrders, FightView } from '../rules/fightRules.ts';

/** A room link that may be closed: a server's socket is; the room in the page has nothing to close. */
type Closable = RoomLink & { close?(): void };

export class SeaRoom {
  readonly own: number;
  private readonly link: Closable;
  private ships: readonly SeenShip[] = [];
  /** The pirates at sea, none of them in a fight. */
  pirates: readonly SeenPirate[] = [];
  /** The player's own fight as the room last showed it, and its events since they were last taken. */
  private fight: FightView | null = null;
  private events: FightEvent[] = [];

  private constructor(link: Closable) {
    this.link = link;
    this.own = link.player;
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
    link.send(courseBytes([start], pace));
    return room;
  }

  private take(snapshot: Snapshot): void {
    this.ships = snapshot.ships;
    this.pirates = snapshot.pirates;
    const own = snapshot.fights.find((fight) => fight.player === this.own);
    if (own) {
      this.fight = fightViewOf(own.view);
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

  /** Sets the ship's course: the points ahead, at a pace; none brings it to rest. */
  course(points: readonly Point2[], pace: Pace): void {
    this.link.send(courseBytes(points, pace));
  }

  /** The player's orders in their fight. */
  orders(orders: FightOrders): void {
    this.link.send(ordersBytes(ordersNumbers(orders)));
  }

  /** Lets the room's clock run `seconds`, where the room runs in the page. */
  pump(seconds: number): void {
    this.link.pump(seconds);
  }

  close(): void {
    this.link.close?.();
  }
}
