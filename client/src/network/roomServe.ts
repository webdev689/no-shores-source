// The rooms' worker's side of playing alone (`roomWorker.ts`): each room opened, told and ticked as the game's thread
// says (`roomThread.ts`), what it sends said back.
import type { ArtState } from './artMessages.ts';
import { LocalRoom } from './localRoom.ts';
import type { Snapshot } from './roomConnection.ts';
import type { PortInfo } from '../rules/watersRules.ts';

/** How a room is opened, as `LocalRoom` opens it. */
export type Opening =
  | { readonly how: 'node'; readonly nodeText: string; readonly foeAsks: boolean }
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
  | {
      readonly kind: 'gear';
      readonly id: number;
      readonly trim: readonly number[] | null;
      readonly arms: readonly number[] | null;
      readonly arts: ArtState | null;
    }
  | { readonly kind: 'word'; readonly id: number; readonly word: string };

/** The rooms' side: each room opened, told and ticked as the game's thread says, what it sends said back by `say`. */
export function serveRooms(say: (told: FromRooms) => void): (told: ToRooms) => void {
  const rooms = new Map<number, LocalRoom>();
  const open = (id: number, module: WebAssembly.Module, opening: Opening): LocalRoom => {
    const snapshot = (whole: Snapshot) => say({ kind: 'snapshot', id, snapshot: whole });
    if (opening.how === 'node') return LocalRoom.openNode(module, opening.nodeText, snapshot, opening.foeAsks);
    if (opening.how === 'island') return LocalRoom.openIsland(module, opening.word, snapshot, opening.seas);
    return LocalRoom.openSea(module, opening.layoutText, snapshot, opening.seed, opening.ports, opening.seas);
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
    if (!room) return;
    if (told.kind === 'input') room.send(told.bytes);
    else if (told.kind === 'word') say({ kind: 'word', id: told.id, word: room.isleWord(told.isle) });
    else if (told.kind === 'close') rooms.delete(told.id);
    else {
      const { trim, arms, arts } = room;
      room.pump(told.seconds);
      // The room's last word on the player's gear, said on whenever a tick changed it.
      if (room.trim !== trim || room.arms !== arms || room.arts !== arts)
        say({ kind: 'gear', id: told.id, trim: room.trim, arms: room.arms, arts: room.arts });
    }
  };
}
