// The Guild tab's Treasury page: what the guild holds, the ledger's latest lines (who moved what, and the balance
// after), and, for a member standing at one of the guild's outposts, a field to put their own Aurem in. The treasury is
// spent only on outposts and never paid out to a player (`server/accounts/treasury.ts`).

import type { LedgerLine, OutpostsFace } from '../../network/accounts.ts';
import { ASKS, type GearAsk } from '../../network/gearMessages.ts';
import type { Node } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import { INK, label, pressNode, words } from '../gearNodes.ts';
import { hintNode } from '../menuPages.ts';
import { counted } from './guildHome.ts';
import { TREASURY_MOST, kindOf, pieceOf } from './outpostLaw.ts';
import { headNode, partNode } from './outpostRows.ts';

export const DEPOSIT_FIELD = 'treasury-deposit';
export const DEPOSIT_ID = 'treasury-deposit-press';
const HOUR_MS = 3_600_000;

/** How long ago a time was, in the ledger's plain words. */
export function agoWords(now: number, then: number): string {
  const hours = Math.floor(Math.max(0, now - then) / HOUR_MS);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

/** What a ledger line's kind says, in the world's verbs: `begin counting` is "Began the Counting House" (its
 *  scaffold), `build counting` "Built the Counting House" (standing at once), `take down well` "Took up the Well" (a
 *  piece of decoration) and `decorate well` "Placed the Well". */
export function ledgerWords(kind: string): string {
  const [what = '', ...rest] = kind.split(' ');
  const thing = rest.join(' ').replace(/^down /, '');
  const named = kindOf(thing)?.name ?? pieceOf(thing)?.name ?? thing;
  switch (what) {
    case 'deposit':
      return 'Put Aurem in';
    case 'strongbox':
      return 'Emptied a strongbox';
    case 'abandon':
      return 'Abandoned an outpost';
    case 'raise':
      return thing === '' ? 'Raised an outpost' : `Began the ${named}'s next tier`;
    case 'begin':
      return `Began the ${named}`;
    case 'build':
      return `Built the ${named}`;
    case 'take':
      return kindOf(thing) ? `Took down the ${named}` : `Took up the ${named}`;
    case 'decorate':
      return `Placed the ${named}`;
    default:
      return kind;
  }
}

/** The ledger as four columns, each as wide as its longest words at `size`: when, who and what (taking the rest, cut
 *  with an ellipsis), the amount moved and the balance after. Every cell is one line at one size, so the lines meet. */
function ledgerNode(ledger: readonly LedgerLine[], now: number, size: number): Node {
  const column = (head: string, cells: readonly Node[], more: Partial<Node> = {}): Node => ({
    direction: 'column',
    gap: 3,
    ...more,
    children: [label(head, size), ...cells],
  });
  return {
    width: 'grow',
    gap: 14 * size,
    children: [
      column(
        'When',
        ledger.map((line) => words(agoWords(now, line.at), size, INK.faint)),
      ),
      column(
        'Who and what',
        ledger.map((line) =>
          words(`${line.name ?? 'The outpost'}: ${ledgerWords(line.kind)}`, size, INK.word, { ellipsis: true }),
        ),
        { width: 'grow' },
      ),
      column(
        'Aurem',
        ledger.map((line) =>
          words(
            `${line.amount >= 0 ? '+' : '−'}${counted(Math.abs(line.amount))}`,
            size,
            line.amount >= 0 ? INK.gain : INK.loss,
          ),
        ),
        { alignX: 'end' },
      ),
      column(
        'Balance',
        ledger.map((line) => words(counted(line.balance), size, INK.faint)),
        { alignX: 'end' },
      ),
    ],
  };
}

/** The field and the press that put the player's own Aurem in, at `size`; `fits` whether what is typed may go in. */
function depositNode(fits: boolean, size: number): Node {
  return {
    gap: 10,
    alignY: 'center',
    children: [
      {
        id: DEPOSIT_FIELD,
        role: 'well',
        width: 200,
        height: 14 + 12 * size,
        padding: [0, 8],
        alignY: 'center',
        label: 'Aurem to put in',
        field: { most: 7, size, placeholder: 'Aurem' },
      },
      pressNode(DEPOSIT_ID, 'Put in', 'primary', '', size, { disabled: !fits }),
    ],
  };
}

/** The page; `room` asks the room the player stands in, which takes the Aurem from them. */
export function treasuryNode(
  ui: Interface,
  outposts: OutpostsFace,
  now: number,
  size: number,
  room: (ask: GearAsk) => void,
): Node {
  const amount = Math.floor(Number(ui.fieldText(DEPOSIT_FIELD).replaceAll(',', '').trim()));
  const space = Math.max(0, TREASURY_MOST - outposts.treasury);
  const typed = Number.isInteger(amount) && amount > 0;
  const fits = typed && amount <= space;
  if (outposts.at !== null && fits && (ui.clicked(DEPOSIT_ID) || ui.submitted(DEPOSIT_FIELD))) {
    room({ kind: ASKS.outpostDeposit, count: amount });
    ui.setFieldText(DEPOSIT_FIELD, '');
  }
  const over =
    typed && !fits
      ? `The treasury holds at most ${counted(TREASURY_MOST)} Aurem: put in ${counted(space)} or less.`
      : null;
  return {
    width: 'grow',
    direction: 'column',
    gap: 12,
    padding: [6, 4, 0, 4],
    children: [
      headNode('Treasury', null, words(`At most ${counted(TREASURY_MOST)} Aurem`, size, INK.faint)),
      partNode([
        {
          width: 'grow',
          gap: 10,
          alignY: 'center',
          wrap: true,
          children: [
            words(`${counted(outposts.treasury)} Aurem`, size + 1, INK.brassLit),
            { width: 'grow' },
            outposts.at !== null && depositNode(fits, size),
          ],
        },
        over !== null && words(over, size, INK.loss, { wrap: true }),
        words(
          "Members put Aurem in at the guild's outposts, and the outposts' strongboxes empty into it. It is spent only on outposts.",
          size,
          INK.faint,
          { wrap: true },
        ),
        outposts.at === null && hintNode("Put your own Aurem in at any of your guild's outposts."),
      ]),
      partNode([
        headNode('Ledger', outposts.ledger.length > 0 ? String(outposts.ledger.length) : null),
        outposts.ledger.length > 0 ? ledgerNode(outposts.ledger, now, size) : hintNode('Nothing has moved yet.'),
      ]),
    ],
  };
}
