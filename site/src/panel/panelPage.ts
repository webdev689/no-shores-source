// The Discord bot's page: the site's frame around the panel, which signs in with Discord and draws everything else
// from the bot's answers. The panel steers by the address's hash, so the skip link takes the focus to it instead of
// naming a hash of its own.
import { startPanel } from './panelMain.ts';

/** Take the skip link's press: the focus goes to the panel, and the address is left as it is. */
export function skipToPanel(page: Pick<Document, 'querySelector' | 'getElementById'>): boolean {
  const skip = page.querySelector('.skip');
  const panel = page.getElementById('app');
  if (!skip || !panel) return false;
  skip.addEventListener('click', (event) => {
    event.preventDefault();
    panel.focus();
  });
  return true;
}

if (typeof document !== 'undefined') {
  document.getElementById('panel-off')?.remove();
  skipToPanel(document);
  startPanel(document.getElementById('app'));
}
