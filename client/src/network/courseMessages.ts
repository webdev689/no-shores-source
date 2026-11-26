// What a browser sends the sea room in a course's message: the ship's course or its rest at a heading, a step of the
// walk on deck, a chase, the helm left or taken again, an ask of the sea, and a fighting ship's orders.
import * as flatbuffers from 'flatbuffers';
import { Course } from '../../../generated/messages/ts/overlook/wire.ts';
import { wholeIn } from './fleetMessages.ts';

/** A ship's course as its bytes: the world points it sails through in turn, and its pace, one of the steps of a
 *  ship's speed. No points brings it to rest. With `travel`, the held map takes the ship to the other waters it ends
 *  in. */
export function courseBytes(
  points: readonly (readonly [number, number])[],
  pace: number,
  travel = false,
): Uint8Array<ArrayBuffer> {
  const builder = new flatbuffers.Builder(256);
  const numbers = Course.createPointsVector(builder, points.flat());
  const paced = wholeIn(pace, 0, 0xffff, 'the pace');
  builder.finish(Course.createCourse(builder, numbers, paced, 0, 0, 0, 0, 0, 0, 0, travel));
  return builder.asUint8Array().slice();
}

/** A ship brought to rest turned to a heading (radians clockwise from north), as its bytes: the helm turned while it
 *  lies still. */
export function faceBytes(heading: number): Uint8Array<ArrayBuffer> {
  const builder = new flatbuffers.Builder(64);
  const facing = Course.createFacingVector(builder, [heading]);
  builder.finish(Course.createCourse(builder, 0, 0, 0, 0, 0, 0, facing, 0, 0, false));
  return builder.asUint8Array().slice();
}

/** A step of the walk on deck, off the helm, as its bytes: its number and its controls in the movement crate's order,
 *  in a course's message. */
export function walkBytes(sequence: number, controls: readonly number[]): Uint8Array<ArrayBuffer> {
  const builder = new flatbuffers.Builder(128);
  const numbers = Course.createWalkVector(builder, [...controls]);
  const numbered = wholeIn(sequence, 0, 0xffff_ffff, "the step's number");
  builder.finish(Course.createCourse(builder, 0, 0, 0, numbers, numbered, 0, 0, 0, 0, false));
  return builder.asUint8Array().slice();
}

/** A chase of the hostile ship numbered `ship` (null for none), as its bytes, in a course's message. */
export function chaseBytes(ship: number | null): Uint8Array<ArrayBuffer> {
  const builder = new flatbuffers.Builder(32);
  builder.finish(Course.createCourse(builder, 0, 0, 0, 0, 0, 3, 0, ship ?? 0, 0, false));
  return builder.asUint8Array().slice();
}

/** Leaving the helm (`leave`), or taking it again at the wheel, as its bytes, in a course's message. */
export function helmBytes(leave: boolean): Uint8Array<ArrayBuffer> {
  const builder = new flatbuffers.Builder(32);
  builder.finish(Course.createCourse(builder, 0, 0, 0, 0, 0, leave ? 1 : 2, 0, 0, 0, false));
  return builder.asUint8Array().slice();
}

/** What a player asks of the sea as its bytes, in a course's message: a repair by a port city, to board a captain
 *  who struck, to leave its deck once its crew has fallen, or the held map raised at the helm, for a lesson. */
export function askBytes(ask: 'repair' | 'board' | 'leave-deck' | 'chart'): Uint8Array<ArrayBuffer> {
  const builder = new flatbuffers.Builder(32);
  const number = { repair: 1, board: 2, 'leave-deck': 3, chart: 4 }[ask];
  builder.finish(Course.createCourse(builder, 0, 0, 0, 0, 0, 0, 0, 0, number, false));
  return builder.asUint8Array().slice();
}

/** A fighting ship's orders as their bytes: the naval crate's numbers (`ordersNumbers`), in a course's message. */
export function ordersBytes(orders: readonly number[]): Uint8Array<ArrayBuffer> {
  const builder = new flatbuffers.Builder(128);
  const numbers = Course.createOrdersVector(builder, [...orders]);
  builder.finish(Course.createCourse(builder, 0, 0, numbers, 0, 0, 0, 0, 0, 0, false));
  return builder.asUint8Array().slice();
}
