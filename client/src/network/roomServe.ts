// The rooms' worker's side of playing alone (`roomWorker.ts`): each room opened, told and ticked as the game's thread
// says (`roomThread.ts`), what it sends said back.
import { LocalRoom } from './localRoom.ts';
import type { GearMessage, Snapshot } from './roomConnection.ts';
import type { PortInfo } from '../rules/watersRules.ts';

/** How a room is opened, as `LocalRoom` opens it. */
export type Opening =
  | {
      readonly how: 'node';
      readonly nodeText: string;
      readonly foeAsks: boolean;
      readonly entrance: number | undefined;
    }
  | { readonly how: 'dungeon'; readonly patrolText: string; readonly number: number }
  | { readonly how: 'run'; readonly ask: string; readonly patrolText: string }
  | {
      readonly how: 'sea';
      readonly layoutText: string;
      readonly seed: number;
      readonly ports: readonly PortInfo[];
      readonly seas: number;
    }
  | { readonly how: 'island'; readonly word: string; readonly seas: number };

/** What the game's thread tells the rooms' worker. */
export type ToRooms =
  | { readonly kind: 'open'; readonly id: number; readonly module: WebAssembly.Module; readonly opening: Opening }
  | { readonly kind: 'input'; readonly id: number; readonly bytes: Uint8Array<ArrayBuffer> }
  | { readonly kind: 'pump'; readonly id: number; readonly seconds: number }
  | { readonly kind: 'word'; readonly id: number; readonly isle: number }
  | { readonly kind: 'close'; readonly id: number };

/** What the rooms' worker says back. */
export type FromRooms =
  | { readonly kind: 'opened'; readonly id: number; readonly player: number; readonly epoch: number }
  | { readonly kind: 'failed'; readonly id: number; readonly error: string }
  | { readonly kind: 'snapshot'; readonly id: number; readonly snapshot: Snapshot }
  | { readonly kind: 'gear'; readonly id: number; readonly gear: GearMessage }
  | { readonly kind: 'word'; readonly id: number; readonly word: string }
  | { readonly kind: 'lost'; readonly id: number; readonly error: string };

/** The rooms' side: each room opened, told and ticked as the game's thread says, what it sends said back by `say`. */
export function serveRooms(say: (told: FromRooms) => void): (told: ToRooms) => void {
  const rooms = new Map<number, LocalRoom>();
  const open = (id: number, module: WebAssembly.Module, opening: Opening): LocalRoom => {
    const snapshot = (whole: Snapshot) => say({ kind: 'snapshot', id, snapshot: whole });
    // Each word on the player's gear, before its tick's snapshot, as the room gives them.
    const gear = (said: GearMessage) => say({ kind: 'gear', id, gear: said });
    if (opening.how === 'node') {
      const { nodeText, foeAsks, entrance } = opening;
      return LocalRoom.openNode(module, nodeText, snapshot, foeAsks, { gear, entrance });
    }
    if (opening.how === 'dungeon')
      return LocalRoom.openDungeon(module, opening.patrolText, opening.number, snapshot, gear);
    if (opening.how === 'run') return LocalRoom.openRun(module, opening.ask, opening.patrolText, snapshot, gear);
    if (opening.how === 'island') return LocalRoom.openIsland(module, opening.word, snapshot, opening.seas, gear);
    const { layoutText, seed, ports, seas } = opening;
    return LocalRoom.openSea(module, layoutText, snapshot, seed, ports, seas, gear);
  };
  return (told) => {
    if (told.kind === 'open') {
      try {
        const room = open(told.id, told.module, told.opening);
        rooms.set(told.id, room);
        say({ kind: 'opened', id: told.id, player: room.player, epoch: room.epoch });
      } catch (error) {
        say({ kind: 'failed', id: told.id, error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }
    const room = rooms.get(told.id);
    // A word asked of a room let go or lost is answered all the same: no island stands in it.
    if (!room) {
      if (told.kind === 'word') say({ kind: 'word', id: told.id, word: '' });
      return;
    }
    try {
      if (told.kind === 'input') room.send(told.bytes);
      else if (told.kind === 'word') say({ kind: 'word', id: told.id, word: room.isleWord(told.isle) });
      else if (told.kind === 'close') rooms.delete(told.id);
      else room.pump(told.seconds);
    } catch (error) {
      // A room that fails is lost, as a server's room can be: let go, and the game told why.
      rooms.delete(told.id);
      say({ kind: 'lost', id: told.id, error: error instanceof Error ? error.message : String(error) });
    }
  };
}
