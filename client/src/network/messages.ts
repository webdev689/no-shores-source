import * as flatbuffers from 'flatbuffers';
import { FromRoom, Input } from '../../../generated/messages/ts/overlook/wire.ts';
import { BODY_FLOATS, type Body, type Controls, bodyOf, floatsOfControls } from '../rules/movementRules.ts';

/** One player as a room last stepped them, and the number of their last input it took. */
export interface SeenPlayer {
  readonly player: number;
  readonly acknowledged: number;
  readonly body: Body;
}

/** What a room says: its welcome, with the joining player's number; or every player after one of its ticks. */
export type FromRoomMessage =
  | { readonly kind: 'joined'; readonly player: number }
  | { readonly kind: 'snapshot'; readonly tick: bigint; readonly players: readonly SeenPlayer[] };

/** One tick's controls as an input's bytes, numbered `sequence`, as the schema defines them. */
export function inputBytes(sequence: number, controls: Controls): Uint8Array {
  const builder = new flatbuffers.Builder(96);
  const numbers = Input.createControlsVector(builder, floatsOfControls(controls));
  builder.finish(Input.createInput(builder, sequence, numbers));
  return builder.asUint8Array();
}

/** The message a room's bytes hold, or null when they hold neither a welcome nor a snapshot that reads. */
export function readFromRoom(bytes: Uint8Array): FromRoomMessage | null {
  // The TypeScript runtime has no verifier, so a message cut short throws while it is read.
  try {
    const message = FromRoom.getRootAsFromRoom(new flatbuffers.ByteBuffer(bytes));
    const joined = message.joined();
    if (joined) return { kind: 'joined', player: joined.player() };
    const snapshot = message.snapshot();
    if (!snapshot) return null;
    const players = Array.from({ length: snapshot.playersLength() }, (unused, index) => {
      const seen = snapshot.players(index);
      const numbers = Array.from(seen?.bodyArray() ?? []);
      if (!seen || numbers.length !== BODY_FLOATS) throw new Error(`snapshot player ${index} has no whole body`);
      return { player: seen.player(), acknowledged: seen.acknowledged(), body: bodyOf(numbers) };
    });
    return { kind: 'snapshot', tick: snapshot.tick(), players };
  } catch {
    return null;
  }
}
