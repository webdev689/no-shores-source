// The account on the Settings page, drawn by the game: who the player is, a username and password to keep a guest by
// or sign in with, typed in the interface's own fields, Discord, and signing out, here or everywhere, each held as
// Destiny holds what cannot be undone; and under it the players blocked, each with a press to unblock them.

import type { Account, AccountLink } from '../network/accounts.ts';
import { button } from '../ui/controls.ts';
import type { Child, Node } from '../ui/node.ts';
import { PAGE, type Page } from '../ui/page.ts';
import { announce } from '../ui/announce.ts';
import { fillNode } from './gearHold.ts';
import { INK, words } from './gearNodes.ts';
import { ACCOUNT_CHANGED } from './gearScreen.ts';
import type { PlainContext } from './menuPage.ts';
import { PRESS_PADDING, RULE, answerNode, headingNode, hintNode, paragraph } from './menuPages.ts';

/** Who the account is, in words. */
export function accountWords(account: Account): string {
  if (account.guest)
    return 'You play as a guest: your character is kept for this browser. Add a username to keep it anywhere.';
  const discord = account.discord ? ' Discord is linked.' : '';
  return account.username ? `Signed in as ${account.username}.${discord}` : `Signed in with Discord.`;
}

/** The fields' ids, which the interface keeps their words by. */
const NAME = 'account-name';
const PASSWORD = 'account-password';

/**
 * The account's part of Settings, asked of the accounts as it is made (each time Settings opens). A sign-in or out
 * loads the page again, so its rooms hold the right character.
 */
export class AccountPanel {
  /** The account, null with the accounts out of reach, undefined while they are asked. */
  private account: Account | null | undefined = undefined;
  private said = '';
  /** The players blocked, or why they could not be listed; null while they are asked. */
  private blocked: readonly string[] | string | null = null;
  private blockedSaid = '';
  private unblocking = false;
  /** The place in the list whose press takes the focus once the list comes again, after an unblock. */
  private focusAt: number | null = null;

  private readonly link: AccountLink;
  private readonly page: Page;

  constructor(link: AccountLink, page: Page = PAGE) {
    this.link = link;
    this.page = page;
    void link.session().then((account) => {
      this.account = account;
      this.say(link.said ?? '');
    });
    this.listBlocked();
  }

  private say(said: string): void {
    this.said = said;
    if (said) announce(said);
  }

  private listBlocked(): void {
    void this.link.roster().then((roster) => (this.blocked = typeof roster === 'string' ? roster : roster.blocked));
  }

  /** Signed in, registered, or refused: words, the page loaded again, or the account shown anew. */
  private after(answer: Account | string, reload: boolean): void {
    if (typeof answer === 'string') this.say(answer);
    else if (reload) this.page.reload();
    else {
      this.account = answer;
      dispatchEvent(new Event(ACCOUNT_CHANGED));
    }
  }

  /** A press that acts once held, in `role`, its fill showing how long is left. */
  private held({ ui, holds }: PlainContext, id: string, said: string, act: () => void, role: 'button' | 'warn'): Node {
    const charged = holds.press(ui, id, act);
    return {
      id,
      press: true,
      role,
      label: said,
      padding: PRESS_PADDING,
      alignY: 'center',
      children: [words(said, 1, INK.word), fillNode(charged, role === 'warn')],
    };
  }

