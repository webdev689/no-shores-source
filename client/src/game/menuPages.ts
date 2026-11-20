// The menu's pages that need no gear: Journal and Guild, still to come and saying so; the Sloop's papers as Manage
// shows them (`shipPages.ts` puts her power and crew beside them); and Settings, which keeps the account and the
// volumes of the interface and the world.

import { make } from '../editor/dom.ts';
import type { AccountLink } from '../network/accounts.ts';
import { ROLES } from '../plus/kit.ts';
import { accountPanel } from './accountTab.ts';
import { pressOf } from './gearDom.ts';
import type { ShipPanel } from './shipPanel.ts';
import { soundCredits } from '../soundSamples.ts';
import { interfaceVolume, play, setInterfaceVolume, setWorldVolume, worldVolume } from './uiSounds.ts';

/** A page still to come: its name, marked Later, and one line on what it will hold. */
export function laterPage(name: string, words: string): HTMLElement {
  const page = make('div', '', `gear-later ${ROLES.panel}`);
  const head = make('h2', '', 'gear-later-name');
  head.append(make('span', name), make('span', 'Later', `gear-chip ${ROLES.chip}`));
  page.append(head, make('p', words, 'gear-hint'));
  return page;
}

/** Her papers: her name, then each part of them. */
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

/** The Settings page: the account, or why there is none, and the volumes. */
export function settingsPage(link: AccountLink | null): HTMLElement {
  const page = make('div', '', `gear-settings ${ROLES.panel}`);
  page.append(make('h2', 'Account', `gear-heading ${ROLES.rule}`));
  page.append(link ? accountPanel(link) : make('p', 'Playing offline: there is no account.', 'gear-hint'));
  if (link) page.append(blockedPanel(link));
  page.append(soundPanel());
  return page;
}

/** The volumes of the interface and the world, each from silent to full, kept in this browser. */
function soundPanel(): HTMLElement {
  const panel = make('section', '', 'gear-sound');
  panel.append(
    make('h2', 'Sound', `gear-heading ${ROLES.rule}`),
    volumeRow('Interface sounds', interfaceVolume, setInterfaceVolume),
    volumeRow('World sounds', worldVolume, setWorldVolume),
    creditsList(),
  );
  return panel;
}

/** One volume's slider, its level said beside it; let go, the interface's press is heard at its new level. */
function volumeRow(name: string, volume: () => number, setVolume: (volume: number) => void): HTMLElement {
  const row = make('label', '', 'gear-sound-row');
  const slider = make('input', '', 'gear-volume');
  Object.assign(slider, { type: 'range', min: '0', max: '100', step: '5' });
  slider.value = String(Math.round(volume() * 100));
  const shown = make('b', `${slider.value}%`);
  // The slider is named by its words alone, and says its level as a percentage.
  shown.setAttribute('aria-hidden', 'true');
  slider.setAttribute('aria-valuetext', `${slider.value}%`);
  slider.addEventListener('input', () => {
    setVolume(Number(slider.value) / 100);
    shown.textContent = `${slider.value}%`;
    slider.setAttribute('aria-valuetext', `${slider.value}%`);
  });
  slider.addEventListener('change', () => play('press'));
  row.append(make('span', name), slider, shown);
  return row;
}

/** The recorded sounds' credits: each sound's name and author, its licence and its source, and what was changed. */
function creditsList(): HTMLElement {
  const list = make('ul', '', 'gear-credits');
  list.setAttribute('aria-label', 'Sound credits');
  for (const credit of soundCredits()) {
    const item = make('li', '');
    // Its licence by its full name and version, as the licence's own page gives it: CC BY 4.0, CC0 1.0.
    const version = /(\d\.\d)\/$/.exec(credit.licenceUrl)?.[1] ?? '';
    const licence = make('a', `${credit.licence.replace('-', ' ')} ${version}`.trim());
    licence.href = credit.licenceUrl;
    const source = make('a', 'Freesound');
    source.href = credit.page;
    for (const link of [licence, source]) Object.assign(link, { target: '_blank', rel: 'noopener' });
    item.append(`"${credit.name}" by ${credit.author}, `, licence, ', from ', source, `. ${credit.changes}`);
    list.append(item);
  }
  const credits = make('section', '', 'gear-sound-credits');
  credits.append(
    make('h3', 'Sound credits', 'gear-hint'),
    make('p', "Each plays at the game's own level.", 'gear-hint'),
    list,
  );
  return credits;
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
