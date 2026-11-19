import { button, make } from '../editor/dom.ts';
import type { Account, AccountLink } from '../network/accounts.ts';
import { ROLES, type Role } from '../plus/kit.ts';
import { heldPress } from './gearDom.ts';
import { ACCOUNT_CHANGED } from './gearScreen.ts';

function pressOf(text: string, run: () => void, role: Role = 'button'): HTMLButtonElement {
  const node = button(text, run);
  node.classList.add(ROLES[role]);
  return node;
}

function field(label: string, type: 'text' | 'password', complete: string): [HTMLElement, HTMLInputElement] {
  const input = make('input', '', ROLES.well);
  Object.assign(input, { type, autocomplete: complete, spellcheck: false });
  const row = make('label', '', 'gear-field');
  row.append(make('span', label, 'gear-label'), input);
  return [row, input];
}

/** Who the account is, in words. */
export function accountWords(account: Account): string {
  if (account.guest)
    return 'You play as a guest: your character is kept for this browser. Add a username to keep it anywhere.';
  const discord = account.discord ? ' Discord is linked.' : '';
  return account.username ? `Signed in as ${account.username}.${discord}` : `Signed in with Discord.`;
}

/**
 * The Account tab: who the player is, a username and password to keep a guest by or sign in with, Discord, and
 * signing out, here or everywhere, each held as Destiny holds what cannot be undone. A sign-in or out loads the page
 * again, so its rooms hold the right character.
 */
export function accountPanel(link: AccountLink): HTMLElement {
  const panel = make('div', '', 'gear-account');
  const who = make('p', 'Asking the accounts…');
  // Signed in, the form below is for another account, and says so.
  const other = make('p', 'Sign in to another account', 'gear-hint');
  const said = make('p', '', 'gear-answer');
  said.setAttribute('role', 'status');
  const [nameRow, name] = field('Username', 'text', 'username');
  const [passwordRow, password] = field('Password', 'password', 'current-password');
  const presses = make('div', '', 'gear-presses');
  // Signing out stands apart, under a rule, from signing in.
  const rule = make('hr', '', ROLES.rule);
  const leaving = make('div', '', 'gear-presses');
  panel.append(who, other, nameRow, passwordRow, presses, rule, leaving, said);
  const after = (answer: Account | string, reload: boolean) => {
    if (typeof answer === 'string') said.textContent = answer;
    else if (reload) location.reload();
    else {
      show(answer);
      dispatchEvent(new Event(ACCOUNT_CHANGED));
    }
  };
  const show = (account: Account | null) => {
    who.textContent = account ? accountWords(account) : 'The accounts cannot be reached: your character is not kept.';
    const keep = pressOf(
      'Keep this character with a username',
      () => {
        void link.register(name.value, password.value).then((answer) => after(answer, false));
      },
      'primary',
    );
    const login = () => void link.login(name.value, password.value).then((answer) => after(answer, true));
    // A guest who signs in to another account leaves their own behind for good, so that is held, not clicked.
    const signIn = account?.guest ? heldPress('Hold to sign in, leaving this guest', login) : pressOf('Sign in', login);
    const discord = pressOf(account?.discord ? 'Sign in with Discord' : 'Sign in or link with Discord', () => {
      void link.discord(location.href).then((to) => location.assign(to));
    });
    const out = heldPress(
      account?.guest ? 'Hold to sign out: a guest cannot come back' : 'Hold to sign out',
      () => void link.logout().then(() => location.reload()),
      'warn',
    );
    const everywhere = heldPress(
      'Hold to sign out everywhere',
      () =>
        void link.logoutEverywhere().then((why) => {
          if (why === null) location.reload();
          else said.textContent = why;
        }),
      'warn',
    );
    const named = account !== null && account.username !== null;
    nameRow.hidden = passwordRow.hidden = rule.hidden = account === null;
    other.hidden = !named;
    leaving.replaceChildren(...(account === null ? [] : account.guest ? [out] : [out, everywhere]));
    // With the accounts out of reach nothing here can work but asking them again.
    if (account === null) {
      const again = pressOf('Try again', () => void link.session().then(show));
      presses.replaceChildren(again);
      return;
    }
    presses.replaceChildren(...(named ? [signIn] : [keep, signIn]), discord);
  };
  void link.session().then((account) => {
    show(account);
    said.textContent = link.said ?? '';
  });
  return panel;
}
