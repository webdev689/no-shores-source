// The desktop app's launcher window: the game's own interface drawing the launcher alone, no world behind it. Play asks
// the shell for the game's window, which opens on the title.
import { askDesktop } from '../../desktop.ts';
import type { Gpu } from '../../gpu.ts';
import { Stack } from '../../ui/stack.ts';
import { DrawnInterface } from '../drawnInterface.ts';
import { openLauncher } from './launcher.ts';

/** Draws the launcher on `canvas`, the only thing on it. */
export function startLauncherApp(gpu: Gpu, canvas: HTMLCanvasElement): void {
  const stack = new Stack();
  new DrawnInterface(gpu, canvas, stack);
  void openLauncher(stack, localStorage, import.meta.env.BASE_URL).then(() => askDesktop({ ask: 'play' }));
}
