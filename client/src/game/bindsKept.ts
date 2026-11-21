// The player's controls kept with their account (`/v1/binds`): read once the account is known (a guest is one from
// the first visit) and bound, and again when another account signs in; each change kept after a short quiet. Where
// the accounts do not answer, the game plays on with the controls it has.
import type { AccountLink } from '../network/accounts.ts';
import { overridesOf, readOverrides, withOverrides } from '../player/binds.ts';
import { BINDS, type LiveBinds } from '../player/input.ts';
import { ACCOUNT_CHANGED } from './gearScreen.ts';

/** How long the controls rest unchanged before they are kept, milliseconds: a few bound in a row are sent once. */
export const KEEP_AFTER_MS = 1500;

/** Keeps `binds` with the account behind `link`; answers once they are first read. */
export function keepBinds(
  link: Pick<AccountLink, 'session' | 'binds' | 'keepBinds'>,
  binds: LiveBinds = BINDS,
): Promise<void> {
  let waiting: ReturnType<typeof setTimeout> | null = null;
  /** The account whose controls were read last, and whether the player bound anything since: theirs are newer. */
  let account: string | null = null;
  let changed = false;
  binds.onChange((now, kept) => {
    if (kept) return;
    changed = true;
    if (waiting !== null) clearTimeout(waiting);
    waiting = setTimeout(() => {
      waiting = null;
      void link.keepBinds(overridesOf(now));
    }, KEEP_AFTER_MS);
  });
  const read = async () => {
    const signedIn = await link.session();
    if (signedIn === null) return;
    const another = account !== null && signedIn.id !== account;
    if (account !== null && !another) return;
    account = signedIn.id;
    const answer = await link.binds();
    if (typeof answer === 'string' || (changed && !another)) return;
    const kept = answer.binds === null ? {} : readOverrides(answer.binds);
    // Another account brings its own controls, or the defaults where it kept none.
    if (kept && (answer.binds !== null || another)) binds.set(withOverrides(kept), true);
    changed = false;
  };
  addEventListener(ACCOUNT_CHANGED, () => void read());
  return read();
}
