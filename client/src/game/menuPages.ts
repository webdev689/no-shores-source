// The menu's pages that need no gear: Journal and Guild, still to come and saying so; the Ship, the Sloop's details as
// Manage shows them; and Settings, which keeps the account.

import { make } from '../editor/dom.ts';
import type { AccountLink } from '../network/accounts.ts';
import { ROLES } from '../plus/kit.ts';
import { accountPanel } from './accountTab.ts';
import { pressOf } from './gearDom.ts';
import type { ShipPanel } from './shipPanel.ts';

/** A page still to come: its name, marked Later, and one line on what it will hold. */
export function laterPage(name: string, words: string): HTMLElement {
  const page = make('div', '', `gear-later ${ROLES.panel}`);
  const head = make('h2', '', 'gear-later-name');
  head.append(make('span', name), make('span', 'Later', `gear-chip ${ROLES.chip}`));
  page.append(head, make('p', words, 'gear-hint'));
  return page;
}

/** The Ship page: her name, then each part of her papers, those still to come marked Later. */
export function shipPage(panel: ShipPanel | null): HTMLElement {
  const page = make('div', '', `gear-ship ${ROLES.panel}`);
  if (!panel) {
    page.append(make('p', 'Loading your ship…', 'gear-hint gear-empty'));
    return page;
  }
  page.append(make('h2', panel.title, 'gear-ship-name'));
  for (const part of panel.parts) {
    const section = make('section', '', 'gear-ship-part');
    const heading = make('h3', '', `gear-heading ${ROLES.rule}`);
    heading.append(make('span', part.heading));
    if (part.later) heading.append(make('span', 'Later', `gear-chip ${ROLES.chip}`));
    section.append(heading);
    for (const [label, value] of part.rows) {
      const row = make('div', '', 'gear-ship-row');
      row.append(make('span', label, 'gear-hint'), make('b', value));
      section.append(row);
    }
    page.append(section);
  }
  return page;
}

/** The Settings page: the account, or why there is none. */
export function settingsPage(link: AccountLink | null): HTMLElement {
  const page = make('div', '', `gear-settings ${ROLES.panel}`);
  page.append(make('h2', 'Account', `gear-heading ${ROLES.rule}`));
  page.append(link ? accountPanel(link) : make('p', 'Playing offline: there is no account.', 'gear-hint'));
  if (link) page.append(blockedPanel(link));
  return page;
}

/** The players blocked, each with a press to unblock them; blocking is done from the Roster. */
function blockedPanel(link: AccountLink): HTMLElement {
  const panel = make('section', '', 'gear-blocked');
  const list = make('div', '', 'gear-blocked-list');
  panel.append(make('h2', 'Blocked players', `gear-heading ${ROLES.rule}`), list);
  const show = () =>
    void link.roster().then((roster) => {
      if (typeof roster === 'string') return list.replaceChildren(make('p', roster, 'gear-hint'));
      list.replaceChildren(
        ...(roster.blocked.length === 0 ? [make('p', 'None. Block a player from the Roster.', 'gear-hint')] : []),
        ...roster.blocked.map((name) => {
          const row = make('div', '', 'gear-blocked-row');
          row.append(
            make('span', name),
            pressOf('Unblock', () => void link.social('unblock', { name }).then(show)),
          );
          return row;
        }),
      );
    });
  show();
  return panel;
}
