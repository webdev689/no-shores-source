import { button, make } from '../editor/dom.ts';
import type { Account, AccountLink } from '../network/accounts.ts';
import { ROLES, type Role } from '../plus/kit.ts';

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
 * signing out. A sign-in or out loads the page again, so its rooms hold the right character.
 */
export function accountPanel(link: AccountLink): HTMLElement {
  const panel = make('div', '', 'gear-account');
  const who = make('p', 'Asking the accounts…');
  const said = make('p', '', 'gear-answer');
  const [nameRow, name] = field('Username', 'text', 'username');
  const [passwordRow, password] = field('Password', 'password', 'current-password');
  const presses = make('div', '', 'gear-presses');
  panel.append(who, nameRow, passwordRow, presses, said);
  const after = (answer: Account | string, reload: boolean) => {
    if (typeof answer === 'string') said.textContent = answer;
    else if (reload) location.reload();
    else show(answer);
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
    const signIn = pressOf('Sign in', () => {
      void link.login(name.value, password.value).then((answer) => after(answer, true));
    });
    const discord = pressOf(account?.discord ? 'Sign in with Discord' : 'Sign in or link with Discord', () => {
      void link.discord(location.href).then((to) => location.assign(to));
    });
    const out = pressOf(
      'Sign out',
      () => {
        const lose = account?.guest ? 'A guest who signs out cannot come back. ' : '';
        if (!confirm(`${lose}Sign out?`)) return;
        void link.logout().then(() => location.reload());
      },
      'warn',
    );
    const named = account !== null && account.username !== null;
    nameRow.hidden = passwordRow.hidden = account === null;
    presses.replaceChildren(...(named ? [signIn] : [keep, signIn]), discord, ...(account ? [out] : []));
  };
  void link.session().then(show);
  return panel;
}
