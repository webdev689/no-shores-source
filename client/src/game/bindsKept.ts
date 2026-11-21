// The player's controls kept with their account (`/v1/binds`): read once the account is known (a guest is one from
// the first visit) and bound, and again when another account signs in; each change kept after a short quiet. Nothing
// is kept over controls never read: a save waits on a read that answers, and what the player bound before it is laid
// over what the account kept. Where the accounts do not answer, the game plays on with the controls it has.
import type { AccountLink } from '../network/accounts.ts';
import { BIND_IDS, type Overrides, overridesOf, readOverrides, withOverrides } from '../player/binds.ts';
import { BINDS, type LiveBinds } from '../player/input.ts';
import { ACCOUNT_CHANGED } from './gearScreen.ts';

/** How long the controls rest unchanged before they are kept, milliseconds: a few bound in a row are sent once. */
export const KEEP_AFTER_MS = 1500;

/** Keeps `binds` with the account behind `link`; answers once they are first read, or could not be. */
export function keepBinds(
  link: Pick<AccountLink, 'session' | 'binds' | 'keepBinds'>,
  binds: LiveBinds = BINDS,
): Promise<void> {
  let waiting: ReturnType<typeof setTimeout> | null = null;
  /** The account whose kept controls were read, none until a read answers; and whether the player bound anything
   *  not yet kept. */
  let account: string | null = null;
  let unsaved = false;
  let reading: Promise<boolean> | null = null;

  /** Reads the signed-in account's controls, unless they were read already: answers whether they are. Another
   *  account brings its own (the defaults where it kept none); the same one's are laid under what the player bound
   *  meanwhile, which is then kept. */
  const readNow = async (): Promise<boolean> => {
    const signedIn = await link.session();
    if (signedIn === null) return false;
    if (signedIn.id === account) return true;
    const answer = await link.binds();
    const kept = typeof answer === 'string' ? null : answer.binds === null ? {} : readOverrides(answer.binds);
    if (kept === null) return false;
    const another = account !== null;
    account = signedIn.id;
    if (another || !unsaved) {
      unsaved = false;
      if (another || Object.keys(kept).length > 0) binds.set(withOverrides(kept), true);
      return true;
    }
    const bound = overridesOf(binds.now);
    const both: Overrides = Object.fromEntries(BIND_IDS.map((id) => [id, { ...kept[id], ...bound[id] }]));
    binds.set(withOverrides(both));
    return true;
  };
  const read = () => (reading ??= readNow().finally(() => (reading = null)));

  const save = async () => {
    waiting = null;
    // A read that laid the account's controls under the player's has a save of its own waiting.
    if (!(await read()) || !unsaved || waiting !== null) return;
    unsaved = false;
    if ((await link.keepBinds(overridesOf(binds.now))) !== null) unsaved = true;
  };
  binds.onChange((_binds, kept) => {
    if (kept) return;
    unsaved = true;
    if (waiting !== null) clearTimeout(waiting);
    waiting = setTimeout(() => void save(), KEEP_AFTER_MS);
  });
  addEventListener(ACCOUNT_CHANGED, () => void read());
  return read().then(() => undefined);
}
