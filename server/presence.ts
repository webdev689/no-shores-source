import type { CharacterKeeper } from './accounts/worker.ts';

/** Tells the accounts a player at sea is here, in the sea's room `room`, in `water`: each word after the last, so the
 *  last said is the last kept; one not taken is said again the next second. */
export function present(
  accounts: Service<CharacterKeeper>,
  room: string,
  held: { token: string | null; water?: string | null; presenting?: Promise<unknown> },
  water: string | null,
): void {
  const token = held.token;
  if (!token) return;
  held.water = water;
  held.presenting = (held.presenting ?? Promise.resolve())
    .then(() => accounts.present(token, room, water))
    .catch(() => false)
    .then((took) => {
      if (!took && held.water === water) delete held.water;
    });
}
