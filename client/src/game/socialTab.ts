import { make } from '../editor/dom.ts';
import type { AccountLink, Friends } from '../network/accounts.ts';
import { ROLES } from '../plus/kit.ts';
import { heldPress, pressOf } from './gearDom.ts';

/** How often the list is asked for again while it is shown, in milliseconds. */
const LOOK_MS = 30_000;

/** A row of the list: a name, a word beside it, and its presses. */
function row(name: string, word: string, presses: readonly HTMLElement[], playing = false): HTMLElement {
  const node = make('div', '', `gear-friend ${ROLES.well}`);
  const state = make('span', '', `gear-friend-dot${playing ? ' gear-friend-playing' : ''}`);
  state.setAttribute('aria-hidden', 'true');
  const words = make('div', '', 'gear-friend-words');
  words.append(make('b', name), make('span', word, 'gear-hint'));
  const actions = make('div', '', 'gear-friend-presses');
  actions.append(...presses);
  node.append(state, words, actions);
  return node;
}

/**
 * The Social tab: the player's friends, each playing or away, with who has asked them and whom they have asked, and
 * a field to ask another by username. Ending a friendship is held, as Destiny holds what cannot be undone. The list
 * is asked for again now and then while it is shown.
 */
export function socialPage(link: AccountLink | null): HTMLElement {
  const page = make('div', '', `gear-social ${ROLES.panel}`);
  if (!link) {
    page.append(make('p', 'This page keeps no account: it plays alone.', 'gear-hint'));
    return page;
  }
  const said = make('p', '', 'gear-answer');
  said.setAttribute('role', 'status');
  const lists = make('div', '', 'gear-social-lists');
  const name = make('input', '', ROLES.well);
  Object.assign(name, { type: 'text', autocomplete: 'off', spellcheck: false, maxLength: 20 });
  name.setAttribute('aria-label', 'Their username');
  const field = make('label', '', 'gear-field');
  const doing = (asked: 'ask' | 'accept' | 'remove', who: string) =>
    void link.befriend(asked, who).then((why) => {
      said.textContent = why ?? (asked === 'ask' ? `Asked ${who}.` : '');
      if (why === null && asked === 'ask') name.value = '';
      look();
    });
  const askPress = pressOf('Ask', () => doing('ask', name.value.trim()), 'primary');
  name.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') doing('ask', name.value.trim());
  });
  field.append(make('span', 'Add a friend', 'gear-label'), name, askPress);
  const show = (list: Friends | string) => {
    if (typeof list === 'string') {
      field.hidden = list === 'Add a username in Settings to have friends.';
      lists.replaceChildren(make('p', list, 'gear-hint'));
      return;
    }
    field.hidden = false;
    const section = (title: string, rows: readonly HTMLElement[]) => {
      const node = make('section', '', 'gear-social-section');
      const heading = make('h3', '', `gear-heading ${ROLES.rule}`);
      heading.append(make('span', title), make('span', String(rows.length)));
      node.append(heading, ...(rows.length > 0 ? rows : [make('p', 'None.', 'gear-hint')]));
      return node;
    };
    const playing = list.friends.filter((each) => each.playing).length;
    lists.replaceChildren(
      ...(list.asking.length > 0
        ? [
            section(
              'Asked you',
              list.asking.map((who) =>
                row(who, 'Wants to be friends', [
                  pressOf('Accept', () => doing('accept', who), 'primary'),
                  pressOf('Decline', () => doing('remove', who)),
                ]),
              ),
            ),
          ]
        : []),
      section(
        `Friends · ${playing} playing`,
        list.friends.map((each) =>
          row(
            each.name,
            each.playing ? 'Playing' : 'Away',
            [heldPress('Hold to remove', () => doing('remove', each.name), 'warn')],
            each.playing,
          ),
        ),
      ),
      ...(list.asked.length > 0
        ? [
            section(
              'You asked',
              list.asked.map((who) => row(who, 'Waiting', [pressOf('Cancel', () => doing('remove', who))])),
            ),
          ]
        : []),
    );
  };
  function look(): void {
    if (!page.isConnected && page.dataset['looked']) return;
    page.dataset['looked'] = '';
    void link?.friends().then(show);
  }
  page.append(field, said, lists);
  look();
  const timer = window.setInterval(() => (page.isConnected ? look() : window.clearInterval(timer)), LOOK_MS);
  return page;
}
