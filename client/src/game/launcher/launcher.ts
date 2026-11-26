// The desktop app's launcher: the first thing the app opens, in a window of its own, drawn by the game's own interface
// and played with keys, pad and mouse. It reads the patch notes and asks the servers as it stands, and Play keeps when
// the player played, so the next launch marks the notes new since.
import type { Stack } from '../../ui/stack.ts';
import { type Does, type Shown, launcherNode } from './launcherNodes.ts';
import { LAST_PLAYED, type Notes, readNotes } from './patchNotes.ts';
import { ASK_EVERY_MS, SERVERS, type Server, askHealth } from './servers.ts';

let standing = false;
/** Whether the launcher stands: the interface hears the page's input for it in its frames alone, with no world. */
export const launcherStanding = (): boolean => standing;

/** What the launcher reads and asks through, a browser's own unless a test gives its stand-ins. */
export interface LauncherReach {
  readonly readNotes: (base: string) => Promise<Notes>;
  readonly askServer: (health: string) => Promise<Server>;
  readonly open: (address: string) => void;
  readonly now: () => Date;
}

/** Shows the launcher on `stack`, keeping what it keeps in `local`, reading the notes beside the game at `base`;
 *  resolves once Play is pressed. */
export function openLauncher(
  stack: Stack,
  local: Pick<Storage, 'getItem' | 'setItem'>,
  base: string,
  reach: Partial<LauncherReach> = {},
): Promise<void> {
  const reading = reach.readNotes ?? ((from: string) => readNotes(from, local));
  const asking = reach.askServer ?? ((health: string) => askHealth(health));
  const open = reach.open ?? ((address: string) => void window.open(address, '_blank', 'noopener'));
  const now = reach.now ?? (() => new Date());
  const shown: { -readonly [key in keyof Shown]: Shown[key] } = {
    notes: null,
    servers: SERVERS.map((): Server => ({ state: 'checking' })),
    lastPlayed: local.getItem(LAST_PLAYED),
  };
  void reading(base).then((notes) => (shown.notes = notes));
  const askAll = () =>
    SERVERS.forEach(
      (server, index) => void asking(server.health).then((heard) => (shown.servers = shown.servers.with(index, heard))),
    );
  askAll();
  const again = setInterval(askAll, ASK_EVERY_MS);
  standing = true;
  return new Promise((resolve) => {
    const does: Does = {
      open,
      play() {
        clearInterval(again);
        removeLayer();
        standing = false;
        local.setItem(LAST_PLAYED, now().toISOString());
        resolve();
      },
    };
    const removeLayer = stack.add((ui) => launcherNode(ui, shown, does));
  });
}
