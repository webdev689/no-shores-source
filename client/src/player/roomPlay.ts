import type { JoinedNode, PlayerDress, Standing } from '../network/messages.ts';
import { Prediction } from '../network/prediction.ts';
import { RoomConnection, type Snapshot } from '../network/roomConnection.ts';
import type { MovementRules } from '../rules/movementRules.ts';
import type { Cards } from './cards.ts';
import { type Dress, dressFrom, plainDress } from './dressing.ts';
import type { Placed } from './figures.ts';
import { showOther } from './others.ts';
import type { Walker } from './walker.ts';

/** How a page keeps other players' figures: it places one for a player who comes, and takes away one who leaves. */
export interface Others {
  place(dress: Dress, x: number, y: number, facing: number): Placed;
  remove(placed: Placed): void;
}

/** What playing in a room needs: the movement rules, the player, the forge's cards, and the page's figures. */
export interface RoomContext {
  readonly movement: MovementRules;
  readonly walker: Walker;
  readonly forge: Cards;
  readonly others: Others;
}

/**
 * The player in a room: each tick's controls go to it with what their figure shows, their dress when it changed and
 * a respawn when asked; the room's word on their body corrects the prediction, and on their standing is kept; every
 * other player stands where the room last saw them, in their own dress. A body the room says is dead lies still.
 */
export class RoomPlay {
  /** Where the player stands with the room's section, as its last snapshot said. */
  standing: Standing = { kind: 'inside' };
  private readonly prediction = new Prediction();
  private readonly others = new Map<number, Placed>();
  private readonly dresses = new Map<number, Dress>();
  private readonly context: RoomContext;
  private connection: RoomConnection | null = null;
  private own = 0;
  private sentDress = '';
  private respawnAsked = false;

  private constructor(context: RoomContext) {
    this.context = context;
  }

  /** Joins the room at `url`; resolves once the room has welcomed the player. */
  static async join(url: string, context: RoomContext): Promise<RoomPlay> {
    const room = new RoomPlay(context);
    const connection = await RoomConnection.open(url, (snapshot) => room.seen(snapshot));
    room.connection = connection;
    room.own = connection.player;
    room.takeDresses(connection.dressed);
    return room;
  }

  /** Whether the room still hears the player. */
  get connected(): boolean {
    return this.connection?.open ?? false;
  }

  /** The player's number in the room. */
  get player(): number {
    return this.own;
  }

  /** A node's room's word on its node: its id and the rect its window of the ground was cut to. */
  get node(): JoinedNode | null {
    return this.connection?.node ?? null;
  }

  /** The rules the player steps by in this room: the movement rules, each tick's controls sent on. */
  rules(): MovementRules {
    const { movement, walker } = this.context;
    return {
      ...movement,
      step: (body, controls) => {
        const dress = walker.lookDress === this.sentDress ? undefined : walker.lookDress;
        this.sentDress = walker.lookDress;
        // Once the room is lost nothing is numbered for it, so nothing waits on its word for ever.
        if (this.connection?.open) {
          this.connection.send(this.prediction.next(controls), controls, walker.look, dress, this.respawnAsked);
        }
        this.respawnAsked = false;
        return this.standing.kind === 'dead' ? body : movement.step(body, controls);
      },
    };
  }

  /** Asks the room, with the next tick's controls, to stand the player up at the nearest spawn. */
  askRespawn(): void {
    this.respawnAsked = true;
  }

  /** Leaves the room, and takes away every other player's figure. */
  close(): void {
    this.connection?.close();
    for (const placed of this.others.values()) this.context.others.remove(placed);
    this.others.clear();
  }

  /** Another player's dress is used only when it is one: a broken or hostile one keeps the dress they had. */
  private takeDresses(dressed: readonly PlayerDress[]): void {
    for (const { player: number, dress } of dressed) {
      const taken = dressFrom(dress);
      if (!taken) continue;
      this.dresses.set(number, taken);
      const placed = this.others.get(number);
      if (placed) placed.dress = taken;
    }
  }

  private seen(snapshot: Snapshot): void {
    const { movement, walker, forge, others } = this.context;
    this.takeDresses(snapshot.dressed);
    const present = new Set<number>();
    for (const seen of snapshot.players) {
      const { player: number, acknowledged, body } = seen;
      present.add(number);
      if (number === this.own) {
        this.standing = seen.standing;
        const still = seen.standing.kind === 'dead';
        const corrected = this.prediction.corrected(body, acknowledged, (from, ask) => movement.step(from, ask), still);
        walker.player = { ...walker.player, body: corrected };
        continue;
      }
      const dress = this.dresses.get(number) ?? plainDress('human', 0.6);
      const placed = this.others.get(number) ?? others.place(dress, body.x, body.y, body.facing);
      this.others.set(number, placed);
      showOther(placed, seen, (anim) => forge.draws(placed.dress.body, anim, null));
    }
    for (const [number, placed] of this.others) {
      if (present.has(number)) continue;
      others.remove(placed);
      this.others.delete(number);
    }
  }
}
