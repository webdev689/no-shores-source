import { SIGN_INS } from '../../ui/page.ts';
import type { Account, AccountLink, Kept } from '../../network/accounts.ts';

/** How the account step ends: an account (by its username, or none for one Discord alone keeps), a guest, or playing
 *  with no account at all, offline or with the accounts out of reach. */
export type AccountOutcome =
  | { readonly kind: 'account'; readonly username: string | null }
  | { readonly kind: 'guest' }
  | { readonly kind: 'alone' };

/** What the account step asks of the accounts. */
export type Accounts = Pick<AccountLink, 'session' | 'register' | 'login'>;

/** The press the player made on the form; Discord leaves the page, by `discordAway`. */
export type AccountAsk = 'create' | 'sign in' | 'guest';

/** The accounts' own words when they cannot be reached, as the account link says them. */
export const OUT_OF_REACH = 'The accounts could not be reached.';

/** What the accounts answer to a press: how the step ends, or their words for why it cannot yet. */
export async function askAccounts(
  link: Accounts,
  ask: AccountAsk,
  username: string,
  password: string,
): Promise<AccountOutcome | string> {
  if (ask === 'sign in') {
    const answer = await link.login(username, password);
    if (typeof answer === 'string') return answer;
    await SIGN_INS.keep({ id: username, password });
    return { kind: 'account', username: answer.username ?? username };
  }
  // A username is given to a session, so the guest is made first.
  const session = await link.session();
  if (session === null) return OUT_OF_REACH;
  if (ask === 'guest')
    return session.username === null ? { kind: 'guest' } : { kind: 'account', username: session.username };
  const answer = await link.register(username, password);
  if (typeof answer === 'string') return answer;
  // A sign-in that worked is offered to the browser's own password store, as a page's form would be.
  await SIGN_INS.keep({ id: username, password });
  return { kind: 'account', username: answer.username ?? username };
}

/** What the step offers past its form, once the accounts have said who the player is: going on as the account signed
 *  in, or, with the accounts out of reach, going on without one. A guest is offered nothing more than the form. */
export function goingOn(
  account: Account | null,
): { readonly words: string; readonly press: string; readonly outcome: AccountOutcome } | null {
  if (account === null) return { words: OUT_OF_REACH, press: 'Go on without an account', outcome: { kind: 'alone' } };
  if (account.guest) return null;
  const { username } = account;
  return username === null
    ? { words: 'You are signed in with Discord.', press: 'Go on', outcome: { kind: 'account', username } }
    : {
        words: `You are signed in as ${username}.`,
        press: `Go on as ${username}`,
        outcome: { kind: 'account', username },
      };
}

/** Where to send the player to sign in with Discord, coming back to `back`; the accounts' words if they cannot be
 *  reached, since Discord would only hand the player back to them. */
export async function discordAway(
  link: Pick<AccountLink, 'session' | 'discord'>,
  back: string,
): Promise<{ readonly to: string } | string> {
  if ((await link.session()) === null) return OUT_OF_REACH;
  return { to: await link.discord(back) };
}

/** Where the tab marks that its player left the helm for Discord, so the story picks up there when they come back. */
const HELM_KEY = 'overlook.story.helm';

export function markHelm(tab: Kept): void {
  try {
    tab.setItem(HELM_KEY, 'discord');
  } catch {
    // A tab that keeps nothing comes back to the story's start.
  }
}

/** Whether the player has come back from Discord to the helm. The mark is read once and cleared, whatever it says,
 *  and a story `played` through outranks it: a mark left by a sign-in never finished never begins the story again. */
export function backAtHelm(tab: Kept, played: boolean): boolean {
  try {
    const marked = tab.getItem(HELM_KEY) !== null;
    tab.removeItem(HELM_KEY);
    return marked && !played;
  } catch {
    return false;
  }
}
