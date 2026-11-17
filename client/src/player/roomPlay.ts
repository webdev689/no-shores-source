import type { GearAsk, GearState } from '../network/gearMessages.ts';
import { type JoinedNode, type Standing, inputBytes } from '../network/messages.ts';
import { Prediction } from '../network/prediction.ts';
import { RoomConnection, type Snapshot } from '../network/roomConnection.ts';
import { type Controls, type MovementRules, floatsOfControls } from '../rules/movementRules.ts';
import type { Cards } from './cards.ts';
import { OtherPlayers, type Others } from './others.ts';
import type { Walker } from './walker.ts';

/** The fight's numbers after the controls in an input (stroke, guard, dodge, shoot, pitch, aim, and an aimed shot's
 *  mark, none here): a walker asks for none. */
const NO_FIGHT = [0, 0, 0, 0, 0, 0, Number.NaN, Number.NaN, Number.NaN];

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
  private readonly prediction = new Prediction<Controls>();
  private readonly others: OtherPlayers;
  private readonly context: RoomContext;
  private connection: RoomConnection | null = null;
  private own = 0;
  private sentDress = '';
  private respawnAsked = false;
  /** The player's gear as the room last sent it, and the asks of it waiting for an input to carry them. */
  private gearNow: GearState | null = null;
  private readonly gearAsks: GearAsk[] = [];
  /** The room tick of the last snapshot taken. */
  private lastTick = 0n;

  private constructor(context: RoomContext) {
    this.context = context;
    this.others = new OtherPlayers(context.others);
  }

  /** Joins the room at `url`, signed in with a session's token if given; resolves once the room has welcomed the
   *  player. */
  static async join(url: string, context: RoomContext, session: string | null = null): Promise<RoomPlay> {
    const room = new RoomPlay(context);
    const connection = await RoomConnection.open(
      url,
      (snapshot) => room.seen(snapshot),
      (gear) => (room.gearNow = gear),
      session,
    );
    room.connection = connection;
    room.own = connection.player;
    room.others.takeDresses(connection.dressed);
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
          const intent = new Float64Array([...floatsOfControls(controls), ...NO_FIGHT]);
          const ask = this.gearAsks.shift();
          const parts = {
            intent,
            look: walker.look,
            arms: 0,
            seen: this.lastTick,
            spawn: 0,
            respawn: this.respawnAsked,
            ...(ask ? { ask } : {}),
          };
          const sequence = this.prediction.next(controls);
          this.connection.send(inputBytes(sequence, dress === undefined ? parts : { ...parts, dress }));
        }
        this.respawnAsked = false;
        return this.standing.kind === 'dead' ? body : movement.step(body, controls);
      },
    };
  }

  /** The player's gear as the room last sent it; null before its first word. */
  get gear(): GearState | null {
    return this.gearNow;
  }

  /** Asks something of the player's gear, one ask an input, in the order asked. */
  askGear(ask: GearAsk): void {
    this.gearAsks.push(ask);
  }

  /** Asks the room, with the next tick's controls, to stand the player up at the nearest spawn. */
  askRespawn(): void {
    this.respawnAsked = true;
  }

  /** Leaves the room, and takes away every other player's figure. */
  close(): void {
    this.connection?.close();
    this.others.clear();
  }

  private seen(snapshot: Snapshot): void {
    const { movement, walker, forge } = this.context;
    this.lastTick = snapshot.tick;
    this.others.takeDresses(snapshot.dressed);
    const mine = snapshot.players.find((seen) => seen.player === this.own);
    if (mine) {
      this.standing = mine.standing;
      const still = mine.standing.kind === 'dead';
      const corrected = this.prediction.corrected(
        mine.body,
        mine.acknowledged,
        (from, ask) => movement.step(from, ask),
        still,
      );
      walker.player = { ...walker.player, body: corrected };
    }
    this.others.seen(snapshot.players, this.own, forge);
  }
}
