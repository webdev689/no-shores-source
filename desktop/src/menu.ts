// The app's menu. On a Mac the menu bar is the app's own and carries the keys a Mac player expects: Cmd+Q, Cmd+H, the
// copy and paste that reach a text the game takes (they go through the menu there, or not at all), and the system's
// whole-screen key. Windows and Linux show none, as a game's window carries no menu bar; their keys reach the page.
import { Menu } from 'electron';

export function setMenu(platform: NodeJS.Platform): void {
  if (platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      { label: 'View', submenu: [{ role: 'togglefullscreen' }, { role: 'toggleDevTools' }] },
      { role: 'windowMenu' },
    ]),
  );
}
