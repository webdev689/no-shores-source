// The menu's pages that need no gear: Journal and Guild, still to come and saying so; the Ship, the Sloop's details as
// Manage shows them; and Settings, which keeps the account and the interface's volume.

import { make } from '../editor/dom.ts';
import type { AccountLink } from '../network/accounts.ts';
import { ROLES } from '../plus/kit.ts';
import { accountPanel } from './accountTab.ts';
import { pressOf } from './gearDom.ts';
import type { ShipPanel } from './shipPanel.ts';
import { interfaceVolume, play, setInterfaceVolume } from './uiSounds.ts';

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

/** The Settings page: the account, or why there is none, and the interface's volume. */
export function settingsPage(link: AccountLink | null): HTMLElement {
  const page = make('div', '', `gear-settings ${ROLES.panel}`);
  page.append(make('h2', 'Account', `gear-heading ${ROLES.rule}`));
  page.append(link ? accountPanel(link) : make('p', 'Playing offline: there is no account.', 'gear-hint'));
  if (link) page.append(blockedPanel(link));
  page.append(soundPanel());
  return page;
}

/** The interface's volume, from silent to full, kept in this browser; let go, it is heard at its new level. */
function soundPanel(): HTMLElement {
  const panel = make('section', '', 'gear-sound');
  const row = make('label', '', 'gear-sound-row');
  const slider = make('input', '', 'gear-volume');
  Object.assign(slider, { type: 'range', min: '0', max: '100', step: '5' });
  slider.value = String(Math.round(interfaceVolume() * 100));
  const shown = make('b', `${slider.value}%`);
  slider.addEventListener('input', () => {
    setInterfaceVolume(Number(slider.value) / 100);
    shown.textContent = `${slider.value}%`;
  });
  slider.addEventListener('change', () => play('press'));
  row.append(make('span', 'Interface sounds'), slider, shown);
  panel.append(make('h2', 'Sound', `gear-heading ${ROLES.rule}`), row);
  return panel;
}

/** The players blocked, each with a press to unblock them; blocking is done from the Roster. */
function blockedPanel(link: AccountLink): HTMLElement {
  const panel = make('section', '', 'gear-blocked');
  const list = make('div', '', 'gear-blocked-list');
  const said = make('p', '', 'gear-answer');
  said.setAttribute('role', 'status');
  panel.append(make('h2', 'Blocked players', `gear-heading ${ROLES.rule}`), list, said);
  let busy = false;
  /** Unblocks a player, saying why not if it could not, the focus kept in the list. */
  const unblock = (name: string, index: number) => {
    if (busy) return;
    busy = true;
    void link.social('unblock', { name }).then((why) => {
      busy = false;
      said.textContent = why ?? `${name} is unblocked.`;
      show(index);
    });
  };
  const show = (focusAt: number | null = null) =>
    void link.roster().then((roster) => {
      if (typeof roster === 'string') return list.replaceChildren(make('p', roster, 'gear-hint'));
      const presses = roster.blocked.map((name, index) => pressOf('Unblock', () => unblock(name, index)));
      list.replaceChildren(
        ...(roster.blocked.length === 0 ? [make('p', 'None. Block a player from the Roster.', 'gear-hint')] : []),
        ...roster.blocked.map((name, index) => {
          const row = make('div', '', 'gear-blocked-row');
          presses[index]?.setAttribute('aria-label', `Unblock ${name}`);
          row.append(make('span', name), presses[index] ?? '');
          return row;
        }),
      );
      if (focusAt !== null) presses[Math.min(focusAt, presses.length - 1)]?.focus();
    });
  show();
  return panel;
}
