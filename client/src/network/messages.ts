import * as flatbuffers from 'flatbuffers';
import { FromRoom, Input } from '../../../generated/messages/ts/overlook/wire.ts';
import type { Dressed } from '../../../generated/messages/ts/overlook/wire/dressed.ts';
import { BODY_FLOATS, type Body, type Controls, bodyOf, floatsOfControls } from '../rules/movementRules.ts';

/** What a player's figure shows on their own screen: the forge's move, its frame, and the way it faces. */
export interface Look {
  readonly anim: string;
  readonly frame: number;
  readonly facing: number;
}

/** One player as a room last stepped them, what their figure showed with it, and the number of their last input it
 *  took. */
export interface SeenPlayer extends Look {
  readonly player: number;
  readonly acknowledged: number;
  readonly body: Body;
}

/** A player's dress as their browser wrote it; the room only carries it. */
export interface PlayerDress {
  readonly player: number;
  readonly dress: string;
}

/** What a room says: its welcome, with the joining player's number and every dress so far; or every player after
 *  one of its ticks, with the dresses that changed since the last. */
export type FromRoomMessage =
  | { readonly kind: 'joined'; readonly player: number; readonly dressed: readonly PlayerDress[] }
  | {
      readonly kind: 'snapshot';
      readonly tick: bigint;
      readonly players: readonly SeenPlayer[];
      readonly dressed: readonly PlayerDress[];
    };

/** One tick's input as its bytes, as the schema defines them: its number, its controls, what the player's figure
 *  shows, and their dress when it changed. */
export function inputBytes(sequence: number, controls: Controls, look: Look, dress?: string): Uint8Array<ArrayBuffer> {
  const builder = new flatbuffers.Builder(256);
  const numbers = Input.createControlsVector(builder, floatsOfControls(controls));
  const anim = builder.createString(look.anim);
  const dressed = dress === undefined ? 0 : builder.createString(dress);
  builder.finish(Input.createInput(builder, sequence, numbers, anim, look.frame, look.facing, dressed));
  return builder.asUint8Array().slice();
}

/** The dresses a message holds. */
function dressesOf(count: number, entry: (index: number) => Dressed | null): PlayerDress[] {
  return Array.from({ length: count }, (unused, index) => {
    const each = entry(index);
    return { player: each?.player() ?? 0, dress: each?.dress() ?? '' };
  });
}

/** The message a room's bytes hold, or null when they hold neither a welcome nor a snapshot that reads. */
export function readFromRoom(bytes: Uint8Array): FromRoomMessage | null {
  // The TypeScript runtime has no verifier, so a message cut short throws while it is read.
  try {
    const message = FromRoom.getRootAsFromRoom(new flatbuffers.ByteBuffer(bytes));
    const joined = message.joined();
    if (joined) {
      const dressed = dressesOf(joined.dressedLength(), (index) => joined.dressed(index));
      return { kind: 'joined', player: joined.player(), dressed };
    }
    const snapshot = message.snapshot();
    if (!snapshot) return null;
    const players = Array.from({ length: snapshot.playersLength() }, (unused, index) => {
      const seen = snapshot.players(index);
      const numbers = Array.from(seen?.bodyArray() ?? []);
      if (!seen || numbers.length !== BODY_FLOATS) throw new Error(`snapshot player ${index} has no whole body`);
      const look = { anim: seen.anim() ?? '', frame: seen.frame(), facing: seen.facing() };
      return { player: seen.player(), acknowledged: seen.acknowledged(), body: bodyOf(numbers), ...look };
    });
    const dressed = dressesOf(snapshot.dressedLength(), (index) => snapshot.dressed(index));
    return { kind: 'snapshot', tick: snapshot.tick(), players, dressed };
  } catch {
    return null;
  }
}
