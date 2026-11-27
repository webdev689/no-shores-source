// The account on the Settings page, drawn by the game: who the player is, a username and password to keep a guest by
// or sign in with, typed in the interface's own fields, Discord, and signing out, here or everywhere, each held as
// Destiny holds what cannot be undone; and under it the players blocked and muted, each with a press to undo it.

import type { Account, AccountLink } from '../network/accounts.ts';
import { button } from '../ui/controls.ts';
import type { Child, Node } from '../ui/node.ts';
import { type KeptSignIn, PAGE, type Page, SIGN_INS } from '../ui/page.ts';
import { announce } from '../ui/announce.ts';
import { fillNode } from './gearHold.ts';
import { INK, words } from './gearNodes.ts';
import { ACCOUNT_CHANGED, ROSTER_HEARD } from './gearScreen.ts';
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
  /** The players blocked and those muted, or why they could not be listed; null while they are asked. */
  private blocked: readonly string[] | string | null = null;
  private muted: readonly string[] | string | null = null;
  private blockedSaid = '';
  private saidFor: 'unblock' | 'unmute' = 'unblock';
  private unblocking = false;
  /** Whether the fields have been emptied since the panel was made, so they start empty. */
  private emptied = false;
  /** The press that takes the focus once the lists come again, after an unblock or unmute: its list and place. */
  private focusAt: { readonly ask: 'unblock' | 'unmute'; readonly index: number } | null = null;
  /** The sign-in the browser keeps, asked for a guest's form once it shows, to fill its fields while they are empty. */
  private kept: KeptSignIn | null = null;
  private keptAsked = false;

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

  /** Asks for the players blocked and muted; with `focusAt`, the press there takes the focus once they come. */
  private listBlocked(focusAt: AccountPanel['focusAt'] = null): void {
    void this.link.roster().then((roster) => {
      // Heard by the rest of the game too, so an unmute shows in the chat at once.
      dispatchEvent(new CustomEvent(ROSTER_HEARD, { detail: roster }));
      this.blocked = typeof roster === 'string' ? roster : roster.blocked;
      this.muted = typeof roster === 'string' ? roster : (roster.muted ?? []);
      this.focusAt = focusAt;
    });
  }

  /** Signed in, registered, or refused: words, the page loaded again, or the account shown anew. A sign-in that worked
   *  is offered to the browser's password store first, as a page's form would be. */
  private async after(answer: Account | string, reload: boolean, signIn: KeptSignIn): Promise<void> {
    if (typeof answer !== 'string') await SIGN_INS.keep(signIn);
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
    if (!this.emptied) {
      // The interface keeps a field's words across frames: each opening of Settings starts them empty.
      for (const id of [NAME, PASSWORD]) ui.setFieldText(id, '');
      this.emptied = true;
    }
    const press = (id: string, said: string, run: () => void, role: 'button' | 'primary' = 'button') =>
      button(ui, id, said, run, { role, padding: PRESS_PADDING });
    if (account?.guest && !this.keptAsked) {
      this.keptAsked = true;
      void SIGN_INS.kept().then((found) => (this.kept = found));
    }
    const kept = this.kept;
    if (kept && ui.fieldText(NAME) === '' && ui.fieldText(PASSWORD) === '') {
      ui.setFieldText(NAME, kept.id);
      ui.setFieldText(PASSWORD, kept.password);
      this.kept = null;
    }
    const typed = (): KeptSignIn => ({ id: ui.fieldText(NAME), password: ui.fieldText(PASSWORD) });
    const login = () => {
      const tried = typed();
      void link.login(tried.id, tried.password).then((answer) => this.after(answer, true, tried));
    };
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
        () => {
          const tried = typed();
          void link.register(tried.id, tried.password).then((answer) => this.after(answer, false, tried));
        },
        'primary',
      );
      // A guest who signs in to another account leaves their own behind for good, so that is held, not clicked.
      const signIn = account.guest
        ? this.held(context, 'account-sign-in', 'Hold to sign in, leaving this guest', login, 'button')
        : press('account-sign-in', 'Sign in', login);
      const discord = press(
        'account-discord',
        account.discord ? 'Sign in with Discord' : 'Sign in or link with Discord',
        () =>
          void link.discord(this.page.address()).then((away) => {
            if (typeof away === 'string') this.say(away);
            else this.page.assign(away.to);
          }),
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
      this.peopleNodes(context, 'unblock'),
      this.peopleNodes(context, 'unmute'),
    ];
  }

  /** The players blocked, or muted, each with a press to unblock or unmute them; blocking is done from the Roster,
   *  muting from a player's menu or the chat. */
  private peopleNodes({ ui }: PlainContext, ask: 'unblock' | 'unmute'): Node {
    const listed = ask === 'unblock' ? this.blocked : this.muted;
    const list = Array.isArray(listed) ? (listed as readonly string[]) : [];
    const undo = (name: string, index: number) => {
      if (this.unblocking) return;
      this.unblocking = true;
      void this.link.social(ask, { name }).then((why) => {
        this.unblocking = false;
        [this.blockedSaid, this.saidFor] = [why ?? `${name} is ${ask === 'unblock' ? 'unblocked' : 'unmuted'}.`, ask];
        announce(this.blockedSaid);
        this.listBlocked({ ask, index });
      });
    };
    // The lists come again after an unblock or unmute, the focus stays in its list, on the press at the same place.
    if (this.focusAt?.ask === ask && Array.isArray(listed)) {
      const place = list[Math.min(this.focusAt.index, list.length - 1)];
      if (place !== undefined) ui.focusOn(`${ask}-${place}`);
      this.focusAt = null;
    }
    const [heading, none, said] =
      ask === 'unblock'
        ? ['Blocked players', 'None. Block a player from the Roster.', 'Unblock']
        : ['Muted players', 'None. Mute a player from their menu, or with /mute in the chat.', 'Unmute'];
    return {
      width: 'grow',
      direction: 'column',
      padding: [18, 0, 0, 0],
      gap: 6,
      children: [
        headingNode(heading),
        typeof listed === 'string' && hintNode(listed),
        Array.isArray(listed) && list.length === 0 && hintNode(none),
        ...list.map((name, index): Node => ({
          width: 'grow',
          alignY: 'center',
          children: [
            { width: 'grow', ...words(name, 1, INK.word) },
            button(ui, `${ask}-${name}`, said, () => undo(name, index), {
              padding: PRESS_PADDING,
              label: `${said} ${name}`,
            }),
          ],
        })),
        this.saidFor === ask && answerNode(this.blockedSaid),
      ],
    };
  }
}
