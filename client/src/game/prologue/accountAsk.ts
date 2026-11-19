import type { AccountLink } from '../../network/accounts.ts';

/** How the account step ends: an account with a username, a guest, or playing alone with no accounts at all. */
export type AccountOutcome =
  { readonly kind: 'account'; readonly username: string } | { readonly kind: 'guest' } | { readonly kind: 'alone' };

/** What the account step asks of the accounts. */
export type Accounts = Pick<AccountLink, 'session' | 'register' | 'login'>;

/** The press the player made. Discord leaves the page, so it never comes back here. */
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
    return typeof answer === 'string' ? answer : { kind: 'account', username: answer.username ?? username };
  }
  // A username is given to a session, so the guest is made first.
  const session = await link.session();
  if (session === null) return OUT_OF_REACH;
  if (ask === 'guest')
    return session.username === null ? { kind: 'guest' } : { kind: 'account', username: session.username };
  const answer = await link.register(username, password);
  return typeof answer === 'string' ? answer : { kind: 'account', username: answer.username ?? username };
}
