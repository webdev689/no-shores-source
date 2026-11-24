// The request id an outpost ask that moves Aurem goes with (`rid` in its body), so the accounts move it once however
// often it arrives. Each press is a fresh id; the very same ask sent again before the accounts said yes to it keeps
// its id, since a reply lost on the way may hide one that landed.

/** The asks of the accounts that move a guild's Aurem. */
const MOVES_AUREM = /^outpost\/(raise|place|rise|remove|abandon|collect|decorate|undecorate)$/;

/** The last ask sent that moves Aurem and has not been said yes to, by its path and body, with its id. */
let unanswered: { readonly said: string; readonly rid: string } | null = null;

/** The body an ask goes with: an Aurem-moving one's with its request id, any other's as given. */
export function withRid(path: string, body: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  if (!MOVES_AUREM.test(path)) return body;
  const said = `${path} ${JSON.stringify(body)}`;
  if (unanswered?.said !== said) unanswered = { said, rid: crypto.randomUUID() };
  return { ...body, rid: unanswered.rid };
}

/** The accounts said yes to an ask sent with this body: the next press of it is a new ask. */
export function ridAnswered(sent: Readonly<Record<string, unknown>>): void {
  if (unanswered !== null && sent['rid'] === unanswered.rid) unanswered = null;
}