  /** The account's nodes, then the players blocked. */
  nodes(context: PlainContext): Child[] {
    const { ui } = context;
    const { link, account } = this;
    const press = (id: string, said: string, run: () => void, role: 'button' | 'primary' = 'button') =>
      button(ui, id, said, run, { role, padding: PRESS_PADDING });
    const typed = () => [ui.fieldText(NAME), ui.fieldText(PASSWORD)] as const;
    const login = () => void link.login(...typed()).then((answer) => this.after(answer, true));
    const named = account?.username !== null && account?.username !== undefined;
    let presses: Child[] = [];
    let leaving: Child[] = [];
    if (account === null)
      // With the accounts out of reach nothing here can work but asking them again.
      presses = [
        press('account-again', 'Try again', () => void link.session().then((found) => (this.account = found))),
      ];
    else if (account) {
      const keep = press(
        'account-keep',
        'Keep this character with a username',
        () => void link.register(...typed()).then((answer) => this.after(answer, false)),
        'primary',
      );
      // A guest who signs in to another account leaves their own behind for good, so that is held, not clicked.
      const signIn = account.guest
        ? this.held(context, 'account-sign-in', 'Hold to sign in, leaving this guest', login, 'button')
        : press('account-sign-in', 'Sign in', login);
      const discord = press(
        'account-discord',
        account.discord ? 'Sign in with Discord' : 'Sign in or link with Discord',
        () => void link.discord(this.page.address()).then((to) => this.page.assign(to)),
      );
      presses = [...(named ? [signIn] : [keep, signIn]), discord];
      const out = this.held(
        context,
        'account-out',
        account.guest ? 'Hold to sign out: a guest cannot come back' : 'Hold to sign out',
        () => void link.logout().then(() => this.page.reload()),
        'warn',
      );
      const everywhere = this.held(
        context,
        'account-everywhere',
        'Hold to sign out everywhere',
        () =>
          void link.logoutEverywhere().then((why) => {
            if (why === null) this.page.reload();
            else this.say(why);
          }),
        'warn',
      );
      leaving = account.guest ? [out] : [out, everywhere];
    }
    const field = (id: string, said: string, secret: boolean): Node => ({
      width: 'grow',
      maxWidth: 520,
      gap: 10,
      alignY: 'center',
      children: [
        { minWidth: 72, ...words(said, 1, INK.faint) },
        {
          id,
          role: 'well',
          width: 'grow',
          maxWidth: 284,
          height: 26,
          padding: [0, 8],
          alignY: 'center',
          label: said,
          field: { secret, most: secret ? 200 : 20 },
        },
      ],
    });
    const who =
      account === undefined
        ? 'Asking the accounts…'
        : account
          ? accountWords(account)
          : 'The accounts cannot be reached: your character is not kept.';
    return [
      {
        width: 'grow',
        direction: 'column',
        gap: 8,
        children: [
          paragraph({ width: 'grow', text: { words: who, colour: INK.word } }),
          // Signed in, the fields below are for another account, and say so.
          account !== null && (account === undefined || named) && paragraph(hintNode('Sign in to another account')),
          account !== null && field(NAME, 'Username', false),
          account !== null && field(PASSWORD, 'Password', true),
          presses.length > 0 && { wrap: true, gap: 8, padding: [8, 0, 0, 0], children: presses },
          account !== null && { width: 'grow', padding: [8, 0], children: [RULE] },
          leaving.length > 0 && { wrap: true, gap: 8, children: leaving },
          answerNode(this.said),
        ],
      },
      this.blockedNodes(context),
    ];
  }

  /** The players blocked, each with a press to unblock them; blocking is done from the Roster. */
  private blockedNodes({ ui }: PlainContext): Node {
    const blocked = this.blocked;
    const list = Array.isArray(blocked) ? (blocked as readonly string[]) : [];
    const unblock = (name: string, index: number) => {
      if (this.unblocking) return;
      this.unblocking = true;
      void this.link.social('unblock', { name }).then((why) => {
        this.unblocking = false;
        this.blockedSaid = why ?? `${name} is unblocked.`;
        announce(this.blockedSaid);
        this.focusAt = index;
        this.listBlocked();
      });
    };
    // The list come again after an unblock, the focus stays in it, on the press now at the same place.
    if (this.focusAt !== null && Array.isArray(blocked)) {
      const place = list[Math.min(this.focusAt, list.length - 1)];
      if (place !== undefined) ui.focusOn(`unblock-${place}`);
      this.focusAt = null;
    }
    return {
      width: 'grow',
      direction: 'column',
      padding: [18, 0, 0, 0],
      gap: 6,
      children: [
        headingNode('Blocked players'),
        typeof blocked === 'string' && hintNode(blocked),
        Array.isArray(blocked) && list.length === 0 && hintNode('None. Block a player from the Roster.'),
        ...list.map((name, index): Node => ({
          width: 'grow',
          alignY: 'center',
          children: [
            { width: 'grow', ...words(name, 1, INK.word) },
            button(ui, `unblock-${name}`, 'Unblock', () => unblock(name, index), {
              padding: PRESS_PADDING,
              label: `Unblock ${name}`,
            }),
          ],
        })),
        answerNode(this.blockedSaid),
      ],
    };
  }
}
